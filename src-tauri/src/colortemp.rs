// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! DDC/CI üzerinden renk sıcaklığı kontrolü (VCP 0x0C).
//!
//! Model: monitörün renk sıcaklığı VCP 0x0C koduyla seçilir; kelvin değeri
//! `K = 3000 + değer × artış` formülüyle hesaplanır (artış = VCP 0x0B'nin
//! anlık değeri, K cinsinden adım). "User" ayarı (değer 0x14) desteklenen
//! değerler arasında olmalıdır; artış okunamazsa veya 0'sa monitör
//! desteklemiyor sayılır.
//!
//! Güvenlik kuralları:
//! - `SaveCurrentSettings` ASLA çağrılmaz (kullanıcının OSD ayarı ezilmez).
//! - K 2500–6500 aralığına kelepçelenir.
//! - Yalnızca son yazılandan >250 K farklıysa ve monitör başına en fazla
//!   10 dakikada bir yazılır.
//! - 3 üst üste hatada o monitörde özellik kapatılır.
//! - HDR açık monitöre yazılmaz (gamma kapısıyla aynı gerekçe: HDR altında
//!   renk yönetimi sürücüye aittir).
//!
//! Yetenek dizgesi (capability string) monitör başına önbelleklenir.
//! duzeltme (md.8): geçici DDC hatası kalıcı "desteklenmiyor" sayılmaz —
//! 3 tur yeniden denendikten sonra kesin sonuç yazılır.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::Serialize;
use windows::Win32::Devices::Display::{
    CapabilitiesRequestAndCapabilitiesReply, GetCapabilitiesStringLength,
    GetVCPFeatureAndVCPFeatureReply, SetVCPFeature, MC_VCP_CODE_TYPE,
};
use windows::Win32::Foundation::HANDLE;

/// Renk sıcaklığı preset kodu.
const VCP_COLOR_TEMP: u8 = 0x0C;
/// Renk sıcaklığı adımı (K) kodu.
const VCP_TEMP_INCREMENT: u8 = 0x0B;
/// Formüldeki taban değer: K = 3000 + değer × artış.
const KELVIN_BASE: i32 = 3000;
/// Yazma kelepçeleri.
const KELVIN_MIN: i32 = 2500;
const KELVIN_MAX: i32 = 6500;
const MIN_DELTA_K: i32 = 250;
const MIN_WRITE_INTERVAL: Duration = Duration::from_secs(10 * 60);
const MAX_CONSECUTIVE_ERRORS: u32 = 3;
/// duzeltme (md.8): geçici DDC hatası bu kadar tur yeniden denendikten sonra
/// kesin "desteklenmiyor"ya döner.
const MAX_PROBE_ATTEMPTS: u32 = 3;

/// Monitör başına önbelleğe alınan yetenek durumu.
#[derive(Clone, Debug, Default, PartialEq)]
enum Caps {
    /// Henüz sorgulanmadı (ya da geçici DDC hatası: yeniden denenecek).
    #[default]
    Unknown,
    /// Destekleniyor: artış (K/adım) + VCP 0x0C üst sınırı biliniyor.
    /// duzeltme (md.7): üst sınır sabit 0x14 değil, monitörün bildirdiği
    /// VCP maksimumudur.
    Supported { increment: u32, max: u32 },
    /// Desteklenmiyor ya da art arda hatadan kapatıldı (neden).
    Unsupported(String),
}

/// Monitör başına izleme durumu: yetenekler + yazma geçmişi + hata sayacı.
#[derive(Default)]
struct MonitorState {
    caps: Caps,
    /// Son başarılı yazma: (zaman, kelvin). Hiç yazılmadıysa None.
    last_write: Option<(Instant, i32)>,
    /// Üst üste DDC hata sayısı (başarılı yazmada sıfırlanır).
    errors: u32,
    /// duzeltme (md.8): geçici DDC sorgu hatalarının tur sayacı.
    probe_failures: u32,
}

