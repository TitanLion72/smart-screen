//! Monitor enumerasyonu ve monitor-basina parlaklik kontrolu.
//!
//! Zincir: EnumDisplayMonitors -> MONITORINFOEXW (szDevice = stabil kimlik,
//! "\\.\DISPLAY1" gibi) -> GetPhysicalMonitorsFromHMONITOR (DDC taniticisi +
//! dost adi). Dahili panel / harici monitor ayrimi QueryDisplayConfig ile
//! yapilir: GDI kaynak adi eslesen path'in outputTechnology'si INTERNAL ise
//! panel dahilidir ve parlaklik WMI uzerinden yazilir; degilse DDC/CI
//! kullanilir. DDC basarisiz olursa sessizce WMI'ya dusulmez — kullaniciya
//! net hata verilir (OSD'den kapali olabilir).

use std::collections::HashMap;

use serde::Serialize;
use windows::core::BOOL;
use windows::Win32::Devices::Display::{
    DestroyPhysicalMonitor, DisplayConfigGetDeviceInfo, GetMonitorBrightness,
    GetNumberOfPhysicalMonitorsFromHMONITOR, GetPhysicalMonitorsFromHMONITOR, QueryDisplayConfig,
    SetMonitorBrightness, DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME, DISPLAYCONFIG_MODE_INFO,
    DISPLAYCONFIG_OUTPUT_TECHNOLOGY_DISPLAYPORT_EMBEDDED, DISPLAYCONFIG_OUTPUT_TECHNOLOGY_INTERNAL,
    DISPLAYCONFIG_OUTPUT_TECHNOLOGY_LVDS, DISPLAYCONFIG_OUTPUT_TECHNOLOGY_UDI_EMBEDDED,
    DISPLAYCONFIG_PATH_INFO, DISPLAYCONFIG_SOURCE_DEVICE_NAME, PHYSICAL_MONITOR,
    QDC_ONLY_ACTIVE_PATHS,
};
use windows::Win32::Foundation::{
    GetLastError, ERROR_INSUFFICIENT_BUFFER, ERROR_SUCCESS, HANDLE, LPARAM, RECT,
};
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW,
};

/// On yuze giden monitor kaydi. `id` szDevice yoludur: HMONITOR oturum
/// boyunca degisebilir, szDevice daha kararli bir anahtardir.
#[derive(Clone, Debug, Serialize)]
pub struct MonitorInfo {
    pub id: String,
    pub name: String,
    pub is_internal: bool,
    /// "wmi" (dahili panel) | "ddc" (harici monitor).
    pub api: String,
}

/// Enumerasyon sirasinda tasinan ham kayit.
struct RawMonitor {
    hmon: HMONITOR,
    device: String,
    name: String,
    is_internal: bool,
}

/// Bagli monitorlerin listesi.
pub fn list() -> Result<Vec<MonitorInfo>, String> {
    Ok(enumerate()?
        .into_iter()
        .map(|m| MonitorInfo {
            id: m.device,
            name: m.name,
            is_internal: m.is_internal,
            api: api_name(m.is_internal).to_string(),
        })
        .collect())
}

/// Bagli monitorlerin GDI cihaz adlari (szDevice, or. "\\.\DISPLAY1").
/// Enumerasyon basarisizsa bos doner; sirasi EnumDisplayMonitors'in sirasidir.
pub fn device_ids() -> Vec<String> {
    enumerate()
        .map(|ms| ms.into_iter().map(|m| m.device).collect())
        .unwrap_or_default()
}

/// Monitor dahili panel mi? (Pro kapisi: harici DDC kontrolu lisanslidir.)
/// Bulunamayan kimlik hata dondurur; cagri yolu "monitör bulunamadı"ya dusmez,
/// set_brightness ayni hatayi uretir.
pub fn is_internal(id: &str) -> Result<bool, String> {
    find_monitor(id).map(|m| m.is_internal)
}

