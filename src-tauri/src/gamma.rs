//! Ekranin renk sicakligini gamma rampasi ile kaydirir (gun batimi sicak tonu).
//!
//! Her ekran kendi GDI cihaz adiyla ("\\.\DISPLAY1" gibi) ele alinir: DC
//! `CreateDCW("DISPLAY", cihaz)` ile acilir, rampa yalnizca o ekrana yazilir.
//! SetDeviceGammaRamp surucu sezgileri yuzunden sessizce basarisiz olur:
//! "any entry in the ramp must be within 32768 of the identity value".
//! Bu yuzden rampa iyimser ama sinirli kayar (warmth=100'de bile),
//! her kanal monoton artar, girisler identity-32768..identity+32768
//! araliginda kalir ve 0-65535'e kelepcelenir.
//!
//! Sicak ton acilmadan once HER EKRANIN rampasi bellek + diskte
//! (`smart-screen-gamma-<cihaz>.bin`) saklanir; kapatilirken her ekran kendi
//! kalibrasyonuna doner. Sakli orijinal (kalibrasyon) rampaya dogrulama
//! UYGULANMAZ: surucunun verdigi deger geri yazilir, sinirlari asiyorsa bile.
//! Ekrana cikis ya da cozunurluk degisiminde surucu rampayi sifirlayabilir;
//! bu yuzden kayitlar diskte de durur (crash sonrasi `recover()` okur).

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex, MutexGuard};

use windows::core::{w, PCWSTR};
use windows::Win32::Graphics::Gdi::{CreateDCW, DeleteDC, HDC};
use windows::Win32::UI::ColorSystem::{GetDeviceGammaRamp, SetDeviceGammaRamp};

/// Sicak ton uygulanmadan once her ekranin rampasi buraya saklanir;
/// kapatilirken geri yuklenir (monitor/Windows renk kalibrasyonu silinmesin).
/// Anahtar GDI cihaz adidir: "\\.\DISPLAY1" gibi.
static ORIGINAL: LazyLock<Mutex<HashMap<String, Ramp>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Surucunun kabul ettigi identity'den maksimum sapma (Microsoft dokumu).
const MAX_DEVIATION: i32 = 32768;

/// warmth=100 hedef carpanlari: kirmizi korunur, mavi en cok kisilir.
const FULL_RED: f32 = 1.0;
const FULL_GREEN: f32 = 0.88;
const FULL_BLUE: f32 = 0.72;

/// Per-cihaz disk kayitlarinin deseni: `smart-screen-gamma-<cihaz>.bin`.
const GAMMA_PREFIX: &str = "smart-screen-gamma-";
const GAMMA_SUFFIX: &str = ".bin";

/// Coklu monitor oncesi tek dosyaydi; acilista per-cihaz semasina tasinir.
const LEGACY_GAMMA_NAME: &str = "smart-screen-gamma.bin";

/// Birincil ekranin GDI cihaz adi (enumerasyon bos kalirsa yedek deger).
const PRIMARY_DEVICE: &str = "\\\\.\\DISPLAY1";

/// 3x256 gamma rampasi; her giris 0-65535 (WORD).
#[derive(Clone, Debug, PartialEq)]
pub struct Ramp {
    pub red: [u16; 256],
    pub green: [u16; 256],
    pub blue: [u16; 256],
}

/// Diskte bulunan per-cihaz orijinal kaydi.
struct DiskOriginal {
    device: String,
    key: String,
    path: PathBuf,
    ramp: Ramp,
}

/// warmth (0-100) icin rampa uretir: 0 = identity (degisiklik yok),
/// 100 = en sicak. Carpanlar 1.0'dan hedefe lineer interpole edilir.
/// Cikis her zaman monoton ve surucu sinirlari icindedir (SAF).
pub fn build_ramp(warmth: u8) -> Ramp {
    let t = warmth.min(100) as f32 / 100.0;
    let id = identity_channel();
    Ramp {
        red: scale_channel(&id, lerp(1.0, FULL_RED, t)),
        green: scale_channel(&id, lerp(1.0, FULL_GREEN, t)),
        blue: scale_channel(&id, lerp(1.0, FULL_BLUE, t)),
    }
}

