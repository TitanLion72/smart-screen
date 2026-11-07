// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! Uygulama adaptorleri: her biri yalniz "hangi dosya, hangi anahtar" bilir.
//!
//! Neden bu kadar ince: yedekleme, atomik yazma ve Pro kapisi cekirdekte
//! (`appearance::apply`) tek yerde durur. Buradaki ortak yardimcilar da
//! (UTF-8/BOM, JSONC dogrulama) tekrarlanmasin diye modul seviyesinde.

pub mod jetbrains;
pub mod obsidian;
pub mod sublime;
pub mod vscode;
pub mod windows_terminal;
pub mod zed;

// Neden `#[path]`: `xmlopt` dosyasi `appearance/xmlopt.rs` altinda duruyor ama
// `appearance/mod.rs` bu degisiklik kapsaminda degil. Modulu buradan baglayinca
// dosya yerinde kalir, derleme agacina da dogru yerde girer.
#[path = "../xmlopt.rs"]
pub mod xmlopt;

use super::jsonc;
use super::{write_atomic_verified, Adapter, Mode};
use std::fs;
use std::path::{Path, PathBuf};

/// Sozlesme C1/C4: kart sirasi terminal → editor → notes.
pub fn all() -> Vec<Box<dyn Adapter>> {
    vec![
        Box::new(windows_terminal::WindowsTerminal),
        Box::new(vscode::VsCode),
        Box::new(jetbrains::JetBrains),
        Box::new(sublime::Sublime),
        Box::new(zed::Zed),
        Box::new(obsidian::Obsidian),
    ]
}

/// UTF-8 BOM baytlari. Korunmazsa VS Code dosyayi "degismis" sayip yeniden yukler.
const BOM: &[u8] = b"\xef\xbb\xbf";

/// Ortam degiskeni + alt yol. Degisken yoksa `None` → adaptor "kurulu degil".
fn env_path(var: &str, sub: &str) -> Option<PathBuf> {
    std::env::var_os(var).map(|dir| PathBuf::from(dir).join(sub))
}

/// `%APPDATA%\<alt>`. Test edilebilirlik icin ayri duruyor.
fn appdata(sub: &str) -> Option<PathBuf> {
    env_path("APPDATA", sub)
}

/// Aday listesinden **ilk var olani** secer; hicbiri yoksa ilk aday doner.
///
/// Neden ilk aday: dosya henuz olusmamis olabilir (uygulama bir kez acilmamis)
/// ve kartin yine de bir yol gostermesi gerekir ("kurulu degil" bilgisi).
/// Ayni desen VS Code, Zed, Sublime ve Windows Terminal'de tekrar ediyordu.
fn first_existing(candidates: &[&str]) -> Option<PathBuf> {
    first_in("APPDATA", candidates)
}

/// `first_existing`'in ortam degiskeni secilebilir surumu: Windows Terminal
/// `%LOCALAPPDATA%` altinda yasar, editorler `%APPDATA%` altinda.
fn first_in(var: &str, candidates: &[&str]) -> Option<PathBuf> {
    let mut fallback: Option<PathBuf> = None;
    for rel in candidates {
        let Some(path) = env_path(var, rel) else {
            continue;
        };
        if path.exists() {
            return Some(path);
        }
        if fallback.is_none() {
            fallback = Some(path);
        }
    }
    fallback
}

/// Ayar dosyasini UTF-8 okur; BOM'u ayirip bayragini dondurur.
///
/// Neden ayiriyoruz: BOM'suz yazmak dosyayi kullanici icin "degismis" gosterir
/// ve bazi araclar ilk satiri bozuk okur.
fn read_utf8(path: &Path) -> Result<(String, bool), String> {
    let bytes = fs::read(path).map_err(|e| format!("okunamadı: {e}"))?;
    let (had_bom, body) = match bytes.strip_prefix(BOM) {
        Some(rest) => (true, rest),
        None => (false, &bytes[..]),
    };
    let text = String::from_utf8(body.to_vec()).map_err(|_| "dosya UTF-8 değil".to_string())?;
    Ok((text, had_bom))
}

/// BOM'u geri koyarak atomik yazar.
fn save(path: &Path, text: &str, had_bom: bool) -> Result<(), String> {
    if had_bom {
        write_atomic_verified(path, &format!("\u{feff}{text}"))
    } else {
        write_atomic_verified(path, text)
    }
}

/// Dosya yazilabilir mi? Bozuk govdeye yazmak kullanici ayarini kurtarmaz.
fn ensure_sane(text: &str) -> Result<(), String> {
    if jsonc_ok(text) {
        Ok(())
    } else {
        Err("ayar dosyası bozuk, yazılmadı".to_string())
    }
}

/// Yumusak JSONC dogrulamasi.
///
/// `is_valid` sonda virgulu reddeder (katı JSON); VS Code ve WT dosyalarinda
/// sonda virgul mesrudur. Once katı kapıyı deneriz, dustuyse yalniz sonda
/// virgulleri atip tekrar bakariz — gercek bozulma yine yakalanir.
fn jsonc_ok(text: &str) -> bool {
    if jsonc::is_valid(text) {
        return true;
    }
    let relaxed = drop_trailing_commas(&jsonc::strip_comments(text));
    serde_json::from_str::<serde_json::Value>(&relaxed).is_ok()
}