/// Tek monitorun parlakligini okur (yuzde 0-100).
pub fn get_brightness(id: &str) -> Result<u8, String> {
    let m = find_monitor(id)?;
    if m.is_internal {
        return crate::brightness::get_brightness();
    }
    match ddc_get_brightness(&m) {
        Ok(v) => Ok(v),
        Err(e) => {
            // Siniflandirma kaybolmus olabilir (QueryDisplayConfig basarisiz):
            // tek monitorlu kurulumda WMI yolu son sans. Cok monitorluyse
            // sessizce baska yola dusmeyiz.
            if single_monitor() {
                crate::brightness::get_brightness().map_err(|_| e)
            } else {
                Err(e)
            }
        }
    }
}

/// Tek monitorun parlakligini yazar (yuzde 0-100).
pub fn set_brightness(id: &str, value: u8) -> Result<(), String> {
    let m = find_monitor(id)?;
    if m.is_internal {
        return crate::brightness::set_brightness(value);
    }
    match ddc_set_brightness(&m, value) {
        Ok(()) => Ok(()),
        Err(e) => {
            if single_monitor() {
                crate::brightness::set_brightness(value).map_err(|_| e)
            } else {
                Err(e)
            }
        }
    }
}

fn api_name(is_internal: bool) -> &'static str {
    if is_internal {
        "wmi"
    } else {
        "ddc"
    }
}

fn find_monitor(id: &str) -> Result<RawMonitor, String> {
    enumerate()?
        .into_iter()
        .find(|m| m.device == id)
        .ok_or_else(|| format!("monitör bulunamadı: {id}"))
}

fn enumerate() -> Result<Vec<RawMonitor>, String> {
    let internals = internal_sources();
    let mut out = Vec::new();
    for hmon in monitor_handles()? {
        // Tek bir monitorun adi okunamazsa tum listeyi dusurmeyelim.
        let Ok(device) = device_name(hmon) else {
            continue;
        };
        let is_internal = internals
            .as_ref()
            .and_then(|m| m.get(&device).copied())
            .unwrap_or(false);
        let name = friendly_name(hmon).unwrap_or_else(|| device.clone());
        out.push(RawMonitor {
            hmon,
            device,
            name,
            is_internal,
        });
    }
    Ok(out)
}

/// Dahili/harici siniflandirmasi kullanilabilir mi? QueryDisplayConfig
/// basarisizsa true: Pro kapisinin dahili paneli yanlis engellemesini onler.
pub fn classification_failed() -> bool {
    internal_sources().is_none()
}

/// Tek monitorlu kurulum mu? QueryDisplayConfig siniflandirmayi kaybettiginde
/// (tek ekranli laptop/masaustu) WMI'ya bir kez dusmek icin kullanilir.
fn single_monitor() -> bool {
    enumerate().map(|v| v.len() == 1).unwrap_or(false)
}

/// EnumDisplayMonitors ile HMONITOR listesini toplar.
fn monitor_handles() -> Result<Vec<HMONITOR>, String> {
    let mut handles: Vec<HMONITOR> = Vec::new();
    // Guvenli: LPARAM, asagidaki yigin uzerindeki Vec'e isaret ediyor;
    // EnumDisplayMonitors senkron calisir, ayni Vec'e baska erisim yok.
    let list: *mut Vec<HMONITOR> = &mut handles;
    let ok =
        unsafe { EnumDisplayMonitors(None, None, Some(monitor_enum_proc), LPARAM(list as isize)) };
    if !ok.as_bool() {
        return Err("monitor listesi alınamadı (EnumDisplayMonitors)".into());
    }
    Ok(handles)
}

/// EnumDisplayMonitors geri cagirisi: her monitoru LISTE'ye ekler.
///
/// Guvenli/invariant: lparam, cagiranin verdigi gecerli `*mut Vec<HMONITOR>`
/// isaretcisidir; cagri tek is parcaciginda senkron yurur. Her adimda TRUE
/// donerek tum monitorlar listelenir.
unsafe extern "system" fn monitor_enum_proc(
    hmon: HMONITOR,
    _hdc: HDC,
    _rect: *mut RECT,
    lparam: LPARAM,
) -> BOOL {
    let list = &mut *(lparam.0 as *mut Vec<HMONITOR>);
    list.push(hmon);
    BOOL(1)
}

