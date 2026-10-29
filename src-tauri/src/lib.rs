// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! Tauri komutlari: on yuz (TUI/panel) <-> backend koprusu.
//!
//! TUM komutlar `async`tir: ana (UI) thread hic bloklanmaz. Uzun suren isler
//! (PowerShell/WMI/DC/kamera/disk) `spawn_blocking` ile arka plan is
//! parcaciginda calisir; `.await` noktasinda hicbir std::sync::Mutex gardi
//! tutulmaz (kilidin al-birak'i tamamen senkron yardimcilarin icindedir).

mod activity;
mod autostart;
mod battery;
mod brightness;
mod colortemp;
mod contrast;
mod decide;
mod diagnose;
mod gamma;
mod hdr;
mod identity;
mod install;
mod license;
mod light;
mod logger;
mod monitor;
mod prefs;
mod ps;
mod stats;
mod theme;
mod winstate;

use std::sync::Mutex;
use std::time::Instant;

use activity::{
    foreground_exe as query_foreground_exe, is_blocked, is_fullscreen as query_fullscreen,
};
use autostart::{autostart_status, set_autostart};
use battery::battery_status as query_battery_status;
use brightness::{get_brightness, set_brightness};
use decide::{next_brightness, scene_target, Level, Source};
use light::{classify, sample_light};
use logger::{
    clear_log as clear_disk_log, log_tick as write_disk_log, read_lines as read_disk_log,
};
use prefs::{
    clear_prefs as wipe_prefs, get_pref as lookup_pref, learn_pref as remember_pref, list_prefs,
};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Position, Rect, Size, WebviewUrl, WebviewWindowBuilder};
use theme::{get_theme, set_theme};

/// Bloklayici isi arka plan is parcaciginda calistirir; komutlar ana
/// thread'i beklemez. Is parcacigi cokerse Turkce hata doner.
async fn run_blocking<T, F>(work: F) -> Result<T, String>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| "arka plan işi tamamlanamadı".to_string())
}

/// Kurulum hatasini smart-screen.log'a tek satir olarak dusurur; uygulama
/// yine dusmez. Satir stats.rs'in bekledigi sabit formattadir.
fn log_setup_error(what: &str, err: &str) {
    let now = crate::logger::now_local();
    write_disk_log(&format!(
        "{now} | source=setup/setup | level=warn | tone=- | desired=- | \
         applied=- | theme=- | note={what}: {err}"
    ));
}

// duzeltme (v2.1 inceleme md.11): `flyout_show` komutu ölüydü — frontend
// (src/flyout.ts) yalnız `flyout_hide` çağırır, tray de doğrudan
// `show_flyout` kullanıyordu. Tek yol bırakıldı: komut ve FlyoutState kaldırıldı.

/// duzeltme (md.3): flyout odak kaybıyla (otomatik) gizlendiğinde zaman
/// damgası buraya yazılır. Tray sol tığı bu damgayla "kapatma" mı "açma" mı
/// olduğuna karar verir: odak kaybı hide() ile Click handler arasında yarışır.
static FLYOUT_AUTOHIDE_AT: Mutex<Option<Instant>> = Mutex::new(None);

/// Flyout'un otomatik gizlenmesinden geçen süre (ms); hiç gizlenmediyse None.
fn ms_since_flyout_autohide() -> Option<u64> {
    FLYOUT_AUTOHIDE_AT
        .lock()
        .ok()
        .and_then(|g| g.map(|at| at.elapsed().as_millis() as u64))
}

/// Flyout gizlendiğinde damgayı tazeler (odak kaybı ve tray ile kapatma).
fn note_flyout_hidden() {
    if let Ok(mut g) = FLYOUT_AUTOHIDE_AT.lock() {
        *g = Some(Instant::now());
    }
}

/// duzeltme (md.3): tray tıkının "flyout açsın mı" kararı (SAF). Görünürken
/// hep kapatır (false). Kapalıyken son gizlenme 300 ms'den yakınsa bu tık,
/// az önceki kapatmanın ta kendisi sayılır (odak kaybı zaten kapattı) ve
/// pencere yeniden açılmaz; aksi halde açar.
fn should_toggle_open(visible: bool, ms_since_autohide: Option<u64>) -> bool {
    if visible {
        return false;
    }
    match ms_since_autohide {
        Some(ms) => ms >= 300,
        None => true,
    }
}

