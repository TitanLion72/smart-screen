// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! "Cok uygulamali tema" cekirdegi: Windows sistem temasi + uygulama
//! adaptorleri icin tek karar noktasi.
//!
//! Neden burada: adaptorler yalniz "dosyaya nasil yazilir" bilir. Yedekleme,
//! atomik yazma, Pro kapisi ve hata toplama **tek yerde** durur; her adaptor
//! ayni guvenlik kurallarini tekrar yazsaydi biri er gec unuturdu.

pub mod adapters;
pub mod jsonc;
pub mod system_theme;

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// Ayar dosyasinin yedek uzantisi. Kullanici silebilir; ilk yazmada olusur.
const BACKUP_SUFFIX: &str = "ss-backup";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Dark,
    Light,
}

impl Mode {
    pub fn as_str(self) -> &'static str {
        match self {
            Mode::Dark => "dark",
            Mode::Light => "light",
        }
    }

    /// Turkce/Ingilizce, buyuk-kucuk harf toleransli. Uydurma metin `None`.
    pub fn parse(s: &str) -> Option<Mode> {
        match s.trim().to_lowercase().as_str() {
            "dark" | "koyu" => Some(Mode::Dark),
            "light" | "açık" | "acik" => Some(Mode::Light),
            _ => None,
        }
    }
}

/// Arayuzde bir uygulama satiri. `error` doluysa okuma/yazma sorunlu demektir;
/// `list_apps` bu yuzden hata dondurmez, sorunu satira yazar.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub id: String,
    pub name: String,
    pub group: String,
    pub installed: bool,
    pub live: bool,
    pub path: Option<String>,
    pub current: Option<String>,
    pub error: Option<String>,
}

/// Tek hedefin sonucu. Bir hedef patlarsa digerleri yine denenir.
#[derive(Clone, Debug, Serialize)]
pub struct ApplyResult {
    pub id: String,
    pub ok: bool,
    pub changed: bool,
    pub error: Option<String>,
}

impl ApplyResult {
    fn fail(id: &str, message: impl Into<String>) -> Self {
        ApplyResult {
            id: id.to_string(),
            ok: false,
            changed: false,
            error: Some(message.into()),
        }
    }
}

/// Sozlesme C1: her uygulama adaptoru bu imzayi uygular.
pub trait Adapter: Send + Sync {
    fn id(&self) -> &'static str;
    fn name(&self) -> &'static str;
    fn group(&self) -> &'static str;
    fn live(&self) -> bool {
        true
    }
    /// Ayar dosyasi (varsa). Dosya henuz olusmamis olabilir.
    fn locate(&self) -> Option<PathBuf>;
    fn read(&self, path: &Path) -> Result<Option<Mode>, String>;
    /// `true` = gercekten yazildi, `false` = deger zaten ayniydi.
    fn write(&self, path: &Path, mode: Mode) -> Result<bool, String>;

    /// Uygulama kurulu mu?
    ///
    /// Neden adaptore birakildi: eskiden `list_apps` "dosya var ya da **ust
    /// klasoru** var" diye bakiyordu. Bu, `%APPDATA%` gibi her zaman var olan
    /// bir ust klasor icin "kurulu" diyordu (JetBrains hic kurulu degilken
    /// "kurulu" gorunuyordu). Varsayilan dogru olan: ayar dosyasi var mi.
    fn installed(&self) -> bool {
        self.locate().map(|p| p.exists()).unwrap_or(false)
    }

    /// Bu adaptorun yazacagi TUM dosyalar.
    ///
    /// Neden gerekli: Obsidian birden fazla kasa, JetBrains birden fazla urun
    /// icin yazar. Cekirdek yedegi `locate()`in dondurdugu tek dosya icin
    /// aliyordu - diger dosyalar **yedeksiz** degisiyordu. Artik her hedef
    /// yedeklenir ve geri alma hepsini dondurur.
    fn targets(&self, path: &Path) -> Vec<PathBuf> {
        vec![path.to_path_buf()]
    }

    /// Arayuzde gorunen durum: `"dark"` / `"light"` / `"system"` / `"unknown"`.
    ///
    /// Neden ayri: `read` yalnizca **yazilabilir** modu dondurur (`Mode`), ama
    /// kullaniciya "su an ne?" sorusunun dogru cevabi bazen "sistemi takip
    /// ediyor" olur (Windows Terminal'de `theme` yoksa varsayilani `system`).
    /// Bunu `None` ile anlatmak "bilinmiyor" demek olurdu - yanlis bilgi.
    fn peek(&self, path: &Path) -> Option<String> {
        match self.read(path) {
            Ok(Some(mode)) => Some(mode.as_str().to_string()),
            Ok(None) => Some("unknown".to_string()),
            Err(_) => None,
        }
    }
}

