// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! WCAG metin/zemin kontrast denetimi.
//!
//! Amac "bu tema goz icin okunakli mi" sorusunu his yerine olcuye
//! cevirmek. OpenCode tema dosyalari JSON'dir; `base` ortak token agacini,
//! `light`/`dark` ise o turun paletini ve token geciersmelerini tasir.
//! Metin ve zemin renkleri cogunlukla `$hue.<ad>.<adim>` ya da
//! `$text.muted` gibi referanslarla verilir; once bunlar cozulur.
//!
//! Karsilastirma esikleri (WCAG 2.1): 7.0 AAA, 4.5 AA, 3.0 AA-large.

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

/// Karar gereken renk kodlu tokenlar. `comment`/`operator`/`punctuation`
/// bilerek soluktur; raporlanir ama karara girmez. Liste
/// `tools/themes.mjs` icindeki ESSENTIAL ile AYNI kalmali.
const ESSENTIAL: [&str; 11] = [
    "$syntax.keyword",
    "$syntax.string",
    "$syntax.number",
    "$syntax.type",
    "$syntax.function",
    "$text.feedback.error",
    "$text.feedback.warning",
    "$text.feedback.success",
    "$markdown.heading",
    "$markdown.link",
    "$markdown.code",
];

/// Bir temanin bir modu (light/dark) icin olculmus kontrast ozeti.
#[derive(Serialize, Clone, Debug)]
pub struct Report {
    pub name: String,
    pub mode: String,
    /// `background.base` uzerine `text.base` kontrast orani.
    pub text_on_bg: f32,
    /// `background.base` uzerine `text.muted` kontrast orani (raporlanir, karara girmez).
    pub muted_on_bg: f32,
    /// Renk kodlu tokenlarin (sozdizimi + geri bildirim) en kotu orani.
    pub syntax_min: f32,
    /// "AAA" | "AA" | "AA-large" | "FAIL" | "UNKNOWN".
    pub verdict: String,
}

/// Orani WCAG esiklerine gore etiketler.
pub fn verdict_of(ratio: f32) -> &'static str {
    if ratio >= 7.0 {
        "AAA"
    } else if ratio >= 4.5 {
        "AA"
    } else if ratio >= 3.0 {
        "AA-large"
    } else {
        "FAIL"
    }
}

/// `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` -> [r,g,b]. Alfa varsayilirsa yok sayilir.
pub fn parse_hex(value: &str) -> Option<[u8; 3]> {
    let s = value.trim().strip_prefix('#')?;
    let digits: Vec<u8> = s
        .chars()
        .map(|c| c.to_digit(16).map(|d| d as u8))
        .collect::<Option<Vec<u8>>>()?;
    match digits.len() {
        3 | 4 => Some([digits[0] * 17, digits[1] * 17, digits[2] * 17]),
        6 | 8 => Some([
            digits[0] * 16 + digits[1],
            digits[2] * 16 + digits[3],
            digits[4] * 16 + digits[5],
        ]),
        _ => None,
    }
}

/// WCAG 2.1 relative luminance (0..1).
pub fn relative_luminance(hex: &str) -> Option<f32> {
    let [r, g, b] = parse_hex(hex)?;
    let channel = |c: u8| -> f32 {
        let v = c as f32 / 255.0;
        if v <= 0.03928 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        }
    };
    Some(0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b))
}

/// Iki renk arasindaki kontrast orani (1..21). Simetrik.
pub fn contrast_ratio(a: &str, b: &str) -> Option<f32> {
    let la = relative_luminance(a)?;
    let lb = relative_luminance(b)?;
    let (hi, lo) = if la >= lb { (la, lb) } else { (lb, la) };
    Some((hi + 0.05) / (lo + 0.05))
}

/// Temalarin dizini: XDG varsa orasi, yoksa ~/.config/opencode/themes.
pub fn themes_dir() -> Result<PathBuf, String> {
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        if !xdg.trim().is_empty() {
            return Ok(PathBuf::from(xdg).join("opencode").join("themes"));
        }
    }
    let home = std::env::var("USERPROFILE")
        .map_err(|e| format!("kullanici dizini yok: {e}"))?
        .trim_end_matches(['\\', '/'])
        .to_string();
    Ok(PathBuf::from(home)
        .join(".config")
        .join("opencode")
        .join("themes"))
}

