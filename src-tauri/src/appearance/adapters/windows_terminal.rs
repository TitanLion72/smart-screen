// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! Windows Terminal: `settings.json` icindeki kok seviye `"theme"`.
//!
//! WT dosyayi izler; yazdigimiz anda acik sekmeler yeniden baslatmadan doner.
//! `"system"` degeri "bilinmiyor" demektir, hata degil.

use super::{env_path, jsonc, read_theme, read_utf8, write_theme};
use crate::appearance::{Adapter, Mode};
use std::path::{Path, PathBuf};

pub struct WindowsTerminal;

/// Store (MSIX) kurulumunun ayar dosyasi. Yalniz bu yol; klasor kurulumu
/// `%LOCALAPPDATA%\Microsoft\Windows Terminal` altinda ama Store surumu yaygin.
const SETTINGS: &str = r"Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json";

impl Adapter for WindowsTerminal {
    fn id(&self) -> &'static str {
        "windows-terminal"
    }

    fn name(&self) -> &'static str {
        "Windows Terminal"
    }

    fn group(&self) -> &'static str {
        "terminal"
    }

    /// Dosya henuz olusmamis olabilir; yol yine de doner (kurulu mu bilgisi).
    fn locate(&self) -> Option<PathBuf> {
        env_path("LOCALAPPDATA", SETTINGS)
    }

    fn read(&self, path: &Path) -> Result<Option<Mode>, String> {
        read_theme(path, "dark", "light")
    }

    fn write(&self, path: &Path, mode: Mode) -> Result<bool, String> {
        write_theme(path, "dark", "light", mode)
    }

    /// `theme` anahtari yoksa Windows Terminal'in varsayilani `"system"`dir
    /// (MS Learn: Appearance > Theme, varsayilan deger `system`). `read` bu
    /// durumda `None` doner - yazilacak bir sey yok - ama kullaniciya
    /// "bilinmiyor" demek yanlis olurdu.
    fn peek(&self, path: &Path) -> Option<String> {
        let (text, _) = read_utf8(path).ok()?;
        Some(match jsonc::get_string(&text, "theme") {
            Some(v) if v == "dark" => "dark".to_string(),
            Some(v) if v == "light" => "light".to_string(),
            _ => "system".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{cleanup, get, put, tmpdir};
    use super::*;

    #[test]
    fn reads_dark_and_light() {
        let dir = tmpdir("wt-read");
        let path = dir.join("settings.json");
        put(&path, "{\n  \"theme\": \"dark\"\n}\n");
        assert_eq!(WindowsTerminal.read(&path).ok(), Some(Some(Mode::Dark)));
        put(&path, "{\n  \"theme\": \"light\"\n}\n");
        assert_eq!(WindowsTerminal.read(&path).ok(), Some(Some(Mode::Light)));
        cleanup(&dir);
    }

    #[test]
    fn system_and_missing_key_read_as_none() {
        let dir = tmpdir("wt-none");
        let path = dir.join("settings.json");
        put(&path, "{\n  \"theme\": \"system\"\n}\n");
        assert_eq!(WindowsTerminal.read(&path).ok(), Some(None));
        put(&path, "{\n  \"profiles\": {}\n}\n");
        assert_eq!(WindowsTerminal.read(&path).ok(), Some(None));
        cleanup(&dir);
    }

    #[test]
    fn write_then_read_roundtrip_and_second_write_is_noop() {
        let dir = tmpdir("wt-write");
        let path = dir.join("settings.json");
        put(&path, "{\n  \"theme\": \"dark\"\n}\n");
        assert_eq!(WindowsTerminal.write(&path, Mode::Light).ok(), Some(true));
        assert_eq!(WindowsTerminal.read(&path).ok(), Some(Some(Mode::Light)));
        assert_eq!(
            WindowsTerminal.write(&path, Mode::Light).ok(),
            Some(false),
            "ayni mod ikinci kez yazilmamali"
        );
        cleanup(&dir);
    }

    #[test]
    fn comments_are_preserved_next_to_the_key() {
        let dir = tmpdir("wt-comments");
        let path = dir.join("settings.json");
        put(
            &path,
            "{\n  // pencere gorunumu\n  \"theme\": \"dark\", // izleniyor\n  \"tabWidthMode\": \"equal\"\n}\n",
        );
        assert_eq!(WindowsTerminal.write(&path, Mode::Light).ok(), Some(true));
        let text = get(&path);
        assert!(
            text.contains("// pencere gorunumu"),
            "satir yorumu korunmali"
        );
        assert!(text.contains("// izleniyor"), "satir sonu yorumu korunmali");
        assert!(text.contains("\"theme\": \"light\""), "deger degismeli");
        assert!(
            text.contains("\"tabWidthMode\": \"equal\""),
            "komsu anahtar ayni"
        );
        cleanup(&dir);
    }

    #[test]
    fn broken_file_is_not_touched() {
        let dir = tmpdir("wt-broken");
        let path = dir.join("settings.json");
        let broken = "{\n  \"theme\": \"dark\",\n  \"profiles\": ,\n}\n";
        put(&path, broken);
        assert!(WindowsTerminal.write(&path, Mode::Light).is_err());
        assert_eq!(get(&path), broken, "bozuk dosyaya yazilmamali");
        cleanup(&dir);
    }

    #[test]
    fn peek_reports_system_when_theme_key_is_absent() {
        // WT'de `theme` yoksa varsayilan "system"dir (MS Learn). `read` bu
        // durumda None doner ama arayuz "sistem" demeli, "bilinmiyor" degil.
        let dir = tmpdir("wt-peek-system");
        let path = dir.join("settings.json");
        put(&path, "{\n  \"profiles\": {}\n}\n");
        assert_eq!(WindowsTerminal.read(&path).ok(), Some(None));
        assert_eq!(WindowsTerminal.peek(&path), Some("system".to_string()));
        cleanup(&dir);
    }

    #[test]
    fn peek_reports_explicit_theme() {
        let dir = tmpdir("wt-peek-dark");
        let path = dir.join("settings.json");
        put(&path, "{\n  \"theme\": \"dark\"\n}\n");
        assert_eq!(WindowsTerminal.peek(&path), Some("dark".to_string()));
        cleanup(&dir);
    }
}