/// Kurulu uygulamalarin listesi. Okuma her zaman serbesttir (Pro kapisi yok);
/// tek bir adaptorun patlamasi listeyi dusurmez, satirda `error` olur.
pub fn list_apps() -> Vec<AppInfo> {
    adapters::all()
        .into_iter()
        .map(|adapter| {
            let located = adapter.locate();
            // Kurulu mu sorusu adaptore ait: ust klasorun varligi kanit degil
            // (`%APPDATA%` her zaman var; JetBrains kurulu degilken "kurulu"
            // gorunuyordu).
            let installed = adapter.installed();
            let path = located.as_ref().map(|p| p.to_string_lossy().to_string());

            let (current, error) = match located.as_ref() {
                Some(p) if p.exists() => match adapter.peek(p) {
                    Some(label) => (Some(label), None),
                    // `peek` yalnizca okuma hatasinda `None` doner; o zaman
                    // `read` ile ayni mesaji alalim (kullanici nedeni gorsun).
                    None => (None, adapter.read(p).err()),
                },
                // Dosya yok: surpriz dosya yaratmayiz (PLAN guvenlik 4).
                _ => (None, None),
            };

            AppInfo {
                id: adapter.id().to_string(),
                name: adapter.name().to_string(),
                group: adapter.group().to_string(),
                installed,
                live: adapter.live(),
                path,
                current,
                error,
            }
        })
        .collect()
}

/// Hedefleri uygular. Kapi **once** calisir: Pro yoksa hicbir sey yazilmaz.
pub fn apply(mode: Mode, targets: &[String], pro: bool) -> Result<Vec<ApplyResult>, String> {
    let wants_app = targets.iter().any(|t| t != "system");
    if wants_app && !pro {
        return Err("Pro gerekli: uygulama temaları".to_string());
    }

    // Adaptor listesi bir kez kurulur: her hedef icin yeniden taramak
    // (A2'de dosya sistemi taramasi olabilir) bosuna maliyet olurdu.
    let adapters = adapters::all();
    let mut results = Vec::new();
    let mut seen: Vec<&str> = Vec::new();
    for target in targets {
        if seen.contains(&target.as_str()) {
            continue;
        }
        seen.push(target.as_str());
        if target == "system" {
            results.push(apply_system(mode));
        } else {
            results.push(apply_adapter(&adapters, target, mode));
        }
    }
    Ok(results)
}

/// Windows sistem temasi. Deger zaten ayniysa yazilmaz: bos yere
/// `WM_SETTINGCHANGE` yayinlamak Explorer'i gereksiz yeniler.
fn apply_system(mode: Mode) -> ApplyResult {
    let before = system_theme::get().ok();
    if before == Some(mode) {
        return ApplyResult {
            id: "system".to_string(),
            ok: true,
            changed: false,
            error: None,
        };
    }
    match system_theme::set(mode) {
        Ok(()) => ApplyResult {
            id: "system".to_string(),
            ok: true,
            changed: true,
            error: None,
        },
        Err(e) => ApplyResult::fail("system", e),
    }
}

/// Tek uygulama hedefi: adaptoru bul, yedegi hazirla, yaz.
///
/// Yedek **merkezi**: adaptor `write` cagrilmadan once dosyanin ilk hali
/// `<dosya>.ss-backup` olarak alinir. Adaptorler bunu tekrar yazmaz.
fn apply_adapter(adapters: &[Box<dyn Adapter>], id: &str, mode: Mode) -> ApplyResult {
    let Some(adapter) = adapters.iter().find(|a| a.id() == id) else {
        return ApplyResult::fail(id, "bilinmeyen hedef");
    };
    let Some(path) = adapter.locate() else {
        // Ayarlari okunacak dosya yok. Uygulama kuruluysa bu "bozuk" degil,
        // "henuz ayar dosyasi yok" demektir (JetBrains laf.xml'i ancak
        // kullanici gorunum ayarini degistirince olusur).
        return ApplyResult::fail(
            id,
            if adapter.installed() {
                "ayar dosyası yok - uygulamayı bir kez aç"
            } else {
                "kurulu değil"
            },
        );
    };
    if !path.exists() {
        return ApplyResult::fail(id, "ayar dosyası yok — uygulamayı bir kez aç");
    }
    if let Err(e) = ensure_backup(&path) {
        return ApplyResult::fail(id, e);
    }
    // Birden fazla dosyaya yazan adaptorler (Obsidian kasalari, JetBrains
    // urunleri) icin her hedef yedeklenir; yoksa yalniz ilk dosya korunur ve
    // geri alma digerlerini kurtaramaz.
    for target in adapter.targets(&path) {
        if target == path || !target.exists() {
            continue;
        }
        if let Err(e) = ensure_backup(&target) {
            return ApplyResult::fail(id, e);
        }
    }
    match adapter.write(&path, mode) {
        Ok(changed) => ApplyResult {
            id: id.to_string(),
            ok: true,
            changed,
            error: None,
        },
        Err(e) => ApplyResult::fail(id, e),
    }
}