fn is_color_literal(value: &str) -> bool {
    value.starts_with('#')
}

/// Degeri `#hex` veya `transparent` ise aynen doner; referanssa `None`.
fn literal_hex(value: &Value) -> Option<String> {
    let s = value.as_str()?;
    if is_color_literal(s) {
        Some(s.to_string())
    } else {
        None
    }
}

fn depth_ok(depth: usize) -> bool {
    depth < 8
}

/// `$hue.<ad>.<adim>` referanslarini cozer. `step` yoksa alias (`"$hue.purple"`).
fn resolve_hue(root: &Value, name: &str, step: Option<&str>, depth: usize) -> Option<String> {
    if !depth_ok(depth) {
        return None;
    }
    match root.get("hue")?.get(name)? {
        Value::String(alias) => {
            let rest = alias.strip_prefix('$')?;
            let parts: Vec<&str> = rest.split('.').collect();
            match parts.as_slice() {
                ["hue", target] => resolve_hue(root, target, step, depth + 1),
                ["hue", target, target_step] => {
                    resolve_hue(root, target, Some(target_step), depth + 1)
                }
                _ => None,
            }
        }
        Value::Object(scale) => literal_hex(scale.get(step?)?),
        _ => None,
    }
}

/// `$text.muted`, `$background.raised.base` gibi token referanslarini cozer.
pub fn resolve_ref(root: &Value, reference: &str) -> Option<String> {
    resolve_ref_at(root, reference, 0)
}

fn resolve_ref_at(root: &Value, reference: &str, depth: usize) -> Option<String> {
    if !depth_ok(depth) {
        return None;
    }
    let path: Vec<&str> = reference.trim().strip_prefix('$')?.split('.').collect();
    resolve_path(root, &path, depth + 1)
}

fn resolve_path(root: &Value, path: &[&str], depth: usize) -> Option<String> {
    if !depth_ok(depth) || path.is_empty() {
        return None;
    }
    if path[0] == "hue" {
        let name = *path.get(1)?;
        return resolve_hue(root, name, path.get(2).copied(), depth + 1);
    }
    let mut node = root;
    for (i, segment) in path.iter().enumerate() {
        let value = node.as_object()?.get(*segment)?;
        if let Value::String(s) = value {
            if i == path.len() - 1 {
                // Son segment hem direkt renk hem referans olabilir ("$hue.gray.800").
                return if s.starts_with('$') {
                    resolve_ref_at(root, s, depth + 1)
                } else {
                    literal_hex(value)
                };
            }
            // Ara segmentte bir renk (ya da renk referansi) alt dallanamaz;
            // kalan yolu yok saymak yanlis cevap uretirdi.
            return None;
        }
        node = value;
    }
    None
}

/// Iki JSON nesnesini derin birlestirir (mod tokenleri tabani ezebilir).
fn merge(base: &mut Value, overlay: &Value) {
    let (Some(target), Some(source)) = (base.as_object_mut(), overlay.as_object()) else {
        return;
    };
    for (key, value) in source {
        match target.get_mut(key) {
            Some(existing) if existing.is_object() && value.is_object() => merge(existing, value),
            _ => {
                target.insert(key.clone(), value.clone());
            }
        }
    }
}

fn round1(v: f32) -> f32 {
    (v * 10.0).round() / 10.0
}

/// Renk kodlu tokenlarin zemine karsi en kotu orani (cozulebilenlerden).
fn essential_min(root: &Value, bg: &str) -> Option<f32> {
    let mut worst: Option<f32> = None;
    for token in ESSENTIAL {
        let Some(hex_value) = resolve_ref(root, token) else {
            continue;
        };
        let Some(ratio) = contrast_ratio(&hex_value, bg) else {
            continue;
        };
        worst = Some(match worst {
            Some(w) => w.min(ratio),
            None => ratio,
        });
    }
    worst
}

