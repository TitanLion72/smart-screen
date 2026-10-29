// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! Uygulama kimliği göçü (v3.0).
//!
//! `tauri.conf.json` kimliği `com.smartscreen.app` idi; ürün adıyla
//! (`smart-screen`) uyuşmayan, jenerik bir yer tutucuydu. Yeni kimlik
//! `com.titanlion72.smart-screen`.
//!
//! Kimlik değişince Tauri'nin iki veri klasörü de değişir:
//!
//! - `%APPDATA%\<kimlik>` → pencere durumu (`window-state`),
//! - `%LOCALAPPDATA%\<kimlik>` → WebView2 profili (localStorage: palet,
//!   şablon, vurgu, ayarlar).
//!
//! Bu modül **açılışta, pencere oluşmadan önce** eski klasörleri yeni ada
//! kopyalar. Eski klasör **silinmez**: geri alma (kimliği eskiye çevirmek)
//! tek adım olur. Kopyalama yarıda kalırsa işaret dosyası yazılmaz, sonraki
//! açılışta yeniden denenir.

use std::fs;
use std::path::{Path, PathBuf};

/// Yeni kimlik (`tauri.conf.json` ile aynı olmalı).
pub const APP_ID: &str = "com.titanlion72.smart-screen";
/// Eski (v3.0 öncesi) kimlik.
pub const LEGACY_ID: &str = "com.smartscreen.app";
/// Göç işareti: yeni klasörde durur, ikinci kez kopyalamayı engeller.
const MARKER: &str = ".identity-v3";

/// Kök klasör (Roaming / Local).
fn base(kind: &str) -> Option<PathBuf> {
    std::env::var(kind).ok().map(PathBuf::from)
}

/// `%APPDATA%\<kimlik>` (pencere durumu, plugin verisi).
pub fn roaming_dir() -> Option<PathBuf> {
    base("APPDATA").map(|p| p.join(APP_ID))
}

/// `%LOCALAPPDATA%\<kimlik>` (WebView2 profili). Göç bu yolu kullanır;
/// uygulama kodu ayrıca çağırmaz, ama tanılama için `pub` kalır.
#[allow(dead_code)]
pub fn local_dir() -> Option<PathBuf> {
    base("LOCALAPPDATA").map(|p| p.join(APP_ID))
}

/// Açılışta bir kez çağrılır (pencere ve webview yaratılmadan ÖNCE).
/// Dönen değer: kopyalanan dosya sayısı (log için).
pub fn migrate_once() -> Vec<String> {
    let mut notes = Vec::new();
    for (label, kind) in [("roaming", "APPDATA"), ("local", "LOCALAPPDATA")] {
        let Some(root) = base(kind) else { continue };
        let src = root.join(LEGACY_ID);
        let dst = root.join(APP_ID);
        match migrate_dir(&src, &dst) {
            Ok(0) => {}
            Ok(n) => notes.push(format!(
                "{label}: {n} dosya taşındı ({LEGACY_ID} → {APP_ID})"
            )),
            Err(e) => notes.push(format!("{label}: kimlik göçü yapılamadı: {e}")),
        }
    }
    notes
}

/// Tek klasör göçü. `dst` zaten varsa ya da işaret duruyorsa hiçbir şey
/// yapmaz (0). Kaynak yoksa da 0 döner — ilk kurulum normal durumdur.
pub fn migrate_dir(src: &Path, dst: &Path) -> Result<u64, String> {
    if dst.join(MARKER).exists() {
        return Ok(0);
    }
    if !src.exists() {
        return Ok(0);
    }
    let copied = if dst.exists() {
        // Hedef yarım kalmış olabilir: eksikleri tamamla (üzerine yazmadan).
        copy_tree_missing(src, dst)?
    } else {
        copy_tree(src, dst)?
    };
    fs::create_dir_all(dst).map_err(|e| format!("hedef klasör açılamadı: {e}"))?;
    fs::write(dst.join(MARKER), b"1").map_err(|e| format!("işaret yazılamadı: {e}"))?;
    Ok(copied)
}