/// Yedek varsa dosyalari geri kopyalar (Pro: yedek yalniz adaptorlerde olusur).
/// Yedeklerden geri yükleme **Pro kapısına takılmaz**.
///
/// Neden: yazma bir Pro özelliği, ama *kullanıcının kendi dosyasını eski
/// hâline döndürmek* değil. Lisans bitince dosyaları eski hâline
/// döndürememek kullanıcıyı tuzağa düşürürdü — üstelik yedekleri biz
/// oluşturduk. Bu yüzden geri alma her zaman serbest.
pub fn restore(_pro: bool) -> Result<Vec<ApplyResult>, String> {
    let results = adapters::all()
        .into_iter()
        .map(|adapter| {
            let id = adapter.id();
            let Some(path) = adapter.locate() else {
                return ApplyResult {
                    id: id.to_string(),
                    ok: true,
                    changed: false,
                    error: None,
                };
            };
            let targets = adapter.targets(&path);
            let mut changed = false;
            let mut first_error: Option<String> = None;
            for target in targets {
                let backup = backup_path(&target);
                if !backup.exists() {
                    continue;
                }
                let content = match fs::read(&backup) {
                    Ok(c) => c,
                    Err(e) => {
                        first_error.get_or_insert_with(|| format!("yedek okunamadı: {e}"));
                        continue;
                    }
                };
                // Atomik yaz: yarim dosya kalirsa uygulama ayarlari bozulur.
                match write_bytes_atomic_verified(&target, &content) {
                    Ok(()) => changed = true,
                    Err(e) => {
                        first_error.get_or_insert(e);
                    }
                }
            }
            match first_error {
                Some(e) => ApplyResult::fail(id, e),
                None => ApplyResult {
                    id: id.to_string(),
                    ok: true,
                    changed,
                    error: None,
                },
            }
        })
        .collect();
    Ok(results)
}

/// Bir dosyanin yedek yolu: `<dosya>.ss-backup` (uzanti degistirilmez).
pub fn backup_path(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    path.with_file_name(format!("{name}.{BACKUP_SUFFIX}"))
}

/// Yedek yoksa olusturur; varsa **dokunmaz** (ilk hali korunur).
fn ensure_backup(path: &Path) -> Result<(), String> {
    let backup = backup_path(path);
    if backup.exists() {
        return Ok(());
    }
    let content = fs::read(path).map_err(|e| format!("yedek için okunamadı: {e}"))?;
    fs::write(&backup, &content).map_err(|e| format!("yedek yazılamadı: {e}"))
}

/// Atomik + dogrulanmis yazma (adaptorlerin kullanacagi yardimci).
/// A2 gelene kadar cagiran yok; bu yuzden `allow(dead_code)`.
#[allow(dead_code)]
pub fn write_atomic_verified(path: &Path, content: &str) -> Result<(), String> {
    write_bytes_atomic_verified(path, content.as_bytes())
}