fn report_for(root: &Value, name: &str, mode: &str) -> Report {
    let text = resolve_ref(root, "$text.base");
    let muted = resolve_ref(root, "$text.muted");
    let bg = resolve_ref(root, "$background.base");
    let (text_ratio, muted_ratio, syntax_ratio) = match (&text, &bg) {
        (Some(t), Some(b)) => (
            contrast_ratio(t, b),
            muted.as_deref().and_then(|m| contrast_ratio(m, b)),
            essential_min(root, b),
        ),
        _ => (None, None, None),
    };
    match text_ratio {
        Some(ratio) => {
            // Karar metin kadar renk koduna da baglidir: gorunmez bir
            // sozdizimi rengi temayi asagi ceker.
            let effective = ratio.min(syntax_ratio.unwrap_or(f32::INFINITY));
            Report {
                name: name.to_string(),
                mode: mode.to_string(),
                text_on_bg: round1(ratio),
                muted_on_bg: round1(muted_ratio.unwrap_or(0.0)),
                syntax_min: round1(syntax_ratio.unwrap_or(0.0)),
                verdict: verdict_of(effective).to_string(),
            }
        }
        None => Report {
            name: name.to_string(),
            mode: mode.to_string(),
            text_on_bg: 0.0,
            muted_on_bg: 0.0,
            syntax_min: 0.0,
            verdict: "UNKNOWN".to_string(),
        },
    }
}

/// Tek tema dosyasini denetler; light ve dark varsa ayri rapor doner.
pub fn audit_theme(path: &Path, name: &str) -> Result<Vec<Report>, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| format!("okunamadi: {e}"))?;
    let doc: Value = serde_json::from_str(&raw).map_err(|e| format!("JSON hatasi: {e}"))?;
    let base = doc
        .get("base")
        .cloned()
        .unwrap_or(Value::Object(Default::default()));
    let has_light = doc.get("light").is_some();
    let has_dark = doc.get("dark").is_some();
    let modes: Vec<&str> = match (has_light, has_dark) {
        (true, true) => vec!["light", "dark"],
        (true, false) => vec!["light"],
        _ => vec!["dark"],
    };
    let mut out = Vec::with_capacity(modes.len());
    for mode in modes {
        let mut root = base.clone();
        if let Some(section) = doc.get(mode) {
            merge(&mut root, section);
        }
        out.push(report_for(&root, name, mode));
    }
    Ok(out)
}