/// Tray menüsündeki işaretlenebilir ögeler (durum güncellemesi için).
struct TrayChecks {
    pause: CheckMenuItem<tauri::Wry>,
    dayoff: CheckMenuItem<tauri::Wry>,
}

/// Flyout penceresinin boyutları (mantıksal piksel).
const FLYOUT_W: f64 = 340.0;
const FLYOUT_H: f64 = 420.0;
/// Flyout ile görev çubuğu arasındaki boşluk (fiziksel piksel).
const FLYOUT_GAP: i32 = 8;

/// Tray dikdörtgenini (x, y, w, h) fiziksel piksele düzleştirir (SAF).
fn rect_tuple(rect: &Rect) -> (i32, i32, i32, i32) {
    let (x, y) = match &rect.position {
        Position::Physical(p) => (p.x, p.y),
        Position::Logical(p) => (p.x as i32, p.y as i32),
    };
    let (w, h) = match &rect.size {
        Size::Physical(s) => (s.width as i32, s.height as i32),
        Size::Logical(s) => (s.width as i32, s.height as i32),
    };
    (x, y, w, h)
}

/// Flyout'un sol-üst köşesini hesaplar: tray dikdörtgeninin merkezine
/// hizalanır, çalışma alanının altına 8 piksel boşlukla oturur ve çalışma
/// alanına kelepçelenir. Tüm birimler fiziksel pikseldir (SAF).
fn flyout_pos(
    tray: (i32, i32, i32, i32),
    win: (i32, i32),
    work: (i32, i32, i32, i32),
) -> (i32, i32) {
    let (tx, _ty, tw, _th) = tray;
    let (wx, wy, ww, wh) = work;
    let mut x = tx + tw / 2 - win.0 / 2;
    let mut y = wy + wh - win.1 - FLYOUT_GAP;
    // Pencere çalışma alanından genişse kenara yasla; aksi halde kelepçele
    // (clamp min>max etmemeli: pencere alana sığmıyorsa kelepçe yok).
    if win.0 >= ww {
        x = wx;
    } else {
        x = x.clamp(wx, wx + ww - win.0);
    }
    if win.1 >= wh {
        y = wy;
    } else {
        y = y.clamp(wy, wy + wh - win.1);
    }
    (x, y)
}

/// Noktanın bulunduğu monitörün çalışma alanını döndürür (fiziksel piksel:
/// x, y, w, h). Win32 `MonitorFromPoint` + `GetMonitorInfoW` kullanılır —
/// gizli bir pencerenin "bulunduğu monitör" yanlış olurdu.
fn work_area_at(x: i32, y: i32) -> Option<(i32, i32, i32, i32)> {
    use windows::Win32::Foundation::{POINT, RECT};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromPoint, HMONITOR, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    // Guvenli: HMONITOR yalnizca bu cagri icinde kullanilir.
    let hmon: HMONITOR = unsafe { MonitorFromPoint(POINT { x, y }, MONITOR_DEFAULTTONEAREST) };
    if hmon.is_invalid() {
        return None;
    }
    let mut info = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    // Guvenli: cikti yerel degiskene bagli; cbSize yapi boyutuyla es.
    if !unsafe { GetMonitorInfoW(hmon, &mut info as *mut _) }.as_bool() {
        return None;
    }
    let RECT {
        left,
        top,
        right,
        bottom,
    } = info.rcWork;
    Some((left, top, right - left, bottom - top))
}

/// Flyout penceresini tray dikdörtgeninin üstüne konumlandırıp gösterir.
/// Dikdörtgen yoksa (ilk açılış, klavyeyle çağrı) ekranın sağ alt köşesine
/// yaslanır. Konum fiziksel pikseldir; pencere gerçek (ölçekli) boyutu
/// hesaba katılır — DPI ölçek faktörü dolaylı olarak uygulanmış olur.
fn show_flyout(app: &AppHandle, tray: Option<(i32, i32, i32, i32)>) {
    let Some(win) = app.get_webview_window("flyout") else {
        return;
    };
    let size = win.outer_size().map(|s| (s.width as i32, s.height as i32));
    let (w, h) = size.unwrap_or((FLYOUT_W as i32, FLYOUT_H as i32));
    let (cx, cy) = match tray {
        Some((tx, ty, tw, th)) => (tx + tw / 2, ty + th / 2),
        None => {
            // Tray dikdörtgeni yoksa: fare imlecinin olduğu monitör.
            let (mx, my) = cursor_pos().unwrap_or((0, 0));
            (mx, my)
        }
    };
    let work = work_area_at(cx, cy).unwrap_or((0, 0, w.max(1), h.max(1)));
    let fallback_tray = tray.unwrap_or((cx - 1, cy - 1, 2, 2));
    let (x, y) = flyout_pos(fallback_tray, (w, h), work);
    let _ = win.set_position(Position::Physical(tauri::PhysicalPosition::new(x, y)));
    let _ = win.show();
    let _ = win.set_focus();
}

