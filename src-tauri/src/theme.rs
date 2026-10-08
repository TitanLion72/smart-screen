//! OpenCode `cli.json` icindeki `theme` alanini okur/yazar.
//!
//! Kural (AGENTS.md): yalniz `theme` alanini degistir, diger
//! anahtarlari ve dosya yapisini koru.

use serde_json::Value;
use std::fs;
use std::path::PathBuf;

fn cli_path() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE").map_err(|e| format!("USERPROFILE okunamadi: {e}"))?;
    Ok(PathBuf::from(home)
        .join(".config")
        .join("opencode")
        .join("cli.json"))
}

fn read_doc(path: &PathBuf) -> Result<Value, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("cli.json okunamadi: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("cli.json parse edilemedi: {e}"))
}

/// (name, mode) dondurur; mode dosyada yoksa None.
pub fn get_theme() -> Result<(String, Option<String>), String> {
    let path = cli_path()?;
    let doc = read_doc(&path)?;
    let (name, mode) = read_theme(&doc);
    name.map(|n| (n, mode))
        .ok_or_else(|| "theme.name bulunamadi".to_string())
}

/// name yazar; mode verildiyse onu da yazar, verilmediyse korur.
/// OpenCode tema adini ve modunu degistirir; diger anahtarlari korur.
pub fn set_theme(name: &str, mode: Option<&str>) -> Result<(), String> {
    let path = cli_path()?;
    let mut doc = read_doc(&path)?;
    apply_theme(&mut doc, name, mode);
    let text = serde_json::to_string_pretty(&doc).map_err(|e| format!("json yazilamadi: {e}"))?;
    fs::write(&path, text + "\n").map_err(|e| format!("cli.json yazilamadi: {e}"))?;
    Ok(())
}

fn read_theme(doc: &Value) -> (Option<String>, Option<String>) {
    let name = doc
        .get("theme")
        .and_then(|t| t.get("name"))
        .and_then(|n| n.as_str())
        .map(|s| s.to_string());
    let mode = doc
        .get("theme")
        .and_then(|t| t.get("mode"))
        .and_then(|m| m.as_str())
        .map(|s| s.to_string());
    (name, mode)
}

fn apply_theme(doc: &mut Value, name: &str, mode: Option<&str>) {
    let entry = doc
        .as_object_mut()
        .expect("cli.json kok obje olmali")
        .entry("theme")
        .or_insert_with(|| Value::Object(Default::default()));
    if let Some(obj) = entry.as_object_mut() {
        obj.insert("name".to_string(), Value::String(name.to_string()));
        if let Some(m) = mode {
            obj.insert("mode".to_string(), Value::String(m.to_string()));
        }
    }
}

fn apply_flag(doc: &mut Value, key: &str, value: bool) {
    if let Some(obj) = doc.as_object_mut() {
        obj.insert(key.to_string(), Value::Bool(value));
    }
}

/// `animations` alanini ac/kapatir (okuma profili icin); diger anahtarlari korur.
pub fn set_animations(enabled: bool) -> Result<(), String> {
    let path = cli_path()?;
    let mut doc = read_doc(&path)?;
    apply_flag(&mut doc, "animations", enabled);
    let text = serde_json::to_string_pretty(&doc).map_err(|e| format!("json yazilamadi: {e}"))?;
    fs::write(&path, text + "\n").map_err(|e| format!("cli.json yazilamadi: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
      "$schema": "https://opencode.ai/v2/cli.json",
      "theme": { "name": "catppuccin-macchiato" },
      "session": { "sidebar": "auto" }
    }"#;

    #[test]
    fn reads_name_without_mode() {
        let doc: Value = serde_json::from_str(SAMPLE).unwrap();
        assert_eq!(
            read_theme(&doc),
            (Some("catppuccin-macchiato".to_string()), None)
        );
    }

    #[test]
    fn set_preserves_other_keys() {
        let mut doc: Value = serde_json::from_str(SAMPLE).unwrap();
        apply_theme(&mut doc, "zenburn", Some("dark"));
        assert_eq!(doc["theme"]["name"], "zenburn");
        assert_eq!(doc["theme"]["mode"], "dark");
        assert_eq!(doc["session"]["sidebar"], "auto");
        assert_eq!(doc["$schema"], "https://opencode.ai/v2/cli.json");
    }

    #[test]
    fn set_without_mode_keeps_existing() {
        let mut doc: Value =
            serde_json::from_str(r#"{"theme": {"name": "x", "mode": "light"}}"#).unwrap();
        apply_theme(&mut doc, "github", None);
        assert_eq!(doc["theme"]["name"], "github");
        assert_eq!(doc["theme"]["mode"], "light");
    }

    #[test]
    fn flag_preserves_other_keys() {
        let mut doc: Value = serde_json::from_str(SAMPLE).unwrap();
        apply_flag(&mut doc, "animations", false);
        assert_eq!(doc["animations"], false);
        assert_eq!(doc["theme"]["name"], "catppuccin-macchiato");
        assert_eq!(doc["session"]["sidebar"], "auto");
    }

    #[test]
    fn roundtrip_through_temp_file() {
        let path = std::env::temp_dir().join("smart-screen-theme-test.json");
        fs::write(&path, SAMPLE).unwrap();
        let mut doc = read_doc(&path).unwrap();
        apply_theme(&mut doc, "vesper", Some("dark"));
        fs::write(&path, serde_json::to_string_pretty(&doc).unwrap()).unwrap();
        let back = read_doc(&path).unwrap();
        assert_eq!(back["theme"]["name"], "vesper");
        assert_eq!(back["session"]["sidebar"], "auto");
        fs::remove_file(&path).unwrap();
    }
}