/// Rampadaki uc kanal da azalmayan sirada mi (SAF)?
pub fn is_monotonic(r: &Ramp) -> bool {
    fn nondecreasing(ch: &[u16; 256]) -> bool {
        ch.windows(2).all(|p| p[0] <= p[1])
    }
    nondecreasing(&r.red) && nondecreasing(&r.green) && nondecreasing(&r.blue)
}

/// Her giris identity+-32768 icinde mi (SAF)? SetDeviceGammaRamp'in
/// okunabilirlik sezgileri bu siniri ihlal edeni sessizce reddeder.
pub fn within_driver_limits(r: &Ramp) -> bool {
    fn bounded(ch: &[u16; 256]) -> bool {
        ch.iter()
            .enumerate()
            .all(|(i, &v)| (v as i32 - identity_at(i)).abs() <= MAX_DEVIATION)
    }
    bounded(&r.red) && bounded(&r.green) && bounded(&r.blue)
}

/// Cihaz adindan DC acar, isletimi calistirir ve DC'yi kapatir.
/// Panik yok; DC acilamazsa Turkce hata doner.
fn with_dc<T>(device: &str, op: impl FnOnce(HDC) -> T) -> Result<T, String> {
    let mut wide: Vec<u16> = device.encode_utf16().collect();
    wide.push(0);
    // Guvenli: wide yerel tampon NUL ile sonlaniyor ve cagri boyunca yasiyor;
    // DC islemden hemen sonra DeleteDC ile kapatiliyor.
    let hdc = unsafe { CreateDCW(w!("DISPLAY"), PCWSTR(wide.as_ptr()), PCWSTR::null(), None) };
    if hdc.0.is_null() {
        return Err(format!("{device}: DC açılamadı (CreateDCW)"));
    }
    let out = op(hdc);
    let _ = unsafe { DeleteDC(hdc) };
    Ok(out)
}

/// Uygulanacak sicak ton rampasini verilen cihaza yazar. Once dogrular
/// (sinir ihlalinde surucu sessizce basarisiz olur), sonra uygular.
pub fn apply_ramp(device: &str, r: &Ramp) -> Result<(), String> {
    validate(r)?;
    apply_raw(device, r)
}

/// Rampayi dogrulamadan cihaza yazar: yalnizca saklanan ORIJINAL rampa icin.
/// Kalibrasyon surucu sinirlari disinda olabilir; geri yazarken kaybetmeyiz.
fn apply_raw(device: &str, r: &Ramp) -> Result<(), String> {
    let words = to_words(r);
    let ok = with_dc(device, |hdc| unsafe {
        SetDeviceGammaRamp(hdc, words.as_ptr() as *const core::ffi::c_void).as_bool()
    })?;
    if ok {
        Ok(())
    } else {
        Err(format!("{device}: SetDeviceGammaRamp basarisiz oldu"))
    }
}

/// Cihazdan gecerli rampayi okur (orijinali saklamak icin).
/// Okunan degere dogrulama UYGULANMAZ.
pub fn read_ramp(device: &str) -> Result<Ramp, String> {
    let mut words = [0u16; 768];
    let ok = with_dc(device, |hdc| unsafe {
        GetDeviceGammaRamp(hdc, words.as_mut_ptr() as *mut core::ffi::c_void).as_bool()
    })?;
    if !ok {
        return Err(format!("{device}: GetDeviceGammaRamp basarisiz oldu"));
    }
    Ok(from_words(&words))
}

/// Sicakligi TUM ekranlara uygular: build + validate + apply. Her cihazin
/// mevcut rampasi ilk yazimdan once saklanir. warmth=0 verilirse geri yukler.
///
/// Kisimli basarisizlikta diger ekranlar sicak kalir (kozmetik ozellik,
/// tek ekran hata diye hepsi geri alinmaz); hicbiri basarisiz olamazsa hata
/// doner.
pub fn set_warmth(warmth: u8) -> Result<(), String> {
    if warmth == 0 {
        return restore_original();
    }
    let ramp = build_ramp(warmth);
    validate(&ramp)?;
    let devices = target_devices();
    let mut errors = Vec::new();
    for device in &devices {
        if let Err(e) = warm_device(device, &ramp) {
            errors.push(format!("{device}: {e}"));
        }
    }
    if errors.len() == devices.len() {
        Err(format!(
            "sicak ton hicbir ekrana uygulanamadi — {}",
            errors.join("; ")
        ))
    } else {
        Ok(())
    }
}