/// Fare imlecinin fiziksel ekran konumu (spawn gerektirmez, mikro saniyeler).
fn cursor_pos() -> Option<(i32, i32)> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut pt = POINT::default();
    // Guvenli: cikti yerel degiskene bagli.
    if unsafe { GetCursorPos(&mut pt) }.is_err() {
        return None;
    }
    Some((pt.x, pt.y))
}

/// Flyout'u gizler (pencere yoksa sessizce geçer).
fn hide_flyout(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("flyout") {
        let _ = w.hide();
    }
}

/// Ana pencereyi gösterir ve öne getirir.
fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
async fn brightness_get() -> Result<u8, String> {
    run_blocking(get_brightness).await?
}

#[tauri::command]
async fn brightness_set(value: u8) -> Result<u8, String> {
    run_blocking(move || set_brightness(value)).await?
}

#[tauri::command]
async fn is_fullscreen() -> bool {
    // Win32 pencere sorgusu mikro saniyeler surer; dogrudan calisirilir.
    query_fullscreen()
}

#[tauri::command]
async fn foreground_exe() -> Option<String> {
    query_foreground_exe()
}

#[tauri::command]
async fn foreground_blocked(list: Vec<String>) -> Option<String> {
    let exe = query_foreground_exe()?;
    let refs: Vec<&str> = list.iter().map(|s| s.as_str()).collect();
    is_blocked(&exe, &refs).then_some(exe)
}

#[tauri::command]
async fn autostart_get() -> Result<bool, String> {
    run_blocking(autostart_status).await?
}

#[tauri::command]
async fn autostart_set(enabled: bool) -> Result<(), String> {
    run_blocking(move || set_autostart(enabled)).await?
}

#[tauri::command]
async fn theme_get() -> Result<(String, Option<String>), String> {
    run_blocking(get_theme).await?
}

#[tauri::command]
async fn theme_set(name: String, mode: Option<String>) -> Result<(), String> {
    run_blocking(move || set_theme(&name, mode.as_deref())).await?
}

#[tauri::command]
async fn decide_target(
    hour: u8,
    minute: u8,
    source: String,
    level: String,
) -> (String, String, u8) {
    let lvl = Level::from_str(&level).unwrap_or(Level::Normal);
    let (name, mode, bright) = scene_target(Source::from_str(&source), hour % 24, minute % 60, lvl);
    (name.to_string(), mode.to_string(), bright)
}

#[tauri::command]
async fn decide_brightness(current: u8, desired: u8, hour: u8, minute: u8) -> u8 {
    next_brightness(current, desired, hour % 24, minute % 60)
}

/// Olcum seviyesini histerezle gunceller: tek bir gurultulu kare sahneyi
/// degistirmez (PLAN-v3 §4.1). Taninmayan `prev` icin `normal` kabul edilir.
#[tauri::command]
async fn decide_level(prev: String, lum: f32) -> String {
    let prev = Level::from_str(&prev).unwrap_or(Level::Normal);
    decide::next_level(prev, lum).as_str().to_string()
}

#[tauri::command]
async fn brightness_floor(hour: u8, minute: u8) -> u8 {
    decide::min_brightness(hour % 24, minute % 60)
}

#[tauri::command]
async fn light_sample() -> Result<(f32, f32, String, String), String> {
    run_blocking(move || -> Result<(f32, f32, String, String), String> {
        let s = sample_light()?;
        let (level, tone) = classify(s.luminance, s.warm_ratio);
        Ok((
            s.luminance,
            s.warm_ratio,
            level.to_string(),
            tone.to_string(),
        ))
    })
    .await?
}

#[tauri::command]
async fn log_tick(line: String) {
    let _ = run_blocking(move || write_disk_log(&line)).await;
}

#[tauri::command]
async fn log_lines(max: usize) -> Result<Vec<String>, String> {
    run_blocking(move || read_disk_log(max)).await?
}

