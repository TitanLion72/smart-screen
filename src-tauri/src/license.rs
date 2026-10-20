//! Offline Ed25519 lisans dogrulamasi (Pro = harici monitor DDC kontrolu).
//!
//! Anahtar uretimi disarida yapilir (`tools/license-gen.mjs`); gizli anahtar
//! uygulamaya hic girmez, yalnizca asagidaki acik anahtar gomuludur.
//!
//! Anahtar bicimi (uretici ile bu modul birebir aynidir):
//!   1. payload = "v1|<email>|<YYYY-MM-DD>" (UTF-8)
//!   2. imza    = Ed25519(payload baytlari), 64 bayt
//!   3. blob    = u16 BIG-ENDIAN payload_uzunlugu + payload + imza
//!   4. key     = "SS-" + CrockfordBase32(blob), 5'lik gruplar arasinda '-'
//!
//! Crockford alfabesi: 0123456789ABCDEFGHJKMNPQRSTVWXYZ (I, L, O, U yok).
//! Cozumleme buyuk harfe cevirir, '-' / bosluk / satir sonunu atar; bilinmeyen
//! karakter hatadir. Gruplama ve son gruptaki fazla bit padding'i tolerantir.

use std::fs;
use std::path::{Path, PathBuf};

use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};

/// Urunun Ed25519 acik anahtari (32 bayt). Karsiligi olan gizli anahtar repoya
/// girmez; yalnizca anahtar uretimi sirasinda (disarida) kullanilir.
const PROD_PUBLIC_KEY: [u8; 32] = [
    0xc2, 0xb3, 0x48, 0x3b, 0x3f, 0x4e, 0x1e, 0x71, 0xaf, 0x18, 0xdf, 0xfe, 0xed, 0xb4, 0x91, 0xc6,
    0xb2, 0x85, 0x30, 0xe2, 0xe3, 0x88, 0x0c, 0x79, 0x05, 0x0a, 0x16, 0x32, 0xf5, 0x2c, 0x50, 0x33,
];

const ERR_FORMAT: &str = "lisans anahtarı geçersiz (biçim)";
const ERR_SIGNATURE: &str = "lisans anahtarı geçersiz (imza)";
const ERR_VERSION: &str = "lisans anahtarı geçersiz (sürüm)";

const CROCKFORD_ALPHABET: [u8; 32] = *b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// Lisans durumu: Pro acik mi, kimde ve ne zaman verilmis.
#[derive(Clone, Debug, Serialize)]
pub struct LicenseStatus {
    pub pro: bool,
    pub email: Option<String>,
    pub issued: Option<String>,
}

/// Depodaki dosya semasi: yalnizca anahtarin kendisi.
#[derive(Serialize, Deserialize)]
struct Store {
    key: String,
}

/// Lisans deposu: `~/.config/opencode/smart-screen-license.json`
/// (prefs.rs ile ayni dizin cozumlemesi, USERPROFILE tabanli).
fn store_path() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE").map_err(|e| format!("USERPROFILE yok: {e}"))?;
    Ok(PathBuf::from(home)
        .join(".config")
        .join("opencode")
        .join("smart-screen-license.json"))
}

/// Depodaki anahtari okur + yeniden dogrular. Gecersizse pro=false.
pub fn status() -> LicenseStatus {
    match store_path() {
        Ok(path) => status_with(&path, &PROD_PUBLIC_KEY),
        Err(_) => no_license(),
    }
}

/// Anahtari dogrular; gecerliyse depoya yazar (atomik temp+rename).
pub fn activate(key: &str) -> Result<LicenseStatus, String> {
    let path = store_path()?;
    activate_with(&path, key, &PROD_PUBLIC_KEY)
}

/// Depoyu siler (yoksa sessiz) ve guncel durumu dondurur.
pub fn deactivate() -> LicenseStatus {
    match store_path() {
        Ok(path) => deactivate_with(&path, &PROD_PUBLIC_KEY),
        Err(_) => no_license(),
    }
}