/// Tek cihaza sicak ton: once orijinali yakala, sonra uygula.
fn warm_device(device: &str, ramp: &Ramp) -> Result<(), String> {
    capture_original_for(device)?;
    apply_ramp(device, ramp)
}

/// Saklanan orijinalleri geri yukler: once bellekteki kayitlar, sonra
/// diskteki tum `smart-screen-gamma-*.bin` dosyalari. Basarili olana ait
/// dosya silinir. Sakli orijinali olmayan cihaza DOKUNULMAZ: mevcut
/// (fabrika/ICC/f.lux) kalibrasyonu kimlik rampayla ezmemeliyiz.
pub fn restore_original() -> Result<(), String> {
    let stored: HashMap<String, Ramp> = {
        let mut guard = lock()?;
        std::mem::take(&mut *guard)
    };
    let mut restored_keys: HashSet<String> = HashSet::new();
    let mut failed_keys: HashSet<String> = HashSet::new();
    let mut errors: Vec<String> = Vec::new();

    for (device, ramp) in stored {
        match apply_raw(&device, &ramp) {
            Ok(()) => {
                restored_keys.insert(sanitize_device(&device));
            }
            Err(e) => {
                errors.push(format!("{device}: {e}"));
                // Cihaz su an erisilemiyorsa (takili degil) kayit kaybolmasin;
                // geri koy ki sonraki cagrilar tekrar deneyebilsin.
                if let Ok(mut guard) = lock() {
                    failed_keys.insert(sanitize_device(&device));
                    guard.insert(device, ramp);
                }
            }
        }
    }

    for orig in disk_originals() {
        if restored_keys.contains(&orig.key) {
            // Bellekten geri yuklendi; diskteki kayit da artik gereksiz.
            let _ = std::fs::remove_file(&orig.path);
            continue;
        }
        if failed_keys.contains(&orig.key) {
            // Az once denenip basarisiz oldu; dosya kalsin, cihaz gelince
            // geri yuklenir.
            continue;
        }
        match apply_raw(&orig.device, &orig.ramp) {
            Ok(()) => {
                let _ = std::fs::remove_file(&orig.path);
            }
            Err(e) => errors.push(format!("{}: {e}", orig.device)),
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

/// Onceki oturumdan kalma sicak tonu temizler (crash sonrasi). Eski tek dosya
/// once per-cihaz semasina tasinir/absorbe edilir, sonra diskteki tum
/// kayitlar geri yuklenir. Hata olsa bile uygulamayi DUSURMEZ.
pub fn recover() {
    if let Ok(dir) = gamma_dir() {
        let _ = migrate_legacy_in(&dir, &primary_device());
    }
    let _ = restore_original();
}

/// Cihazin rampasini ilk kez saklar (bellek + disk). Zaten sakliysa dokunmaz
/// — en eski orijinal (sicak ton oncesi kalibrasyon) korunur.
fn capture_original_for(device: &str) -> Result<(), String> {
    {
        let guard = lock()?;
        if guard.contains_key(device) {
            return Ok(());
        }
    }
    // Kilidi okuma (IO) boyunca tutmuyoruz.
    let ramp = read_ramp(device)?;
    let mut guard = lock()?;
    if guard.contains_key(device) {
        return Ok(());
    }
    if let Ok(p) = gamma_file_for(device) {
        let _ = save_to_path(&p, &ramp);
    }
    guard.insert(device.to_string(), ramp);
    Ok(())
}

fn lock() -> Result<MutexGuard<'static, HashMap<String, Ramp>>, String> {
    ORIGINAL
        .lock()
        .map_err(|_| "gamma kilidi bozuk".to_string())
}

/// Sicak ton uygulanacak ekranlar: bagli tum cihazlar; liste bos kalirsa
/// birincil ekran.
fn target_devices() -> Vec<String> {
    let ids = crate::monitor::device_ids();
    if ids.is_empty() {
        vec![PRIMARY_DEVICE.to_string()]
    } else {
        ids
    }
}

/// Birincil ekranin GDI cihaz adi. Eski tek dosyanin migrasyon hedefi:
/// `\\.\DISPLAY1` (device_ids()[0]) varsa o, yoksa yedek ad.
fn primary_device() -> String {
    let ids = crate::monitor::device_ids();
    ids.iter()
        .find(|d| d.as_str() == PRIMARY_DEVICE)
        .cloned()
        .or_else(|| ids.into_iter().next())
        .unwrap_or_else(|| PRIMARY_DEVICE.to_string())
}

/// Cihaz adindan dosya adi parcasi uretir: `\\.\DISPLAY1` -> `DISPLAY1` (SAF).
fn sanitize_device(device: &str) -> String {
    let tail = device.rsplit('\\').next().unwrap_or(device);
    let cleaned: String = tail
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() {
        "DISPLAY".to_string()
    } else {
        cleaned
    }
}

/// Cihazin disk kayit dosyasinin adi (SAF): `smart-screen-gamma-DISPLAY1.bin`.
fn gamma_file_name(device: &str) -> String {
    format!("{GAMMA_PREFIX}{}{GAMMA_SUFFIX}", sanitize_device(device))
}

/// Dosya adindaki parcadan GDI cihaz adi (SAF): `DISPLAY1` -> `\\.\DISPLAY1`.
fn device_from_key(key: &str) -> String {
    format!("\\\\.\\{key}")
}

/// Dosya adindan cihaz anahtarini okur; kaliptaysa None (SAF). Eski tek
/// dosya (`smart-screen-gamma.bin`) bu kalipta degildir — migrasyonla
/// ele alinir.
fn key_from_file_name(name: &str) -> Option<&str> {
    name.strip_prefix(GAMMA_PREFIX)?.strip_suffix(GAMMA_SUFFIX)
}

/// Eski tek dosyayi (`smart-screen-gamma.bin`) per-cihaz semasina tasir.
/// Hedef dosya zaten varsa eski kayit guncel degildir: absorbe edilip silinir.
fn migrate_legacy_in(dir: &Path, primary: &str) -> Result<(), String> {
    let legacy = dir.join(LEGACY_GAMMA_NAME);
    if !legacy.exists() {
        return Ok(());
    }
    let target = dir.join(gamma_file_name(primary));
    if target.exists() {
        std::fs::remove_file(&legacy).map_err(|e| format!("eski gamma kaydı silinemedi: {e}"))?;
        return Ok(());
    }
    std::fs::rename(&legacy, &target).map_err(|e| format!("eski gamma kaydı taşınamadı: {e}"))
}

/// Diskteki per-cihaz kayitlarini okur. Dosya adindaki anahtar, bagli
/// cihazlar arasinda eslesirse o cihazin gercek adi kullanilir; degilse
/// anahtardan `\\.\` on ekiyle yeniden kurulur (takili degilse uygulama
/// zaten basarisiz olur ve dosya yerinde kalir).
fn disk_originals() -> Vec<DiskOriginal> {
    let Ok(dir) = gamma_dir() else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let live = crate::monitor::device_ids();
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let Some(key) = key_from_file_name(name) else {
            continue;
        };
        let Some(ramp) = load_from_path(&path) else {
            continue;
        };
        let device = live
            .iter()
            .find(|d| sanitize_device(d.as_str()) == key)
            .cloned()
            .unwrap_or_else(|| device_from_key(key));
        out.push(DiskOriginal {
            device,
            key: key.to_string(),
            path,
            ramp,
        });
    }
    out
}

fn gamma_dir() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE").map_err(|e| format!("USERPROFILE yok: {e}"))?;
    Ok(PathBuf::from(home).join(".config").join("opencode"))
}