#[tauri::command]
async fn log_clear() -> Result<(), String> {
    run_blocking(clear_disk_log).await?
}

/// Günlük dosyasını varsayılan editörde açar (destek akışı).
///
/// v2.11: "Raporu kopyala" tek başına yetmiyordu; kullanıcı günlüğü
/// `~/.config/opencode` içinde elle arıyordu. Dosya yoksa/açılamazsa
/// klasörünü açar. Yol sabittir, komut parametre almaz (yol geçişi yok).
#[tauri::command]
async fn open_log(app: AppHandle) -> Result<String, String> {
    use tauri_plugin_opener::OpenerExt;
    let path = logger::log_path()?;
    let shown = path.to_string_lossy().to_string();
    if path.exists()
        && app
            .opener()
            .open_path(shown.clone(), None::<String>)
            .is_ok()
    {
        return Ok(shown);
    }
    let dir = path
        .parent()
        .ok_or_else(|| "günlük klasörü bulunamadı".to_string())?;
    let dir_shown = dir.to_string_lossy().to_string();
    app.opener()
        .open_path(dir_shown.clone(), None::<String>)
        .map_err(|e| format!("günlük açılamadı: {e}"))?;
    Ok(dir_shown)
}

#[tauri::command]
async fn pref_learn(hour: u8, light: String, name: String, mode: String) {
    let _ = run_blocking(move || remember_pref(hour, &light, &name, &mode)).await;
}

#[tauri::command]
async fn pref_get(hour: u8, light: String, mode: String) -> Option<(String, String)> {
    run_blocking(move || lookup_pref(hour, &light, &mode))
        .await
        .ok()
        .flatten()
}

#[tauri::command]
async fn pref_list() -> Vec<(u8, String, String, String)> {
    run_blocking(list_prefs).await.unwrap_or_default()
}

#[tauri::command]
async fn pref_clear() {
    let _ = run_blocking(wipe_prefs).await;
}

#[tauri::command]
async fn battery_status() -> Result<(u8, bool), String> {
    run_blocking(query_battery_status).await?
}

#[tauri::command]
async fn stats_summary() -> Result<stats::Summary, String> {
    run_blocking(stats::summarize_now).await?
}

#[tauri::command]
async fn gamma_set_warmth(percent: u8) -> Result<(), String> {
    run_blocking(move || gamma::set_warmth(percent)).await?
}

#[tauri::command]
async fn gamma_restore() -> Result<(), String> {
    run_blocking(gamma::restore_original).await?
}

/// Yazimdan sonra geri okuma: (beklenen, okunan) mavi orta ton yuzdesi.
/// Surucu rampayi sessizce reddettiyse fark buyuk cikar; arayuz loglar.
#[tauri::command]
async fn gamma_verify_warmth(percent: u8) -> Result<(u8, u8), String> {
    run_blocking(move || gamma::verify_warmth(percent)).await?
}

/// Saat + isik seviyesine gore otomatik sicak ton siddeti (0..=100).
#[tauri::command]
async fn warmth_auto(hour: u8, minute: u8, light_level: String) -> Result<u8, String> {
    Ok(decide::warmth_auto(hour % 24, minute % 60, &light_level))
}

/// Hedefe gore parlaklik FARKINI ogrenir (delta, −20..+20).
#[tauri::command]
async fn pref_learn_bright(hour: u8, light: String, delta: i8) {
    let _ = run_blocking(move || prefs::learn_bright(hour, &light, delta)).await;
}

/// (ortalama delta, gozlem sayisi, farkli gun sayisi).
#[tauri::command]
async fn pref_get_bright(hour: u8, light: String) -> Option<(i8, u32, u32)> {
    run_blocking(move || prefs::get_bright(hour, &light))
        .await
        .ok()
        .flatten()
}

#[tauri::command]
async fn animations_set(enabled: bool) -> Result<(), String> {
    run_blocking(move || theme::set_animations(enabled)).await?
}

/// Kurulu tema dosyalarinin WCAG kontrast denetimi.
#[tauri::command]
async fn contrast_audit() -> Result<Vec<contrast::Report>, String> {
    run_blocking(move || -> Result<Vec<contrast::Report>, String> {
        contrast::audit_all(&contrast::themes_dir()?)
    })
    .await?
}

