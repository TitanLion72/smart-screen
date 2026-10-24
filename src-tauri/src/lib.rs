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
mod contrast;
mod decide;
mod gamma;
mod install;
mod license;
mod light;
mod logger;
mod monitor;
mod prefs;
mod ps;
mod stats;
mod theme;

use activity::{
    foreground_exe as query_foreground_exe, is_blocked, is_fullscreen as query_fullscreen,
};
use autostart::{autostart_status, set_autostart};
use battery::battery_status as query_battery_status;
use brightness::{get_brightness, set_brightness};
use decide::{next_brightness, scene_target, Source};
use light::{classify, sample_light};
use logger::{
    clear_log as clear_disk_log, log_tick as write_disk_log, read_lines as read_disk_log,
};
use prefs::{
    clear_prefs as wipe_prefs, get_pref as lookup_pref, learn_pref as remember_pref, list_prefs,
};
use tauri::Manager;
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
    let now = chrono::Utc::now().to_rfc3339();
    write_disk_log(&format!(
        "{now} | source=setup/setup | level=warn | tone=- | desired=- | \
         applied=- | theme=- | note={what}: {err}"
    ));
}

#[tauri::command]
async fn brightness_get() -> Result<u8, String> {
    run_blocking(get_brightness).await?
}

#[tauri::command]
async fn brightness_set(value: u8) -> Result<(), String> {
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
async fn decide_target(hour: u8, source: String) -> (String, String, u8) {
    let (name, mode, bright) = scene_target(Source::from_str(&source), hour % 24);
    (name.to_string(), mode.to_string(), bright)
}

#[tauri::command]
async fn decide_brightness(current: u8, desired: u8, hour: u8, minute: u8) -> u8 {
    next_brightness(current, desired, hour % 24, minute % 60)
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

#[tauri::command]
async fn pref_learn(hour: u8, light: String, name: String, mode: String) {
    let _ = run_blocking(move || remember_pref(hour, &light, &name, &mode)).await;
}

#[tauri::command]
async fn pref_get(hour: u8, light: String) -> Option<(String, String)> {
    run_blocking(move || lookup_pref(hour, &light))
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

/// Saat + isik seviyesine gore otomatik sicak ton siddeti (0..=45).
#[tauri::command]
async fn warmth_auto(hour: u8, minute: u8, light_level: String) -> Result<u8, String> {
    Ok(decide::warmth_auto(hour % 24, minute % 60, &light_level))
}

#[tauri::command]
async fn pref_learn_bright(hour: u8, light: String, value: u8) {
    let _ = run_blocking(move || prefs::learn_bright(hour, &light, value)).await;
}

#[tauri::command]
async fn pref_get_bright(hour: u8, light: String) -> Option<(u8, u32)> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Ikinci kopya acilirsa ilk pencereyi one getir; ikinci cikar.
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
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
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::TrayIconBuilder;
            let open = MenuItem::with_id(app, "open", "Ac", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Cikis", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|w, e| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                api.prevent_close();
                let _ = w.hide();
            }
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
            brightness_floor,
            light_sample,
            log_tick,
            log_lines,
            log_clear,
            pref_learn,
            pref_get,
            pref_list,
            pref_clear,
            battery_status,
            stats_summary,
            gamma_set_warmth,
            gamma_restore,
            warmth_auto,
            pref_learn_bright,
            pref_get_bright,
            animations_set,
            contrast_audit,
            monitor_list,
            brightness_get_monitor,
            brightness_set_monitor,
            license_status,
            license_activate,
            license_deactivate
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