/// HMONITOR'un GDI cihaz adi (szDevice), orn. "\\.\DISPLAY1".
fn device_name(hmon: HMONITOR) -> Result<String, String> {
    let mut info = MONITORINFOEXW::default();
    info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
    // Guvenli: MONITORINFOEXW, MONITORINFO ile ayni satirda baslar (repr C);
    // cbSize toplam yapi boyutunu icerir, API bunu ister.
    let ok = unsafe { GetMonitorInfoW(hmon, &mut info as *mut _ as *mut MONITORINFO) };
    if !ok.as_bool() {
        return Err("monitör bilgisi alınamadı (GetMonitorInfoW)".into());
    }
    Ok(utf16_to_string(&info.szDevice))
}

/// QueryDisplayConfig + GET_SOURCE_NAME ile "GDI kaynak adi -> dahili mi"
/// haritasini cikarir. Hicbir harita cikamazsa (QueryDisplayConfig basarisiz)
/// None doner: siniflandirma bilinmiyordur ve Pro kapisinin yanlis engelleme
/// yapmamasi icin `classification_failed` sorgulanir.
fn internal_sources() -> Option<HashMap<String, bool>> {
    let mut map = HashMap::new();
    let mut paths: Vec<DISPLAYCONFIG_PATH_INFO> = vec![DISPLAYCONFIG_PATH_INFO::default(); 16];
    let mut modes: Vec<DISPLAYCONFIG_MODE_INFO> = vec![DISPLAYCONFIG_MODE_INFO::default(); 32];
    for _ in 0..4 {
        let mut n_path = paths.len() as u32;
        let mut n_mode = modes.len() as u32;
        // Guvenli: sayilar dizilerin uzunluguyla es, isaretciler gecerli.
        let rc = unsafe {
            QueryDisplayConfig(
                QDC_ONLY_ACTIVE_PATHS,
                &mut n_path,
                paths.as_mut_ptr(),
                &mut n_mode,
                modes.as_mut_ptr(),
                None,
            )
        };
        if rc.0 == ERROR_INSUFFICIENT_BUFFER.0 {
            let need_path = n_path as usize;
            let need_mode = n_mode as usize;
            paths.resize(need_path, DISPLAYCONFIG_PATH_INFO::default());
            modes.resize(need_mode, DISPLAYCONFIG_MODE_INFO::default());
            continue;
        }
        if rc.0 != ERROR_SUCCESS.0 {
            return None;
        }
        paths.truncate(n_path as usize);
        for p in &paths {
            // Dahili panel yalnizca INTERNAL bildirmez: eDP cogu zaman
            // DISPLAYPORT_EMBEDDED, eski paneller LVDS/UDI_EMBEDDED dondurur.
            // Bu kume dahili sayilmazsa laptop paneli "harici" sanilir ve
            // kullanici kendi ekraninda DDC hatasi gorur.
            let tech = p.targetInfo.outputTechnology.0;
            let internal = tech == DISPLAYCONFIG_OUTPUT_TECHNOLOGY_INTERNAL.0
                || tech == DISPLAYCONFIG_OUTPUT_TECHNOLOGY_DISPLAYPORT_EMBEDDED.0
                || tech == DISPLAYCONFIG_OUTPUT_TECHNOLOGY_UDI_EMBEDDED.0
                || tech == DISPLAYCONFIG_OUTPUT_TECHNOLOGY_LVDS.0;
            if let Some(name) = source_gdi_name(p) {
                map.insert(name, internal);
            }
        }
        return Some(map);
    }
    None
}

/// Path'in kaynak GDI adini (szDevice ile eslesir) sorar.
fn source_gdi_name(path: &DISPLAYCONFIG_PATH_INFO) -> Option<String> {
    let mut req = DISPLAYCONFIG_SOURCE_DEVICE_NAME::default();
    req.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
    req.header.size = std::mem::size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32;
    req.header.adapterId = path.sourceInfo.adapterId;
    req.header.id = path.sourceInfo.id;
    // Guvenli: req yerel degisken, boyut alani yapi ile es.
    let rc = unsafe { DisplayConfigGetDeviceInfo(&mut req.header) };
    (rc == 0).then(|| utf16_to_string(&req.viewGdiDeviceName))
}

