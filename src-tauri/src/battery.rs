//! Pil yuzdesi + sarj durumu. Karar uygulayiciye veri saglar; kalibrasyon yok.

use crate::ps;

/// (yuzde 0-100, sarjda mi)
///
/// WMI: `Win32_Battery.EstimatedChargeRemaining` ve `BatteryStatus`
/// (2 = AC bagli / sarjda). Dizustunde birden fazla batarya varsa
/// ilk satiri alir; alan yoksa hata dondurur, panik olmaz.
pub fn battery_status() -> Result<(u8, bool), String> {
    let script = "$b = Get-CimInstance -ClassName Win32_Battery | Select-Object -First 1;\
     if (-not $b) { 'NOBAT' } else { \"$($b.EstimatedChargeRemaining),$($b.BatteryStatus)\" }";
    let out = ps::run(script)?;
    parse_status(&out).ok_or_else(|| format!("pil verisi parse edilemedi: {out:?}"))
}

/// `"%85,2"` -> (85, true); alan yoksa None.
fn parse_status(output: &str) -> Option<(u8, bool)> {
    let t = output.trim();
    if t.starts_with("NOBAT") {
        return None;
    }
    let mut parts = t.split(',');
    let pct_raw = parts.next()?.trim();
    let st_raw = parts.next()?.trim();
    let pct: u16 = pct_raw.parse().ok()?;
    let charging = st_raw == "2" || st_raw == "6" || st_raw == "7" || st_raw == "9";
    Some((pct.min(100) as u8, charging))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_discharging() {
        assert_eq!(parse_status("85,1"), Some((85, false)));
    }

    #[test]
    fn parses_charging_status_two() {
        assert_eq!(parse_status("42,2"), Some((42, true)));
    }

    #[test]
    fn clamps_above_hundred() {
        assert_eq!(parse_status("255,1"), Some((100, false)));
    }

    #[test]
    fn nobat_is_none() {
        assert_eq!(parse_status("NOBAT"), None);
    }

    #[test]
    fn garbage_is_none() {
        assert_eq!(parse_status("x,y"), None);
        assert_eq!(parse_status(""), None);
    }
}
