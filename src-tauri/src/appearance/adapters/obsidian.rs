// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! Obsidian: her kasanin `.obsidian/appearance.json` dosyasindaki `"theme"`.
//!
//! Neden tum kasalar: kullanici birden fazla kasa acabilir; yalniz birini
//! degistirmek yarim bir gecis olurdu. Her kasa bagimsiz denenir, biri
//! patlarsa digerleri yine yazilir.
//!
//! Kasa listesi `%APPDATA%\obsidian\obsidian.json` icinde; bu dosya **katı
//! JSON**'dur (yorum icermez), bu yuzden `serde_json` ile dogrudan okunur.

use super::{appdata, ensure_sane, jsonc, jsonc_ok, read_utf8, save};
use crate::appearance::{Adapter, Mode};
use std::fs;
use std::path::{Path, PathBuf};

pub struct Obsidian;

const INDEX: &str = r"obsidian\obsidian.json";
const DARK: &str = "obsidian";
const LIGHT: &str = "moonstone";

/// Kasa listesi dosyasi (ayar dosyasi degil, kurulum bilgisi).
fn index_path() -> Option<PathBuf> {
    appdata(INDEX)
}

/// `.obsidian` klasoru olan kasalarin kok dizinleri; sira dosyadaki siradir.
fn vault_dirs() -> Vec<PathBuf> {
    match index_path() {
        Some(index) => vaults_from(&index),
        None => Vec::new(),
    }
}

/// Liste dosyasini **katı** JSON olarak okur. Bozuk/eksik dosya bos liste
/// demektir: adaptor patlamaz, kart yalniz "kurulu degil" der.
fn vaults_from(index: &Path) -> Vec<PathBuf> {
    let Ok(text) = fs::read_to_string(index) else {
        return Vec::new();
    };
    let Ok(doc) = serde_json::from_str::<serde_json::Value>(&text) else {
        return Vec::new();
    };
    let Some(vaults) = doc.get("vaults").and_then(|v| v.as_object()) else {
        return Vec::new();
    };
    vaults
        .values()
        .filter_map(|v| v.get("path").and_then(|p| p.as_str()))
        .map(PathBuf::from)
        // `.obsidian` yoksa kasa hic acilmamis demektir: atla.
        .filter(|dir| dir.join(".obsidian").is_dir())
        .collect()
}

fn appearance_of(vault: &Path) -> PathBuf {
    vault.join(".obsidian").join("appearance.json")
}

/// Ayni dosyayi iki farkli metinle temsil etmemek icin (Windows harf duyarsiz).
fn same_path(a: &Path, b: &Path) -> bool {
    a.to_string_lossy()
        .eq_ignore_ascii_case(&b.to_string_lossy())
}

/// Cekirdegin verdigi yol kasalardan birine aitse **tum** kasalar hedeflenir;
/// degilse yalniz o dosya (birim testleri ve tek dosya kullanimi).
fn targets(path: &Path) -> Vec<PathBuf> {
    let known: Vec<PathBuf> = vault_dirs().iter().map(|v| appearance_of(v)).collect();
    if known.iter().any(|k| same_path(k, path)) {
        known
    } else {
        vec![path.to_path_buf()]
    }
}

fn write_one(path: &Path, mode: Mode) -> Result<bool, String> {
    let (text, had_bom) = read_utf8(path)?;
    ensure_sane(&text)?;
    let value = match mode {
        Mode::Dark => DARK,
        Mode::Light => LIGHT,
    };
    let next = jsonc::set_string(&text, "theme", value);
    if next == text {
        return Ok(false);
    }
    if !jsonc_ok(&next) {
        return Err("appearance.json bozulurdu, yazılmadı".to_string());
    }
    save(path, &next, had_bom)?;
    Ok(true)
}

