// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! Windows "gece ışığı" (night light) **algılama** (v3.0).
//!
//! Neden: gece ışığı açıkken uygulama kendi gamma rampasını da yazarsa ekran
//! iki kez sararır (çifte sararma). Kontrol edilemiyorsa tahmin etmemek
//! kuraldır: `None` = "bilinmiyor", o durumda davranış değişmez.
//!
//! Durum `HKCU\...\CloudStore\Store\...\windows.data.bluelightreduction.*`
//! altındaki ikili blob'da tutulur. Microsoft bunu **belgelemedi**; bu yüzden
//! yalnız bilinen başlıkları tanırız, gerisini "bilinmiyor" sayarız.
//!
//! Programatik **yazma** desteklenmiyor (blob şeması sürüme bağlı ve bu
//! makinede boş çıktı); uygulama yalnız okur ve kullanıcıyı yönlendirir.

use std::ffi::c_void;

/// Microsoft'un belgelemediği blob: tanıdığımız başlık.
const KNOWN_HEADER: [u8; 4] = [0x02, 0x00, 0x00, 0x00];
/// Durum baytının konumu (bilinen kodlamalarda sabit).
const STATE_INDEX: usize = 18;
/// Bilinen "açık" değerleri.
const ON_VALUES: [u8; 2] = [0x13, 0x15];
/// Bilinen "kapalı" değerleri.
const OFF_VALUES: [u8; 2] = [0x10, 0x12];

/// Blob'u yorumlar (SAF). `None` = tanınmadı/eksik → tahmin yok.
pub fn parse_state(blob: &[u8]) -> Option<bool> {
    if blob.len() <= STATE_INDEX || blob[..4] != KNOWN_HEADER {
        return None;
    }
    let v = blob[STATE_INDEX];
    if ON_VALUES.contains(&v) {
        Some(true)
    } else if OFF_VALUES.contains(&v) {
        Some(false)
    } else {
        None
    }
}

/// Registry yolunun parçaları (test edilebilir metin).
pub const CLOUD_KEY: &str =
    r"Software\Microsoft\Windows\CurrentVersion\CloudStore\Store\DefaultAccount\Current";
pub const CLOUD_SUBKEY: &str = "default$windows.data.bluelightreduction.bluelightreductionstate";
pub const CLOUD_VALUE: &str = "windows.data.bluelightreduction.bluelightreductionstate";

/// Kayıt defterinden ham blob'u okur. Yoksa/okunamazsa `None`.
pub fn read_blob() -> Option<Vec<u8>> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegGetValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_QUERY_VALUE,
        RRF_RT_REG_BINARY,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    let path = wide(&format!(r"{CLOUD_KEY}\{CLOUD_SUBKEY}"));
    let name = wide(CLOUD_VALUE);
    let mut hkey = HKEY::default();
    // Güvenli: iki geniş dizge de çağrı boyunca yaşıyor ve NUL ile bitiyor.
    let rc = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(path.as_ptr()),
            Some(0),
            KEY_QUERY_VALUE,
            &mut hkey,
        )
    };
    if rc.is_err() {
        return None;
    }
    let mut size: u32 = 0;
    let rc = unsafe {
        RegGetValueW(
            hkey,
            PCWSTR::null(),
            PCWSTR(name.as_ptr()),
            RRF_RT_REG_BINARY,
            None,
            None,
            Some(&mut size),
        )
    };
    if rc.is_err() || size == 0 || size > 4096 {
        let _ = unsafe { RegCloseKey(hkey) };
        return None;
    }
    let mut buf = vec![0u8; size as usize];
    let mut got = size;
    let rc = unsafe {
        RegGetValueW(
            hkey,
            PCWSTR::null(),
            PCWSTR(name.as_ptr()),
            RRF_RT_REG_BINARY,
            None,
            Some(buf.as_mut_ptr() as *mut c_void),
            Some(&mut got),
        )
    };
    let _ = unsafe { RegCloseKey(hkey) };
    if rc.is_err() {
        return None;
    }
    buf.truncate(got as usize);
    Some(buf)
}

/// Genel API: `Some(true)` açık, `Some(false)` kapalı, `None` bilinmiyor.
pub fn status() -> Option<bool> {
    read_blob().as_deref().and_then(parse_state)
}

/// Kullanıcıya gösterilecek kısa metin.
pub fn status_text(state: Option<bool>) -> &'static str {
    match state {
        Some(true) => "açık",
        Some(false) => "kapalı",
        None => "okunamadı",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn blob_with(state: u8) -> Vec<u8> {
        let mut b = vec![0u8; 24];
        b[..4].copy_from_slice(&KNOWN_HEADER);
        b[STATE_INDEX] = state;
        b
    }

    #[test]
    fn parses_known_on_and_off() {
        assert_eq!(parse_state(&blob_with(0x13)), Some(true));
        assert_eq!(parse_state(&blob_with(0x15)), Some(true));
        assert_eq!(parse_state(&blob_with(0x10)), Some(false));
        assert_eq!(parse_state(&blob_with(0x12)), Some(false));
    }

    #[test]
    fn unknown_state_is_none_never_guessed() {
        // Bilinmeyen değer: "kapalı" varsaymak çifte sararmaya yol açar.
        assert_eq!(parse_state(&blob_with(0x99)), None);
        // Bilinmeyen başlık.
        let mut b = blob_with(0x13);
        b[0] = 0xFF;
        assert_eq!(parse_state(&b), None);
    }

    #[test]
    fn short_or_empty_blob_is_none() {
        assert_eq!(parse_state(&[]), None);
        assert_eq!(parse_state(&KNOWN_HEADER), None);
        assert_eq!(parse_state(&blob_with(0x13)[..STATE_INDEX].to_vec()), None);
    }

    #[test]
    fn status_text_never_lies() {
        assert_eq!(status_text(Some(true)), "açık");
        assert_eq!(status_text(Some(false)), "kapalı");
        assert_eq!(status_text(None), "okunamadı");
    }
}