/// Cihazin orijinal rampasinin disk kaydi.
fn gamma_file_for(device: &str) -> Result<PathBuf, String> {
    Ok(gamma_dir()?.join(gamma_file_name(device)))
}

/// Rampayi 768 WORD olarak dosyaya yazar (kucuk endian).
fn save_to_path(path: &Path, ramp: &Ramp) -> Result<(), String> {
    let mut bytes = [0u8; 768 * 2];
    for (i, v) in to_words(ramp).iter().enumerate() {
        bytes[i * 2..i * 2 + 2].copy_from_slice(&v.to_le_bytes());
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("gamma dizini yok: {e}"))?;
    }
    std::fs::write(path, bytes).map_err(|e| format!("gamma yazilamadi: {e}"))
}

/// Dosyadan rampa okur; dosya yoksa/bos ise None. Dogrulama YAPILMAZ.
fn load_from_path(path: &Path) -> Option<Ramp> {
    let bytes = std::fs::read(path).ok()?;
    if bytes.len() < 768 * 2 {
        return None;
    }
    let mut words = [0u16; 768];
    for (i, w) in words.iter_mut().enumerate() {
        *w = u16::from_le_bytes([bytes[i * 2], bytes[i * 2 + 1]]);
    }
    Some(from_words(&words))
}