/// Monitorun dost adi (szPhysicalMonitorDescription); alinamazsa veya bossa
/// None doner, cagiran szDevice'a duser.
fn friendly_name(hmon: HMONITOR) -> Option<String> {
    let physical = physical_monitors(hmon).ok()?;
    let name = physical.first().map(|m| {
        // PHYSICAL_MONITOR packed(1): alana referans alinamaz (E0793),
        // once deger olarak kopyalariz.
        let desc = m.szPhysicalMonitorDescription;
        utf16_to_string(&desc).trim().to_string()
    });
    destroy_monitors(&physical);
    let name = name.unwrap_or_default();
    (!name.is_empty()).then_some(name)
}

/// HMONITOR'un fiziksel (DDC) monitor taniticilarini acar.
fn physical_monitors(hmon: HMONITOR) -> Result<Vec<PHYSICAL_MONITOR>, String> {
    let mut count = 0u32;
    // Guvenli: cikti gecerli yerel degiskene bagli.
    unsafe { GetNumberOfPhysicalMonitorsFromHMONITOR(hmon, &mut count) }
        .map_err(|e| format!("fiziksel monitör sayısı alınamadı: {e}"))?;
    if count == 0 {
        return Ok(Vec::new());
    }
    let mut buf = vec![PHYSICAL_MONITOR::default(); count as usize];
    // Guvenli: dilim uzunlugu GetNumberOfPhysicalMonitorsFromHMONITOR'in
    // bildirdigi sayiya esit (API sozlesmesi).
    unsafe { GetPhysicalMonitorsFromHMONITOR(hmon, &mut buf) }
        .map_err(|e| format!("fiziksel monitör açılamadı: {e}"))?;
    Ok(buf)
}

/// Acilan taniticilari kapatir; temizlik hatasi kritik degil.
fn destroy_monitors(physical: &[PHYSICAL_MONITOR]) {
    for m in physical {
        let _ = unsafe { DestroyPhysicalMonitor(m.hPhysicalMonitor) };
    }
}

fn ddc_get_brightness(m: &RawMonitor) -> Result<u8, String> {
    let physical = physical_monitors(m.hmon)?;
    let result = read_ddc(&physical);
    destroy_monitors(&physical);
    result
}

fn ddc_set_brightness(m: &RawMonitor, value: u8) -> Result<(), String> {
    let physical = physical_monitors(m.hmon)?;
    let result = write_ddc(&physical, value);
    destroy_monitors(&physical);
    result
}

fn first_handle(physical: &[PHYSICAL_MONITOR]) -> Result<HANDLE, String> {
    physical
        .first()
        .map(|m| m.hPhysicalMonitor)
        .ok_or_else(|| "monitörde fiziksel DDC tanıtıcısı yok".into())
}

/// DDC ham araligini ve anlik degeri okur: (min, current, max).
fn ddc_raw(handle: HANDLE) -> Result<(u32, u32, u32), String> {
    let (mut min, mut cur, mut max) = (0u32, 0u32, 0u32);
    // Guvenli: uc cikis da gecerli yerel degiskene bagli.
    let ok = unsafe { GetMonitorBrightness(handle, &mut min, &mut cur, &mut max) };
    if ok == 0 {
        // 31 = ERROR_GEN_FAILURE: monitor DDC/CI'ye yanit vermiyor.
        return Err(ddc_failure("okunamadı", unsafe { GetLastError() }.0));
    }
    Ok((min, cur, max))
}

fn read_ddc(physical: &[PHYSICAL_MONITOR]) -> Result<u8, String> {
    let handle = first_handle(physical)?;
    let (min, cur, max) = ddc_raw(handle)?;
    normalize(cur, min, max)
}