/// Tüm izleme durumu tek haritada; komutlar arası paylaşılır.
static STATE: LazyLock<Mutex<HashMap<String, MonitorState>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// "Durum değişince tek satır log" için son bildirilen (destek, hdr) ikilisi.
static LOGGED: LazyLock<Mutex<HashMap<String, (bool, bool)>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Ön yüze giden renk sıcaklığı kaydı.
#[derive(Clone, Debug, Serialize)]
pub struct ColorTempInfo {
    pub device: String,
    pub supported: bool,
    /// Anlık renk sıcaklığı (K); okunamıyorsa None.
    pub kelvin: Option<i32>,
    /// VCP 0x0B artışı (K/adım); bilinmiyorsa None.
    pub increment: Option<u32>,
}

/// Kelvin'i yazma aralığına kelepçeler (SAF).
pub fn clamp_kelvin(kelvin: i32) -> i32 {
    kelvin.clamp(KELVIN_MIN, KELVIN_MAX)
}

/// Kelvin'den VCP 0x0C değerine çevirir: (K - 3000) / artış, 0..=max
/// aralığına yuvarlanır. Artış 0'sa None (desteklenmiyor) — SAF.
/// duzeltme (md.7): üst sınır sabit 0x14 ("User") yerine monitörün VCP
/// maksimumudur — bazı monitörler 0x0C için daha az adım sunar.
pub fn kelvin_to_value(kelvin: i32, increment: u32, max_value: u32) -> Option<u32> {
    if increment == 0 {
        return None;
    }
    let v = ((kelvin - KELVIN_BASE) as f64 / increment as f64).round() as i32;
    let hi = max_value.min(i32::MAX as u32) as i32;
    Some(v.clamp(0, hi) as u32)
}

/// VCP 0x0C değerinden kelvine: 3000 + değer × artış — SAF.
pub fn value_to_kelvin(value: u32, increment: u32) -> Option<i32> {
    if increment == 0 {
        return None;
    }
    Some(KELVIN_BASE + value as i32 * increment as i32)
}

/// Son yazılanla aradaki fark yazmaya değer mi? Hiç yazılmamışsa hep evet
/// (SAF; zaman koşulu ayrıca değerlendirilir).
pub fn kelvin_differs_enough(last: Option<i32>, kelvin: i32) -> bool {
    match last {
        None => true,
        Some(l) => (l - kelvin).abs() > MIN_DELTA_K,
    }
}

/// Yetenek dizgesinde verilen VCP kodu destekleniyor mu? Token bazlı arama:
/// `vcp(02 04 05 08 0B 0C ...)` bölümünde kod eşleşmesi aranır (SAF).
pub fn caps_has_vcp(caps: &str, code: &str) -> bool {
    vcp_symbols(caps)
        .iter()
        .any(|(tok, _paren)| tok.eq_ignore_ascii_case(code))
}

/// VCP 0x0C için "User" (0x14) değeri destekleniyor mu? Kod değer listesi
/// veriyse (`0C(03 04 14)`) orada, vermiyorsa vcp bölümünde bağımsız `14`
/// tokeni olarak aranır (SAF).
pub fn caps_has_user_preset(caps: &str) -> bool {
    match vcp_values(caps, "0C") {
        Some(values) => values.iter().any(|t| t.eq_ignore_ascii_case("14")),
        None => caps_has_vcp(caps, "14"),
    }
}

/// Monitör yetenek dizgesi renk sıcaklığı için yeterli mi? 0x0C ve 0x0B
/// kodları desteklenmeli ve "User" (0x14) seçilebilir olmalı (SAF).
pub fn caps_supports_color_temp(caps: &str) -> bool {
    caps_has_vcp(caps, "0C") && caps_has_vcp(caps, "0B") && caps_has_user_preset(caps)
}

/// Yetenek dizgesinin `vcp(...)` bölümünü çıkarır; bölüm yoksa None (SAF).
fn vcp_section(caps: &str) -> Option<&str> {
    let start = caps.find("vcp(")? + 4;
    let rest = &caps[start..];
    // Bolumun sonu: dengeleyici kapanis parantezi.
    let mut depth = 1i32;
    for (i, c) in rest.char_indices() {
        match c {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&rest[..i]);
                }
            }
            _ => {}
        }
    }
    None
}

