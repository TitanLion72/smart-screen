// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! Windows acilisinda baslatma (HKCU Run anahtari).
//!
//! Yalniz kendi exe yolunu yazar/siler; baska anahtara dokunmaz.
//!
//! **Neden kurulu exe yazilir:** gelistirici derlemesi (`target\debug`) kayit
//! edilirse acilista iki sey birden bozulur — (1) debug build konsol alt
//! sistemini kullanir, cmd penceresi acilir; (2) debug build `devUrl`e baglidir,
//! vite sunucusu olmadigi icin arayuz bos acilir. Kullanici bunu "otomatik
//! baslat bozuk, cmd cikiyor" diye bildirdi.

use std::path::PathBuf;

const RUN_KEY: &str = r"HKCU:\Software\Microsoft\Windows\CurrentVersion\Run";
const VALUE_NAME: &str = "smart-screen";

/// Kurulu uygulamanin varsayilan yolu (NSIS `/S` kurulumu buraya yazar).
fn installed_exe() -> Option<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA")?;
    let path = PathBuf::from(local)
        .join("smart-screen")
        .join("smart-screen.exe");
    path.is_file().then_some(path)
}

/// Acilista calistirilacak exe: **kurulu** olan tercih edilir.
///
/// Gelistirme derlemesini kayit etmek yukaridaki iki arizayi uretir; bu yuzden
/// `current_exe()` yalnizca kurulu surum yokken (portable kullanim) kullanilir.
fn launcher_exe() -> Result<PathBuf, String> {
    if let Some(installed) = installed_exe() {
        return Ok(installed);
    }
    std::env::current_exe().map_err(|e| format!("exe yolu alinamadi: {e}"))
}

/// Yol gelistirme derlemesine mi ait? (`...\target\debug\...` / `...\release\...`)
fn is_dev_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase().replace('/', "\\");
    lower.contains("\\target\\debug\\") || lower.contains("\\target\\release\\")
}

/// Kayit defteri degerinin dogru olup olmadigini soyler.
fn needs_repair(current: &str) -> bool {
    let trimmed = current.trim().trim_matches('"');
    if trimmed.is_empty() || is_dev_path(trimmed) {
        return true;
    }
    // Kurulu surum varsa ve deger onu gostermiyorsa da duzeltilir (tasa
    // yollari: eski surum klasoru, farkli kullanici yolu).
    match installed_exe() {
        Some(installed) => {
            let want = installed.display().to_string();
            !trimmed.eq_ignore_ascii_case(&want)
        }
        None => false,
    }
}

fn run_powershell(script: &str) -> Result<String, String> {
    crate::ps::run(script)
}

/// Kayıt defterine yazılacak değer: **çift tırnaklı** yol.
///
/// Neden tırnak: `Run` değeri tırnaksızsa ve yolda boşluk varsa Windows yolu
/// böler (`C:\Program` + `Files\...`). PowerShell'in tek tırnağı yalnız betik
/// metninde string sınırıdır, kayıt defterine geçmez — bu yüzden tırnağı
/// değerin İÇİNE koymak gerekir.
fn current_exe_quoted() -> Result<String, String> {
    let exe = launcher_exe()?;
    // PowerShell single-quoted string: tek tirnaklar guvenli (injection yok).
    // Yolda tek tirnak varsa PowerShell kurali: '' ile kac.
    let path = exe.display().to_string().replace('\'', "''");
    Ok(format!("'\"{}\"'", path))
}

/// Acilista baslatma acik mi?
pub fn autostart_status() -> Result<bool, String> {
    let script = format!(
        "(Get-ItemProperty -Path {RUN_KEY} -Name \"{VALUE_NAME}\" -ErrorAction SilentlyContinue).\"{VALUE_NAME}\""
    );
    let out = run_powershell(&script)?;
    Ok(parse_status(&out))
}

/// Acilista baslatmayi ac/kapat.
pub fn set_autostart(enabled: bool) -> Result<(), String> {
    if enabled {
        let exe = current_exe_quoted()?;
        let script = format!(
            "New-ItemProperty -Path {RUN_KEY} -Name {VALUE_NAME} -Value {exe} -Force | Out-Null"
        );
        run_powershell(&script)?;
    } else {
        let script = format!(
            "Remove-ItemProperty -Path {RUN_KEY} -Name {VALUE_NAME} -ErrorAction SilentlyContinue"
        );
        run_powershell(&script)?;
    }
    Ok(())
}

