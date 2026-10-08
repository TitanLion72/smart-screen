//! Ekranin renk sicakligini gamma rampasi ile kaydirir (gun batimi sicak tonu).
//!
//! SetDeviceGammaRamp surucu sezgileri yuzunden sessizce basarisiz olur:
//! "any entry in the ramp must be within 32768 of the identity value".
//! Bu yuzden rampa iyimser ama sinirli kayar (warmth=100'de bile),
//! her kanal monoton artar, girisler identity-32768..identity+32768
//! araliginda kalir ve 0-65535'e kelepcelenir. Ekrana cikis ya da
//! cozunurluk degisiminde surucu rampayi sifirlayabilir; kapanista
//! cagiranin read_ramp ile sakladigi orijinali geri koymasi gerekir.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use windows::Win32::Graphics::Gdi::{GetDC, ReleaseDC};
use windows::Win32::UI::ColorSystem::{GetDeviceGammaRamp, SetDeviceGammaRamp};

/// Sicak ton uygulanmadan once ekranin rampasi buraya saklanir; kapatilirken
/// geri yuklenir (monitor/Windows renk kalibrasyonu silinmesin).
static ORIGINAL: Mutex<Option<Ramp>> = Mutex::new(None);

/// Surucunun kabul ettigi identity'den maksimum sapma (Microsoft dokumu).
const MAX_DEVIATION: i32 = 32768;

/// warmth=100 hedef carpanlari: kirmizi korunur, mavi en cok kisilir.
const FULL_RED: f32 = 1.0;
const FULL_GREEN: f32 = 0.88;
const FULL_BLUE: f32 = 0.72;

/// 3x256 gamma rampasi; her giris 0-65535 (WORD).
#[derive(Clone, Debug, PartialEq)]
pub struct Ramp {
    pub red: [u16; 256],
    pub green: [u16; 256],
    pub blue: [u16; 256],
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

/// Rampayi birincil ekrana uygular. Once dogrular (sinir ihlalinde
/// surucu sessizce basarisiz olur), sonra GetDC(NULL) ile uygular
/// ve DC'yi geri birakir.
pub fn apply_ramp(r: &Ramp) -> Result<(), String> {
    validate(r)?;
    let words = to_words(r);
    let hdc = unsafe { GetDC(None) };
    if hdc.0.is_null() {
        return Err("GetDC(NULL) HDC dondurmedi".into());
    }
    let ok = unsafe { SetDeviceGammaRamp(hdc, words.as_ptr() as *const core::ffi::c_void) };
    let _ = unsafe { ReleaseDC(None, hdc) };
    if ok.as_bool() {
        Ok(())
    } else {
        Err("SetDeviceGammaRamp basarisiz oldu".into())
    }
}

/// Ekrandan gecerli rampayi okur (baslangicta orijinali saklamak icin).
pub fn read_ramp() -> Result<Ramp, String> {
    let mut words = [0u16; 768];
    let hdc = unsafe { GetDC(None) };
    if hdc.0.is_null() {
        return Err("GetDC(NULL) HDC dondurmedi".into());
    }
    let ok = unsafe { GetDeviceGammaRamp(hdc, words.as_mut_ptr() as *mut core::ffi::c_void) };
    let _ = unsafe { ReleaseDC(None, hdc) };
    if !ok.as_bool() {
        return Err("GetDeviceGammaRamp basarisiz oldu".into());
    }
    Ok(from_words(&words))
}

/// Sicakligi uygular: build + validate + apply. Ilk uygulamadan once ekranin
/// mevcut rampasi saklanir. warmth=0 verilirse geri yukler.
pub fn set_warmth(warmth: u8) -> Result<(), String> {
    if warmth == 0 {
        return restore_original();
    }
    capture_original()?;
    let ramp = build_ramp(warmth);
    validate(&ramp)?;
    apply_ramp(&ramp)
}

/// Saklanan orijinali geri yukler; hicbir sey saklanmadiysa identity
/// (yani monitor kalibrasyonu yoksa varsayilana doner).
pub fn restore_original() -> Result<(), String> {
    let disk = gamma_file().ok().and_then(|p| load_from_path(&p));
    let stored = {
        let mut guard = ORIGINAL
            .lock()
            .map_err(|_| "gamma kilidi bozuk".to_string())?;
        guard.take()
    };
    let ramp = stored.or(disk).unwrap_or_else(identity_ramp);
    let _ = clear_original();
    apply_ramp(&ramp)
}

/// Onceki oturumdan kalma sicak tonu temizler (crash sonrasi).
/// Diskte kayit yoksa hicbir sey yapmaz.
pub fn recover() {
    if let Some(ramp) = gamma_file().ok().and_then(|p| load_from_path(&p)) {
        let _ = apply_ramp(&ramp);
        let _ = clear_original();
    }
}

/// Sicak tonu uygulamadan once ekranin rampasini saklar (bellek + disk).
pub fn capture_original() -> Result<(), String> {
    {
        let guard = ORIGINAL
            .lock()
            .map_err(|_| "gamma kilidi bozuk".to_string())?;
        if guard.is_some() {
            return Ok(());
        }
    }
    let ramp = read_ramp()?;
    if let Ok(p) = gamma_file() {
        let _ = save_to_path(&p, &ramp);
    }
    let mut guard = ORIGINAL
        .lock()
        .map_err(|_| "gamma kilidi bozuk".to_string())?;
    *guard = Some(ramp);
    Ok(())
}

fn clear_original() -> Result<(), String> {
    if let Ok(p) = gamma_file() {
        let _ = std::fs::remove_file(p);
    }
    Ok(())
}

fn gamma_file() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE").map_err(|e| format!("USERPROFILE yok: {e}"))?;
    Ok(PathBuf::from(home)
        .join(".config")
        .join("opencode")
        .join("smart-screen-gamma.bin"))
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

/// Dosyadan rampa okur; dosya yoksa/bos ise None.
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

/// Kimlik rampasi (uc kanal da identity).
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
    Ramp {
        red: w[..256].try_into().unwrap(),
        green: w[256..512].try_into().unwrap(),
        blue: w[512..].try_into().unwrap(),
    }
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

    /// Gercek donanim testi: SetDeviceGammaRamp'i gercekten cagirir ve
    /// sonunda ekrani geri duzeltir. Varsayilan olarak atlanir:
    /// `cargo test -- --ignored`
    #[test]
    #[ignore = "gercek surucu cagrisi yapar; elle kosulmali"]
    fn live_apply_and_restore() {
        let orig = read_ramp().expect("rampa okunamadi");
        let warm = build_ramp(100);
        apply_ramp(&warm).expect("sicak rampa uygulanamadi");
        let now = read_ramp().expect("rampa tekrar okunamadi");
        // Once orijinali geri koy; o gecemezse identity ile duzelt.
        if apply_ramp(&orig).is_err() {
            apply_ramp(&identity_ramp()).expect("identity rampa geri konamadi");
        }
        assert_eq!(now, warm, "uygulanan rampa geri okunamadi");
    }
}
