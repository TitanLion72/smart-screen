// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! GitHub Desktop: `settings.json` icindeki `"theme"` (`"dark"` / `"light"`).
//!
//! `live = false`: GitHub Desktop ayarlari acilista okuyup kapanista yazar;
//! disaridan yazilan deger ancak yeniden baslatmayla gorunur.

use super::{appdata, read_theme, write_theme};
use crate::appearance::{Adapter, Mode};
use std::path::{Path, PathBuf};

pub struct GithubDesktop;

const SETTINGS: &str = r"GitHub Desktop\settings.json";
const DARK: &str = "dark";
const LIGHT: &str = "light";

impl Adapter for GithubDesktop {
    fn id(&self) -> &'static str {
        "github-desktop"
    }

    fn name(&self) -> &'static str {
        "GitHub Desktop"
    }

    fn group(&self) -> &'static str {
        "editor"
    }

    fn live(&self) -> bool {
        false
    }

    fn locate(&self) -> Option<PathBuf> {
        appdata(SETTINGS)
    }

    fn read(&self, path: &Path) -> Result<Option<Mode>, String> {
        read_theme(path, DARK, LIGHT)
    }

    fn write(&self, path: &Path, mode: Mode) -> Result<bool, String> {
        write_theme(path, DARK, LIGHT, mode)
    }

    /// `theme` yoksa uygulama sistem temasini kullanir.
    fn peek(&self, path: &Path) -> Option<String> {
        let (text, _) = super::read_utf8(path).ok()?;
        Some(match super::jsonc::get_string(&text, "theme").as_deref() {
            Some(DARK) => "dark".to_string(),
            Some(LIGHT) => "light".to_string(),
            _ => "system".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{cleanup, get, put, tmpdir};
    use super::*;

    #[test]
    fn reads_then_writes_both_directions() {
        let dir = tmpdir("ghd");
        let path = dir.join("settings.json");
        put(
            &path,
            "{\n  \"theme\": \"dark\",\n  \"window\": { \"zoom\": 1 }\n}\n",
        );
        assert_eq!(GithubDesktop.read(&path).ok(), Some(Some(Mode::Dark)));
        assert_eq!(GithubDesktop.write(&path, Mode::Light).ok(), Some(true));
        assert_eq!(GithubDesktop.read(&path).ok(), Some(Some(Mode::Light)));
        assert!(get(&path).contains("\"zoom\": 1"), "ic ice obje korunmali");
        assert_eq!(GithubDesktop.write(&path, Mode::Light).ok(), Some(false));
        cleanup(&dir);
    }

    #[test]
    fn missing_theme_is_system() {
        let dir = tmpdir("ghd-none");
        let path = dir.join("settings.json");
        put(&path, "{\n  \"window\": {}\n}\n");
        assert_eq!(GithubDesktop.read(&path).ok(), Some(None));
        assert_eq!(
            GithubDesktop.peek(&path),
            Some("system".to_string()),
            "alan yoksa sistem temasini kullanir"
        );
        cleanup(&dir);
    }

    #[test]
    fn broken_file_is_not_touched() {
        let dir = tmpdir("ghd-broken");
        let path = dir.join("settings.json");
        let broken = "{ \"theme\": }";
        put(&path, broken);
        assert!(GithubDesktop.write(&path, Mode::Dark).is_err());
        assert_eq!(get(&path), broken);
        cleanup(&dir);
    }

    #[test]
    fn is_not_live() {
        assert!(
            !GithubDesktop.live(),
            "kapanista yazar, yeniden baslat gerekir"
        );
    }
}