/// Bozuk kaydi sessizce duzeltir; acilisi engellemez.
///
/// Neden acilista: kullanici bir kez yanlis deger yazdirirsa (gelistirici
/// derlemesi) uygulama her acilista bozuk baslar ve kullanici bunu kendi
/// duzeltemez — arayuzu acmak da bozuk. Kendi kendini onaran kayit sart.
/// Donus: duzeltildiyse `true`.
pub fn repair_autostart() -> Result<bool, String> {
    let script = format!(
        "(Get-ItemProperty -Path {RUN_KEY} -Name \"{VALUE_NAME}\" -ErrorAction SilentlyContinue).\"{VALUE_NAME}\""
    );
    let out = run_powershell(&script)?;
    let value = out.trim();
    if value.is_empty() {
        // Kayit yok: acilista baslatma kapali, dokunmayiz.
        return Ok(false);
    }
    let unquoted = value.trim_matches('"');
    if !needs_repair(unquoted) {
        return Ok(false);
    }
    set_autostart(true)?;
    Ok(true)
}

fn parse_status(output: &str) -> bool {
    !output.trim().is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_means_disabled() {
        assert!(!parse_status(""));
        assert!(!parse_status("  \r\n"));
    }

    #[test]
    fn path_means_enabled() {
        assert!(parse_status("\"C:\\app\\smart-screen.exe\""));
    }

    #[test]
    fn dev_build_paths_need_repair() {
        // Kullanicinin bildirdigi ariza: `target\debug` kayitliydi -> cmd
        // penceresi + bos arayuz. Bu yollar asla gecerli sayilmamali.
        assert!(needs_repair(
            r"C:\proj\smart-screen\src-tauri\target\debug\smart-screen.exe"
        ));
        assert!(needs_repair(
            r"C:\proj\smart-screen\src-tauri\target\release\smart-screen.exe"
        ));
        assert!(needs_repair(r"C:\Proj\SMART-SCREEN\TARGET\DEBUG\app.exe"));
        assert!(needs_repair(""));
        assert!(needs_repair(r"C:/proj/target/debug/app.exe"));
    }

    #[test]
    fn installed_path_is_accepted() {
        // Kurulu surum yolu (bu makinede varsa) duzeltme istemez.
        if let Some(installed) = installed_exe() {
            assert!(!needs_repair(&installed.display().to_string()));
        }
        // Kurulu surum yokken dev olmayan yol kabul edilir (portable).
        if installed_exe().is_none() {
            assert!(!needs_repair(
                r"C:\Program Files\smart-screen\smart-screen.exe"
            ));
        }
    }

    #[test]
    fn launcher_prefers_installed_exe() {
        let chosen = launcher_exe().expect("exe yolu");
        if let Some(installed) = installed_exe() {
            assert_eq!(chosen, installed, "kurulu surum varken o secilmeli");
        }
        assert!(
            !chosen
                .display()
                .to_string()
                .to_ascii_lowercase()
                .contains("\\target\\debug\\"),
            "acilista dev yolu secilmemeli"
        );
    }

    #[test]
    fn registry_value_is_quoted() {
        // `Run` degerinde tirnak OLMAZSA ve yolda bosluk varsa Windows yolu
        // boler. PowerShell tek tirnagi yalniz betik siniridir; degerin
        // ICINDE cift tirnak olmali.
        let quoted = current_exe_quoted().expect("exe yolu");
        assert!(
            quoted.starts_with("'\"") && quoted.ends_with("\"'"),
            "deger: {quoted}"
        );
        let inner = quoted.trim_matches('\'');
        assert!(
            inner.starts_with('"') && inner.ends_with('"'),
            "ic tirnak yok: {inner}"
        );
    }

    #[test]
    #[ignore]
    fn live_enable_disable_roundtrip() {
        set_autostart(true).expect("acilista baslatma acilamadi");
        assert!(autostart_status().expect("durum okunamadi"));
        set_autostart(false).expect("acilista baslatma kapatilamadi");
        assert!(!autostart_status().expect("durum okunamadi"));
    }

    #[test]
    #[ignore]
    fn live_repair_fixes_dev_path() {
        // Gercek kayit defterini duzeltir: kayit yoksa yaratmaz.
        let fixed = repair_autostart().expect("onarim calismadi");
        let _ = fixed;
        if autostart_status().expect("durum okunamadi") {
            let out = crate::ps::run(&format!(
                "(Get-ItemProperty -Path {RUN_KEY} -Name \"{VALUE_NAME}\").\"{VALUE_NAME}\""
            ))
            .expect("okunamadi");
            assert!(
                !is_dev_path(out.trim().trim_matches('"')),
                "onarimdan sonra dev yolu kalmamali: {out}"
            );
        }
    }
}