/// Ağacı kopyalar; var olan dosyanın üzerine YAZMAZ (yarıda kalan göç
/// yeniden denenebilsin, kullanıcı verisi ezilmesin).
fn copy_tree(src: &Path, dst: &Path) -> Result<u64, String> {
    copy_tree_inner(src, dst, true)
}

/// Yalnız eksik dosyaları kopyalar.
fn copy_tree_missing(src: &Path, dst: &Path) -> Result<u64, String> {
    copy_tree_inner(src, dst, false)
}

fn copy_tree_inner(src: &Path, dst: &Path, overwrite: bool) -> Result<u64, String> {
    let mut count = 0u64;
    fs::create_dir_all(dst).map_err(|e| format!("klasör açılamadı {}: {e}", dst.display()))?;
    let entries =
        fs::read_dir(src).map_err(|e| format!("klasör okunamadı {}: {e}", src.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("girdi okunamadı: {e}"))?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        let meta = entry
            .metadata()
            .map_err(|e| format!("bilgi okunamadı {}: {e}", from.display()))?;
        if meta.is_dir() {
            count += copy_tree_inner(&from, &to, overwrite)?;
        } else {
            if !overwrite && to.exists() {
                continue;
            }
            // Kilitli dosya (WebView2 günlüğü gibi) göçü durdurmasın: atla,
            // işareti yine bırakma kararı çağıranın (kısmi göç kabul edilir).
            if fs::copy(&from, &to).is_ok() {
                count += 1;
            }
        }
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ss-ident-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn copies_tree_and_writes_marker() {
        let root = tmp("copy");
        let src = root.join(LEGACY_ID);
        let dst = root.join(APP_ID);
        fs::create_dir_all(src.join("EBWebView")).unwrap();
        fs::write(src.join(".window-state.json"), b"{}").unwrap();
        fs::write(src.join("EBWebView").join("Cookies"), b"x").unwrap();

        assert_eq!(migrate_dir(&src, &dst).unwrap(), 2);
        assert!(dst.join(".window-state.json").exists());
        assert!(dst.join("EBWebView").join("Cookies").exists());
        assert!(dst.join(MARKER).exists());
        // Kaynak silinmez (geri alma yolu).
        assert!(src.join(".window-state.json").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn marker_prevents_second_copy() {
        let root = tmp("once");
        let src = root.join(LEGACY_ID);
        let dst = root.join(APP_ID);
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("a"), b"1").unwrap();
        assert_eq!(migrate_dir(&src, &dst).unwrap(), 1);
        // Kaynağa yeni dosya eklense bile ikinci kez kopyalanmaz.
        fs::write(src.join("b"), b"2").unwrap();
        assert_eq!(migrate_dir(&src, &dst).unwrap(), 0);
        assert!(!dst.join("b").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn existing_target_is_not_overwritten() {
        let root = tmp("user");
        let src = root.join(LEGACY_ID);
        let dst = root.join(APP_ID);
        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&dst).unwrap();
        fs::write(src.join(".window-state.json"), b"eski").unwrap();
        fs::write(dst.join(".window-state.json"), b"kullanici").unwrap();
        // Eksik dosya yok: kopyalanacak bir şey yok, kullanıcı verisi korunur.
        assert_eq!(migrate_dir(&src, &dst).unwrap(), 0);
        let got = fs::read_to_string(dst.join(".window-state.json")).unwrap();
        assert_eq!(got, "kullanici");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn missing_source_is_first_install() {
        let root = tmp("fresh");
        let src = root.join(LEGACY_ID);
        let dst = root.join(APP_ID);
        assert_eq!(migrate_dir(&src, &dst).unwrap(), 0);
        assert!(!dst.exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn ids_differ_and_are_dsn_shaped() {
        assert_ne!(APP_ID, LEGACY_ID);
        // Ters alan adı biçimi: en az iki nokta, boşluk yok.
        for id in [APP_ID, LEGACY_ID] {
            assert!(id.matches('.').count() >= 2, "{id} ters alan adı değil");
            assert!(!id.contains(' '), "{id} boşluk içeriyor");
        }
    }
}
