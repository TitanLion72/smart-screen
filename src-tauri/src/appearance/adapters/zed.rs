// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! Zed: `settings.json` icindeki `"theme"` (`"One Dark"` / `"One Light"`).
//!
//! Zed de JSONC kabul eder; ortak yardimci ikisini birden kaldirir.

use super::{first_existing, read_theme, write_theme};
use crate::appearance::{Adapter, Mode};
use std::path::{Path, PathBuf};

pub struct Zed;

/// Zed Preview ayri klasor kullaniyor; ilk var olan kazanir.
const CANDIDATES: [&str; 2] = [r"Zed\settings.json", r"Zed Preview\settings.json"];
const DARK: &str = "One Dark";
const LIGHT: &str = "One Light";

impl Adapter for Zed {
    fn id(&self) -> &'static str {
        "zed"
    }

    fn name(&self) -> &'static str {
        "Zed"
    }

    fn group(&self) -> &'static str {
        "editor"
    }

    fn locate(&self) -> Option<PathBuf> {
        first_existing(&CANDIDATES)
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
    fn reads_then_writes_both_directions() {
        let dir = tmpdir("zed");
        let path = dir.join("settings.json");
        put(
            &path,
            "{\n  \"theme\": \"One Dark\",\n  \"vim_mode\": true,\n}\n",
        );
        assert_eq!(Zed.read(&path).ok(), Some(Some(Mode::Dark)));
        assert_eq!(Zed.write(&path, Mode::Light).ok(), Some(true));
        assert_eq!(Zed.read(&path).ok(), Some(Some(Mode::Light)));
        assert!(
            get(&path).contains("\"vim_mode\": true"),
            "sonda virgul ve komsu korunmali"
        );
        assert_eq!(Zed.write(&path, Mode::Light).ok(), Some(false));
        cleanup(&dir);
    }

    #[test]
    fn candidate_list_includes_zed_preview() {
        assert_eq!(CANDIDATES[0], r"Zed\settings.json");
        assert!(
            CANDIDATES[1].contains("Zed Preview"),
            "preview ayrı klasör kullanıyorsa o yol da denenmeli"
        );
    }

    #[test]
    fn custom_theme_name_is_unknown_not_an_error() {
        let dir = tmpdir("zed-custom");
        let path = dir.join("settings.json");
        put(&path, "{\n  \"theme\": \"Ayul Dark\"\n}\n");
        assert_eq!(Zed.read(&path).ok(), Some(None));
        cleanup(&dir);
    }
}
