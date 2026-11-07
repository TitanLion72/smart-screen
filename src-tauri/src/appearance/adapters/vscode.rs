// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! VS Code ailesi (Code, Insiders, VSCodium, Cursor, Windsurf): `settings.json`.
//!
//! Neden `autoDetectColorScheme` okunuyor: acikken VS Code zaten Windows'u
//! takip eder. O durumda yazmak onunla dovusmek olur — `Ok(false)` doneriz.

use super::jsonc;
use super::{ensure_sane, first_existing, jsonc_ok, read_utf8, save};
use crate::appearance::{Adapter, Mode};
use std::path::{Path, PathBuf};

pub struct VsCode;

/// Ilk var olan aday kazanir; hicbiri yoksa ilki "kurulu degil" bilgisi olur.
const CANDIDATES: [&str; 8] = [
    r"Code\User\settings.json",
    r"Code - Insiders\User\settings.json",
    r"VSCodium\User\settings.json",
    r"VSCodium - Insiders\User\settings.json",
    r"Cursor\User\settings.json",
    r"Windsurf\User\settings.json",
    r"Positron\User\settings.json",
    r"Trae\User\settings.json",
];

const AUTO_DETECT: &str = "window.autoDetectColorScheme";
const ACTIVE: &str = "workbench.colorTheme";
const PREFERRED_DARK: &str = "workbench.preferredDarkColorTheme";
const PREFERRED_LIGHT: &str = "workbench.preferredLightColorTheme";
const DEFAULT_DARK: &str = "Default Dark Modern";
const DEFAULT_LIGHT: &str = "Default Light Modern";

impl VsCode {
    /// Kullanicinin tercih ettigi koyu tema; yoksa VS Code varsayilani.
    fn preferred(text: &str, key: &str, fallback: &str) -> String {
        jsonc::get_string(text, key).unwrap_or_else(|| fallback.to_string())
    }
}