/// Sistem tanilamasi: parlaklik okuma/yazma, sicak ton surucusu, HDR,
/// monitorler, tema, otomatik baslatma, lisans ve gunluk.
///
/// `warmth`: uygulamanin su an kullandigi sicak ton siddeti. `0` ise gamma
/// rampasi **yazilmaz** (kullanicinin kalibrasyonunu ezmemek icin).
#[tauri::command]
async fn diagnose(warmth: u8) -> Result<diagnose::Report, String> {
    run_blocking(move || diagnose::run(warmth)).await
}

/// Bagli monitorlerin listesi (kimlik, ad, dahili/harici, parlaklik API'si).
#[tauri::command]
async fn monitor_list() -> Result<Vec<monitor::MonitorInfo>, String> {
    run_blocking(monitor::list).await?
}

/// Tek monitorun parlakligini okur (yuzde 0-100). Okuma bilincli olarak
/// serbesttir: ucretsiz kullanici listeyi ve degerleri gorebilir (teaser),
/// yalniz yazma kapilidir.
#[tauri::command]
async fn brightness_get_monitor(id: String) -> Result<u8, String> {
    run_blocking(move || monitor::get_brightness(&id)).await?
}

/// Tek monitorun parlakligini yazar (yuzde 0-100). Harici monitor (DDC)
/// kontrolu Pro lisans ister; dahili panel her zaman serbesttir. Pro kapisi
/// tek monitor taramasiyla cozulur; lisans yalniz harici yazmada sorgulanir.
#[tauri::command]
async fn brightness_set_monitor(id: String, value: u8) -> Result<(), String> {
    run_blocking(move || monitor::set_brightness_checked(&id, value, license::is_pro)).await?
}

/// Lisans durumu: Pro acik mi, kimde ve ne zaman verilmis.
#[tauri::command]
async fn license_status() -> license::LicenseStatus {
    run_blocking(license::status)
        .await
        .unwrap_or_else(|_| license::no_license())
}

/// Lisans anahtarini dogrular ve depoya yazar.
#[tauri::command]
async fn license_activate(key: String) -> Result<license::LicenseStatus, String> {
    run_blocking(move || license::activate(&key)).await?
}

/// Lisans kaydini siler (Pro kapisi kapanir).
#[tauri::command]
async fn license_deactivate() -> license::LicenseStatus {
    run_blocking(license::deactivate)
        .await
        .unwrap_or_else(|_| license::no_license())
}

/// Uygulamanın sürümü (flyout ayak bilgisi).
#[tauri::command]
async fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// HDR kapısı: herhangi bir çıkışta HDR (gelişmiş renk) açıksa `true`.
/// Flyout sözleşmesi tek boolean bekler; sorgu başarısızsa `false`.
#[tauri::command]
async fn hdr_status() -> bool {
    run_blocking(|| hdr::list().iter().any(|h| h.hdr))
        .await
        .unwrap_or(false)
}

/// Cihaz bazlı HDR durumu (kimlik + açık mı).
#[tauri::command]
async fn hdr_status_all() -> Result<Vec<hdr::HdrInfo>, String> {
    run_blocking(hdr::list).await
}

/// Flyout'u gizler.
#[tauri::command]
async fn flyout_hide(app: AppHandle) -> Result<(), String> {
    hide_flyout(&app);
    Ok(())
}

/// Bağlı monitörlerin DDC/CI renk sıcaklığı durumu (destek, anlık K, adım).
#[tauri::command]
async fn monitor_color_temp_info() -> Result<Vec<colortemp::ColorTempInfo>, String> {
    run_blocking(colortemp::info).await?
}

