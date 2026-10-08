//! Uygulamanin kendi goz konforu temalarini kurar.
//!
//! Temalar `tools/themes.mjs` ile uretilir ve derlemeye `../themes/*.json`
//! olarak gomulur. Acilista kullanici dizinine kopyalanir; orada zaten bir
//! dosya varsa DOKUNULMAZ (kullanici duzenlemisse geri almamak icin).
//! Guncellemek icin `node tools/themes.mjs` calistirilir.

use std::path::Path;

use crate::contrast;

const BUNDLED: [(&str, &str); 3] = [
    ("ss-paper.json", include_str!("../themes/ss-paper.json")),
    ("ss-dusk.json", include_str!("../themes/ss-dusk.json")),
    ("ss-night.json", include_str!("../themes/ss-night.json")),
];

/// Gomulu temalari eksikse kurar; kac dosya yazdigini doner.
pub fn install_builtin_themes() -> Result<usize, String> {
    let dir = contrast::themes_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("tema dizini olusturulamadi: {e}"))?;
    let mut written = 0;
    for (name, body) in BUNDLED {
        if write_if_missing(&dir, name, body)? {
            written += 1;
        }
    }
    Ok(written)
}

/// Dosya yoksa yazar; varsa dokunmaz. Yazildiysa true.
fn write_if_missing(dir: &Path, name: &str, body: &str) -> Result<bool, String> {
    let path = dir.join(name);
    if path.exists() {
        return Ok(false);
    }
    std::fs::write(&path, body).map_err(|e| format!("{name} yazilamadi: {e}"))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_themes_are_valid_and_readable() {
        for (name, body) in BUNDLED {
            let dir = std::env::temp_dir().join(format!("ss-install-{}", std::process::id()));
            std::fs::create_dir_all(&dir).unwrap();
            let path = dir.join(name);
            std::fs::write(&path, body).unwrap();
            let reports = contrast::audit_theme(&path, name.trim_end_matches(".json")).unwrap();
            assert_eq!(reports.len(), 2, "{name}: light+dark beklenir");
            for r in &reports {
                assert_ne!(r.verdict, "UNKNOWN", "{name}/{}: token cozulemedi", r.mode);
                assert_ne!(r.verdict, "FAIL", "{name}/{}: kontrast yetersiz", r.mode);
            }
            std::fs::remove_file(&path).ok();
        }
    }

    #[test]
    fn installs_once_and_respects_existing_file() {
        let dir = std::env::temp_dir().join(format!("ss-install2-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(write_if_missing(&dir, "ss-test.json", "{\"a\":1}").unwrap());
        // Ikinci kez yazmaz.
        assert!(!write_if_missing(&dir, "ss-test.json", "{\"a\":2}").unwrap());
        // Kullanici duzenlemis korunur.
        assert_eq!(
            std::fs::read_to_string(dir.join("ss-test.json")).unwrap(),
            "{\"a\":1}"
        );
        std::fs::remove_dir_all(&dir).ok();
    }
}