impl Adapter for VsCode {
    fn id(&self) -> &'static str {
        "vscode"
    }

    fn name(&self) -> &'static str {
        "VS Code"
    }

    fn group(&self) -> &'static str {
        "editor"
    }

    fn locate(&self) -> Option<PathBuf> {
        first_existing(&CANDIDATES)
    }

    fn read(&self, path: &Path) -> Result<Option<Mode>, String> {
        let (text, _) = read_utf8(path)?;
        // Sistemi takip eden dosyada "su an ne?" sorusunun tek cevabi yok.
        if jsonc::get_bool(&text, AUTO_DETECT) == Some(true) {
            return Ok(None);
        }
        let Some(active) = jsonc::get_string(&text, ACTIVE) else {
            return Ok(None);
        };
        if active == Self::preferred(&text, PREFERRED_DARK, DEFAULT_DARK) {
            return Ok(Some(Mode::Dark));
        }
        if active == Self::preferred(&text, PREFERRED_LIGHT, DEFAULT_LIGHT) {
            return Ok(Some(Mode::Light));
        }
        // El ile secilmis baska bir tema: bilinmiyor.
        Ok(None)
    }

    fn write(&self, path: &Path, mode: Mode) -> Result<bool, String> {
        let (text, had_bom) = read_utf8(path)?;
        ensure_sane(&text)?;
        // VS Code zaten sistemi takip ediyorsa dokunmayiz.
        if jsonc::get_bool(&text, AUTO_DETECT) == Some(true) {
            return Ok(false);
        }
        let mut next = text.clone();
        // Kullanicinin O ANKI temasini **terk edilen** modun tercih alanina
        // yaz. Neden: `One Dark Pro Darker` gibi magaza temalari kullanicinin
        // secimi; `Default Dark Modern` ile ezmek geri donusu olmayan bir kayip
        // olurdu. Hangi moda yaziyorsak kullanici o an digerindedir, bu yuzden
        // koyuya gecerken aktif tema "tercih edilen acik" olarak saklanir.
        // Boylece iki yonde de kullanici kendi temasiyla geri doner.
        let leaving = match mode {
            Mode::Dark => PREFERRED_LIGHT,
            Mode::Light => PREFERRED_DARK,
        };
        if jsonc::get_string(&next, leaving).is_none() {
            if let Some(active) = jsonc::get_string(&next, ACTIVE) {
                next = jsonc::set_string(&next, leaving, &active);
            }
        }
        let target = match mode {
            Mode::Dark => Self::preferred(&next, PREFERRED_DARK, DEFAULT_DARK),
            Mode::Light => Self::preferred(&next, PREFERRED_LIGHT, DEFAULT_LIGHT),
        };
        next = jsonc::set_string(&next, ACTIVE, &target);
        // Otomatik algilama acik kalsaydi VS Code bizim degerimizi ezerdi.
        next = jsonc::set_bool(&next, AUTO_DETECT, false);
        if next == text {
            return Ok(false);
        }
        if !jsonc_ok(&next) {
            return Err("ayar dosyası bozulurdu, yazılmadı".to_string());
        }
        save(path, &next, had_bom)?;
        Ok(true)
    }

    /// `autoDetectColorScheme` acikken dogru cevap "sistemi takip ediyor".
    /// `read` bu durumda `None` doner (yazilacak mod yok); arayuz ise bunu
    /// "bilinmiyor" diye gostermemeli.
    fn peek(&self, path: &Path) -> Option<String> {
        let (text, _) = read_utf8(path).ok()?;
        if jsonc::get_bool(&text, AUTO_DETECT) == Some(true) {
            return Some("system".to_string());
        }
        Some(match self.read(path) {
            Ok(Some(mode)) => mode.as_str().to_string(),
            _ => "unknown".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{cleanup, get, put, tmpdir};
    use super::*;

    const FILE: &str = "{\n  // gorunum\n  \"window.autoDetectColorScheme\": false,\n  \
\"workbench.colorTheme\": \"Default Dark Modern\", /* tercih */\n  \
\"workbench.preferredLightColorTheme\": \"Quiet Light\"\n}\n";

    #[test]
    fn reads_active_theme_against_preferred_keys() {
        let dir = tmpdir("vscode-read");
        let path = dir.join("settings.json");
        put(&path, FILE);
        assert_eq!(VsCode.read(&path).ok(), Some(Some(Mode::Dark)));
        // `preferredLightColorTheme` = "Quiet Light" → aktif tema onunla eslesir.
        put(
            &path,
            "{\n  \"workbench.colorTheme\": \"Quiet Light\",\n  \
\"workbench.preferredLightColorTheme\": \"Quiet Light\"\n}\n",
        );
        assert_eq!(VsCode.read(&path).ok(), Some(Some(Mode::Light)));
        cleanup(&dir);
    }

    #[test]
    fn custom_theme_and_missing_key_read_as_none() {
        let dir = tmpdir("vscode-none");
        let path = dir.join("settings.json");
        put(&path, "{\n  \"workbench.colorTheme\": \"Monokai\"\n}\n");
        assert_eq!(VsCode.read(&path).ok(), Some(None));
        put(&path, "{\n  \"editor.fontSize\": 14\n}\n");
        assert_eq!(VsCode.read(&path).ok(), Some(None));
        cleanup(&dir);
    }

    #[test]
    fn write_sets_theme_and_turns_auto_detect_off() {
        let dir = tmpdir("vscode-write");
        let path = dir.join("settings.json");
        put(&path, FILE);
        assert_eq!(VsCode.write(&path, Mode::Light).ok(), Some(true));
        let text = get(&path);
        assert!(text.contains("\"workbench.colorTheme\": \"Quiet Light\""));
        assert!(text.contains("\"window.autoDetectColorScheme\": false"));
        assert_eq!(VsCode.read(&path).ok(), Some(Some(Mode::Light)));
        assert_eq!(
            VsCode.write(&path, Mode::Light).ok(),
            Some(false),
            "ikinci yazma degisiklik uretmemeli"
        );
        cleanup(&dir);
    }

    #[test]
    fn write_preserves_comments_and_other_lines() {
        let dir = tmpdir("vscode-comments");
        let path = dir.join("settings.json");
        put(&path, FILE);
        assert_eq!(VsCode.write(&path, Mode::Light).ok(), Some(true));
        let text = get(&path);
        assert!(text.contains("// gorunum"), "satir yorumu korunmali");
        assert!(text.contains("/* tercih */"), "blok yorumu korunmali");
        assert!(text.contains("\"workbench.preferredLightColorTheme\": \"Quiet Light\""));
        // Aktif tema artik Quiet Light; eski DARK degeri silinmedi, cunku
        // kullanicinin secimi `preferredDarkColorTheme` olarak saklandi.
        assert!(text.contains("\"workbench.colorTheme\": \"Quiet Light\""));
        assert!(!text.contains("\"workbench.colorTheme\": \"Default Dark Modern\""));
        cleanup(&dir);
    }

    #[test]
    fn first_write_remembers_users_own_theme_as_preferred_dark() {
        // Kullanici magaza temasi kullaniyor; onu ezmek geri donusu olmayan
        // bir kayip olurdu. Koyu tura donunce kendi temasi geri gelmeli.
        let dir = tmpdir("vscode-remember");
        let path = dir.join("settings.json");
        let src = "{\n  \"workbench.colorTheme\": \"One Dark Pro Darker\"\n}\n";
        put(&path, src);
        assert_eq!(VsCode.write(&path, Mode::Light).ok(), Some(true));
        let after_light = get(&path);
        assert!(
            after_light.contains("\"workbench.preferredDarkColorTheme\": \"One Dark Pro Darker\"")
        );
        assert_eq!(VsCode.read(&path).ok(), Some(Some(Mode::Light)));
        // Koyu tura donus: kullanicinin kendi temasi geri gelir.
        assert_eq!(VsCode.write(&path, Mode::Dark).ok(), Some(true));
        assert!(get(&path).contains("\"workbench.colorTheme\": \"One Dark Pro Darker\""));
        cleanup(&dir);
    }

    #[test]
    fn peek_says_system_when_auto_detect_is_on() {
        let dir = tmpdir("vscode-peek");
        let path = dir.join("settings.json");
        put(&path, "{\n  \"window.autoDetectColorScheme\": true\n}\n");
        assert_eq!(VsCode.peek(&path), Some("system".to_string()));
        cleanup(&dir);
    }

    #[test]
    fn peek_says_unknown_for_a_foreign_manual_theme() {
        let dir = tmpdir("vscode-peek-unknown");
        let path = dir.join("settings.json");
        put(
            &path,
            "{\n  \"workbench.colorTheme\": \"Solarized Dark\"\n}\n",
        );
        assert_eq!(VsCode.peek(&path), Some("unknown".to_string()));
        cleanup(&dir);
    }

    #[test]
    fn auto_detect_true_blocks_writing_entirely() {
        let dir = tmpdir("vscode-auto");
        let path = dir.join("settings.json");
        let src = "{\n  \"window.autoDetectColorScheme\": true,\n  \
\"workbench.colorTheme\": \"Default Dark Modern\"\n}\n";
        put(&path, src);
        assert_eq!(VsCode.write(&path, Mode::Light).ok(), Some(false));
        assert_eq!(get(&path), src, "dosya bayt bayt ayni kalmali");
        assert_eq!(VsCode.read(&path).ok(), Some(None), "okuma bilinmiyor der");
        cleanup(&dir);
    }

    #[test]
    fn candidate_list_covers_all_vscode_derivatives() {
        for needle in [
            r"Code\User",
            "Code - Insiders",
            r"VSCodium\User",
            "VSCodium - Insiders",
            "Cursor",
            "Windsurf",
            "Positron",
            "Trae",
        ] {
            assert!(
                CANDIDATES.iter().any(|c| c.contains(needle)),
                "{needle} aday listesinde eksik"
            );
        }
        assert_eq!(CANDIDATES.len(), 8, "tüm adaylar sayılmalı");
    }

    #[test]
    fn write_dark_remembers_users_light_theme_as_preferred_light() {
        // Koyuya geciyoruz: kullanicinin o anki ACIK temasi kendi alanina
        // yazilmali. Eskiden her yonde "preferredDark" yaziliyordu ve acik
        // taraf kayboluyordu.
        let dir = tmpdir("vscode-remember-light");
        let path = dir.join("settings.json");
        put(
            &path,
            "{\n  \"workbench.colorTheme\": \"GitHub Light\"\n}\n",
        );
        assert_eq!(VsCode.write(&path, Mode::Dark).ok(), Some(true));
        let after_dark = get(&path);
        assert!(
            after_dark.contains("\"workbench.preferredLightColorTheme\": \"GitHub Light\""),
            "terk edilen acik tema saklanmali: {after_dark}"
        );
        assert!(after_dark.contains("\"workbench.colorTheme\": \"Default Dark Modern\""));
        assert_eq!(VsCode.read(&path).ok(), Some(Some(Mode::Dark)));
        // Koyu → acik donus: kullanicinin kendi acik temasi geri gelir.
        assert_eq!(VsCode.write(&path, Mode::Light).ok(), Some(true));
        assert!(get(&path).contains("\"workbench.colorTheme\": \"GitHub Light\""));
        assert_eq!(VsCode.read(&path).ok(), Some(Some(Mode::Light)));
        cleanup(&dir);
    }

    #[test]
    fn broken_file_is_not_touched() {
        let dir = tmpdir("vscode-broken");
        let path = dir.join("settings.json");
        let broken = "{\n  \"workbench.colorTheme\": ,\n}\n";
        put(&path, broken);
        assert!(VsCode.write(&path, Mode::Light).is_err());
        assert_eq!(get(&path), broken);
        cleanup(&dir);
    }
}
