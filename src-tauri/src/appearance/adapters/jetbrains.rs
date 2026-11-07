// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! JetBrains ailesi (IntelliJ, PyCharm, WebStorm, GoLand, CLion...):
//! `<urun>\options\laf.xml` icindeki `LafManager` / `theme` secenegi.
//!
//! Neden `live = false`: IDE temayi yalniz acilista okur. Dosyayi degistirmek
//! acik pencereyi etkilemez; karta "yeniden baslat" rozeti dogru bilgi.
//!
//! Neden tum urunler: ayni makinede birden fazla IDE kurulu olabilir. Yalniz
//! birini degistirmek yarim gecis olurdu (Obsidian'daki kasalar gibi).

use super::xmlopt;
use super::{appdata, read_utf8, save};
use crate::appearance::{Adapter, Mode};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};

pub struct JetBrains;

const ROOT: &str = "JetBrains";
const OPTIONS: &str = "options";
const LAF: &str = "laf.xml";
const COMPONENT: &str = "LafManager";
const OPTION: &str = "theme";
const DARK: &str = "Dark";
const LIGHT: &str = "Light";

/// `%APPDATA%\JetBrains` — urun klasorlerinin kok dizini.
fn root() -> Option<PathBuf> {
    appdata(ROOT)
}

/// Kok altindaki (bir urun klasoru derinligindedir) tum `options\laf.xml`
/// dosyalari, urun klasoru adina gore **azalan**: en yeni surum basta.
fn laf_files(root: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut dirs: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    dirs.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
    dirs.into_iter()
        .map(|dir| dir.join(OPTIONS).join(LAF))
        .filter(|path| path.is_file())
        .collect()
}

/// Verilen `laf.xml` yolundan urun koku (`...\JetBrains`) turetir.
///
/// Neden turetme: cekirdek adaptore yalniz `locate()` sonucunu veriyor; diger
/// urunleri bulmak icin kok dizini bilmek gerek.
fn root_of(path: &Path) -> Option<PathBuf> {
    if path.file_name() != Some(OsStr::new(LAF)) {
        return None;
    }
    let options = path.parent()?;
    if options.file_name() != Some(OsStr::new(OPTIONS)) {
        return None;
    }
    let product = options.parent()?;
    product.parent().map(Path::to_path_buf)
}

/// Windows harf duyarsiz: ayni dosyayi iki kez hedeflemeyelim.
fn same_path(a: &Path, b: &Path) -> bool {
    a.to_string_lossy()
        .eq_ignore_ascii_case(&b.to_string_lossy())
}

/// Cekirdegin verdigi yol bilinen urunlerden birine aitse **tum** urunler
/// hedeflenir; degilse yalniz o dosya (birim testleri ve tek dosya kullanimi).
fn targets(path: &Path) -> Vec<PathBuf> {
    let Some(root) = root_of(path) else {
        return vec![path.to_path_buf()];
    };
    let known = laf_files(&root);
    if known.iter().any(|candidate| same_path(candidate, path)) {
        known
    } else {
        vec![path.to_path_buf()]
    }
}

fn write_one(path: &Path, mode: Mode) -> Result<bool, String> {
    let (text, had_bom) = read_utf8(path)?;
    // Bozuk XML'e yazmak kullanici ayarini kurtarmaz, daha da bozar.
    if !xmlopt::is_well_formed(&text) {
        return Err("laf.xml bozuk, yazılmadı".to_string());
    }
    let value = match mode {
        Mode::Dark => DARK,
        Mode::Light => LIGHT,
    };
    // Secenek o urunde tanimli degilse `None`: atla, hata degil. IDE'nin
    // kendi yazmadigi bir ayari biz uydurmak istemeyiz.
    let Some(next) = xmlopt::set_attr(&text, COMPONENT, OPTION, value) else {
        return Ok(false);
    };
    if next == text {
        return Ok(false);
    }
    if !xmlopt::is_well_formed(&next) {
        return Err("laf.xml bozulurdu, yazılmadı".to_string());
    }
    save(path, &next, had_bom)?;
    Ok(true)
}

