//! Tauri komutlari: on yuz (TUI/panel) <-> backend koprusu.

mod activity;
mod autostart;
mod battery;
mod brightness;
mod decide;
mod gamma;
mod light;
mod logger;
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

#[tauri::command]
fn brightness_get() -> Result<u8, String> {
    get_brightness()
}

#[tauri::command]
fn brightness_set(value: u8) -> Result<(), String> {
    set_brightness(value)
}

#[tauri::command]
fn is_fullscreen() -> bool {
    query_fullscreen()
}

#[tauri::command]
fn foreground_exe() -> Option<String> {
    query_foreground_exe()
}

#[tauri::command]
fn foreground_blocked(list: Vec<String>) -> Option<String> {
    let exe = query_foreground_exe()?;
    let refs: Vec<&str> = list.iter().map(|s| s.as_str()).collect();
    is_blocked(&exe, &refs).then(|| exe)
}

#[tauri::command]
fn autostart_get() -> Result<bool, String> {
    autostart_status()
}

#[tauri::command]
fn autostart_set(enabled: bool) -> Result<(), String> {
    set_autostart(enabled)
}

#[tauri::command]
fn theme_get() -> Result<(String, Option<String>), String> {
    get_theme()
}

#[tauri::command]
fn theme_set(name: String, mode: Option<String>) -> Result<(), String> {
    set_theme(&name, mode.as_deref())
}

#[tauri::command]
fn decide_target(hour: u8, source: String) -> (String, String, u8) {
    let (name, mode, bright) = scene_target(Source::from_str(&source), hour % 24);
    (name.to_string(), mode.to_string(), bright)
}

#[tauri::command]
fn decide_brightness(current: u8, desired: u8, hour: u8, minute: u8) -> u8 {
    next_brightness(current, desired, hour % 24, minute % 60)
}

#[tauri::command]
fn brightness_floor(hour: u8, minute: u8) -> u8 {
    decide::min_brightness(hour % 24, minute % 60)
}

#[tauri::command]
fn light_sample() -> Result<(f32, f32, String, String), String> {
    let s = sample_light()?;
    let (level, tone) = classify(s.luminance, s.warm_ratio);
    Ok((
        s.luminance,
        s.warm_ratio,
        level.to_string(),
        tone.to_string(),
    ))
}

#[tauri::command]
fn log_tick(line: String) {
    write_disk_log(&line);
}

#[tauri::command]
fn log_lines(max: usize) -> Result<Vec<String>, String> {
    read_disk_log(max)
}

#[tauri::command]
fn log_clear() -> Result<(), String> {
    clear_disk_log()
}

#[tauri::command]
fn pref_learn(hour: u8, light: String, name: String, mode: String) {
    remember_pref(hour, &light, &name, &mode);
}

#[tauri::command]
fn pref_get(hour: u8, light: String) -> Option<(String, String)> {
    lookup_pref(hour, &light)
}

#[tauri::command]
fn pref_list() -> Vec<(u8, String, String, String)> {
    list_prefs()
}

#[tauri::command]
fn pref_clear() {
    wipe_prefs();
}

#[tauri::command]
fn battery_status() -> Result<(u8, bool), String> {
    query_battery_status()
}

#[tauri::command]
fn stats_summary() -> Result<stats::Summary, String> {
    stats::summarize_now()
}

#[tauri::command]
fn gamma_set_warmth(percent: u8) -> Result<(), String> {
    gamma::set_warmth(percent)
}

#[tauri::command]
fn gamma_restore() -> Result<(), String> {
    gamma::restore_identity()
}

#[tauri::command]
fn pref_learn_bright(hour: u8, light: String, value: u8) {
    prefs::learn_bright(hour, &light, value);
}

#[tauri::command]
fn pref_get_bright(hour: u8, light: String) -> Option<(u8, u32)> {
    prefs::get_bright(hour, &light)
}

#[tauri::command]
fn animations_set(enabled: bool) -> Result<(), String> {
    theme::set_animations(enabled)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
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
            pref_learn_bright,
            pref_get_bright,
            animations_set
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