/// Dizindeki tum `*.json` temalari denetler. Okunamayan dosyalar atlanir.
pub fn audit_all(dir: &Path) -> Result<Vec<Report>, String> {
    let entries = std::fs::read_dir(dir).map_err(|e| format!("tema dizini okunamadi: {e}"))?;
    let mut out = Vec::new();
    let mut files: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .collect();
    files.sort();
    for file in files {
        let name = file
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("?")
            .to_string();
        if let Ok(reports) = audit_theme(&file, &name) {
            out.extend(reports);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(v: u16) -> String {
        format!("#{v:04x}")
    }

    #[test]
    fn luminance_endpoints() {
        assert!((relative_luminance(&hex(0xFFFF)).unwrap() - 1.0).abs() < 0.001);
        assert!(relative_luminance(&hex(0x0000)).unwrap().abs() < 0.001);
    }

    #[test]
    fn luminance_low_channel_uses_linear_branch() {
        // #080808: 8/255 = 0.0314 <= 0.03928 -> v/12.92 (pow dalinda degil).
        let l = relative_luminance("#080808").unwrap();
        // 0.0314/12.92 = 0.00243 her kanal, L = ayni (0.2126+0.7152+0.0722=1).
        assert!((l - 0.00243).abs() < 0.0002, "got {l}");
        // Eski sabit 12.4 ile ~0.00253 olurdu; 12.92 dogru WCAG degeri.
        assert!(
            l < 0.0025,
            "eski 12.4 sabiti hala kullaniliyor olabilir: {l}"
        );
    }

    #[test]
    fn ratio_white_on_black_is_21() {
        let r = contrast_ratio("#ffffff", "#000000").unwrap();
        assert!((r - 21.0).abs() < 0.05, "got {r}");
    }

    #[test]
    fn ratio_is_symmetric() {
        let a = contrast_ratio("#123456", "#fedcba").unwrap();
        let b = contrast_ratio("#fedcba", "#123456").unwrap();
        assert!((a - b).abs() < 0.0001);
    }

    #[test]
    fn same_color_is_one() {
        assert!((contrast_ratio("#336699", "#336699").unwrap() - 1.0).abs() < 0.0001);
    }

    #[test]
    fn short_hex_matches_long() {
        assert_eq!(parse_hex("#abc"), Some(parse_hex("#aabbcc").unwrap()));
        assert_eq!(parse_hex("#abcd"), Some(parse_hex("#aabbcc").unwrap()));
    }

    #[test]
    fn invalid_hex_is_none() {
        assert_eq!(parse_hex("#12"), None);
        assert_eq!(parse_hex("zzz"), None);
        assert_eq!(parse_hex("336699"), None);
        assert_eq!(relative_luminance("transparent"), None);
    }

    #[test]
    fn verdict_thresholds() {
        assert_eq!(verdict_of(7.0), "AAA");
        assert_eq!(verdict_of(6.9), "AA");
        assert_eq!(verdict_of(4.5), "AA");
        assert_eq!(verdict_of(4.4), "AA-large");
        assert_eq!(verdict_of(3.0), "AA-large");
        assert_eq!(verdict_of(2.9), "FAIL");
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ss-contrast-{}-{tag}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    // Gercek konvansiyon: text.base = $hue.neutral.200, background.base =
    // $hue.neutral.800. Acik temada 100 koyu -> 900 acik, koyu temada tersi.
    const FIXTURE: &str = r##"{
      "$schema": "https://opencode.ai/theme.json",
      "base": {
        "text": { "base": "$hue.neutral.200", "muted": "$hue.neutral.400" },
        "background": { "base": "$hue.neutral.800" }
      },
      "light": {
        "hue": {
          "neutral": "$hue.gray",
          "gray": {
            "100": "#1a1a1a", "200": "#333333", "300": "#666666", "400": "#999999",
            "500": "#b3b3b3", "600": "#cccccc", "700": "#e0e0e0", "800": "#eeeeee", "900": "#f8f8f8"
          }
        }
      },
      "dark": {
        "hue": {
          "neutral": "$hue.gray",
          "gray": {
            "100": "#f8f8f8", "200": "#eeeeee", "300": "#cccccc", "400": "#999999",
            "500": "#666666", "600": "#4a4a4a", "700": "#333333", "800": "#1a1a1a", "900": "#0d0d0d"
          },
          "accent": "$hue.gray"
        }
      }
    }"##;

    #[test]
    fn audits_both_modes_from_fixture() {
        let dir = temp_dir("modes");
        let file = dir.join("deneme.json");
        std::fs::write(&file, FIXTURE).unwrap();
        let reports = audit_theme(&file, "deneme").unwrap();
        assert_eq!(reports.len(), 2, "{reports:?}");
        assert_eq!(reports[0].mode, "light");
        assert_eq!(reports[1].mode, "dark");
        // acik: koyu metin (#333) acik zeminde (#eee)
        assert!(reports[0].text_on_bg > 10.0, "{:?}", reports[0]);
        assert_eq!(reports[0].verdict, "AAA");
        // koyu: acik metin (#eee) koyu zeminde (#1a1a1a)
        assert!(reports[1].text_on_bg > 10.0, "{:?}", reports[1]);
        assert_eq!(reports[1].verdict, "AAA");
        // muted raporlanir ve metinden dusuktur
        assert!(reports[1].muted_on_bg > 1.0);
        assert!(reports[1].muted_on_bg < reports[1].text_on_bg);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn fails_when_low_contrast() {
        let dir = temp_dir("fail");
        let file = dir.join("soluk.json");
        std::fs::write(
            &file,
            r##"{"base":{},"dark":{"text":{"base":"#777777"},"background":{"base":"#808080"}}}"##,
        )
        .unwrap();
        let reports = audit_theme(&file, "soluk").unwrap();
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].verdict, "FAIL");
        assert!(reports[0].text_on_bg < 3.0);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn unresolvable_tokens_are_unknown_not_panic() {
        let dir = temp_dir("unknown");
        let file = dir.join("bozuk.json");
        std::fs::write(&file, r#"{"base":{"text":{"base":"$hue.yok.500"}}}"#).unwrap();
        let reports = audit_theme(&file, "bozuk").unwrap();
        assert_eq!(reports[0].verdict, "UNKNOWN");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn circular_reference_terminates() {
        let dir = temp_dir("circular");
        let file = dir.join("dongu.json");
        std::fs::write(
            &file,
            r#"{"base":{},"dark":{"text":{"base":"$background.base"},"background":{"base":"$text.base"}}}"#,
        )
        .unwrap();
        let reports = audit_theme(&file, "dongu").unwrap();
        assert_eq!(reports[0].verdict, "UNKNOWN");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn hue_alias_chain_resolves() {
        let doc: Value = serde_json::from_str(
            r##"{"hue":{"gray":{"400":"#112233"},"neutral":"$hue.gray","accent":"$hue.neutral"}}"##,
        )
        .unwrap();
        assert_eq!(
            resolve_ref(&doc, "$hue.accent.400").as_deref(),
            Some("#112233")
        );
        assert_eq!(
            resolve_ref(&doc, "$hue.neutral.400").as_deref(),
            Some("#112233")
        );
        assert_eq!(resolve_ref(&doc, "$hue.accent.900"), None);
    }

    #[test]
    fn transparent_is_not_a_color() {
        let doc: Value = serde_json::from_str(r#"{"hue":{"gray":{"400":"transparent"}}}"#).unwrap();
        assert_eq!(resolve_ref(&doc, "$hue.gray.400"), None);
    }

    #[test]
    fn mid_path_reference_does_not_swallow_rest() {
        // `a.b` bir renk referansiysa `a.b.c` cozulemez; `b`'nin rengi donmemeli.
        let doc: Value = serde_json::from_str(
            r##"{"hue":{"gray":{"400":"#112233"}},"a":{"b":"$hue.gray.400"}}"##,
        )
        .unwrap();
        assert_eq!(resolve_ref(&doc, "$a.b"), Some("#112233".to_string()));
        assert_eq!(resolve_ref(&doc, "$a.b.c"), None);
    }

    #[test]
    fn invisible_syntax_downgrades_verdict() {
        // Metin AAA olsa bile gorunmez sozdizimi rengi temayi dusurur.
        let dir = temp_dir("syntax");
        let file = dir.join("soluk-renk.json");
        std::fs::write(
            &file,
            r##"{
              "base": {},
              "dark": {
                "text": { "base": "#ffffff", "muted": "#cccccc" },
                "background": { "base": "#000000" },
                "syntax": { "keyword": "#020102", "string": "#ffffff" }
              }
            }"##,
        )
        .unwrap();
        let reports = audit_theme(&file, "soluk-renk").unwrap();
        assert_eq!(reports.len(), 1);
        assert!(reports[0].text_on_bg > 19.0, "{:?}", reports[0]);
        assert!(reports[0].syntax_min < 1.2, "{:?}", reports[0]);
        assert_eq!(reports[0].verdict, "FAIL");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn audit_all_counts_files_and_sorts() {
        let dir = temp_dir("all");
        std::fs::write(dir.join("b.json"), FIXTURE).unwrap();
        std::fs::write(dir.join("a.json"), FIXTURE).unwrap();
        std::fs::write(dir.join("notlar.txt"), "x").unwrap();
        let reports = audit_all(&dir).unwrap();
        // 2 dosya x 2 mod
        assert_eq!(reports.len(), 4);
        assert_eq!(reports[0].name, "a");
        assert_eq!(reports[2].name, "b");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn missing_dir_is_error() {
        assert!(audit_all(Path::new("C:\\yok-boyle-bir-dizin-xyz")).is_err());
    }

    /// Kurulu temalari gercekten denetler: `cargo test -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn audits_installed_themes() {
        let dir = themes_dir().expect("tema dizini");
        let reports = audit_all(&dir).expect("denetim");
        println!("tema dizini: {}", dir.display());
        for r in &reports {
            println!(
                "  {:<14} {:<5} text {:>5} ({}) muted {:>5} renk {:>5}",
                r.name, r.mode, r.text_on_bg, r.verdict, r.muted_on_bg, r.syntax_min
            );
        }
        assert!(!reports.is_empty(), "tema dizini bos");
        for r in &reports {
            assert_ne!(r.verdict, "UNKNOWN", "{}: cozulemedi", r.name);
            assert_ne!(r.verdict, "FAIL", "{}: kontrast yetersiz", r.name);
        }
    }
}
