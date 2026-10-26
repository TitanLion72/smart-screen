// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
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

/// Parlakligi yazar ve **dogrular** (PLAN-v3 §2/A11): surucu yazimi sessizce
/// yutarsa eskiden basarili sayiliyordu. Simdi okunan deger 2 puandan fazla
/// saparsa iki kez daha denenir; hala tutmuyorsa hata dondurulur.
pub fn set_brightness(value: u8) -> Result<u8, String> {
    let want = value.min(100);
    let script = format!(
        "$m = Get-CimInstance -Namespace {NAMESPACE} -Class WmiMonitorBrightnessMethods \
         | Select-Object -First 1; \
         Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness \
         -Arguments @{{Timeout=1; Brightness={want}}} | Out-Null"
    );
    let mut last = want;
    for attempt in 0..3 {
        run_powershell(&script)?;
        // Okuma basarisizsa (ekran uyaniyor) yazimi basarili sayariz.
        last = get_brightness().unwrap_or(want);
        if last.abs_diff(want) <= 2 {
            return Ok(last);
        }
        if attempt < 2 {
            std::thread::sleep(std::time::Duration::from_millis(120));
        }
    }
    Err(format!(
        "surucu parlakligi uygulamadi: yazilan {want}, okunan {last}"
    ))
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