/// Surucunun sessizce reddedecegi rampayi onceden yakalar.
fn validate(r: &Ramp) -> Result<(), String> {
    if !is_monotonic(r) {
        return Err("rampa monoton degil".into());
    }
    if !within_driver_limits(r) {
        return Err("rampa identity+-32768 sinirlarini asiyor".into());
    }
    Ok(())
}

/// Identity rampa girisi: i * 257 (0..=65535 tam aralik).
fn identity_at(i: usize) -> i32 {
    (i * 257) as i32
}

/// Kimlik rampasinin tek kanali.
fn identity_channel() -> [u16; 256] {
    let mut ch = [0u16; 256];
    for (i, v) in ch.iter_mut().enumerate() {
        *v = identity_at(i) as u16;
    }
    ch
}

/// Kimlik (degisiklik yok) rampasi (uc kanal da identity).
#[allow(dead_code)]
fn identity_ramp() -> Ramp {
    Ramp {
        red: identity_channel(),
        green: identity_channel(),
        blue: identity_channel(),
    }
}

/// a'dan b'ye t oraninda lineer interpolasyon.
fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

/// Tek kanali carpanla olcekler. Sonuc once identity+-32768 araligina
/// kelepcelenir, sonra monotonluk onceden gelen degerle garanti edilir
/// (hi azalmadigi icin bu kelepceyi bozmaz).
fn scale_channel(identity: &[u16; 256], m: f32) -> [u16; 256] {
    let mut out = [0u16; 256];
    let mut prev = 0i32;
    for i in 0..256 {
        let id = identity[i] as i32;
        let lo = (id - MAX_DEVIATION).max(0);
        let hi = (id + MAX_DEVIATION).min(u16::MAX as i32);
        let scaled = (identity[i] as f32 * m).round() as i32;
        let v = scaled.clamp(lo, hi).max(prev);
        out[i] = v as u16;
        prev = v;
    }
    out
}

/// Rampayi GDI'nin bekledigi duz diziye dizer (red, green, blue; 768 WORD).
fn to_words(r: &Ramp) -> [u16; 768] {
    let mut w = [0u16; 768];
    w[..256].copy_from_slice(&r.red);
    w[256..512].copy_from_slice(&r.green);
    w[512..].copy_from_slice(&r.blue);
    w
}