impl Adapter for JetBrains {
    fn id(&self) -> &'static str {
        "jetbrains"
    }

    fn name(&self) -> &'static str {
        "JetBrains IDE"
    }

    fn group(&self) -> &'static str {
        "editor"
    }

    /// IDE yeniden baslamadan tema degismez.
    fn live(&self) -> bool {
        false
    }

    /// En yeni urunun `laf.xml`'i; hicbiri yoksa kok dizin (kurulu mu bilgisi).
    fn locate(&self) -> Option<PathBuf> {
        let root = root()?;
        Some(match laf_files(&root).into_iter().next() {
            Some(found) => found,
            None => root,
        })
    }

    fn read(&self, path: &Path) -> Result<Option<Mode>, String> {
        if !path.is_file() {
            // `locate` kok dizini dondurmus olabilir: okunacak tema yok.
            return Ok(None);
        }
        let (text, _) = read_utf8(path)?;
        Ok(
            match xmlopt::get_attr(&text, COMPONENT, OPTION).as_deref() {
                Some(DARK) => Some(Mode::Dark),
                Some(LIGHT) => Some(Mode::Light),
                // "Darcula" gibi eski/baska deger: bilinmiyor, hata degil.
                _ => None,
            },
        )
    }

    fn write(&self, path: &Path, mode: Mode) -> Result<bool, String> {
        if !path.is_file() {
            return Ok(false);
        }
        let mut changed = false;
        let mut first_error: Option<String> = None;
        for target in targets(path) {
            if !target.is_file() {
                continue;
            }
            match write_one(&target, mode) {
                Ok(written) => changed |= written,
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

    const LAF_XML: &str = "<application>\n  <component name=\"LafManager\">\n    \
<option name=\"theme\" value=\"Dark\" />\n  </component>\n  <component name=\"Other\">\n    \
<option name=\"theme\" value=\"Dark\" />\n  </component>\n</application>\n";

    /// Gecici kok altinda bir urun klasoru + `options\laf.xml` olusturur.
    fn product(root: &Path, name: &str, body: &str) -> PathBuf {
        let path = root.join(name).join(OPTIONS).join(LAF);
        if let Some(dir) = path.parent() {
            if let Err(e) = fs::create_dir_all(dir) {
                panic!("ürün klasörü oluşturulamadı: {e}");
            }
        }
        put(&path, body);
        path
    }

    #[test]
    fn reads_jetbrains_theme_values() {
        let dir = tmpdir("jetbrains-read");
        let path = product(&dir, "IntelliJIdea2024.3", LAF_XML);
        assert_eq!(JetBrains.read(&path).ok(), Some(Some(Mode::Dark)));
        put(
            &path,
            &LAF_XML.replacen("value=\"Dark\"", "value=\"Light\"", 1),
        );
        assert_eq!(JetBrains.read(&path).ok(), Some(Some(Mode::Light)));
        // Eski "Darcula" degeri: bilinmiyor.
        put(
            &path,
            "<a><component name=\"LafManager\"><option name=\"theme\" \
value=\"Darcula\" /></component></a>",
        );
        assert_eq!(JetBrains.read(&path).ok(), Some(None));
        cleanup(&dir);
    }

    #[test]
    fn write_changes_only_value_and_keeps_rest() {
        let dir = tmpdir("jetbrains-write");
        let path = product(&dir, "PyCharm2025.1", LAF_XML);
        assert_eq!(JetBrains.write(&path, Mode::Light).ok(), Some(true));
        let text = get(&path);
        let expected = LAF_XML.replacen("value=\"Dark\"", "value=\"Light\"", 1);
        assert_eq!(text, expected, "yalnız value değişmeli, blok aynı kalmalı");
        assert_eq!(JetBrains.read(&path).ok(), Some(Some(Mode::Light)));
        cleanup(&dir);
    }

    #[test]
    fn second_write_reports_no_change() {
        let dir = tmpdir("jetbrains-noop");
        let path = product(&dir, "WebStorm2024.2", LAF_XML);
        assert_eq!(JetBrains.write(&path, Mode::Light).ok(), Some(true));
        assert_eq!(JetBrains.write(&path, Mode::Light).ok(), Some(false));
        cleanup(&dir);
    }

    #[test]
    fn every_product_gets_the_theme() {
        let dir = tmpdir("jetbrains-multi");
        let idea = product(&dir, "IntelliJIdea2024.3", LAF_XML);
        let pycharm = product(&dir, "PyCharm2025.1", LAF_XML);
        // En yeni ürünün yolu veriliyor; kardeş ürün de yazılmalı.
        assert_eq!(JetBrains.write(&pycharm, Mode::Light).ok(), Some(true));
        for path in [&idea, &pycharm] {
            assert_eq!(
                JetBrains.read(path).ok(),
                Some(Some(Mode::Light)),
                "{} yazılmadı",
                path.display()
            );
        }
        // En yeni ürün en başta olmalı (klasör adına göre azalan).
        assert_eq!(laf_files(&dir).first(), Some(&pycharm));
        cleanup(&dir);
    }

    #[test]
    fn broken_xml_is_never_written() {
        let dir = tmpdir("jetbrains-broken");
        let broken = "<application><component name=\"LafManager\">\
<option name=\"theme\" value=\"Dark\"></component>";
        let path = product(&dir, "GoLand2024.1", broken);
        assert!(JetBrains.write(&path, Mode::Light).is_err());
        assert_eq!(get(&path), broken, "bozuk dosya bayt bayt aynı kalmalı");
        cleanup(&dir);
    }

    #[test]
    fn product_without_option_is_skipped_not_an_error() {
        let dir = tmpdir("jetbrains-skip");
        let no_option = "<application>\n  <component name=\"Other\" />\n</application>\n";
        let path = product(&dir, "CLion2024.1", no_option);
        assert_eq!(JetBrains.write(&path, Mode::Dark).ok(), Some(false));
        assert_eq!(get(&path), no_option, "olmayan ayar uydurulmamalı");
        cleanup(&dir);
    }

    #[test]
    fn product_without_laf_file_is_not_created() {
        let dir = tmpdir("jetbrains-missing");
        let existing = product(&dir, "RustRover2024.3", LAF_XML);
        // Yalniz `options` klasörü var, `laf.xml` yok: IDE hiç açılmamış.
        let empty = dir.join("Rider2024.2").join(OPTIONS);
        if let Err(e) = fs::create_dir_all(&empty) {
            panic!("klasör oluşturulamadı: {e}");
        }
        assert_eq!(JetBrains.write(&existing, Mode::Light).ok(), Some(true));
        assert!(
            !empty.join(LAF).exists(),
            "laf.xml olmayan ürüne dosya yaratılmamalı"
        );
        cleanup(&dir);
    }

    #[test]
    fn root_traversal_only_accepts_product_layout() {
        let p =
            PathBuf::from(r"C:\Users\x\AppData\Roaming\JetBrains\PyCharm2025.1\options\laf.xml");
        assert_eq!(
            root_of(&p),
            Some(PathBuf::from(r"C:\Users\x\AppData\Roaming\JetBrains"))
        );
        assert_eq!(root_of(&PathBuf::from(r"C:\x\settings.json")), None);
    }
}
