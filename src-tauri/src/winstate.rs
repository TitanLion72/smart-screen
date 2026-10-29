// SPDX-License-Identifier: GPL-3.0-or-later
//! Pencere boyutu göçü (v2.4.2).
//!
//! `tauri-plugin-window-state` son pencere boyutunu hatırlar. Uygulamanın eski
//! varsayılanı 800x600 olduğu için, yeni varsayılan (1040x740) **mevcut
//! kurulumlara hiç ulaşmıyordu**: kullanıcı güncelleme sonrası yine sıkışmış
//! pencereyi görüyordu.
//!
//! Bu modül yalnızca **eski varsayılana eşit** kayıtlı boyutu bir kez büyütür;
//! kullanıcının kendi seçtiği boyutlara dokunmaz ve işaret dosyası bıraktığı
//! için ikinci kez çalışmaz.

use std::fs;
use std::path::{Path, PathBuf};

/// Eski varsayılan pencere boyutu.
const OLD_W: u64 = 800;
const OLD_H: u64 = 600;
/// Yeni varsayılan (tauri.conf.json ile aynı olmalı).
pub const NEW_W: u64 = 1040;
pub const NEW_H: u64 = 740;

fn app_dir() -> Option<PathBuf> {
    // v3.0: kimlik değişti; klasör adı tek kaynaktan (identity) gelir.
    crate::identity::roaming_dir()
}

fn state_path() -> Option<PathBuf> {
    app_dir().map(|d| d.join(".window-state.json"))
}

fn marker_path() -> Option<PathBuf> {
    app_dir().map(|d| d.join(".layout-242"))
}

/// Uygulama açılmadan (pencere yaratılmadan) çağrılmalı: plugin dosyayı
/// pencere oluşturulurken okuyor.
pub fn migrate_once() {
    if let (Some(state), Some(marker)) = (state_path(), marker_path()) {
        let _ = migrate(&state, &marker);
    }
}

/// Test edilebilir çekirdek: `state` JSON'unu gerekiyorsa büyütür, `marker`
/// dosyasını bırakır. Dönen değer: boyut değişti mi.
pub fn migrate(state: &Path, marker: &Path) -> Result<bool, String> {
    if marker.exists() {
        return Ok(false);
    }

    let mut changed = false;
    if state.exists() {
        let raw = fs::read_to_string(state).map_err(|e| format!("state okunamadı: {e}"))?;
        // Bozuk JSON göçü engellemesin: sessizce geç, işareti yine bırak.
        if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(main) = v.get_mut("main").and_then(|m| m.as_object_mut()) {
                let w = main.get("width").and_then(|x| x.as_u64()).unwrap_or(0);
                let h = main.get("height").and_then(|x| x.as_u64()).unwrap_or(0);
                // Yalnızca ESKİ VARSAYILAN: kullanıcı bilerek küçültmüş olabilir.
                // Maksimize bayrağı korunur; kayıtlı boyut yalnız "küçült"te
                // kullanıldığı için onu da düzeltmek gerekir.
                if w <= OLD_W && h <= OLD_H {
                    main.insert("width".to_string(), serde_json::json!(NEW_W));
                    main.insert("height".to_string(), serde_json::json!(NEW_H));
                    changed = true;
                }
            }
            if changed {
                let out =
                    serde_json::to_vec_pretty(&v).map_err(|e| format!("state yazılamadı: {e}"))?;
                fs::write(state, out).map_err(|e| format!("state yazılamadı: {e}"))?;
            }
        }
    }

    if let Some(dir) = marker.parent() {
        let _ = fs::create_dir_all(dir);
    }
    fs::write(marker, b"1").map_err(|e| format!("işaret yazılamadı: {e}"))?;
    Ok(changed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ss-winstate-{}-{}", std::process::id(), name));
        let _ = fs::create_dir_all(&dir);
        dir
    }

    #[test]
    fn old_default_buyutulur() {
        let dir = tmp("old");
        let state = dir.join(".window-state.json");
        let marker = dir.join(".layout-242");
        let _ = fs::remove_file(&marker);
        fs::write(
            &state,
            r#"{"main":{"width":800,"height":600,"maximized":false}}"#,
        )
        .unwrap();

        assert_eq!(migrate(&state, &marker), Ok(true));
        let v: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&state).unwrap()).unwrap();
        assert_eq!(v["main"]["width"], NEW_W);
        assert_eq!(v["main"]["height"], NEW_H);
        assert!(marker.exists());
    }

    #[test]
    fn kullanici_boyutu_korunur() {
        let dir = tmp("user");
        let state = dir.join(".window-state.json");
        let marker = dir.join(".layout-242");
        let _ = fs::remove_file(&marker);
        fs::write(
            &state,
            r#"{"main":{"width":1200,"height":800,"maximized":false}}"#,
        )
        .unwrap();

        assert_eq!(migrate(&state, &marker), Ok(false));
        let v: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&state).unwrap()).unwrap();
        assert_eq!(v["main"]["width"], 1200);
    }

    #[test]
    fn ikinci_kez_calismaz() {
        let dir = tmp("once");
        let state = dir.join(".window-state.json");
        let marker = dir.join(".layout-242");
        fs::write(
            &state,
            r#"{"main":{"width":800,"height":600,"maximized":false}}"#,
        )
        .unwrap();
        fs::write(&marker, b"1").unwrap();

        assert_eq!(migrate(&state, &marker), Ok(false));
        let v: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&state).unwrap()).unwrap();
        assert_eq!(v["main"]["width"], 800);
    }

    #[test]
    fn maksimize_bayragi_korunur() {
        let dir = tmp("max");
        let state = dir.join(".window-state.json");
        let marker = dir.join(".layout-242");
        let _ = fs::remove_file(&marker);
        fs::write(
            &state,
            r#"{"main":{"width":800,"height":600,"maximized":true}}"#,
        )
        .unwrap();

        // Boyut büyür, "maksimize" bayrağı olduğu gibi kalır.
        assert_eq!(migrate(&state, &marker), Ok(true));
        let v: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&state).unwrap()).unwrap();
        assert_eq!(v["main"]["width"], NEW_W);
        assert_eq!(v["main"]["maximized"], true);
    }

    #[test]
    fn bozuk_json_panik_yok() {
        let dir = tmp("bozuk");
        let state = dir.join(".window-state.json");
        let marker = dir.join(".layout-242");
        let _ = fs::remove_file(&marker);
        fs::write(&state, "{bozuk").unwrap();

        assert_eq!(migrate(&state, &marker), Ok(false));
        assert!(marker.exists());
    }
}