/// Monitörün renk sıcaklığını DDC/CI VCP 0x0C ile yazar (kelvin).
///
/// v3.0: kapı burada. Harici monitöre yazma Pro özelliğidir; okuma
/// (`monitor_color_temp_info`) her zaman serbesttir. Kapı eklenmeden önce bu
/// komut lisanssız da yazabiliyordu — `brightness_set_monitor` ile tutarsızdı.
#[tauri::command]
async fn monitor_set_color_temp(device: String, kelvin: i32) -> Result<(), String> {
    license::require_pro("harici monitöre renk sıcaklığı yazma")?;
    run_blocking(move || colortemp::set_color_temp(&device, kelvin)).await?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Kimlik göçü (v3.0) EN ÖNCE: pencere durumu ve WebView2 profili yeni
    // klasörde olmalı, yoksa kullanıcı paletini/şablonunu ve pencere
    // konumunu kaybeder. Eski klasör silinmez (geri alma tek adım).
    for note in identity::migrate_once() {
        logger::log_tick(&format!(
            "{} | source=setup/setup | level=info | tone=- | desired=- | applied=- | theme=- | note={note}",
            logger::now_local()
        ));
    }
    // Pencere yaratılmadan ÖNCE: window-state dosyasındaki eski varsayılan
    // boyutu (800x600) yeni varsayılana büyüt — yoksa güncelleme sonrası
    // kullanıcı yine sıkışmış pencereyi görür (v2.4.2).
    winstate::migrate_once();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Ikinci kopya acilirsa ilk pencereyi one getir; ikinci cikar.
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        // Flyout sabit konumda açılır (tray'e göre); window-state onu
        // kaydetmesin ya da geri yüklemesin.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["flyout"])
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Kendi goz konforu temalarimizi kur (eksikse), sonra onceki
            // oturumdan kalma sicak tonu temizle (crash sonrasi). Hatalar
            // smart-screen.log'a tek satir duser; uygulama yine dusmez.
            if let Err(e) = install::install_builtin_themes() {
                log_setup_error("tema kurulumu", &e);
            }
            if let Err(e) = gamma::recover() {
                log_setup_error("gamma kurtarma", &e);
            }
            // Flyout penceresi burada (setup'ta) yaratilir; tray olay
            // işleyicisi içinden pencere yaratmak Windows'ta kilitlenir.
            // visible(false): yalnız tray sol tıkla gösterilir.
            WebviewWindowBuilder::new(app, "flyout", WebviewUrl::App("flyout.html".into()))
                .title("smart-screen — hızlı panel")
                .inner_size(FLYOUT_W, FLYOUT_H)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .shadow(true)
                .visible(false)
                .build()
                .map_err(|e| format!("flyout penceresi açılamadı: {e}"))?;
            let open = MenuItem::with_id(app, "open", "Ayarlar", true, None::<&str>)?;
            let pause =
                CheckMenuItem::with_id(app, "pause", "1 saat duraklat", true, false, None::<&str>)?;
            let dayoff =
                CheckMenuItem::with_id(app, "dayoff", "Bugün kapat", true, false, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &pause, &dayoff, &separator, &quit])?;
            app.manage(TrayChecks { pause, dayoff });
            TrayIconBuilder::new()
                .menu(&menu)
                // Sol tık flyout açar; menü yalnız sağ tıkla çıkar.
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "pause" => {
                        if let Some(item) = app.try_state::<TrayChecks>() {
                            let on = item.pause.is_checked().unwrap_or(false);
                            let _ = item.pause.set_checked(!on);
                        }
                        let _ = app.emit("ss:action", serde_json::json!({ "action": "pause-1h" }));
                    }
                    "dayoff" => {
                        if let Some(item) = app.try_state::<TrayChecks>() {
                            let on = item.dayoff.is_checked().unwrap_or(false);
                            let _ = item.dayoff.set_checked(!on);
                        }
                        let _ = app.emit("ss:action", serde_json::json!({ "action": "day-off" }));
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect,
                        ..
                    } = event
                    {
                        let app = tray.app_handle().clone();
                        let rect = rect_tuple(&rect);
                        let visible = app
                            .get_webview_window("flyout")
                            .and_then(|w| w.is_visible().ok())
                            .unwrap_or(false);
                        if visible {
                            // duzeltme (md.3): elle kapatma da damgalanır —
                            // hemen ardından gelen odak-kaybı hide()'ı bu tığı
                            // "kapatma" sayacak, pencereyi geri açmayacak.
                            note_flyout_hidden();
                            hide_flyout(&app);
                        } else if should_toggle_open(visible, ms_since_flyout_autohide()) {
                            show_flyout(&app, Some(rect));
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|w, e| match e {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // Ana pencere ve flyout kapatma isteginde gizlenir; uygulama
                // tray'de yasamaya devam eder.
                api.prevent_close();
                let _ = w.hide();
            }
            tauri::WindowEvent::Focused(false) if w.label() == "flyout" => {
                // Flyout odak kaybedince kapanir (hızlı panel davranışı);
                // ana pencere odak kaybında gizlenmez. duzeltme (md.3):
                // gizlenme damgalanır ki hemen ardından gelen tray tığı
                // pencereyi hemen geri açmasın (toggle yarışı).
                note_flyout_hidden();
                let _ = w.hide();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            brightness_get,
            brightness_set,
            is_fullscreen,
            foreground_exe,
            foreground_blocked,
            autostart_get,
            autostart_set,
            theme_get,
            theme_set,
            decide_target,
            decide_brightness,
            decide_level,
            brightness_floor,
            light_sample,
            log_tick,
            log_lines,
            log_clear,
            open_log,
            pref_learn,
            pref_get,
            pref_list,
            pref_clear,
            battery_status,
            stats_summary,
            gamma_set_warmth,
            gamma_restore,
            gamma_verify_warmth,
            warmth_auto,
            pref_learn_bright,
            pref_get_bright,
            animations_set,
            contrast_audit,
            diagnose,
            monitor_list,
            brightness_get_monitor,
            brightness_set_monitor,
            license_status,
            license_activate,
            license_deactivate,
            app_version,
            hdr_status,
            hdr_status_all,
            flyout_hide,
            monitor_color_temp_info,
            monitor_set_color_temp
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flyout_pos_centers_on_tray_and_sits_above_work_area() {
        // Tray ekranın ortasında, 40 px genişlik.
        let tray = (780, 1060, 40, 40);
        let win = (340, 420);
        let work = (0, 0, 1600, 1040); // görev çubuğu hariç
        let (x, y) = flyout_pos(tray, win, work);
        assert_eq!(x, 800 - 170, "tray merkezine hizalanmalı");
        assert_eq!(y, 1040 - 420 - 8, "çalışma alanı altından 8 px yukarıda");
    }

    #[test]
    fn flyout_pos_clamps_to_work_area() {
        let tray = (10, 1060, 40, 40); // sol kenara yakın
        let win = (340, 420);
        let work = (0, 0, 1600, 1040);
        let (x, y) = flyout_pos(tray, win, work);
        assert_eq!(x, 0, "sol kenardan taşmamalı");
        assert!(y >= 0 && y + 420 <= 1040, "çalışma alanı içinde kalmalı");
        // Sağ kenara yakın tray.
        let tray = (1560, 1060, 40, 40);
        let (x, _) = flyout_pos(tray, win, work);
        assert_eq!(x, 1600 - 340, "sağ kenardan taşmamalı");
    }

    #[test]
    fn flyout_pos_survives_oversized_window() {
        // Pencere çalışma alanından büyükse clamp min>max olmamalı.
        let (x, y) = flyout_pos((780, 1060, 40, 40), (2000, 2000), (0, 0, 1600, 1040));
        assert_eq!((x, y), (0, 0), "kenara yaslanmalı, paniklememeli");
    }

    #[test]
    fn rect_tuple_flattens_physical() {
        let rect = Rect {
            position: Position::Physical(tauri::PhysicalPosition::new(10, 20)),
            size: Size::Physical(tauri::PhysicalSize::new(30, 40)),
        };
        assert_eq!(rect_tuple(&rect), (10, 20, 30, 40));
    }

    #[test]
    fn rect_tuple_flattens_logical() {
        let rect = Rect {
            position: Position::Logical(tauri::LogicalPosition::new(10.6, 20.2)),
            size: Size::Logical(tauri::LogicalSize::new(30.0, 40.0)),
        };
        assert_eq!(rect_tuple(&rect), (10, 20, 30, 40));
    }

    // duzeltme (md.3): tray toggle yarışı — saf karar fonksiyonu.

    #[test]
    fn tray_toggle_opens_when_no_recent_autohide() {
        assert!(should_toggle_open(false, None), "damga yoksa açmalı");
        assert!(
            should_toggle_open(false, Some(10_000)),
            "eski gizlenme açmayı engellememeli"
        );
    }

    #[test]
    fn tray_toggle_treats_recent_autohide_as_close() {
        assert!(
            !should_toggle_open(false, Some(0)),
            "0 ms: yeniden açmamalı"
        );
        assert!(
            !should_toggle_open(false, Some(299)),
            "299 ms: yeniden açmamalı"
        );
        assert!(
            should_toggle_open(false, Some(300)),
            "300 ms: sınırı geçince açmalı"
        );
        assert!(should_toggle_open(false, Some(301)), "301 ms: açmalı");
    }

    #[test]
    fn tray_toggle_never_opens_while_visible() {
        assert!(!should_toggle_open(true, None), "görünürken açma yok");
        assert!(!should_toggle_open(true, Some(0)));
    }
}
