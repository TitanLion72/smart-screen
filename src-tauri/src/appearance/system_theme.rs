// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! Windows sistem (uygulama) temasini kayit defterinden okur/yazar.
//!
//! Neden `winreg` eklemedik: `windows` crate'i zaten bagimlilikta ve
//! `Win32_System_Registry` feature'i acik; yeni bir crate eklemek ikinci bir
//! kayit defteri soyutlamasi getirirdi.
//!
//! Iki deger birlikte yazilir: `AppsUseLightTheme` uygulama pencerelerini,
//! `SystemUsesLightTheme` gorev cubugu/Baslat gibi kabugu boyar. Yalniz birini
//! yazmak "yarim koyu" gorunum birakir.

use crate::appearance::Mode;

/// Kullanici bazli kisisellestirme anahtari (HKCU — yonetici gerekmez).
pub const PERSONALIZE_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";

/// Uygulama pencereleri (0 = koyu, 1 = acik).
const APPS_VALUE: &str = "AppsUseLightTheme";
/// Kabuk / gorev cubugu.
const SYSTEM_VALUE: &str = "SystemUsesLightTheme";

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Mod -> DWORD (SAF; kayit defterine dokunmadan test edilir).
fn mode_to_dword(mode: Mode) -> u32 {
    match mode {
        Mode::Light => 1,
        Mode::Dark => 0,
    }
}

/// DWORD -> Mod (SAF). 0 disindaki her deger acik sayilir: Windows da
/// `!= 0` kontrolu yapar, negatif/uydurma degerde koyuya dusmek surpriz olurdu.
fn dword_to_mode(value: u32) -> Mode {
    if value == 0 {
        Mode::Dark
    } else {
        Mode::Light
    }
}

/// Kayit defterindeki degeri okur. Deger yoksa `None` (hata degil).
fn read_dword(name: &str) -> Result<Option<u32>, String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};

    let key = wide(PERSONALIZE_KEY);
    let value = wide(name);
    let mut data: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    // Guvenli: iki genis dizge NUL ile bitiyor ve cagri boyunca yasiyor;
    // cikti yerel `data`/`size` degiskenlerine bagli.
    let rc = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            PCWSTR(key.as_ptr()),
            PCWSTR(value.as_ptr()),
            RRF_RT_REG_DWORD,
            None,
            Some(&mut data as *mut u32 as *mut core::ffi::c_void),
            Some(&mut size),
        )
    };
    match rc {
        ERROR_SUCCESS => Ok(Some(data)),
        // Anahtar/deger hic yok: Windows varsayilani (acik) gecerli.
        ERROR_FILE_NOT_FOUND => Ok(None),
        other => Err(format!("kayıt defteri okunamadı ({name}): {}", other.0)),
    }
}

/// Sistem uygulama temasini okur. Anahtar yoksa `Mode::Light` (Windows
/// varsayilani) — bu bir hata degil, taze profilde normaldir.
pub fn get() -> Result<Mode, String> {
    Ok(read_dword(APPS_VALUE)?
        .map(dword_to_mode)
        .unwrap_or(Mode::Light))
}

/// Iki degeri de yazar, sonra `WM_SETTINGCHANGE` yayinlar.
///
/// Yayin olmadan Explorer ve uyumlu uygulamalar yeni degeri ancak yeniden
/// baslatilinca fark eder; yayin aninda donmelerini saglar.
pub fn set(mode: Mode) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::Security::SECURITY_ATTRIBUTES;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE,
        REG_DWORD, REG_OPTION_NON_VOLATILE,
    };

    let key = wide(PERSONALIZE_KEY);
    let mut hkey = HKEY::default();
    // Guvenli: `key` NUL ile bitiyor; `hkey` yerel ve basarida RegCloseKey ile
    // kapatiliyor. lpclass/guvenlik nitelikleri verilmez (varsayilan).
    let rc = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(key.as_ptr()),
            None,
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            None::<*const SECURITY_ATTRIBUTES>,
            &mut hkey,
            None,
        )
    };
    if rc != ERROR_SUCCESS {
        return Err(format!("kişiselleştirme anahtarı açılamadı: {}", rc.0));
    }

    let data = mode_to_dword(mode).to_le_bytes();
    let mut error = None;
    for name in [APPS_VALUE, SYSTEM_VALUE] {
        let value = wide(name);
        // Guvenli: `value` NUL ile bitiyor, `data` cagri boyunca yasiyor.
        let rc =
            unsafe { RegSetValueExW(hkey, PCWSTR(value.as_ptr()), None, REG_DWORD, Some(&data)) };
        if rc != ERROR_SUCCESS && error.is_none() {
            error = Some(format!("{name} yazılamadı: {}", rc.0));
        }
    }
    // Guvenli: hkey burada gecerli (yukarida basariyla acildi).
    let _ = unsafe { RegCloseKey(hkey) };
    if let Some(e) = error {
        return Err(e);
    }

    broadcast_change();
    Ok(())
}

/// `WM_SETTINGCHANGE` / `ImmersiveColorSet` yayini. Explorer ve uyumlu
/// uygulamalar bunu duyunca temayı yeniden okur. Yayin basarisiz olsa bile
/// deger yazilmistir; bu yuzden hata dondurulmez (yalniz gecikme olur).
fn broadcast_change() {
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };

    let param = wide("ImmersiveColorSet");
    let mut result: usize = 0;
    // Guvenli: `param` NUL ile bitiyor ve cagri suresince yasiyor; ABORTIFHUNG
    // ile mesaj islemeyen pencereye takilmayiz.
    let _ = unsafe {
        SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            WPARAM(0),
            LPARAM(param.as_ptr() as isize),
            SMTO_ABORTIFHUNG,
            5000,
            Some(&mut result),
        )
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_mode_to_dword_and_back() {
        assert_eq!(mode_to_dword(Mode::Dark), 0);
        assert_eq!(mode_to_dword(Mode::Light), 1);
        assert_eq!(dword_to_mode(0), Mode::Dark);
        assert_eq!(dword_to_mode(1), Mode::Light);
        assert_eq!(dword_to_mode(2), Mode::Light, "sifir olmayan deger acik");
    }

    #[test]
    fn roundtrip_is_stable() {
        for mode in [Mode::Dark, Mode::Light] {
            assert_eq!(dword_to_mode(mode_to_dword(mode)), mode);
        }
    }

    #[test]
    fn personalize_key_is_user_scope() {
        assert!(PERSONALIZE_KEY.contains(r"CurrentVersion\Themes\Personalize"));
    }

    /// Canli dogrulama: mevcut modu **ayni degerle** geri yazar (gorunum
    /// degismez) ve okumanin yazimla tutarli oldugunu kontrol eder.
    /// Normal kosuda atlanir: `cargo test -- --ignored live_`.
    #[test]
    #[ignore]
    fn live_write_then_read_roundtrip() {
        let before = get().expect("okunmali");
        set(before).expect("yazilmali");
        assert_eq!(get().expect("okunmali"), before);
    }
}
