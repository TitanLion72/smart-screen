// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! HDR (gelişmiş renk) tespiti ve sıcak ton kapısı.
//!
//! `QueryDisplayConfig` ile etkin yollar toplanır; her çıkış için
//! `DisplayConfigGetDeviceInfo(DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO)`
//! sorulur ve `advancedColorEnabled` biti okunur. Cihaz eşlemesi monitor.rs
//! ile aynı yöntemle yapılır: yolun kaynak GDI adı (`\\.\DISPLAY1` gibi).
//!
//! Sorgu başarısızsa HDR **kapalı** kabul edilir (sıcak ton yazmaya devam
//! edilir) ve smart-screen.log'a işlem başına tek satır uyarı düşer.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use windows::Win32::Devices::Display::{
    DisplayConfigGetDeviceInfo, DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO,
    DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME, DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO,
    DISPLAYCONFIG_PATH_INFO, DISPLAYCONFIG_SOURCE_DEVICE_NAME,
};

/// Ön yüze giden HDR kaydı: cihaz kimliği + HDR açık mı.
#[derive(Clone, Debug, Serialize)]
pub struct HdrInfo {
    pub device: String,
    pub hdr: bool,
}

/// "HDR sorgusu başarısız oldu" uyarısı işlem başına yalnız bir kez yazılır:
/// dakikalık döngüde her tur bir satır basmak logu doldurur.
static WARNED: AtomicBool = AtomicBool::new(false);

/// GET_ADVANCED_COLOR_INFO bit alanından `advancedColorEnabled` bitini
/// okur (bit 1; bit 0 supported, bit 2 wideColorEnforced) — SAF.
pub fn advanced_color_enabled(value: u32) -> bool {
    (value >> 1) & 1 == 1
}

/// HDR açık cihazların haritası (GDI cihaz adı -> HDR açık mı). Sorgu
/// hiç yapılamazsa boş harita döner: bilinmeyen = kapalı kabul.
pub fn enabled_map() -> HashMap<String, bool> {
    match query_entries() {
        Some(entries) => entries.into_iter().collect(),
        None => {
            if !WARNED.swap(true, Ordering::Relaxed) {
                crate::logger::log_tick(&format!(
                    "{} | source=hdr/hdr | level=warn | tone=- | desired=- | applied=- | \
                     theme=- | note=HDR durumu sorgulanamadı; kapalı kabul edildi",
                    crate::logger::now_local()
                ));
            }
            HashMap::new()
        }
    }
}

/// Tek cihazın HDR durumu; bilinmiyorsa (sorgu hatası, cihaz listede yok)
/// `false` — sıcak ton kapısı kapatılmaz.
pub fn is_hdr(device: &str) -> bool {
    enabled_map().get(device).copied().unwrap_or(false)
}

/// Bağlı tüm monitörler için HDR durumu; sorgu başarısızsa hepsi `false`.
pub fn list() -> Vec<HdrInfo> {
    let map = enabled_map();
    crate::monitor::device_ids()
        .into_iter()
        .map(|device| {
            let hdr = map.get(&device).copied().unwrap_or(false);
            HdrInfo { device, hdr }
        })
        .collect()
}

/// Sıcak ton uygulanacak cihazları HDR kapısından geçirir: HDR açıksa o
/// cihaz elenir, diğerleri döner (SAF).
pub fn warm_allowed(devices: &[String], hdr: &HashMap<String, bool>) -> Vec<String> {
    devices
        .iter()
        .filter(|d| !hdr.get(d.as_str()).copied().unwrap_or(false))
        .cloned()
        .collect()
}

/// Etkin yollar için (GDI kaynak adı, HDR açık mi) listesi. Tek bir yolun
/// bilgisi alınamazsa o yol atlanır; hiç yol çıkmazsa None.
fn query_entries() -> Option<Vec<(String, bool)>> {
    let paths = crate::monitor::active_paths()?;
    let mut out = Vec::new();
    for p in &paths {
        let (Some(gdi), Some(hdr)) = (source_name(p), advanced_color(p)) else {
            continue;
        };
        out.push((gdi, hdr));
    }
    Some(out)
}

/// Yolun kaynak GDI cihaz adı (monitor.rs ile aynı eşleme).
fn source_name(path: &DISPLAYCONFIG_PATH_INFO) -> Option<String> {
    let mut req = DISPLAYCONFIG_SOURCE_DEVICE_NAME::default();
    req.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
    req.header.size = std::mem::size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32;
    req.header.adapterId = path.sourceInfo.adapterId;
    req.header.id = path.sourceInfo.id;
    // Guvenli: req yerel degisken, boyut alani yapi ile es.
    let rc = unsafe { DisplayConfigGetDeviceInfo(&mut req.header) };
    (rc == 0).then(|| utf16(&req.viewGdiDeviceName))
}

/// Yolun hedef çıkışında gelişmiş renk (HDR) açık mı.
fn advanced_color(path: &DISPLAYCONFIG_PATH_INFO) -> Option<bool> {
    let mut req = DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO::default();
    req.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO;
    req.header.size = std::mem::size_of::<DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO>() as u32;
    req.header.adapterId = path.targetInfo.adapterId;
    req.header.id = path.targetInfo.id;
    // Guvenli: req yerel degisken, boyut alani yapi ile es.
    let rc = unsafe { DisplayConfigGetDeviceInfo(&mut req.header) };
    (rc == 0).then(|| advanced_color_enabled(unsafe { req.Anonymous.value }))
}

/// UTF-16 tamponunu ilk NUL'e kadar String'e cevirir.
fn utf16(buf: &[u16]) -> String {
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..len])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bit1_is_advanced_color_enabled() {
        assert!(advanced_color_enabled(0b0000_0010));
        assert!(!advanced_color_enabled(0));
        // bit 0 = supported (henüz açık değil), bit 2 = wideColorEnforced.
        assert!(!advanced_color_enabled(0b0000_0001));
        assert!(!advanced_color_enabled(0b0000_0100));
        assert!(advanced_color_enabled(0b0000_0111));
    }

    #[test]
    fn warm_allowed_drops_hdr_devices() {
        let mut hdr = HashMap::new();
        hdr.insert("\\\\.\\DISPLAY1".to_string(), true);
        hdr.insert("\\\\.\\DISPLAY2".to_string(), false);
        let devices = vec![
            "\\\\.\\DISPLAY1".to_string(),
            "\\\\.\\DISPLAY2".to_string(),
            "\\\\.\\DISPLAY3".to_string(),
        ];
        assert_eq!(
            warm_allowed(&devices, &hdr),
            vec!["\\\\.\\DISPLAY2".to_string(), "\\\\.\\DISPLAY3".to_string()]
        );
    }

    #[test]
    fn warm_allowed_empty_map_keeps_all() {
        let devices = vec!["\\\\.\\DISPLAY1".to_string()];
        assert_eq!(
            warm_allowed(&devices, &HashMap::new()),
            vec!["\\\\.\\DISPLAY1".to_string()]
        );
    }

    #[test]
    fn warm_allowed_empty_devices_is_empty() {
        assert!(warm_allowed(&[], &HashMap::new()).is_empty());
    }

    #[test]
    fn utf16_stops_at_nul() {
        assert_eq!(utf16(&[0x41, 0, 0x42]), "A");
        assert_eq!(utf16(&[0x42]), "B");
    }

    #[test]
    #[ignore = "canli donanim gerektirir"]
    fn live_hdr_list() {
        for h in list() {
            println!("{} | hdr={}", h.device, h.hdr);
        }
    }
}