/// Pro kapilari icin ucuz sorgu (dogrulama her cagrida tazelenir).
pub fn is_pro() -> bool {
    status().pro
}

fn no_license() -> LicenseStatus {
    LicenseStatus {
        pro: false,
        email: None,
        issued: None,
    }
}

/// Anahtari cozumleyip imzayi dogrular; gecerliyse (email, verilis tarihi) doner.
/// Acik anahtar parametrik tutuldu ki birim testleri kendi anahtariyla calissin.
fn verify_with(key: &str, public: &[u8; 32]) -> Result<(String, String), String> {
    let blob = decode_key(key)?;
    // 2 bayt uzunluk + payload + 64 bayt imza.
    if blob.len() < 2 + 64 {
        return Err(ERR_FORMAT.to_string());
    }
    let payload_len = usize::from(u16::from_be_bytes([blob[0], blob[1]]));
    let sig_start = 2 + payload_len;
    if payload_len == 0 || blob.len() != sig_start + 64 {
        return Err(ERR_FORMAT.to_string());
    }
    let payload = &blob[2..sig_start];
    let signature =
        Signature::from_slice(&blob[sig_start..]).map_err(|_| ERR_SIGNATURE.to_string())?;
    let verifying = VerifyingKey::from_bytes(public).map_err(|_| ERR_SIGNATURE.to_string())?;
    verifying
        .verify_strict(payload, &signature)
        .map_err(|_| ERR_SIGNATURE.to_string())?;
    // Imza gecerli; simdi payload semasi.
    let text = std::str::from_utf8(payload).map_err(|_| ERR_FORMAT.to_string())?;
    let parts: Vec<&str> = text.split('|').collect();
    if parts.len() != 3 {
        return Err(ERR_FORMAT.to_string());
    }
    if parts[0] != "v1" {
        return Err(ERR_VERSION.to_string());
    }
    if parts[1].is_empty() || parts[2].is_empty() {
        return Err(ERR_FORMAT.to_string());
    }
    Ok((parts[1].to_string(), parts[2].to_string()))
}

/// Anahtari normalize edip ("SS-" oneki dahil tum ayraclar atilir) Crockford
/// Base32 govdeyi bayta cevirir.
fn decode_key(key: &str) -> Result<Vec<u8>, String> {
    // Once normalizasyon: buyuk harf, '-' / bosluk / satir sonu yok.
    let normalized: String = key
        .chars()
        .filter(|c| !matches!(c, '-' | ' ' | '\t' | '\n' | '\r'))
        .map(|c| c.to_ascii_uppercase())
        .collect();
    // Normalizeda "SS-" oneki "SS" olur.
    let body = normalized
        .strip_prefix("SS")
        .ok_or_else(|| ERR_FORMAT.to_string())?;
    crockford_decode(body)
}

/// Crockford Base32 cozumleme: '-', bosluk ve satir sonlari atlanir; buyuk/kucuk
/// harf fark etmez. Son gruptaki eksik bitler (padding) tolerantca yok sayilir.
fn crockford_decode(input: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(input.len() * 5 / 8 + 1);
    let mut acc: u32 = 0;
    let mut bits: u32 = 0;
    for c in input.chars() {
        if matches!(c, '-' | ' ' | '\t' | '\n' | '\r') {
            continue;
        }
        let upper = c.to_ascii_uppercase();
        // `as u8` truncation'a kacmasin diye karsilastirma char uzerinden.
        let value = CROCKFORD_ALPHABET
            .iter()
            .position(|&a| a as char == upper)
            .ok_or_else(|| ERR_FORMAT.to_string())?;
        acc = (acc << 5) | value as u32;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1u32 << bits) - 1;
        }
    }
    Ok(out)
}

fn read_store(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    let store: Store = serde_json::from_str(&text).ok()?;
    (!store.key.is_empty()).then_some(store.key)
}

