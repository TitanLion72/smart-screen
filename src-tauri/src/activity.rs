//! On plan pencere tam ekransa (oyun/video) otomasyonu dondur.
//!
//! Kural (AGENTS.md): oyun/video fullscreen veya kilit acikken
//! tema ve parlakliga dokunma.

use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, RECT};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetSystemMetrics, GetWindowRect, GetWindowThreadProcessId, SM_CXSCREEN,
    SM_CYSCREEN,
};

/// On plan pencere tam ekransa true (oyun/video). Tek basina
/// dondurma sebebi degil; exe listeleriyle birlikte degerlendirilir.
pub fn is_fullscreen() -> bool {
    is_foreground_fullscreen()
}

fn is_foreground_fullscreen() -> bool {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return false;
        }
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return false;
        }
        let hmon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            rcMonitor: RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            },
            rcWork: RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            },
            dwFlags: 0,
        };
        if GetMonitorInfoW(hmon, &mut mi).as_bool() {
            let m = mi.rcMonitor;
            let mw = m.right - m.left;
            let mh = m.bottom - m.top;
            return mw > 0
                && mh > 0
                && rect.left <= m.left
                && rect.top <= m.top
                && rect.right >= m.right
                && rect.bottom >= m.bottom;
        }
        let sw = GetSystemMetrics(SM_CXSCREEN);
        let sh = GetSystemMetrics(SM_CYSCREEN);
        sw > 0 && sh > 0 && rect.left <= 0 && rect.top <= 0 && rect.right >= sw && rect.bottom >= sh
    }
}

/// Pencere ekrani tamamen kapliyorsa true.
#[allow(dead_code)]
fn is_fullscreen_rect(l: i32, t: i32, r: i32, b: i32, sw: i32, sh: i32) -> bool {
    sw > 0 && sh > 0 && l <= 0 && t <= 0 && r >= sw && b >= sh
}

/// On plan pencerenin exe dosya adi (kucuk harf), örn. "vlc.exe".
pub fn foreground_exe() -> Option<String> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid as *mut u32));
        if pid == 0 {
            return None;
        }
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut size = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_FORMAT(0),
            PWSTR(buf.as_mut_ptr()),
            &mut size,
        );
        let _ = CloseHandle(handle);
        if ok.is_err() {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..size as usize]);
        path.rsplit(['\\', '/']).next().map(|s| s.to_lowercase())
    }
}

/// Exe, engel listesindeyse true (tam eslesme, kucuk harf).
pub fn is_blocked(exe: &str, blocklist: &[&str]) -> bool {
    blocklist.contains(&exe)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_match_is_fullscreen() {
        assert!(is_fullscreen_rect(0, 0, 1920, 1080, 1920, 1080));
    }

    #[test]
    fn overscan_is_fullscreen() {
        assert!(is_fullscreen_rect(-8, -8, 1928, 1088, 1920, 1080));
    }

    #[test]
    fn windowed_is_not_fullscreen() {
        assert!(!is_fullscreen_rect(100, 100, 1820, 980, 1920, 1080));
    }

    #[test]
    fn zero_screen_is_not_fullscreen() {
        assert!(!is_fullscreen_rect(0, 0, 0, 0, 0, 0));
    }

    #[test]
    fn live_queries_do_not_panic() {
        let _ = is_fullscreen();
        let _ = foreground_exe();
    }

    #[test]
    fn blocklist_matches_exact() {
        let list = ["vlc.exe", "mpv.exe"];
        assert!(is_blocked("vlc.exe", &list));
        assert!(!is_blocked("vlc", &list));
        assert!(!is_blocked("chrome.exe", &list));
    }
}