fn write_ddc(physical: &[PHYSICAL_MONITOR], value: u8) -> Result<(), String> {
    let handle = first_handle(physical)?;
    let (min, _cur, max) = ddc_raw(handle)?;
    let raw = denormalize(value, min, max)?;
    // Guvenli: raw, az once okunan min/max araliginin icinde.
    let ok = unsafe { SetMonitorBrightness(handle, raw) };
    if ok == 0 {
        return Err(ddc_failure("yazılamadı", unsafe { GetLastError() }.0));
    }
    Ok(())
}

/// DDC/CI hatasinin net mesaji: sessizce WMI'ya dusulmez.
fn ddc_failure(what: &str, code: u32) -> String {
    format!(
        "DDC/CI bu monitörde çalışmıyor (muhtemelen OSD'den kapalı ya da desteklenmiyor) \
         — parlaklık {what} (kod {code})"
    )
}

/// DDC ham degerini yuzdeye cevirir (0-100, tam sayi).
fn normalize(current: u32, min: u32, max: u32) -> Result<u8, String> {
    if max <= min {
        return Err(format!(
            "monitör parlaklık aralığı geçersiz (min={min}, max={max})"
        ));
    }
    let percent = (current.saturating_sub(min)) as u64 * 100 / ((max - min) as u64);
    Ok((percent.min(100)) as u8)
}

/// Yuzdeyi (0-100) DDC ham degerine cevirir.
fn denormalize(percent: u8, min: u32, max: u32) -> Result<u32, String> {
    if max <= min {
        return Err(format!(
            "monitör parlaklık aralığı geçersiz (min={min}, max={max})"
        ));
    }
    let p = percent.min(100) as u64;
    Ok((min as u64 + (max - min) as u64 * p / 100) as u32)
}

/// UTF-16 tamponunu ilk NUL'e kadar String'e cevirir.
fn utf16_to_string(buf: &[u16]) -> String {
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..len])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf16_stops_at_nul() {
        assert_eq!(utf16_to_string(&[0x41, 0x42, 0, 0x43]), "AB");
    }

    #[test]
    fn utf16_without_nul_reads_all() {
        assert_eq!(utf16_to_string(&[0x41, 0x42]), "AB");
    }

    #[test]
    fn utf16_empty_is_empty() {
        assert_eq!(utf16_to_string(&[0]), "");
    }

    #[test]
    fn normalize_mid_range() {
        assert_eq!(normalize(50, 0, 100).unwrap(), 50);
        assert_eq!(normalize(60, 10, 110).unwrap(), 50);
    }

    #[test]
    fn normalize_edges() {
        assert_eq!(normalize(0, 0, 100).unwrap(), 0);
        assert_eq!(normalize(100, 0, 100).unwrap(), 100);
        assert_eq!(normalize(10, 10, 110).unwrap(), 0);
        assert_eq!(normalize(110, 10, 110).unwrap(), 100);
    }

    #[test]
    fn normalize_clamps_above_max() {
        assert_eq!(normalize(200, 0, 100).unwrap(), 100);
    }

    #[test]
    fn normalize_clamps_below_min() {
        assert_eq!(normalize(5, 10, 110).unwrap(), 0);
    }

    #[test]
    fn normalize_rejects_flat_range() {
        assert!(normalize(5, 50, 50).is_err());
        assert!(normalize(5, 60, 50).is_err());
    }

    #[test]
    fn denormalize_roundtrip() {
        for p in [0u8, 1, 33, 50, 99, 100] {
            let raw = denormalize(p, 10, 110).unwrap();
            assert_eq!(normalize(raw, 10, 110).unwrap(), p);
        }
    }

    #[test]
    fn denormalize_clamps_input() {
        assert_eq!(denormalize(150, 0, 100).unwrap(), 100);
    }

    #[test]
    fn denormalize_rejects_flat_range() {
        assert!(denormalize(5, 7, 7).is_err());
    }

    #[test]
    fn api_name_splits_on_internal() {
        assert_eq!(api_name(true), "wmi");
        assert_eq!(api_name(false), "ddc");
    }

    #[test]
    #[ignore = "canli donanim gerektirir"]
    fn live_monitor_list() {
        for m in list().expect("monitor listesi gelmeli") {
            println!(
                "{} | {} | internal={} api={}",
                m.id, m.name, m.is_internal, m.api
            );
        }
    }
}
