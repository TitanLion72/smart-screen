// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! Typora: `conf/conf.user.json` icindeki `"theme"` (`"dark"` / `"light"`).
//!
//! `live = false`: Typora ayar dosyasini kapanista yazar; disaridan yazilan
//! deger yeniden baslatmadan gorunmez.

use super::{appdata, read_theme, write_theme};
use crate::appearance::{Adapter, Mode};
use std::path::{Path, PathBuf};

pub struct Typora;

const SETTINGS: &str = r"Typora\conf\conf.user.json";
const DARK: &str = "dark";
const LIGHT: &str = "light";

impl Adapter for Typora {
    fn id(&self) -> &'static str {
        "typora"
    }

    fn name(&self) -> &'static str {
        "Typora"
    }

    fn group(&self) -> &'static str {
        "notes"
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

    /// `theme` yoksa Typora varsayilan (acik) temayi kullanir.
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
        let dir = tmpdir("typora");
        let path = dir.join("conf.user.json");
        put(&path, "{\n  \"theme\": \"dark\",\n  \"fontSize\": 16\n}\n");
        assert_eq!(Typora.read(&path).ok(), Some(Some(Mode::Dark)));
        assert_eq!(Typora.write(&path, Mode::Light).ok(), Some(true));
        assert_eq!(Typora.read(&path).ok(), Some(Some(Mode::Light)));
        assert!(get(&path).contains("\"fontSize\": 16"), "komsu korunmali");
        assert_eq!(Typora.write(&path, Mode::Light).ok(), Some(false));
        cleanup(&dir);
    }

    #[test]
    fn missing_theme_is_system() {
        let dir = tmpdir("typora-none");
        let path = dir.join("conf.user.json");
        put(&path, "{\n  \"fontSize\": 16\n}\n");
        assert_eq!(Typora.read(&path).ok(), Some(None));
        assert_eq!(Typora.peek(&path), Some("system".to_string()));
        cleanup(&dir);
    }

    #[test]
    fn broken_file_is_not_touched() {
        let dir = tmpdir("typora-broken");
        let path = dir.join("conf.user.json");
        let broken = "{\"theme\": }";
        put(&path, broken);
        assert!(Typora.write(&path, Mode::Dark).is_err());
        assert_eq!(get(&path), broken);
        cleanup(&dir);
    }

    #[test]
    fn is_not_live() {
        assert!(!Typora.live(), "kapanista yazar");
    }
}