/// GDI'dan okunan duz diziyi Ramp'a cevirir.
fn from_words(w: &[u16; 768]) -> Ramp {
    let mut red = [0u16; 256];
    let mut green = [0u16; 256];
    let mut blue = [0u16; 256];
    red.copy_from_slice(&w[..256]);
    green.copy_from_slice(&w[256..512]);
    blue.copy_from_slice(&w[512..]);
    Ramp { red, green, blue }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn warmth_zero_is_identity() {
        assert_eq!(build_ramp(0), identity_ramp());
    }

    #[test]
    fn ramp_survives_disk_roundtrip() {
        let dir = std::env::temp_dir().join(format!("ss-gamma-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("g.bin");
        let ramp = build_ramp(45);
        save_to_path(&path, &ramp).unwrap();
        let back = load_from_path(&path).unwrap();
        assert_eq!(back, ramp);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn missing_or_short_disk_file_is_none() {
        let dir = std::env::temp_dir().join(format!("ss-gamma2-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("yok.bin");
        assert!(load_from_path(&path).is_none());
        std::fs::write(&path, [0u8; 10]).unwrap();
        assert!(load_from_path(&path).is_none());
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn warmth_clamped_to_100() {
        assert_eq!(build_ramp(150), build_ramp(100));
        assert_eq!(build_ramp(255), build_ramp(100));
    }

    #[test]
    fn full_warmth_cuts_blue_and_keeps_red() {
        let r = build_ramp(100);
        assert_eq!(r.red[255], 65535, "kirmizi korunmali");
        let g = r.green[255] as f32 / 65535.0;
        let b = r.blue[255] as f32 / 65535.0;
        assert!((g - FULL_GREEN).abs() < 0.01, "yesil oran: {g}");
        assert!((b - FULL_BLUE).abs() < 0.01, "mavi oran: {b}");
        assert!(r.blue[255] < r.green[255]);
        assert!(r.green[255] < r.red[255]);
    }

    #[test]
    fn red_channel_preserved_at_every_warmth() {
        for w in [0u8, 25, 50, 75, 100] {
            assert_eq!(build_ramp(w).red, identity_channel(), "warmth={w}");
        }
    }

    #[test]
    fn monotonic_for_every_warmth() {
        for w in 0..=100u8 {
            assert!(is_monotonic(&build_ramp(w)), "warmth={w} monoton degil");
        }
    }

    #[test]
    fn within_driver_limits_for_every_warmth() {
        for w in 0..=100u8 {
            assert!(
                within_driver_limits(&build_ramp(w)),
                "warmth={w} sinir asiyor"
            );
        }
    }

    #[test]
    fn identity_ramp_is_valid() {
        let id = identity_ramp();
        assert!(is_monotonic(&id));
        assert!(within_driver_limits(&id));
    }

    #[test]
    fn scale_clamps_total_blackout() {
        // Kotu niyetli carpan (0.0) bile sinirlari asamaz, monotonluk bozulmaz.
        let flat = scale_channel(&identity_channel(), 0.0);
        let r = Ramp {
            red: flat,
            green: flat,
            blue: flat,
        };
        assert!(is_monotonic(&r));
        assert!(within_driver_limits(&r));
    }

    #[test]
    fn scale_clamps_overshoot() {
        // 1.5 carpan bile ust siniri (identity+32768 ve 65535) asamaz.
        let hot = scale_channel(&identity_channel(), 1.5);
        let r = Ramp {
            red: hot,
            green: hot,
            blue: hot,
        };
        assert!(within_driver_limits(&r));
        assert!(is_monotonic(&r));
        assert_eq!(r.red[255], 65535);
    }

    #[test]
    fn detects_limit_violation() {
        let mut r = identity_ramp();
        r.red[10] = 60000; // identity=2570; sapma 57430 > 32768
        assert!(!within_driver_limits(&r));
    }

    #[test]
    fn detects_monotonicity_break() {
        let mut r = identity_ramp();
        r.blue[200] = 65535;
        r.blue[201] = 1000; // duser
        assert!(!is_monotonic(&r));
    }

    #[test]
    fn words_roundtrip() {
        let r = build_ramp(60);
        assert_eq!(from_words(&to_words(&r)), r);
        // GDI duzeni: ilk 256 kirmizi, sonda mavi.
        let w = to_words(&r);
        assert_eq!(&w[..256], &r.red[..]);
        assert_eq!(&w[512..], &r.blue[..]);
    }

    #[test]
    fn sanitize_strips_win32_device_prefix() {
        assert_eq!(sanitize_device("\\\\.\\DISPLAY1"), "DISPLAY1");
        assert_eq!(sanitize_device("\\\\.\\DISPLAY10"), "DISPLAY10");
        assert_eq!(sanitize_device("DISPLAY2"), "DISPLAY2");
    }

    #[test]
    fn sanitize_replaces_odd_characters() {
        assert_eq!(sanitize_device("\\\\.\\DISPLAY 1"), "DISPLAY_1");
        assert_eq!(sanitize_device("\\\\.\\DISPLAY/1"), "DISPLAY_1");
        // Bos kalirsa dosya adi bos parca uretmesin.
        assert_eq!(sanitize_device("\\\\.\\"), "DISPLAY");
        assert_eq!(sanitize_device(""), "DISPLAY");
    }

    #[test]
    fn gamma_file_name_uses_sanitized_device() {
        assert_eq!(
            gamma_file_name("\\\\.\\DISPLAY1"),
            "smart-screen-gamma-DISPLAY1.bin"
        );
        assert_eq!(
            gamma_file_name("\\\\.\\DISPLAY2"),
            "smart-screen-gamma-DISPLAY2.bin"
        );
    }

    #[test]
    fn key_from_file_name_matches_only_per_device_files() {
        assert_eq!(
            key_from_file_name("smart-screen-gamma-DISPLAY1.bin"),
            Some("DISPLAY1")
        );
        // Eski tek dosya kalipta degil; migrasyonla ele alinir.
        assert_eq!(key_from_file_name(LEGACY_GAMMA_NAME), None);
        assert_eq!(key_from_file_name("smart-screen.log"), None);
    }

    #[test]
    fn device_from_key_roundtrips_sanitize() {
        let device = "\\\\.\\DISPLAY3";
        assert_eq!(device_from_key(&sanitize_device(device)), device);
    }

    fn temp_gamma_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ss-gamma-mig-{tag}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn legacy_file_is_moved_to_per_device_name() {
        let dir = temp_gamma_dir("move");
        let legacy = dir.join(LEGACY_GAMMA_NAME);
        std::fs::write(&legacy, [0u8; 768 * 2]).unwrap();
        migrate_legacy_in(&dir, "\\\\.\\DISPLAY1").unwrap();
        assert!(!legacy.exists(), "eski dosya kalmamali");
        assert!(
            dir.join("smart-screen-gamma-DISPLAY1.bin").exists(),
            "per-cihaz adina tasinmali"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn legacy_file_is_absorbed_when_target_exists() {
        let dir = temp_gamma_dir("absorb");
        let legacy = dir.join(LEGACY_GAMMA_NAME);
        let target = dir.join("smart-screen-gamma-DISPLAY1.bin");
        std::fs::write(&legacy, [1u8; 768 * 2]).unwrap();
        std::fs::write(&target, [2u8; 768 * 2]).unwrap();
        migrate_legacy_in(&dir, "\\\\.\\DISPLAY1").unwrap();
        assert!(!legacy.exists(), "eski kayit absorbe edilip silinmeli");
        assert_eq!(
            std::fs::read(&target).unwrap(),
            vec![2u8; 768 * 2],
            "hedef kayit ezilmemeli"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn legacy_migration_without_legacy_is_noop() {
        let dir = temp_gamma_dir("noop");
        migrate_legacy_in(&dir, "\\\\.\\DISPLAY1").unwrap();
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0);
        std::fs::remove_dir_all(&dir).ok();
    }

    /// Gercek donanim testi: SetDeviceGammaRamp'i gercekten cagirir ve
    /// sonunda ekrani geri duzeltir. Varsayilan olarak atlanir:
    /// `cargo test -- --ignored`
    #[test]
    #[ignore = "gercek surucu cagrisi yapar; elle kosulmali"]
    fn live_apply_and_restore() {
        let device = primary_device();
        let orig = read_ramp(&device).expect("rampa okunamadi");
        let warm = build_ramp(100);
        apply_ramp(&device, &warm).expect("sicak rampa uygulanamadi");
        let now = read_ramp(&device).expect("rampa tekrar okunamadi");
        // Once orijinali geri koy; o gecemezse identity ile duzelt.
        if apply_raw(&device, &orig).is_err() {
            apply_raw(&device, &identity_ramp()).expect("identity rampa geri konamadi");
        }
        assert_eq!(now, warm, "uygulanan rampa geri okunamadi");
    }
}
