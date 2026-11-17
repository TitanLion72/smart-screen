// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! Discord: `settings.json` icindeki `"theme"` (`"dark"` / `"light"`).
//!
//! `live = false`: Discord calisirken ayar dosyasini kendi belle deckinden
//! yeniden yazar. Yazdigimiz deger ancak uygulama yeniden acilinca gorunur -
//! kartta "yeniden baslat" rozeti bunu dogru anlatir.

use super::{first_existing, read_theme, write_theme};
use crate::appearance::{Adapter, Mode};
use std::path::{Path, PathBuf};

pub struct Discord;

/// Uc kanal ayri klasor kullaniyor; ilk var olan kazanir.
const CANDIDATES: [&str; 3] = [
    r"discord\settings.json",
    r"discordcanary\settings.json",
    r"discordptb\settings.json",
];
const DARK: &str = "dark";
const LIGHT: &str = "light";

impl Adapter for Discord {
    fn id(&self) -> &'static str {
        "discord"
    }

    fn name(&self) -> &'static str {
        "Discord"
    }

    fn group(&self) -> &'static str {
        "chat"
    }

    fn live(&self) -> bool {
        false
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

    /// `theme` anahtarı yoksa Discord **sistemi takip eder** (varsayılanı).
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
    fn reads_both_values() {
        let dir = tmpdir("discord-read");
        let path = dir.join("settings.json");
        put(&path, "{\n  \"theme\": \"dark\",\n  \"zoom\": 1.0\n}\n");
        assert_eq!(Discord.read(&path).ok(), Some(Some(Mode::Dark)));
        put(&path, "{\n  \"theme\": \"light\"\n}\n");
        assert_eq!(Discord.read(&path).ok(), Some(Some(Mode::Light)));
        cleanup(&dir);
    }

    #[test]
    fn write_keeps_neighbours_and_is_idempotent() {
        let dir = tmpdir("discord-write");
        let path = dir.join("settings.json");
        put(
            &path,
            "{\n  // tercihler\n  \"theme\": \"dark\",\n  \"zoom\": 1.0\n}\n",
        );
        assert_eq!(Discord.write(&path, Mode::Light).ok(), Some(true));
        let text = get(&path);
        assert!(text.contains("\"theme\": \"light\""));
        assert!(text.contains("\"zoom\": 1.0"), "komsu anahtar korunmali");
        assert!(text.contains("// tercihler"), "yorum korunmali");
        assert_eq!(
            Discord.write(&path, Mode::Light).ok(),
            Some(false),
            "ikinci yazma degisiklik uretmemeli"
        );
        cleanup(&dir);
    }

    #[test]
    fn missing_theme_is_none_not_error() {
        // Discord varsayilani sistemi takip etmek; alan yoksa "bilinmiyor"
        // degil "sistem" demek icin `read` None doner, `peek` system der.
        let dir = tmpdir("discord-none");
        let path = dir.join("settings.json");
        put(&path, "{\n  \"zoom\": 1.0\n}\n");
        assert_eq!(Discord.read(&path).ok(), Some(None));
        assert_eq!(Discord.peek(&path), Some("system".to_string()));
        cleanup(&dir);
    }

    #[test]
    fn broken_file_is_not_touched() {
        let dir = tmpdir("discord-broken");
        let path = dir.join("settings.json");
        let broken = "{\n  \"theme\": ,\n}\n";
        put(&path, broken);
        assert!(
            Discord.write(&path, Mode::Light).is_err(),
            "bozuk dosya hata dondurmeli"
        );
        assert_eq!(get(&path), broken, "bozuk dosyaya yazilmamali");
        cleanup(&dir);
    }

    #[test]
    fn not_live_because_discord_rewrites_its_settings() {
        assert!(!Discord.live(), "Discord acikken dosyayi ezer");
        assert_eq!(CANDIDATES[0], r"discord\settings.json");
    }
}