/// Bayt tabanli surum: yedekten geri kopyalarken de ayni yolu kullaniriz.
///
/// Sirasi: eski icerigi akilda tut → `.tmp-<pid>` yaz → geri oku → rename →
/// son hali dogrula. Herhangi bir adim patlarsa eski icerik geri yazilir.
fn write_bytes_atomic_verified(path: &Path, content: &[u8]) -> Result<(), String> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| "dosya adı çözülemedi".to_string())?;
    let tmp = path.with_file_name(format!("{name}.tmp-{}", std::process::id()));
    let old = fs::read(path).ok();

    let restore_old = |tmp: &Path| {
        let _ = fs::remove_file(tmp);
        if let Some(ref old) = old {
            let _ = fs::write(path, old);
        }
    };

    if let Err(e) = fs::write(&tmp, content) {
        return Err(format!("geçici dosya yazılamadı: {e}"));
    }
    match fs::read(&tmp) {
        Ok(back) if back == content => {}
        Ok(_) => {
            restore_old(&tmp);
            return Err("yazılan içerik geri okunduğunda farklı".to_string());
        }
        Err(e) => {
            restore_old(&tmp);
            return Err(format!("geçici dosya doğrulanamadı: {e}"));
        }
    }
    if let Err(e) = fs::rename(&tmp, path) {
        restore_old(&tmp);
        return Err(format!("dosya yerine konamadı: {e}"));
    }
    match fs::read(path) {
        Ok(back) if back == content => Ok(()),
        Ok(_) => {
            if let Some(ref old) = old {
                let _ = fs::write(path, old);
            }
            Err("doğrulama başarısız: dosya beklenen içerikle açılmadı".to_string())
        }
        Err(e) => {
            if let Some(ref old) = old {
                let _ = fs::write(path, old);
            }
            Err(format!("yazma doğrulanamadı: {e}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mode_str_roundtrip() {
        assert_eq!(Mode::Dark.as_str(), "dark");
        assert_eq!(Mode::Light.as_str(), "light");
        assert_eq!(Mode::parse("dark"), Some(Mode::Dark));
        assert_eq!(Mode::parse(" LIGHT "), Some(Mode::Light));
        assert_eq!(Mode::parse("koyu"), Some(Mode::Dark));
        assert_eq!(Mode::parse("açık"), Some(Mode::Light));
        assert_eq!(Mode::parse("acik"), Some(Mode::Light));
        assert_eq!(Mode::parse("mavi"), None);
    }

    #[test]
    fn unknown_target_is_reported_without_writing_anything() {
        // Bilinmeyen hedef adaptor aramasinda duser; kayit defterine
        // dokunulmaz, bu yuzden test ortami degistirmez.
        let results = apply(Mode::Dark, &["yok-boyle-bir-sey".to_string()], true).unwrap();
        assert_eq!(results.len(), 1);
        assert!(!results[0].ok);
        assert!(!results[0].changed);
        assert_eq!(results[0].error.as_deref(), Some("bilinmeyen hedef"));
    }

    #[test]
    fn pro_gate_rejects_before_writing() {
        let err = apply(Mode::Dark, &["vscode".to_string()], false).unwrap_err();
        assert_eq!(err, "Pro gerekli: uygulama temaları");
    }

    #[test]
    fn restore_is_never_pro_gated() {
        // Lisans bitse de kullanici kendi dosyasini geri alabilmeli: yedegi
        // biz olusturduk, geri almayi kilitlemek kullaniciyi tuzaga dusurur.
        assert!(restore(false).is_ok(), "geri alma Pro kapisina takilmamali");
    }

    #[test]
    fn duplicate_targets_are_applied_once() {
        let results = apply(Mode::Dark, &["yok".to_string(), "yok".to_string()], true).unwrap();
        assert_eq!(results.len(), 1, "ayni hedef iki kez islenmemeli");
    }

    #[test]
    fn backup_path_appends_suffix_without_replacing_extension() {
        let p = PathBuf::from(r"C:\x\settings.json");
        let b = backup_path(&p);
        assert_eq!(
            b.file_name().unwrap().to_string_lossy(),
            "settings.json.ss-backup"
        );
    }

    #[test]
    fn atomic_write_creates_and_verifies() {
        let dir = std::env::temp_dir().join("smart-screen-appearance-test");
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("settings.json");
        write_atomic_verified(&path, "{\n  \"a\": 1\n}\n").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "{\n  \"a\": 1\n}\n");
        assert!(!dir.join("settings.json.tmp-0").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn backup_is_created_once_and_never_overwritten() {
        let dir = std::env::temp_dir().join("smart-screen-appearance-backup");
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("settings.json");
        fs::write(&path, "ilk").unwrap();
        ensure_backup(&path).unwrap();
        fs::write(&path, "ikinci").unwrap();
        ensure_backup(&path).unwrap();
        assert_eq!(fs::read_to_string(backup_path(&path)).unwrap(), "ilk");
        let _ = fs::remove_dir_all(&dir);
    }
}