impl Adapter for Obsidian {
    fn id(&self) -> &'static str {
        "obsidian"
    }

    fn name(&self) -> &'static str {
        "Obsidian"
    }

    fn group(&self) -> &'static str {
        "notes"
    }

    /// Kasa varsa ilk kasanin `appearance.json`'i; yoksa liste dosyasi
    /// ("kurulu mu?" sorusu icin).
    fn locate(&self) -> Option<PathBuf> {
        vault_dirs()
            .first()
            .map(|v| appearance_of(v))
            .or_else(index_path)
    }

    fn read(&self, path: &Path) -> Result<Option<Mode>, String> {
        // `locate` kasa yokken liste dosyasini dondurur; onda tema yok.
        if path.file_name().and_then(|n| n.to_str()) == Some("obsidian.json") {
            return Ok(None);
        }
        let (text, _) = read_utf8(path)?;
        Ok(match jsonc::get_string(&text, "theme").as_deref() {
            Some(DARK) => Some(Mode::Dark),
            Some(LIGHT) => Some(Mode::Light),
            _ => None,
        })
    }

    fn write(&self, path: &Path, mode: Mode) -> Result<bool, String> {
        let mut changed = false;
        let mut first_error: Option<String> = None;
        for target in targets(path) {
            // Dosya yoksa olusturmayiz: kasa hic acilmamis olabilir.
            if !target.exists() {
                continue;
            }
            match write_one(&target, mode) {
                Ok(c) => changed |= c,
                Err(e) => {
                    if first_error.is_none() {
                        first_error = Some(e);
                    }
                }
            }
        }
        match first_error {
            Some(e) => Err(e),
            None => Ok(changed),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{cleanup, get, put, tmpdir};
    use super::*;

    #[test]
    fn reads_both_theme_values() {
        let dir = tmpdir("obsidian-read");
        let path = dir.join("appearance.json");
        put(
            &path,
            "{\n  \"theme\": \"obsidian\",\n  \"accentColor\": \"\"\n}\n",
        );
        assert_eq!(Obsidian.read(&path).ok(), Some(Some(Mode::Dark)));
        put(&path, "{\n  \"theme\": \"moonstone\"\n}\n");
        assert_eq!(Obsidian.read(&path).ok(), Some(Some(Mode::Light)));
        cleanup(&dir);
    }

    #[test]
    fn missing_theme_reads_as_none_and_vault_index_is_not_a_theme_file() {
        let dir = tmpdir("obsidian-none");
        let path = dir.join("appearance.json");
        put(&path, "{\n  \"accentColor\": \"\"\n}\n");
        assert_eq!(Obsidian.read(&path).ok(), Some(None));
        let index = dir.join("obsidian.json");
        put(&index, "{\"vaults\":{}}");
        assert_eq!(Obsidian.read(&index).ok(), Some(None));
        cleanup(&dir);
    }

    #[test]
    fn write_then_read_roundtrip_and_second_write_is_noop() {
        let dir = tmpdir("obsidian-write");
        let path = dir.join("appearance.json");
        put(&path, "{\n  \"theme\": \"obsidian\"\n}\n");
        assert_eq!(Obsidian.write(&path, Mode::Light).ok(), Some(true));
        assert_eq!(Obsidian.read(&path).ok(), Some(Some(Mode::Light)));
        assert_eq!(Obsidian.write(&path, Mode::Light).ok(), Some(false));
        cleanup(&dir);
    }

    #[test]
    fn missing_appearance_file_is_created_only_by_us_never_by_adapter() {
        let dir = tmpdir("obsidian-missing");
        let path = dir.join("appearance.json");
        assert_eq!(Obsidian.write(&path, Mode::Dark).ok(), Some(false));
        assert!(!path.exists(), "olmayan dosya yaratilmamali");
        cleanup(&dir);
    }

    #[test]
    fn broken_file_reports_error_without_touching_it() {
        let dir = tmpdir("obsidian-broken");
        let path = dir.join("appearance.json");
        let broken = "{\n  \"theme\": \n}\n";
        put(&path, broken);
        assert!(Obsidian.write(&path, Mode::Light).is_err());
        assert_eq!(get(&path), broken);
        cleanup(&dir);
    }

    #[test]
    fn vault_list_filters_unopened_vaults_and_ignores_broken_index() {
        let dir = tmpdir("obsidian-vaults");
        let opened = dir.join("acik-kasa");
        let closed = dir.join("kapali-kasa");
        if let Err(e) = fs::create_dir_all(opened.join(".obsidian")) {
            panic!("kasa klasörü oluşturulamadı: {e}");
        }
        if let Err(e) = fs::create_dir_all(&closed) {
            panic!("kasa klasörü oluşturulamadı: {e}");
        }
        let index = dir.join("obsidian.json");
        let doc = format!(
            "{{\"vaults\":{{\"a\":{{\"path\":{}}},\"b\":{{\"path\":{}}}}}}}",
            serde_json::Value::String(opened.to_string_lossy().to_string()),
            serde_json::Value::String(closed.to_string_lossy().to_string())
        );
        put(&index, &doc);
        assert_eq!(
            vaults_from(&index),
            vec![opened.clone()],
            "yalniz .obsidian klasörü olan kasa"
        );

        put(&index, "{\"vaults\": {");
        assert!(vaults_from(&index).is_empty(), "bozuk liste bos dönmeli");
        cleanup(&dir);
    }
}