/// `}`/`]` oncesi virgulleri siler; dizge icindekilere dokunmaz.
fn drop_trailing_commas(text: &str) -> String {
    let b = text.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(b.len());
    let mut i = 0usize;
    while i < b.len() {
        if b[i] == b'"' {
            // Dizgeyi oldugu gibi kopyala: icindeki virgul veri, ayirici degil.
            let mut j = i + 1;
            while j < b.len() {
                match b[j] {
                    b'\\' => j = (j + 2).min(b.len()),
                    b'"' => {
                        j += 1;
                        break;
                    }
                    _ => j += 1,
                }
            }
            out.extend_from_slice(&b[i..j]);
            i = j;
            continue;
        }
        if b[i] == b',' {
            let mut j = i + 1;
            while j < b.len() && b[j].is_ascii_whitespace() {
                j += 1;
            }
            if j < b.len() && (b[j] == b'}' || b[j] == b']') {
                i += 1;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| text.to_string())
}

/// `"theme": <dark>|<light>` tutan dosyalar (WT, Sublime, Zed) icin ortak okuma.
fn read_theme(path: &Path, dark: &str, light: &str) -> Result<Option<Mode>, String> {
    let (text, _) = read_utf8(path)?;
    Ok(match jsonc::get_string(&text, "theme") {
        Some(v) if v == dark => Some(Mode::Dark),
        Some(v) if v == light => Some(Mode::Light),
        // "system" ya da taninmayan deger: bilinmiyor (hata degil).
        _ => None,
    })
}

/// Ayni anahtara yazan adaptorlerin ortak yazma akisi.
fn write_theme(path: &Path, dark: &str, light: &str, mode: Mode) -> Result<bool, String> {
    let (text, had_bom) = read_utf8(path)?;
    ensure_sane(&text)?;
    let value = match mode {
        Mode::Dark => dark,
        Mode::Light => light,
    };
    let next = jsonc::set_string(&text, "theme", value);
    // Degismediyse yazmayiz: mtime oynamasi uygulamayi bosuna yeniler.
    if next == text {
        return Ok(false);
    }
    if !jsonc_ok(&next) {
        return Err("ayar dosyası bozulurdu, yazılmadı".to_string());
    }
    save(path, &next, had_bom)?;
    Ok(true)
}

#[cfg(test)]
pub(crate) mod test_support {
    use std::fs;
    use std::path::{Path, PathBuf};

    /// Her test icin tekil, temiz gecici klasor (paralel kosuda cakismasin).
    pub fn tmpdir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ss-adapter-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        if let Err(e) = fs::create_dir_all(&dir) {
            panic!("geçici klasör oluşturulamadı: {e}");
        }
        dir
    }

    pub fn put(path: &Path, text: &str) {
        if let Err(e) = fs::write(path, text) {
            panic!("test dosyası yazılamadı: {e}");
        }
    }

    pub fn get(path: &Path) -> String {
        match fs::read_to_string(path) {
            Ok(s) => s,
            Err(e) => panic!("test dosyası okunamadı: {e}"),
        }
    }

    pub fn cleanup(dir: &Path) {
        let _ = fs::remove_dir_all(dir);
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::{cleanup, put, tmpdir};
    use super::*;

    #[test]
    fn registry_has_all_six_adapters_in_contract_order() {
        let ids: Vec<&str> = all().iter().map(|a| a.id()).collect();
        assert_eq!(
            ids,
            vec![
                "windows-terminal",
                "vscode",
                "jetbrains",
                "sublime",
                "zed",
                "obsidian"
            ]
        );
        let groups: Vec<&str> = all().iter().map(|a| a.group()).collect();
        assert_eq!(
            groups,
            vec!["terminal", "editor", "editor", "editor", "editor", "notes"]
        );
        // JetBrains temayi yalniz acilista okur: canli olmamali (dogru rozet).
        assert!(
            all()
                .iter()
                .filter(|a| a.id() != "jetbrains")
                .all(|a| a.live()),
            "JetBrains disindakiler canli olmali"
        );
        let jetbrains = all().into_iter().find(|a| a.id() == "jetbrains");
        assert_eq!(
            jetbrains.map(|a| a.live()),
            Some(false),
            "JetBrains canli olmamali"
        );
    }

    #[test]
    fn jsonc_ok_accepts_trailing_comma_but_not_broken_body() {
        assert!(jsonc_ok("{\n  \"a\": 1,\n}\n"), "sonda virgul mesru");
        assert!(jsonc_ok("{\n  // yorum\n  \"a\": \"]\",\n}\n"));
        assert!(!jsonc_ok("{\n  \"a\": ,\n}\n"), "bos deger bozuk");
        assert!(!jsonc_ok(""), "bos dosya bozuk sayilir");
    }

    #[test]
    fn bom_survives_a_write_cycle() {
        let dir = tmpdir("bom");
        let path = dir.join("settings.json");
        put(&path, "\u{feff}{\n  \"theme\": \"dark\"\n}\n");
        match write_theme(&path, "dark", "light", Mode::Light) {
            Ok(true) => {}
            other => panic!("değişiklik bekleniyordu: {other:?}"),
        }
        let raw = match fs::read(&path) {
            Ok(r) => r,
            Err(e) => panic!("test dosyası okunamadı: {e}"),
        };
        assert_eq!(&raw[..3], BOM, "BOM geri konmali");
        assert_eq!(
            read_theme(&path, "dark", "light").ok(),
            Some(Some(Mode::Light))
        );
        cleanup(&dir);
    }
}
