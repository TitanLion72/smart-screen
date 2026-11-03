// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! Sublime Text: `Preferences.sublime-settings` icindeki `"theme"`.
//!
//! Dosya JSONC: yorum ve sonda virgul serbest.

use super::{appdata, read_theme, write_theme};
use crate::appearance::{Adapter, Mode};
use std::path::{Path, PathBuf};

pub struct Sublime;

const REL: &str = r"Sublime Text\Packages\User\Preferences.sublime-settings";
const DARK: &str = "Default Dark.sublime-theme";
const LIGHT: &str = "Default Light.sublime-theme";

impl Adapter for Sublime {
    fn id(&self) -> &'static str {
        "sublime"
    }

    fn name(&self) -> &'static str {
        "Sublime Text"
    }

    fn group(&self) -> &'static str {
        "editor"
    }

    fn locate(&self) -> Option<PathBuf> {
        appdata(REL)
    }

    fn read(&self, path: &Path) -> Result<Option<Mode>, String> {
        read_theme(path, DARK, LIGHT)
    }

    fn write(&self, path: &Path, mode: Mode) -> Result<bool, String> {
        write_theme(path, DARK, LIGHT, mode)
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{cleanup, get, put, tmpdir};
    use super::*;

    #[test]
    fn write_then_read_roundtrip_is_idempotent() {
        let dir = tmpdir("sublime");
        let path = dir.join("Preferences.sublime-settings");
        put(&path, "{\n\t\"theme\": \"Default Dark.sublime-theme\"\n}\n");
        assert_eq!(Sublime.write(&path, Mode::Light).ok(), Some(true));
        assert_eq!(Sublime.read(&path).ok(), Some(Some(Mode::Light)));
        assert!(get(&path).contains("Default Light.sublime-theme"));
        assert_eq!(Sublime.write(&path, Mode::Light).ok(), Some(false));
        cleanup(&dir);
    }

    #[test]
    fn unknown_theme_reads_as_none_and_key_is_inserted_on_write() {
        let dir = tmpdir("sublime-missing");
        let path = dir.join("Preferences.sublime-settings");
        put(
            &path,
            "{\n\t\"color_scheme\": \"Monokai.sublime-color-scheme\"\n}\n",
        );
        assert_eq!(Sublime.read(&path).ok(), Some(None));
        assert_eq!(Sublime.write(&path, Mode::Dark).ok(), Some(true));
        assert_eq!(Sublime.read(&path).ok(), Some(Some(Mode::Dark)));
        assert!(get(&path).contains("\"color_scheme\": \"Monokai.sublime-color-scheme\""));
        cleanup(&dir);
    }
}
