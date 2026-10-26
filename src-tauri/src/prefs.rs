// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! Kullanici tema tercihleri: saat + isik seviyesi -> (tema, mod).
//! El ile yapilan secimler kaydedilir, ayni kosulda once onlar uygulanir.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

/// Yazma islemlerini (ok-degistir-yaz) kilitleyen kilit: ayni andaki iki
/// tercih yazisi dosyayi cakistirmasin. Dosya semasi DEGISMEZ.
static LOCK: Mutex<()> = Mutex::new(());

fn guard() -> MutexGuard<'static, ()> {
    match LOCK.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    }
}

/// Gecici yazma dosyasinin adi: PID ekli ki paralel yazismalar cakismasin.
fn tmp_path(path: &Path) -> PathBuf {
    path.with_extension(format!("json.tmp-{}", std::process::id()))
}

#[derive(Serialize, Deserialize, Clone)]
struct Pref {
    hour: u8,
    light: String,
    name: String,
    mode: String,
    /// Son ogrenme zamani (unix sn). Eski kayitlarda yok → 0 (en eski).
    #[serde(default)]
    seen: u64,
}

/// Parlaklik tercihi: hedefe gore **delta** (mutlak parlaklik DEGIL),
/// isaretli toplam + gozlem sayisi + farkli gunler (PLAN-v3 §4.1/7).
///
/// v2.5: eski sema mutlak parlakligi ortaliyordu; ogrenilen deger yillarca
/// ayni kalip sahne hedefini eziyordu (sikayet: "durduk yere cok kisik").
#[derive(Serialize, Deserialize, Clone)]
struct BrightPref {
    hour: u8,
    light: String,
    /// Isaretli delta toplami (ornek: -5, +8).
    #[serde(default)]
    total: i32,
    #[serde(default)]
    count: u32,
    /// Gozlem yapilan farkli gunler ("YYYY-MM-DD"), en fazla 14 tutulur.
    #[serde(default)]
    days: Vec<String>,
}

#[derive(Serialize, Deserialize, Default)]
struct Store {
    #[serde(default)]
    prefs: Vec<Pref>,
    #[serde(default)]
    bright: Vec<BrightPref>,
    /// Semanin surumu; ileride migration icin. 0 = eski format.
    #[serde(default)]
    version: u32,
}

/// Sema surumu. 2 = parlaklik ogrenmesi delta + gun bazli.
const STORE_VERSION: u32 = 2;
/// Bir tercihte tutulan farkli gun sayisi.
const MAX_DAYS: usize = 14;

fn prefs_path() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE").map_err(|e| format!("USERPROFILE yok: {e}"))?;
    Ok(PathBuf::from(home)
        .join(".config")
        .join("opencode")
        .join("smart-screen-prefs.json"))
}

pub fn learn_pref(hour: u8, light: &str, name: &str, mode: &str) {
    let _guard = guard();
    if let Ok(p) = prefs_path() {
        let _ = learn_at(&p, hour, light, name, mode);
    }
}

pub fn get_pref(hour: u8, light: &str, want_mode: &str) -> Option<(String, String)> {
    let _guard = guard();
    let p = prefs_path().ok()?;
    lookup_at(&p, hour, light, want_mode)
}

pub fn list_prefs() -> Vec<(u8, String, String, String)> {
    let _guard = guard();
    match prefs_path().ok() {
        Some(p) => load(&p)
            .prefs
            .into_iter()
            .map(|f| (f.hour, f.light, f.name, f.mode))
            .collect(),
        None => Vec::new(),
    }
}

pub fn clear_prefs() {
    let _guard = guard();
    if let Ok(p) = prefs_path() {
        let _ = save(&p, &Store::default());
    }
}

/// Kullanicinin sectigi parlakligin o anki hedefe gore FARKINI ogrenir
/// (delta, mutlak parlaklik degil); gozlem sayisini ve gun cesidini artirir.
pub fn learn_bright(hour: u8, light: &str, delta: i8) {
    let _guard = guard();
    if let Ok(p) = prefs_path() {
        let day = chrono::Local::now().format("%Y-%m-%d").to_string();
        let _ = learn_bright_at(&p, hour, light, delta, &day);
    }
}

/// Ogrenilmis ortalama delta + gozlem sayisi + farkli gun sayisi.
pub fn get_bright(hour: u8, light: &str) -> Option<(i8, u32, u32)> {
    let _guard = guard();
    let p = prefs_path().ok()?;
    lookup_bright_at(&p, hour, light)
}