/// vcp bölümünü sembollere ayırır: (token, parantez mi). Boşluklar ayraç,
/// parantezler tek karakterlik sembol olarak korunur (SAF).
fn vcp_symbols(caps: &str) -> Vec<(String, bool)> {
    let Some(section) = vcp_section(caps) else {
        return Vec::new();
    };
    let mut out: Vec<(String, bool)> = Vec::new();
    let mut cur = String::new();
    for c in section.chars() {
        match c {
            '(' | ')' => {
                if !cur.is_empty() {
                    out.push((std::mem::take(&mut cur), false));
                }
                out.push((c.to_string(), true));
            }
            c if c.is_whitespace() => {
                if !cur.is_empty() {
                    out.push((std::mem::take(&mut cur), false));
                }
            }
            c => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push((cur, false));
    }
    out
}

/// Verilen kodun değer listesi (`kod v1 v2 ...`) varsa onu döndürür;
/// listenin parantezli (`kod(v1 v2 ...)`) ve parantezsiz biçimini de kabul
/// eder. Kod yoksa ya da liste yoksa None (SAF).
fn vcp_values(caps: &str, code: &str) -> Option<Vec<String>> {
    let symbols = vcp_symbols(caps);
    let mut i = 0;
    while i < symbols.len() {
        let (tok, paren) = &symbols[i];
        if !*paren && tok.eq_ignore_ascii_case(code) {
            // Parantezli liste: kod(v1 v2 ...)
            if symbols.get(i + 1).map(|(_, p)| *p) == Some(true) {
                let mut values = Vec::new();
                let mut j = i + 2;
                while j < symbols.len() {
                    let (vtok, vparen) = &symbols[j];
                    if *vparen {
                        if vtok == ")" {
                            break;
                        }
                    } else {
                        values.push(vtok.clone());
                    }
                    j += 1;
                }
                return Some(values);
            }
            return None;
        }
        i += 1;
    }
    None
}

/// Bağlı monitörlerin renk sıcaklığı durumu. Yetenek sorgusu monitör başına
/// bir kez yapılır ve önbelleklenir; anlık kelvin destekleniyorsa okunur.
pub fn info() -> Result<Vec<ColorTempInfo>, String> {
    Ok(crate::monitor::list()?
        .into_iter()
        .map(|m| {
            let device = m.id;
            let caps = probe_caps(&device);
            let (supported, increment) = match &caps {
                Caps::Supported { increment, .. } => (true, Some(*increment)),
                _ => (false, None),
            };
            let kelvin = match &caps {
                Caps::Supported { increment, .. } => {
                    read_current_kelvin(&device, *increment).map(clamp_kelvin)
                }
                _ => None,
            };
            note_status(&device, supported, crate::hdr::is_hdr(&device));
            ColorTempInfo {
                device,
                supported,
                kelvin,
                increment,
            }
        })
        .collect())
}

/// Monitörün renk sıcaklığını yazar (kelvin). Kurallar: kelepçe, HDR kapısı,
/// yetenek denetimi, >250 K fark + 10 dk hız sınırı, 3 hatada kapatma.
pub fn set_color_temp(device: &str, kelvin: i32) -> Result<(), String> {
    let kelvin = clamp_kelvin(kelvin);
    let caps = probe_caps(device);
    let hdr = crate::hdr::is_hdr(device);
    note_status(device, matches!(caps, Caps::Supported { .. }), hdr);
    if hdr {
        return Err("HDR açık".to_string());
    }
    let (increment, max) = match caps {
        Caps::Supported { increment, max } => (increment, max),
        Caps::Unsupported(why) => return Err(why),
        Caps::Unknown => return Err("renk sıcaklığı desteği sorgulanamadı".to_string()),
    };
    // Hız/fark koşulları kilit altında değerlendirilir; DDC yazması kilitsiz.
    {
        let mut guard = lock_state();
        let st = guard.entry(device.to_string()).or_default();
        if let Some((at, last_k)) = st.last_write {
            if at.elapsed() < MIN_WRITE_INTERVAL {
                drop(guard);
                log_note(&format!(
                    "hız sınırı: {device} için 10 dakikada bir yazılır"
                ));
                return Ok(());
            }
            if !kelvin_differs_enough(Some(last_k), kelvin) {
                drop(guard);
                log_note(&format!(
                    "fark küçük: {device} son {last_k} K, istenen {kelvin} K"
                ));
                return Ok(());
            }
        }
    }
    let value = kelvin_to_value(kelvin, increment, max)
        .ok_or_else(|| "renk sıcaklığı adışı 0 bildirildi (desteklenmiyor)".to_string())?;
    match write_vcp(device, value) {
        Ok(()) => {
            // duzeltme (md.7): last_write'a İSTENEN değil GERÇEKLEŞEN K yazılır
            // — VCP maksimumu değeri kıstığında realize edilen K istenenden
            // uzaklaşır; eski kafa "fark küçük" diye sonraki düzeltmeyi atlar.
            let realized = value_to_kelvin(value, increment).unwrap_or(kelvin);
            let mut guard = lock_state();
            let st = guard.entry(device.to_string()).or_default();
            st.last_write = Some((Instant::now(), realized));
            st.errors = 0;
            Ok(())
        }
        Err(e) => {
            let mut guard = lock_state();
            let st = guard.entry(device.to_string()).or_default();
            st.errors += 1;
            if st.errors >= MAX_CONSECUTIVE_ERRORS {
                st.caps = Caps::Unsupported(format!("art arda {MAX_CONSECUTIVE_ERRORS} hata: {e}"));
            }
            Err(e)
        }
    }
}

/// Monitörün anlık kelvin değeri: VCP 0x0C oku + formül. Okunamazsa None.
fn read_current_kelvin(device: &str, increment: u32) -> Option<i32> {
    let handles = crate::monitor::physical_handles(device).ok()?;
    let result = handles
        .first()
        .map(|m| m.hPhysicalMonitor)
        .and_then(|h| read_vcp(h, VCP_COLOR_TEMP).ok())
        .and_then(|(v, _)| value_to_kelvin(v, increment));
    crate::monitor::close_handles(&handles);
    result
}

/// Yetenek sorgusu sonucu: kesin destek / kesin desteklenmiyor / geçici hata.
enum ProbeOutcome {
    Supported {
        increment: u32,
        max: u32,
    },
    /// Kesin sonuç: monitör yetenek dizgesi özelliği yok diyor.
    Unsupported(String),
    /// Geçici DDC hatası: monitör "hayır" demedi, cevap veremedi.
    Transient(String),
}

/// duzeltme (md.8): geçici DDC hatası kalıcı Unsupported'e dönüşmez (SAF):
/// sayaç artar ve Unknown kalır; 3. üst üste geçici hatada kesin Unsupported.
fn apply_probe_outcome(failures: u32, outcome: &ProbeOutcome) -> (Caps, u32) {
    match outcome {
        ProbeOutcome::Supported { increment, max } => (
            Caps::Supported {
                increment: *increment,
                max: *max,
            },
            0,
        ),
        ProbeOutcome::Unsupported(why) => (Caps::Unsupported(why.clone()), 0),
        ProbeOutcome::Transient(why) => {
            let n = failures.saturating_add(1);
            if n >= MAX_PROBE_ATTEMPTS {
                (
                    Caps::Unsupported(format!(
                        "DDC sorgusu {MAX_PROBE_ATTEMPTS} kez başarısız: {why}"
                    )),
                    0,
                )
            } else {
                (Caps::Unknown, n)
            }
        }
    }
}

/// Yetenekleri gerekirse DDC'den sorgular, önbelleğe yazar ve döndürür.
/// Önbellekte kesin sonuç varsa (Supported/Unsupported) DDC'ye dokunmaz.
/// duzeltme (md.8): geçici DDC hatası Unknown bırakır — kalıcı Unsupported
/// önbelleklenmez, sonraki turlarda yeniden denenir.
fn probe_caps(device: &str) -> Caps {
    {
        let guard = lock_state();
        if let Some(st) = guard.get(device) {
            if st.caps != Caps::Unknown {
                return st.caps.clone();
            }
        }
    }
    let outcome = probe_caps_ddc(device);
    let mut guard = lock_state();
    let st = guard.entry(device.to_string()).or_default();
    let (caps, failures) = apply_probe_outcome(st.probe_failures, &outcome);
    st.caps = caps;
    st.probe_failures = failures;
    st.caps.clone()
}

/// DDC üzerinden yetenek sorgusu: capability string + 0x0B artışı + 0x0C üst
/// sınırı. duzeltme (md.7): VCP 0x0C maksimumu da okunur. duzeltme (md.8):
/// DDC iletişim hataları Transient sayılır; yalnız monitörün "yok" demesi
/// kesin Unsupported'tur.
fn probe_caps_ddc(device: &str) -> ProbeOutcome {
    let Ok(handles) = crate::monitor::physical_handles(device) else {
        // Monitör o anda gitmiş olabilir; kalıcı "desteklenmiyor" demeyelim.
        return ProbeOutcome::Transient("monitör tanıtıcıları alınamadı".to_string());
    };
    let outcome = (|| {
        let handle = match handles.first().map(|m| m.hPhysicalMonitor) {
            Some(h) => h,
            None => {
                return ProbeOutcome::Transient("monitörde fiziksel DDC tanıtıcısı yok".to_string())
            }
        };
        // Yetenek dizgesi okunamıyorsa bu bir DDC iletişim hatasıdır:
        // monitör özelliği yok demedi, cevap veremedi.
        let caps = match read_capabilities(handle) {
            Ok(c) => c,
            Err(e) => return ProbeOutcome::Transient(e),
        };
        if !caps_supports_color_temp(&caps) {
            return ProbeOutcome::Unsupported(
                "monitör renk sıcaklığı (VCP 0x0C) desteklemiyor".to_string(),
            );
        }
        let (increment, _) = match read_vcp(handle, VCP_TEMP_INCREMENT) {
            Ok(v) => v,
            Err(e) => return ProbeOutcome::Transient(e),
        };
        if increment == 0 {
            return ProbeOutcome::Unsupported(
                "monitör renk sıcaklığı adışı 0 bildiriyor (desteklenmiyor)".to_string(),
            );
        }
        // duzeltme (md.7): 0x0C üst sınırı monitörden okunur.
        let (_, max) = match read_vcp(handle, VCP_COLOR_TEMP) {
            Ok(v) => v,
            Err(e) => return ProbeOutcome::Transient(e),
        };
        if max == 0 {
            return ProbeOutcome::Unsupported(
                "monitör renk sıcaklığı üst sınırı 0 bildiriyor (desteklenmiyor)".to_string(),
            );
        }
        ProbeOutcome::Supported { increment, max }
    })();
    crate::monitor::close_handles(&handles);
    outcome
}

/// Monitörün yetenek dizgesini okur (ASCII).
fn read_capabilities(handle: HANDLE) -> Result<String, String> {
    let mut len = 0u32;
    // Guvenli: cikti yerel degiskene bagli; donus 0'sa hata vardir.
    if unsafe { GetCapabilitiesStringLength(handle, &mut len) } == 0 {
        return Err("yetenek dizgesi uzunluğu alınamadı".to_string());
    }
    if len == 0 || len > 65_536 {
        return Err("yetenek dizgesi uzunluğu geçersiz".to_string());
    }
    let mut buf = vec![0u8; len as usize];
    // Guvenli: tampon API'nin sozlesmesiyle es; uzunluk tampondan okunur.
    if unsafe { CapabilitiesRequestAndCapabilitiesReply(handle, &mut buf) } == 0 {
        return Err("yetenek dizgesi okunamadı".to_string());
    }
    let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
    Ok(String::from_utf8_lossy(&buf[..end]).to_string())
}

/// VCP kodunun anlık ve maksimum değerini okur: (current, max).
/// duzeltme (md.7): maksimum da istenir — kelvin üst sınırı bununla kurulur.
fn read_vcp(handle: HANDLE, code: u8) -> Result<(u32, u32), String> {
    let (mut kind, mut current, mut max) = (MC_VCP_CODE_TYPE(0), 0u32, 0u32);
    // Guvenli: ciktilar yerel degiskenlere bagli.
    let ok = unsafe {
        GetVCPFeatureAndVCPFeatureReply(handle, code, Some(&mut kind), &mut current, Some(&mut max))
    };
    if ok == 0 {
        return Err(format!("VCP {code:#04x} okunamadı"));
    }
    Ok((current, max))
}

/// VCP 0x0C'ye değer yazar. SaveCurrentSettings BILINCLI olarak çağrılmaz.
fn write_vcp(device: &str, value: u32) -> Result<(), String> {
    let handles = crate::monitor::physical_handles(device)?;
    let result = (|| {
        let handle = handles
            .first()
            .map(|m| m.hPhysicalMonitor)
            .ok_or_else(|| "monitörde fiziksel DDC tanıtıcısı yok".to_string())?;
        // Guvenli: value az once hesaplanan 0..=0x14 araliginda.
        if unsafe { SetVCPFeature(handle, VCP_COLOR_TEMP, value) } == 0 {
            return Err("renk sıcaklığı yazılamadı (VCP 0x0C)".to_string());
        }
        Ok(())
    })();
    crate::monitor::close_handles(&handles);
    result
}

/// Destek/HDR durumu değişince tek satır log yazar.
fn note_status(device: &str, supported: bool, hdr: bool) {
    let mut logged = LOGGED.lock().unwrap_or_else(|p| p.into_inner());
    if logged.get(device) != Some(&(supported, hdr)) {
        logged.insert(device.to_string(), (supported, hdr));
        drop(logged);
        log_note(&format!(
            "{device}: renk sıcaklığı destek={supported}, hdr={hdr}"
        ));
    }
}

fn log_note(note: &str) {
    crate::logger::log_tick(&format!(
        "{} | source=vcp/vcp | level=info | tone=- | desired=- | applied=- | \
         theme=- | note={note}",
        chrono::Utc::now().to_rfc3339()
    ));
}

/// Durum haritasının kilidi; zehirlenmişse içeriği geri alınır.
fn lock_state() -> MutexGuard<'static, HashMap<String, MonitorState>> {
    STATE.lock().unwrap_or_else(|p| p.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kelvin_clamped_to_write_range() {
        assert_eq!(clamp_kelvin(0), 2500);
        assert_eq!(clamp_kelvin(2500), 2500);
        assert_eq!(clamp_kelvin(4200), 4200);
        assert_eq!(clamp_kelvin(6500), 6500);
        assert_eq!(clamp_kelvin(9000), 6500);
    }

    #[test]
    fn kelvin_to_value_uses_base_and_increment() {
        // 3000 K taban: 5500 K, 500 K/adımla -> değer 5.
        assert_eq!(kelvin_to_value(5500, 500, 0x14), Some(5));
        assert_eq!(kelvin_to_value(3000, 500, 0x14), Some(0));
        // Yuvarlama: 3760 K, 125 K/adım -> (760/125)=6.08 -> 6.
        assert_eq!(kelvin_to_value(3760, 125, 0x14), Some(6));
    }

    #[test]
    fn kelvin_to_value_clamps_to_user_preset() {
        assert_eq!(kelvin_to_value(99999, 100, 0x14), Some(0x14));
        assert_eq!(kelvin_to_value(-9999, 100, 0x14), Some(0));
    }

    // duzeltme (md.7): üst sınır monitörün VCP maksimumu, sabit 0x14 değil.

    #[test]
    fn kelvin_to_value_respects_monitor_max() {
        // Monitör 0x0C için yalnız 0..=5 sunuyorsa 5'te kesilir.
        assert_eq!(kelvin_to_value(99999, 100, 5), Some(5));
        assert_eq!(kelvin_to_value(6500, 100, 5), Some(5));
        assert_eq!(kelvin_to_value(3000, 100, 5), Some(0));
        // İstenen K, max'ın karşılığından küçükse max devreye girmez.
        assert_eq!(kelvin_to_value(3500, 100, 5), Some(5));
        assert_eq!(kelvin_to_value(3400, 100, 5), Some(4));
    }

    #[test]
    fn realized_kelvin_reflects_monitor_max() {
        // md.7: max değeri 6120 K'a taşımaz; yazma sonrası realize edilen
        // K = 3000 + max × artış olur ve last_write'a O yazılır.
        let value = kelvin_to_value(6500, 500, 5).unwrap();
        assert_eq!(value, 5);
        assert_eq!(value_to_kelvin(value, 500), Some(5500));
        // Gerçekleşen 5500 kaydedildiğinde aynı 6500 isteği "fark küçük"
        // diye ATLANMAZ (1000 K > 250 K eşiği) — düzeltme tekrar denenebilir.
        assert!(kelvin_differs_enough(Some(5500), 6500));
        // Eski kusur karşıtı: istenen 6500 kaydedilseydi aynı istek atlanırdı.
        assert!(!kelvin_differs_enough(Some(6500), 6500));
    }

    #[test]
    fn kelvin_to_value_rejects_zero_increment() {
        assert_eq!(kelvin_to_value(5000, 0, 0x14), None);
    }

    #[test]
    fn value_to_kelvin_roundtrip() {
        for v in [0u32, 5, 20] {
            let k = value_to_kelvin(v, 156).unwrap();
            assert_eq!(kelvin_to_value(k, 156, 0x14), Some(v));
        }
    }

    #[test]
    fn value_to_kelvin_formula() {
        assert_eq!(value_to_kelvin(0, 156), Some(3000));
        assert_eq!(value_to_kelvin(20, 156), Some(3000 + 20 * 156));
        assert_eq!(value_to_kelvin(5, 0), None);
    }

    #[test]
    fn differs_enough_requires_250k() {
        assert!(kelvin_differs_enough(None, 3000));
        assert!(!kelvin_differs_enough(Some(3000), 3000));
        assert!(!kelvin_differs_enough(Some(3000), 3250));
        assert!(kelvin_differs_enough(Some(3000), 3251));
        assert!(kelvin_differs_enough(Some(6500), 2500));
    }

    const SAMPLE_CAPS: &str = "(prot(monitor)type(lcd)model(X)cmds(01 02 03 07 0C E3 F3)vcp(02 04 05 08 0B 0C 10 12 14 16 18 52 54(01 02 04) 60(01 03))msw(1)VCP 0C 14)";

    #[test]
    fn caps_finds_codes_in_vcp_section() {
        assert!(caps_has_vcp(SAMPLE_CAPS, "0C"));
        assert!(caps_has_vcp(SAMPLE_CAPS, "0B"));
        assert!(caps_has_vcp(SAMPLE_CAPS, "14"));
        assert!(!caps_has_vcp(SAMPLE_CAPS, "99"));
    }

    #[test]
    fn caps_supports_requires_all_three() {
        assert!(caps_supports_color_temp(SAMPLE_CAPS));
        // 0B yok.
        let no_inc = SAMPLE_CAPS.replace(" 0B ", " 9B ");
        assert!(!caps_supports_color_temp(&no_inc));
        // 0C yok (cmds bölümündekini de bozar; vcp bölümündeki asıl olandır).
        let no_temp = SAMPLE_CAPS.replace(" 0C ", " 9C ");
        assert!(!caps_supports_color_temp(&no_temp));
        // User (14) yok.
        let no_user = SAMPLE_CAPS.replace(" 14 ", " 15 ");
        assert!(!caps_supports_color_temp(&no_user));
    }

    #[test]
    fn caps_user_preset_in_value_list() {
        // 0C değer listesi içinde 14 geçiyorsa User desteklenir.
        let caps = "(vcp(0B 0C(03 04 05 08 14) 10))";
        assert!(caps_has_user_preset(caps));
        assert!(caps_supports_color_temp(caps));
        let no_user = "(vcp(0B 0C(03 04 05 08) 10))";
        assert!(!caps_has_user_preset(no_user));
        assert!(!caps_supports_color_temp(no_user));
    }

    #[test]
    fn caps_without_vcp_section_is_unsupported() {
        assert!(!caps_supports_color_temp("(prot(monitor)type(lcd))"));
        assert!(!caps_supports_color_temp(""));
    }

    #[test]
    fn vcp_values_parses_parenthesized_list() {
        let caps = "(vcp(0B 0C(03 04 14) 54(01 02)))";
        assert_eq!(
            vcp_values(caps, "0C"),
            Some(vec!["03".to_string(), "04".to_string(), "14".to_string()])
        );
        assert_eq!(
            vcp_values(caps, "54"),
            Some(vec!["01".to_string(), "02".to_string()])
        );
        // Değer listesi olmayan kod için None.
        assert_eq!(vcp_values(caps, "0B"), None);
        // Olmayan kod.
        assert_eq!(vcp_values(caps, "99"), None);
    }

    #[test]
    fn vcp_section_handles_nested_parens() {
        let caps = "(vcp(02 10(aa bb) 12)msw(2))";
        assert_eq!(vcp_section(caps), Some("02 10(aa bb) 12"));
        // Kapanmamış parantez: bölüm yok.
        assert_eq!(vcp_section("(vcp(02 10"), None);
    }

    #[test]
    fn vcp_symbols_split_parens_and_spaces() {
        let caps = "(vcp(0B 0C(03 14)))";
        let symbols = vcp_symbols(caps);
        let tokens: Vec<&str> = symbols.iter().map(|(t, _)| t.as_str()).collect();
        assert_eq!(tokens, vec!["0B", "0C", "(", "03", "14", ")"]);
    }

    // duzeltme (md.8): geçici DDC hatası kalıcı Unsupported'e dönüşmez.

    #[test]
    fn transient_probe_keeps_unknown_and_counts() {
        let (caps, n) = apply_probe_outcome(0, &ProbeOutcome::Transient("ddc meşgul".into()));
        assert_eq!(caps, Caps::Unknown, "ilk geçici hata Unknown bırakmalı");
        assert_eq!(n, 1);
        let (caps, n) = apply_probe_outcome(1, &ProbeOutcome::Transient("ddc meşgul".into()));
        assert_eq!(caps, Caps::Unknown, "ikinci geçici hata hâlâ Unknown");
        assert_eq!(n, 2);
    }

    #[test]
    fn third_transient_probe_becomes_unsupported() {
        let (caps, n) = apply_probe_outcome(2, &ProbeOutcome::Transient("ddc meşgul".into()));
        match caps {
            Caps::Unsupported(why) => {
                assert!(why.contains("3 kez"), "neden metni: {why}");
                assert!(why.contains("ddc meşgul"), "orijinal hata korunmalı: {why}");
            }
            other => panic!("3. hatada Unsupported beklenirdi: {other:?}"),
        }
        assert_eq!(n, 0, "kesin sonuçtan sonra sayaç sıfırlanır");
    }

    #[test]
    fn successful_probe_resets_failure_counter() {
        let (caps, n) = apply_probe_outcome(
            2,
            &ProbeOutcome::Supported {
                increment: 500,
                max: 5,
            },
        );
        assert_eq!(
            caps,
            Caps::Supported {
                increment: 500,
                max: 5
            }
        );
        assert_eq!(n, 0, "başarı sayacı sıfırlamalı");
    }

    #[test]
    fn definitive_unsupported_is_immediate() {
        let (caps, n) = apply_probe_outcome(
            0,
            &ProbeOutcome::Unsupported("VCP 0x0C desteklemiyor".into()),
        );
        assert_eq!(caps, Caps::Unsupported("VCP 0x0C desteklemiyor".into()));
        assert_eq!(n, 0);
    }
}