/// Anahtari atomik yazar (temp + rename, prefs.rs ev stili).
fn write_store(path: &Path, key: &str) -> Result<(), String> {
    let text = serde_json::to_string_pretty(&Store {
        key: key.to_string(),
    })
    .map_err(|e| format!("lisans dosyası yazılamadı: {e}"))?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("lisans dizini oluşturulamadı: {e}"))?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, text + "\n").map_err(|e| format!("lisans dosyası yazılamadı: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("lisans dosyası yazılamadı: {e}"))?;
    Ok(())
}

fn status_with(path: &Path, public: &[u8; 32]) -> LicenseStatus {
    let Some(key) = read_store(path) else {
        return no_license();
    };
    match verify_with(&key, public) {
        Ok((email, issued)) => LicenseStatus {
            pro: true,
            email: Some(email),
            issued: Some(issued),
        },
        Err(_) => no_license(),
    }
}

fn activate_with(path: &Path, key: &str, public: &[u8; 32]) -> Result<LicenseStatus, String> {
    let (email, issued) = verify_with(key, public)?;
    write_store(path, key)?;
    Ok(LicenseStatus {
        pro: true,
        email: Some(email),
        issued: Some(issued),
    })
}

fn deactivate_with(path: &Path, public: &[u8; 32]) -> LicenseStatus {
    // Dosya yoksa remove_file hata dondurur; bu sessiz gecilir.
    let _ = fs::remove_file(path);
    status_with(path, public)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    /// Verilen hex acik anahtar, derleme zamanindaki sabitle birebir ayni mi?
    #[test]
    fn prod_key_matches_documented_hex() {
        let hex = "c2b3483b3f4e1e71af18dffeedb491c6b28530e2e3880c79050a1632f52c5033";
        assert_eq!(hex32(hex), Some(PROD_PUBLIC_KEY));
        assert!(VerifyingKey::from_bytes(&PROD_PUBLIC_KEY).is_ok());
    }

    #[test]
    fn valid_key_roundtrips() {
        let sk = seed_key(1);
        let key = key_from_blob(&blob(&sk, "v1|user@mail.com|2026-10-20"));
        assert_eq!(
            verify_with(&key, &public_of(&sk)),
            Ok(("user@mail.com".to_string(), "2026-10-20".to_string()))
        );
    }

    #[test]
    fn corrupted_signature_is_signature_error() {
        let sk = seed_key(2);
        let mut b = blob(&sk, "v1|user@mail.com|2026-10-20");
        let sig_at = b.len() - 64;
        b[sig_at] ^= 0x01;
        assert_eq!(
            verify_with(&key_from_blob(&b), &public_of(&sk)),
            Err(ERR_SIGNATURE.to_string())
        );
    }

    #[test]
    fn tampered_payload_is_signature_error() {
        let sk = seed_key(3);
        let mut b = blob(&sk, "v1|user@mail.com|2026-10-20");
        b[2] = b'X'; // payload'un ilk bayti
        assert_eq!(
            verify_with(&key_from_blob(&b), &public_of(&sk)),
            Err(ERR_SIGNATURE.to_string())
        );
    }

    #[test]
    fn wrong_version_is_version_error() {
        let sk = seed_key(4);
        let key = key_from_blob(&blob(&sk, "v2|user@mail.com|2026-10-20"));
        assert_eq!(
            verify_with(&key, &public_of(&sk)),
            Err(ERR_VERSION.to_string())
        );
    }

    #[test]
    fn short_blob_is_format_error() {
        let sk = seed_key(5);
        let key = key_from_blob(&[0x00, 0x01, 0x41]);
        assert_eq!(
            verify_with(&key, &public_of(&sk)),
            Err(ERR_FORMAT.to_string())
        );
    }

    #[test]
    fn empty_and_prefixless_keys_are_format_error() {
        let sk = seed_key(6);
        let pk = public_of(&sk);
        for key in ["", "  ", "ABCDEF", "XX-AAAA"] {
            assert_eq!(verify_with(key, &pk), Err(ERR_FORMAT.to_string()), "{key}");
        }
    }

    #[test]
    fn garbage_characters_are_format_error() {
        let sk = seed_key(7);
        let pk = public_of(&sk);
        // '!' rakam degil, 'U' alfabede yok, 'İ' ASCII disi (truncation tuzağı).
        for key in ["SS-ABC!DEF", "SS-AAAAU", "SS-ABCDİ"] {
            assert_eq!(verify_with(key, &pk), Err(ERR_FORMAT.to_string()), "{key}");
        }
    }

    #[test]
    fn grouping_lowercase_and_whitespace_are_tolerated() {
        let sk = seed_key(8);
        let key = key_from_blob(&blob(&sk, "v1|user@mail.com|2026-10-20"));
        let messy = format!("\n  {}  \n", key.to_lowercase().replace('-', " - "));
        assert!(verify_with(&messy, &public_of(&sk)).is_ok());
        // Gruplamasiz tek satir da ayni sonucu vermeli.
        let bare = format!("SS-{}", key[3..].replace('-', ""));
        assert!(verify_with(&bare, &public_of(&sk)).is_ok());
    }

    #[test]
    fn zero_bytes_in_signature_are_tolerated() {
        // Imzasi icerisinde 0x00 bayti olan bir tohum bul (kesin var: ~%92).
        let payload = "v1|a@b.c|2026-10-20";
        let mut hit = None;
        for seed in 0u8..=255 {
            let sk = seed_key(seed);
            let b = blob(&sk, payload);
            if b[b.len() - 64..].contains(&0) {
                hit = Some((sk, b));
                break;
            }
        }
        let (sk, b) = hit.expect("imzasinda sifir bayt olan tohum bulunmali");
        assert_eq!(
            verify_with(&key_from_blob(&b), &public_of(&sk)),
            Ok(("a@b.c".to_string(), "2026-10-20".to_string()))
        );
    }

    #[test]
    fn length_prefix_mismatch_is_format_error() {
        let sk = seed_key(9);
        let mut b = blob(&sk, "v1|user@mail.com|2026-10-20");
        b.push(0x00); // imza sonuna fazladan bayt
        assert_eq!(
            verify_with(&key_from_blob(&b), &public_of(&sk)),
            Err(ERR_FORMAT.to_string())
        );
        let mut b2 = blob(&sk, "v1|user@mail.com|2026-10-20");
        b2[1] = b2[1].wrapping_add(1); // u16 uzunluk oneki yanlis
        assert_eq!(
            verify_with(&key_from_blob(&b2), &public_of(&sk)),
            Err(ERR_FORMAT.to_string())
        );
    }

    #[test]
    fn wrong_public_key_rejects_valid_key() {
        let sk = seed_key(10);
        let other = seed_key(11);
        let key = key_from_blob(&blob(&sk, "v1|user@mail.com|2026-10-20"));
        assert_eq!(
            verify_with(&key, &public_of(&other)),
            Err(ERR_SIGNATURE.to_string())
        );
    }

    #[test]
    fn activate_status_deactivate_cycle() {
        let sk = seed_key(12);
        let pk = public_of(&sk);
        let path = tmp("cycle");
        let key = key_from_blob(&blob(&sk, "v1|pro@mail.com|2026-10-20"));

        let st = activate_with(&path, &key, &pk).unwrap();
        assert!(st.pro);
        assert_eq!(st.email.as_deref(), Some("pro@mail.com"));
        assert_eq!(st.issued.as_deref(), Some("2026-10-20"));

        let st = status_with(&path, &pk);
        assert!(st.pro, "yeniden dogrulama basarili olmali");
        assert_eq!(st.email.as_deref(), Some("pro@mail.com"));

        let st = deactivate_with(&path, &pk);
        assert!(!st.pro);
        assert!(st.email.is_none());
        assert!(!path.exists(), "depo silinmeli");
        // Ikinci deaktivasyon sessiz gecmeli.
        assert!(!deactivate_with(&path, &pk).pro);
        fs::remove_file(&path).ok();
    }

    #[test]
    fn invalid_key_is_rejected_and_not_stored() {
        let sk = seed_key(13);
        let pk = public_of(&sk);
        let path = tmp("reject");
        for bad in [
            "SS-ABC!DEF",
            "SS-AAAA",
            &key_from_blob(&blob(&sk, "v2|a@b.c|2026-10-20")),
        ] {
            assert!(activate_with(&path, bad, &pk).is_err(), "{bad}");
            assert!(!path.exists(), "gecersiz anahtar depoya yazilmamali");
            assert!(!status_with(&path, &pk).pro);
        }
        fs::remove_file(&path).ok();
    }

    #[test]
    fn stored_but_corrupt_key_gives_pro_false() {
        let sk = seed_key(14);
        let pk = public_of(&sk);
        let path = tmp("corrupt");
        let mut b = blob(&sk, "v1|pro@mail.com|2026-10-20");
        let last = b.len() - 1;
        b[last] ^= 0xff;
        write_store(&path, &key_from_blob(&b)).unwrap();
        let st = status_with(&path, &pk);
        assert!(!st.pro);
        assert!(st.email.is_none());
        fs::remove_file(&path).ok();
    }

    #[test]
    #[ignore = "uretici anahtari gerektirir: once node tools/license-gen.mjs, sonra SMART_SCREEN_TEST_LICENSE ortam degiskenine tek satir anahtari"]
    fn live_generated_key_verifies_with_prod_key() {
        let key = std::env::var("SMART_SCREEN_TEST_LICENSE")
            .expect("SMART_SCREEN_TEST_LICENSE tanimli olmali");
        let (email, issued) =
            verify_with(&key, &PROD_PUBLIC_KEY).expect("uretici anahtari gecerli olmali");
        assert!(!email.is_empty());
        assert!(!issued.is_empty());
    }

    // --- test yardimcilari ---

    fn seed_key(seed: u8) -> SigningKey {
        SigningKey::from_bytes(&[seed; 32])
    }

    fn public_of(sk: &SigningKey) -> [u8; 32] {
        sk.verifying_key().to_bytes()
    }

    /// payload + u16 BE uzunluk oneki + imza -> blob.
    fn blob(sk: &SigningKey, payload: &str) -> Vec<u8> {
        let msg = payload.as_bytes();
        let sig = sk.sign(msg);
        let mut out = Vec::with_capacity(2 + msg.len() + 64);
        out.extend_from_slice(&u16::try_from(msg.len()).unwrap().to_be_bytes());
        out.extend_from_slice(msg);
        out.extend_from_slice(&sig.to_bytes());
        out
    }

    fn key_from_blob(blob: &[u8]) -> String {
        format!("SS-{}", group(&crockford_encode(blob)))
    }

    fn group(body: &str) -> String {
        let mut out = String::new();
        for (i, c) in body.chars().enumerate() {
            if i > 0 && i % 5 == 0 {
                out.push('-');
            }
            out.push(c);
        }
        out
    }

    /// Ureticideki encoder ile ayni: 5 bitlik semboller, son grup sifir bit
    /// ile doldurulur.
    fn crockford_encode(bytes: &[u8]) -> String {
        let mut out = String::new();
        let mut acc: u32 = 0;
        let mut bits: u32 = 0;
        for &b in bytes {
            acc = (acc << 8) | u32::from(b);
            bits += 8;
            while bits >= 5 {
                bits -= 5;
                out.push(CROCKFORD_ALPHABET[((acc >> bits) & 31) as usize] as char);
            }
        }
        if bits > 0 {
            out.push(CROCKFORD_ALPHABET[((acc << (5 - bits)) & 31) as usize] as char);
        }
        out
    }

    fn hex32(s: &str) -> Option<[u8; 32]> {
        let bytes = s.as_bytes();
        if bytes.len() != 64 {
            return None;
        }
        let mut out = [0u8; 32];
        for (i, slot) in out.iter_mut().enumerate() {
            let hi = (bytes[i * 2] as char).to_digit(16)?;
            let lo = (bytes[i * 2 + 1] as char).to_digit(16)?;
            *slot = (hi * 16 + lo) as u8;
        }
        Some(out)
    }

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ss-license-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir.join(format!("{name}.json"))
    }
}
