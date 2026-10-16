//! Windows acilisinda baslatma (HKCU Run anahtari).
//!
//! Yalniz kendi exe yolunu yazar/siler; baska anahtara dokunmaz.

const RUN_KEY: &str = r"HKCU:\Software\Microsoft\Windows\CurrentVersion\Run";
const VALUE_NAME: &str = "smart-screen";

fn run_powershell(script: &str) -> Result<String, String> {
    crate::ps::run(script)
}

fn current_exe_quoted() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| format!("exe yolu alinamadi: {e}"))?;
    // PowerShell single-quoted string: tek tirnaklar guvenli (injection yok).
    // Yolda tek tirnak varsa PowerShell kurali: '' ile kac.
    let path = exe.display().to_string().replace('\'', "''");
    Ok(format!("'{}'", path))
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
    #[ignore]
    fn live_enable_disable_roundtrip() {
        set_autostart(true).expect("acilista baslatma acilamadi");
        assert!(autostart_status().expect("durum okunamadi"));
        set_autostart(false).expect("acilista baslatma kapatilamadi");
        assert!(!autostart_status().expect("durum okunamadi"));
    }
}