fn load(path: &PathBuf) -> Store {
    let text = fs::read_to_string(path).unwrap_or_default();
    let mut store: Store = match serde_json::from_str(&text) {
        Ok(s) => s,
        Err(_) => {
            if !text.trim().is_empty() {
                let _ = fs::write(path.with_extension("json.bak"), &text);
            }
            Store::default()
        }
    };
    // Migration: v1 parlaklik ogrenmesi MUTLAK degeri sakliyordu. Delta
    // semasina cevrilemez (o anki hedef bilinmiyor) → temizlenir; tema
    // tercihleri korunur. Boylece sahneyi ezen eski ogrenme bir daha
    // uygulanmaz (PLAN-v3 §2/A4).
    if store.version < STORE_VERSION {
        if store.version < 2 {
            store.bright.clear();
        }
        store.version = STORE_VERSION;
        let _ = save(path, &store);
    }
    store
}

fn save(path: &PathBuf, store: &Store) -> Result<(), String> {
    let mut doc: Value = fs::read_to_string(path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    if let Some(obj) = doc.as_object_mut() {
        let list = serde_json::to_value(&store.prefs).map_err(|e| e.to_string())?;
        obj.insert("prefs".to_string(), list);
        let bright = serde_json::to_value(&store.bright).map_err(|e| e.to_string())?;
        obj.insert("bright".to_string(), bright);
        obj.insert("version".to_string(), serde_json::json!(store.version));
    } else {
        return Err("prefs kok obje degil".to_string());
    }
    let text = serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())?;
    let tmp = tmp_path(path);
    fs::write(&tmp, text + "\n").map_err(|e| format!("prefs temp yazilamadi: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("prefs yeniden adlandirilamadi: {e}"))?;
    Ok(())
}

fn learn_at(path: &PathBuf, hour: u8, light: &str, name: &str, mode: &str) -> Result<(), String> {
    let mut store = load(path);
    match store
        .prefs
        .iter_mut()
        .find(|p| p.hour == hour && p.light == light)
    {
        Some(slot) => {
            slot.name = name.to_string();
            slot.mode = mode.to_string();
            slot.seen = now_secs();
        }
        None => store.prefs.push(Pref {
            hour,
            light: light.to_string(),
            name: name.to_string(),
            mode: mode.to_string(),
            seen: now_secs(),
        }),
    }
    save(path, &store)
}

/// Simdiki zaman (unix sn); kilitli olmayan basit okuma.
fn now_secs() -> u64 {
    chrono::Utc::now().timestamp().max(0) as u64
}

/// Isik anahtarinin seviye parcasi: `dim/warm` -> `dim`.
fn light_level(light: &str) -> &str {
    light.split('/').next().unwrap_or(light)
}

/// Tema tercihini uc kademeli bulur (PLAN-v3 §4.1):
/// 1. tam kosul (saat + isik) — kullanicinin o kosuldaki acik secimi,
/// 2. ayni saat + ayni isik SEVIYESI (ton farkli) — sahne salinmasin,
/// 3. ayni saat + ayni MOD — **isik yok sayilir ama mod korunur**.
///
/// Eski davranis (v2.4): 3. kademe modu yok sayiyordu ve o saatteki ILK
/// kaydi donduruyordu; gece yarisinda `github/light` gibi acik tema
/// uygulanip parlaklik 30'da kalabiliyordu (PLAN-v3 §2/A5).
fn lookup_at(path: &PathBuf, hour: u8, light: &str, want_mode: &str) -> Option<(String, String)> {
    let store = load(path);
    if let Some(p) = store
        .prefs
        .iter()
        .find(|p| p.hour == hour && p.light == light)
    {
        return Some((p.name.clone(), p.mode.clone()));
    }
    let level = light_level(light);
    if let Some(p) = store
        .prefs
        .iter()
        .filter(|p| p.hour == hour && light_level(&p.light) == level)
        .max_by_key(|p| p.seen)
    {
        return Some((p.name.clone(), p.mode.clone()));
    }
    store
        .prefs
        .iter()
        .filter(|p| p.hour == hour && p.mode == want_mode)
        .max_by_key(|p| p.seen)
        .map(|p| (p.name.clone(), p.mode.clone()))
}

/// Ogrenilen delta −20..+20 araligina kelepcelenir (PLAN-v3 §4.1/7).
pub const DELTA_LIMIT: i32 = 20;

fn learn_bright_at(
    path: &PathBuf,
    hour: u8,
    light: &str,
    delta: i8,
    day: &str,
) -> Result<(), String> {
    let delta = i32::from(delta).clamp(-DELTA_LIMIT, DELTA_LIMIT);
    let mut store = load(path);
    match store
        .bright
        .iter_mut()
        .find(|p| p.hour == hour && p.light == light)
    {
        Some(slot) => {
            slot.total += delta;
            slot.count += 1;
            push_day(&mut slot.days, day);
        }
        None => store.bright.push(BrightPref {
            hour,
            light: light.to_string(),
            total: delta,
            count: 1,
            days: vec![day.to_string()],
        }),
    }
    save(path, &store)
}

/// Gun listesine tekilleştirerek ekler; en fazla `MAX_DAYS` tutar.
fn push_day(days: &mut Vec<String>, day: &str) {
    if days.iter().any(|d| d == day) {
        return;
    }
    days.push(day.to_string());
    if days.len() > MAX_DAYS {
        days.remove(0);
    }
}

fn lookup_bright_at(path: &PathBuf, hour: u8, light: &str) -> Option<(i8, u32, u32)> {
    let store = load(path);
    let level = light_level(light);
    let slot = store
        .bright
        .iter()
        .find(|p| p.hour == hour && p.light == light)
        // Once ayni saat + ayni seviye (en cok gozlem), sonra ayni saat.
        .or_else(|| {
            store
                .bright
                .iter()
                .filter(|p| p.hour == hour && light_level(&p.light) == level)
                .max_by_key(|p| p.count)
        })
        .or_else(|| {
            store
                .bright
                .iter()
                .filter(|p| p.hour == hour)
                .max_by_key(|p| p.count)
        })?;
    let avg = (f64::from(slot.total) / f64::from(slot.count.max(1))).round() as i8;
    Some((avg, slot.count, slot.days.len() as u32))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ss-prefs-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir.join(format!("{name}.json"))
    }

    #[test]
    fn learns_and_finds_exact() {
        let p = tmp("exact");
        learn_at(&p, 18, "dim/warm", "catppuccin-macchiato", "dark").unwrap();
        assert_eq!(
            lookup_at(&p, 18, "dim/warm", "dark"),
            Some(("catppuccin-macchiato".into(), "dark".into()))
        );
        fs::remove_file(&p).ok();
    }

    #[test]
    fn falls_back_to_same_hour_and_level() {
        let p = tmp("hour");
        learn_at(&p, 18, "dim/warm", "tokyonight", "dark").unwrap();
        // Ayni saat, farkli ton ama ayni seviye: tercih korunur.
        assert_eq!(
            lookup_at(&p, 18, "dim/neutral", "dark"),
            Some(("tokyonight".into(), "dark".into()))
        );
        fs::remove_file(&p).ok();
    }

    #[test]
    fn falls_back_to_same_hour_and_mode_only() {
        let p = tmp("mode");
        learn_at(&p, 18, "dim/warm", "tokyonight", "dark").unwrap();
        // Seviye farkli (bright), mod ayni: mod korunur, ışık yok sayılır.
        assert_eq!(
            lookup_at(&p, 18, "bright/neutral", "dark"),
            Some(("tokyonight".into(), "dark".into()))
        );
        // Mod uyusmuyorsa tercih DONDURULMEZ: sahne kendi temasini secer.
        assert_eq!(lookup_at(&p, 18, "bright/neutral", "light"), None);
        fs::remove_file(&p).ok();
    }

    #[test]
    fn light_theme_never_leaks_into_dark_scene() {
        // Gercek vaka (PLAN-v3 §2/A5): gece yarisinda ogrenilmis acik tema.
        let p = tmp("midnight");
        learn_at(&p, 0, "normal/neutral", "github", "light").unwrap();
        learn_at(&p, 0, "dark/neutral", "tokyonight", "dark").unwrap();
        // 00:00, olcum dark/cool: ton tutmaz, seviye tutar -> koyu tema.
        assert_eq!(
            lookup_at(&p, 0, "dark/cool", "dark"),
            Some(("tokyonight".into(), "dark".into()))
        );
        // Seviye de tutmazsa yalniz MOD eslesir; acik tema asla donmez.
        assert_eq!(
            lookup_at(&p, 0, "dim/warm", "dark"),
            Some(("tokyonight".into(), "dark".into()))
        );
        fs::remove_file(&p).ok();
    }

    #[test]
    fn newest_slot_wins_in_fallback() {
        let p = tmp("newest");
        learn_at(&p, 18, "dim/warm", "eski", "dark").unwrap();
        learn_at(&p, 18, "bright/cool", "yeni", "dark").unwrap();
        assert_eq!(
            lookup_at(&p, 18, "normal/neutral", "dark"),
            Some(("yeni".into(), "dark".into()))
        );
        fs::remove_file(&p).ok();
    }

    #[test]
    fn overwrites_same_slot() {
        let p = tmp("overwrite");
        learn_at(&p, 18, "dim/warm", "a", "dark").unwrap();
        learn_at(&p, 18, "dim/warm", "b", "dark").unwrap();
        let store = load(&p);
        assert_eq!(store.prefs.len(), 1);
        assert_eq!(store.prefs[0].name, "b");
        fs::remove_file(&p).ok();
    }

    #[test]
    fn unknown_slot_is_none() {
        let p = tmp("unknown");
        assert_eq!(lookup_at(&p, 9, "x", "dark"), None);
        fs::remove_file(&p).ok();
    }

    #[test]
    fn learns_brightness_delta_average_and_days() {
        let p = tmp("bright");
        learn_bright_at(&p, 18, "dim/warm", 6, "2026-10-01").unwrap();
        learn_bright_at(&p, 18, "dim/warm", 4, "2026-10-02").unwrap();
        // Ayni gun ikinci gozlem gun sayisini artirmaz.
        learn_bright_at(&p, 18, "dim/warm", 8, "2026-10-02").unwrap();
        assert_eq!(lookup_bright_at(&p, 18, "dim/warm"), Some((6, 3, 2)));
        fs::remove_file(&p).ok();
    }

    #[test]
    fn brightness_delta_is_clamped() {
        let p = tmp("bright-clamp");
        learn_bright_at(&p, 12, "normal/neutral", 90, "2026-10-01").unwrap();
        learn_bright_at(&p, 12, "normal/neutral", -90, "2026-10-01").unwrap();
        // +20 ve -20 ortalamasi 0; sinir asilmadi.
        assert_eq!(lookup_bright_at(&p, 12, "normal/neutral"), Some((0, 2, 1)));
        fs::remove_file(&p).ok();
    }

    #[test]
    fn brightness_falls_back_to_hour_only() {
        let p = tmp("bright-hour");
        learn_bright_at(&p, 20, "dark/neutral", -5, "2026-10-01").unwrap();
        assert_eq!(lookup_bright_at(&p, 20, "dim/warm"), Some((-5, 1, 1)));
        assert_eq!(lookup_bright_at(&p, 9, "dim/warm"), None);
        fs::remove_file(&p).ok();
    }

    #[test]
    fn v1_absolute_brightness_is_dropped_on_migration() {
        // v2.4 dosyasi: mutlak parlaklik ortalamalari + tema tercihi.
        let p = tmp("migrate");
        fs::write(
            &p,
            r#"{"prefs":[{"hour":18,"light":"dim/warm","name":"tokyonight","mode":"dark"}],
                "bright":[{"hour":18,"light":"dim/warm","total":135,"count":3}],
                "version":1}"#,
        )
        .unwrap();
        // Eski ogrenme uygulanmaz...
        assert_eq!(lookup_bright_at(&p, 18, "dim/warm"), None);
        // ...tema tercihi korunur.
        assert_eq!(
            lookup_at(&p, 18, "dim/warm", "dark"),
            Some(("tokyonight".into(), "dark".into()))
        );
        let doc: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&p).unwrap()).unwrap();
        assert_eq!(doc["version"], 2);
        assert_eq!(doc["bright"].as_array().unwrap().len(), 0);
        fs::remove_file(&p).ok();
    }

    #[test]
    fn corrupt_json_starts_clean_and_keeps_backup() {
        let p = tmp("corrupt");
        fs::write(&p, "{bozuk!!").unwrap();
        assert_eq!(lookup_at(&p, 18, "dim/warm", "dark"), None);
        let bak = p.with_extension("json.bak");
        assert!(bak.exists(), "bozuk dosya yedeklenmeliydi");
        learn_at(&p, 18, "dim/warm", "vesper", "dark").unwrap();
        assert_eq!(load(&p).prefs.len(), 1);
        fs::remove_file(&p).ok();
        fs::remove_file(bak).ok();
    }
}
