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
}

/// Parlaklik tercihi: toplam + gozlem sayisi (ortalama = toplam/sayi).
#[derive(Serialize, Deserialize, Clone)]
struct BrightPref {
    hour: u8,
    light: String,
    total: u32,
    count: u32,
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

const STORE_VERSION: u32 = 1;

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

pub fn get_pref(hour: u8, light: &str) -> Option<(String, String)> {
    let _guard = guard();
    let p = prefs_path().ok()?;
    lookup_at(&p, hour, light)
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

/// Kullanicinin el ile kullandigi parlakligi ogrenir; gozlem sayisini artirir.
pub fn learn_bright(hour: u8, light: &str, value: u8) {
    let _guard = guard();
    if let Ok(p) = prefs_path() {
        let _ = learn_bright_at(&p, hour, light, value);
    }
}

/// Ogrenilmis ortalama parlaklik + gozlem sayisi (guven gostergesi).
pub fn get_bright(hour: u8, light: &str) -> Option<(u8, u32)> {
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
    // Migration hook: eski format (version 0) -> mevcut sema.
    if store.version < STORE_VERSION {
        store.version = STORE_VERSION;
        // Burada eski alanlar yenilenecek (su an sema degismedi).
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
        }
        None => store.prefs.push(Pref {
            hour,
            light: light.to_string(),
            name: name.to_string(),
            mode: mode.to_string(),
        }),
    }
    save(path, &store)
}

fn lookup_at(path: &PathBuf, hour: u8, light: &str) -> Option<(String, String)> {
    let store = load(path);
    store
        .prefs
        .iter()
        .find(|p| p.hour == hour && p.light == light)
        .or_else(|| store.prefs.iter().find(|p| p.hour == hour))
        .map(|p| (p.name.clone(), p.mode.clone()))
}

fn learn_bright_at(path: &PathBuf, hour: u8, light: &str, value: u8) -> Result<(), String> {
    let mut store = load(path);
    match store
        .bright
        .iter_mut()
        .find(|p| p.hour == hour && p.light == light)
    {
        Some(slot) => {
            slot.total += u32::from(value);
            slot.count += 1;
        }
        None => store.bright.push(BrightPref {
            hour,
            light: light.to_string(),
            total: u32::from(value),
            count: 1,
        }),
    }
    save(path, &store)
}

fn lookup_bright_at(path: &PathBuf, hour: u8, light: &str) -> Option<(u8, u32)> {
    let store = load(path);
    let slot = store
        .bright
        .iter()
        .find(|p| p.hour == hour && p.light == light)
        .or_else(|| store.bright.iter().find(|p| p.hour == hour))?;
    let avg = (slot.total / slot.count.max(1)) as u8;
    Some((avg, slot.count))
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
            lookup_at(&p, 18, "dim/warm"),
            Some(("catppuccin-macchiato".into(), "dark".into()))
        );
        fs::remove_file(&p).ok();
    }

    #[test]
    fn falls_back_to_hour_only() {
        let p = tmp("hour");
        learn_at(&p, 18, "dim/warm", "tokyonight", "dark").unwrap();
        assert_eq!(
            lookup_at(&p, 18, "bright/neutral"),
            Some(("tokyonight".into(), "dark".into()))
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
        assert_eq!(lookup_at(&p, 9, "x"), None);
        fs::remove_file(&p).ok();
    }

    #[test]
    fn learns_brightness_average_and_count() {
        let p = tmp("bright");
        learn_bright_at(&p, 18, "dim/warm", 40).unwrap();
        learn_bright_at(&p, 18, "dim/warm", 50).unwrap();
        assert_eq!(lookup_bright_at(&p, 18, "dim/warm"), Some((45, 2)));
        fs::remove_file(&p).ok();
    }

    #[test]
    fn brightness_falls_back_to_hour_only() {
        let p = tmp("bright-hour");
        learn_bright_at(&p, 20, "dark/neutral", 30).unwrap();
        assert_eq!(lookup_bright_at(&p, 20, "dim/warm"), Some((30, 1)));
        assert_eq!(lookup_bright_at(&p, 9, "dim/warm"), None);
        fs::remove_file(&p).ok();
    }

    #[test]
    fn corrupt_json_starts_clean_and_keeps_backup() {
        let p = tmp("corrupt");
        fs::write(&p, "{bozuk!!").unwrap();
        assert_eq!(lookup_at(&p, 18, "dim/warm"), None);
        let bak = p.with_extension("json.bak");
        assert!(bak.exists(), "bozuk dosya yedeklenmeliydi");
        learn_at(&p, 18, "dim/warm", "vesper", "dark").unwrap();
        assert_eq!(load(&p).prefs.len(), 1);
        fs::remove_file(&p).ok();
        fs::remove_file(bak).ok();
    }
}
