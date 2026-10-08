//! Laptop ekran parlakligini WMI uzerinden okur/yazar.
//!
//! Dogrulanmis PowerShell komutlarini penceresiz calistirir (bak: AGENTS.md).
//! Adim/gece kurallari karar motorunda uygulanir; burasi ham erisimdir.

const NAMESPACE: &str = "root/wmi";

/// Gecerli parlakligi okur (0-100).
pub fn get_brightness() -> Result<u8, String> {
    let script = format!(
        "(Get-CimInstance -Namespace {NAMESPACE} -Class WmiMonitorBrightness \
         | Select-Object -First 1 -ExpandProperty CurrentBrightness)"
    );
    let out = run_powershell(&script)?;
    parse_brightness(&out).ok_or_else(|| format!("parlaklik parse edilemedi: {out:?}"))
}

/// Parlakligi yazar (0-100, clamp'lenir).
pub fn set_brightness(value: u8) -> Result<(), String> {
    let value = value.min(100);
    let script = format!(
        "$m = Get-CimInstance -Namespace {NAMESPACE} -Class WmiMonitorBrightnessMethods \
         | Select-Object -First 1; \
         Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness \
         -Arguments @{{Timeout=1; Brightness={value}}} | Out-Null"
    );
    run_powershell(&script)?;
    Ok(())
}

fn run_powershell(script: &str) -> Result<String, String> {
    crate::ps::run(script)
}

/// Ciktidaki ilk 0-100 sayisini bulur.
fn parse_brightness(output: &str) -> Option<u8> {
    output
        .split(|c: char| !c.is_ascii_digit())
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.parse::<u16>().ok())
        .find(|&n| n <= 100)
        .map(|n| n as u8)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_number() {
        assert_eq!(parse_brightness("50\r\n"), Some(50));
    }

    #[test]
    fn parses_embedded_number() {
        assert_eq!(parse_brightness("CurrentBrightness : 75"), Some(75));
    }

    #[test]
    fn rejects_out_of_range() {
        assert_eq!(parse_brightness("255"), None);
    }

    #[test]
    fn rejects_empty() {
        assert_eq!(parse_brightness(""), None);
    }
}
