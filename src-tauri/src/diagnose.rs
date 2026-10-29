// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! Sistem tanılama — "bir şey çalışmıyorsa **neden**" sorusunun ürün içi cevabı.
//!
//! Bugüne kadar bu cevap yalnız `smart-screen.log` içindeydi: DDC/CI desteği,
//! HDR engeli, gamma sürücüsünün yazımı kabul edip etmediği, parlaklık
//! yazımının tutup tutmadığı... Hepsi log'a gömülüydü ve kullanıcı "olmadı"
//! diyene kadar kimse fark etmiyordu (PLAN-v3 §3/B5). Bu modül aynı bilgileri
//! tek tıkla, sade Türkçe ve **ölçümle** verir.
//!
//! Tasarım kuralları:
//!   - **Yan etkisi görünür olan yazma yok.** Parlaklık testi ekrandaki
//!     değerin AYNISINI yazar (görünür değişiklik yok, yol doğrulanır).
//!   - **Sıcak ton kapalıyken rampa yazılmaz.** `warmth == 0` ise yalnız
//!     okunur; kimlik rampa yazmak kullanıcının kalibrasyonunu ezerdi
//!     (AGENTS: "off'ta her turda kimlik rampa yazma").
//!   - Her kontrol **saf bir fonksiyona** ayrılmıştır: G/Ç sonucu `Result`
//!     olarak verilir, karar testte doğrulanır.

use serde::Serialize;

use crate::{autostart, brightness, gamma, hdr, license, logger, monitor, theme};

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Check {
    /// Kararlı kimlik (QA ve rapor ayrıştırması bunu kullanır).
    pub id: String,
    pub label: String,
    /// `ok` | `warn` | `bad`
    pub status: String,
    pub detail: String,
    /// Sorun varsa "ne yapmalı" — boş olabilir.
    pub hint: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct Report {
    pub version: String,
    pub os: String,
    pub checks: Vec<Check>,
}

fn check(id: &str, label: &str, status: &str, detail: impl Into<String>, hint: &str) -> Check {
    Check {
        id: id.to_string(),
        label: label.to_string(),
        status: status.to_string(),
        detail: detail.into(),
        hint: hint.to_string(),
    }
}

// ── parlaklık ────────────────────────────────────────────────────────

pub fn brightness_read_check(read: &Result<u8, String>) -> Check {
    match read {
        Ok(v) => check(
            "bright_read",
            "Parlaklık okuma",
            "ok",
            format!("şu an %{v}"),
            "",
        ),
        Err(e) => check(
            "bright_read",
            "Parlaklık okuma",
            "bad",
            format!("okunamadı: {e}"),
            "Laptop paneli WMI üzerinden okunamıyor. Harici monitör kullanıyorsan bu normaldir.",
        ),
    }
}

/// Yazma testi: ekrandaki değerin **aynısı** yazılır, sonra geri okunur.
/// Görünür değişiklik yok; yalnız "sürücü yazımı kabul ediyor mu" ölçülür.
pub fn brightness_write_check(read: &Result<u8, String>, written: &Result<u8, String>) -> Check {
    let Some(before) = read.as_ref().ok() else {
        return check(
            "bright_write",
            "Parlaklık yazma",
            "warn",
            "okuma başarısız olduğu için yazma denenmedi",
            "",
        );
    };
    match written {
        Ok(after) => {
            let delta = (*after as i16 - *before as i16).abs();
            if delta <= 2 {
                check(
                    "bright_write",
                    "Parlaklık yazma",
                    "ok",
                    format!("yazdı %{before}, geri okudu %{after} — sürücü kabul ediyor"),
                    "",
                )
            } else {
                check(
                    "bright_write",
                    "Parlaklık yazma",
                    "warn",
                    format!("yazdı %{before}, geri okudu %{after}"),
                    "Sürücü yazımı gecikmeli yansıtıyor olabilir; birkaç dakika sonra tekrar dene.",
                )
            }
        }
        Err(e) => check(
            "bright_write",
            "Parlaklık yazma",
            "bad",
            format!("reddedildi: {e}"),
            "Windows parlaklık arayüzü yazımı kabul etmiyor. Güç planı ya da üretici yazılımı kilitlemiş olabilir.",
        ),
    }
}

// ── sıcak ton ────────────────────────────────────────────────────────

/// `warmth > 0`: rampa yazıldı ve geri okundu. `(istenen, okunan)` mavi oranı.
pub fn gamma_write_check(warmth: u8, res: &Result<(u8, u8), String>) -> Check {
    match res {
        Ok((want, now)) => {
            let delta = (*want as i16 - *now as i16).abs();
            if delta <= 2 {
                check(
                    "gamma",
                    "Sıcak ton (sürücü)",
                    "ok",
                    format!("%{warmth} şiddet yazıldı — mavi %{now} (beklenen %{want})"),
                    "",
                )
            } else {
                check(
                    "gamma",
                    "Sıcak ton (sürücü)",
                    "bad",
                    format!("beklenen mavi %{want}, okunan %{now} — sürücü rampayı uygulamadı"),
                    "Ekran kartı sürücüsü gamma rampasını reddediyor. HDR açıksa kapat; oyun/renk yönetimi yazılımları da kilitleyebilir.",
                )
            }
        }
        Err(e) => check(
            "gamma",
            "Sıcak ton (sürücü)",
            "bad",
            format!("okunamadı: {e}"),
            "Gamma rampasına erişilemiyor; ekran kartı sürücüsünü güncelle.",
        ),
    }
}

/// `warmth == 0` (sıcak ton kapalı): **yazma yok**, yalnız mevcut mavi oranı.
pub fn gamma_readonly_check(cur: &Result<(u8, u8), String>) -> Check {
    match cur {
        Ok((_, now)) => check(
            "gamma",
            "Sıcak ton (sürücü)",
            "ok",
            format!("şu an mavi %{now} — sıcak ton kapalı, rampa yazılmadı"),
            "",
        ),
        Err(e) => check(
            "gamma",
            "Sıcak ton (sürücü)",
            "bad",
            format!("okunamadı: {e}"),
            "Gamma rampasına erişilemiyor; ekran kartı sürücüsünü güncelle.",
        ),
    }
}

// ── HDR ──────────────────────────────────────────────────────────────

pub fn hdr_check(infos: &[hdr::HdrInfo]) -> Check {
    let on: Vec<&str> = infos
        .iter()
        .filter(|i| i.hdr)
        .map(|i| i.device.as_str())
        .collect();
    if infos.is_empty() {
        return check(
            "hdr",
            "HDR",
            "warn",
            "HDR durumu okunamadı — kapalı kabul edildi",
            "",
        );
    }
    if on.is_empty() {
        check(
            "hdr",
            "HDR",
            "ok",
            format!(
                "{} monitörde kapalı — yazılımsal sıcak ton uygulanabilir",
                infos.len()
            ),
            "",
        )
    } else {
        check(
            "hdr",
            "HDR",
            "warn",
            format!("{} monitörde açık — orada sıcak ton uygulanmaz", on.len()),
            "Windows Ayarlar → Ekran → HDR'ı kapat; sıcak ton ancak HDR kapalıyken çalışır.",
        )
    }
}

// ── monitörler ───────────────────────────────────────────────────────

pub fn monitor_check(res: &Result<Vec<monitor::MonitorInfo>, String>) -> Check {
    let rows = match res {
        Ok(r) => r,
        Err(e) => {
            return check(
                "monitors",
                "Monitörler",
                "bad",
                format!("listelenemedi: {e}"),
                "Ekran bağlantısını denetle; sorun sürerse uygulamayı yeniden başlat.",
            )
        }
    };
    if rows.is_empty() {
        return check(
            "monitors",
            "Monitörler",
            "bad",
            "hiç monitör bulunamadı",
            "Ekran bağlantısını denetle; sorun sürerse uygulamayı yeniden başlat.",
        );
    }
    let internal = rows.iter().filter(|m| m.is_internal).count();
    let external = rows.len() - internal;
    let ddc = rows.iter().filter(|m| m.api == "ddc").count();
    let mut detail = format!("{} monitör · {internal} dahili", rows.len());
    if external > 0 {
        detail.push_str(&format!(" · {external} harici"));
    }
    if ddc > 0 {
        detail.push_str(&format!(" ({ddc} DDC/CI)"));
    }
    let hint = if external > 0 {
        "Harici monitör parlaklığı Pro gerektirir; DDC/CI desteklemiyorsa uygulanamaz."
    } else {
        ""
    };
    check("monitors", "Monitörler", "ok", detail, hint)
}

// ── diğer ────────────────────────────────────────────────────────────

pub fn theme_check(res: &Result<(String, Option<String>), String>) -> Check {
    match res {
        Ok((name, mode)) => check(
            "theme",
            "OpenCode teması",
            "ok",
            match mode {
                Some(m) => format!("{name} ({m})"),
                None => name.clone(),
            },
            "",
        ),
        Err(e) => check(
            "theme",
            "OpenCode teması",
            "warn",
            format!("okunamadı: {e}"),
            "OpenCode ayar dosyası (`cli.json`) bulunamadı; tema değiştirme devre dışı.",
        ),
    }
}

pub fn autostart_check(res: &Result<bool, String>) -> Check {
    match res {
        Ok(true) => check("autostart", "Açılışta başlat", "ok", "açık", ""),
        Ok(false) => check(
            "autostart",
            "Açılışta başlat",
            "warn",
            "kapalı — bilgisayar açılınca uygulama kendiliğinden başlamaz",
            "Ayarlar → Gelişmiş → \"Windows açılışında başlat\" anahtarını aç.",
        ),
        Err(e) => check(
            "autostart",
            "Açılışta başlat",
            "warn",
            format!("okunamadı: {e}"),
            "",
        ),
    }
}

pub fn license_check(s: &license::LicenseStatus) -> Check {
    if !s.pro {
        return check(
            "license",
            "Lisans",
            "ok",
            "ücretsiz sürüm (3 profil, harici monitör kapalı)",
            "",
        );
    }
    check(
        "license",
        "Lisans",
        "ok",
        match s.email.as_deref() {
            Some(m) => format!("Pro — {m}"),
            None => "Pro".to_string(),
        },
        "",
    )
}

/// Windows gece ışığı. Açıkken kendi gamma'mız yazılmaz (çifte sararma);
/// okunamıyorsa "bilinmiyor" denir — tahmin edilmez.
pub fn nightlight_check(state: Option<bool>) -> Check {
    let label = "Windows gece ışığı";
    match state {
        Some(true) => check(
            "night_light",
            label,
            "warn",
            "açık — kendi sıcak tonumuz uygulanmıyor",
            "Çifte sararma olmasın diye böyle. Gece ışığını kapatırsan sıcak ton devreye girer.",
        ),
        Some(false) => check(
            "night_light",
            label,
            "ok",
            "kapalı — sıcak tonu biz yönetiyoruz",
            "",
        ),
        // Tanınmayan blob şeması: "okunamadı" demek, "kapalı" demekten dürüst.
        None => check(
            "night_light",
            label,
            "ok",
            format!(
                "{} (Windows sürümü desteklemiyor) — davranış değişmedi",
                crate::nightlight::status_text(None)
            ),
            "",
        ),
    }
}

pub fn log_check(last: Option<&str>) -> Check {
    match last {
        Some(line) if !line.trim().is_empty() => {
            // Satır biçimi: `<yerel-iso> | source=...` — yalnız damgayı göster.
            let stamp = line.split('|').next().unwrap_or("").trim();
            check(
                "log",
                "Günlük",
                "ok",
                format!("yazılıyor — son kayıt {stamp}"),
                "",
            )
        }
        _ => check(
            "log",
            "Günlük",
            "warn",
            "henüz kayıt yok — ilk ölçümü bekle (bir dakika)",
            "",
        ),
    }
}

// ── orkestrasyon ─────────────────────────────────────────────────────

/// Tüm kontrolleri koşar. `warmth`: uygulamanın **şu an** kullandığı sıcak ton
/// şiddeti; `0` ise rampa **yazılmaz** (yalnız okunur).
pub fn run(warmth: u8) -> Report {
    let mut checks = Vec::with_capacity(9);

    // 1-2) Parlaklık: oku, aynı değeri yaz, geri oku.
    let read = brightness::get_brightness();
    checks.push(brightness_read_check(&read));
    let written = match read.as_ref() {
        Ok(v) => brightness::set_brightness(*v),
        Err(_) => Err("okuma başarısız".to_string()),
    };
    checks.push(brightness_write_check(&read, &written));

    // 3) Sıcak ton. Kapalıyken yazma yok (kalibrasyonu ezmemek için).
    if warmth == 0 {
        checks.push(gamma_readonly_check(&gamma::verify_warmth(0)));
    } else {
        let res = gamma::set_warmth(warmth).and_then(|()| gamma::verify_warmth(warmth));
        checks.push(gamma_write_check(warmth, &res));
    }

    // 4-5) HDR ve monitörler.
    checks.push(hdr_check(&hdr::list()));
    checks.push(monitor_check(&monitor::list()));

    // 5b) Windows gece ışığı: açıksa kendi sıcak tonumuz devre dışı (çifte
    // sararma olmasın). Bilinmiyorsa "tahmin yok" denir.
    checks.push(nightlight_check(crate::nightlight::status()));
    // 6-7) Tema ve otomatik başlatma.
    checks.push(theme_check(&theme::get_theme()));
    checks.push(autostart_check(&autostart::autostart_status()));

    // 8) Lisans.
    checks.push(license_check(&license::status()));

    // 9) Günlük yazılabiliyor mu.
    let last = logger::read_lines(1)
        .ok()
        .and_then(|v| v.into_iter().last());
    checks.push(log_check(last.as_deref()));

    Report {
        version: env!("CARGO_PKG_VERSION").to_string(),
        os: format!("{} · {}", std::env::consts::OS, std::env::consts::ARCH),
        checks,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok_read(v: u8) -> Result<u8, String> {
        Ok(v)
    }

    #[test]
    fn read_check_ok_and_bad() {
        let a = brightness_read_check(&ok_read(64));
        assert_eq!(a.status, "ok");
        assert!(a.detail.contains("%64"));

        let b = brightness_read_check(&Err("wmi yok".into()));
        assert_eq!(b.status, "bad");
        assert!(b.detail.contains("wmi yok"));
        assert!(!b.hint.is_empty());
    }

    #[test]
    fn write_check_tolerates_two_points() {
        assert_eq!(brightness_write_check(&ok_read(50), &Ok(52)).status, "ok");
        assert_eq!(brightness_write_check(&ok_read(50), &Ok(53)).status, "warn");
    }

    #[test]
    fn write_check_skipped_when_read_fails() {
        let c = brightness_write_check(&Err("yok".into()), &Err("yok".into()));
        assert_eq!(c.status, "warn");
        assert!(c.detail.contains("denenmedi"));
    }

    #[test]
    fn write_check_rejects_driver_error() {
        let c = brightness_write_check(&ok_read(40), &Err("surucu uygulamadi".into()));
        assert_eq!(c.status, "bad");
        assert!(c.detail.contains("surucu uygulamadi"));
    }

    #[test]
    fn gamma_write_verifies_readback() {
        let ok = gamma_write_check(70, &Ok((55, 56)));
        assert_eq!(ok.status, "ok");
        let bad = gamma_write_check(70, &Ok((55, 100)));
        assert_eq!(bad.status, "bad");
        assert!(bad.detail.contains("uygulamadı"));
    }

    #[test]
    fn gamma_readonly_never_claims_write() {
        let c = gamma_readonly_check(&Ok((100, 100)));
        assert_eq!(c.status, "ok");
        assert!(c.detail.contains("yazılmadı"));
    }

    #[test]
    fn hdr_reports_enabled_device() {
        let open = hdr_check(&[hdr::HdrInfo {
            device: "\\\\.\\DISPLAY1".into(),
            hdr: true,
        }]);
        assert_eq!(open.status, "warn");
        assert!(open.detail.contains("açık"));

        let shut = hdr_check(&[hdr::HdrInfo {
            device: "\\\\.\\DISPLAY1".into(),
            hdr: false,
        }]);
        assert_eq!(shut.status, "ok");

        assert_eq!(hdr_check(&[]).status, "warn");
    }

    #[test]
    fn monitor_check_counts_internal_and_ddc() {
        let rows = vec![
            monitor::MonitorInfo {
                id: "A".into(),
                name: "Dahili".into(),
                is_internal: true,
                api: "wmi".into(),
            },
            monitor::MonitorInfo {
                id: "B".into(),
                name: "Dell".into(),
                is_internal: false,
                api: "ddc".into(),
            },
        ];
        let c = monitor_check(&Ok(rows));
        assert_eq!(c.status, "ok");
        assert!(c.detail.contains("2 monitör"));
        assert!(c.detail.contains("1 dahili"));
        assert!(c.detail.contains("1 DDC/CI"));
        assert!(!c.hint.is_empty());

        assert_eq!(monitor_check(&Ok(Vec::new())).status, "bad");
    }

    #[test]
    fn autostart_off_is_warning_with_action() {
        let c = autostart_check(&Ok(false));
        assert_eq!(c.status, "warn");
        assert!(c.hint.contains("başlat"));
        assert_eq!(autostart_check(&Ok(true)).status, "ok");
    }

    #[test]
    fn log_check_extracts_timestamp() {
        let c = log_check(Some(
            "2026-10-29T01:22:53+03:00 | source=auto/auto | note=x",
        ));
        assert_eq!(c.status, "ok");
        assert!(c.detail.contains("2026-10-29T01:22:53+03:00"));
        assert_eq!(log_check(None).status, "warn");
        assert_eq!(log_check(Some("")).status, "warn");
    }

    #[test]
    fn every_check_has_stable_id_and_label() {
        let report_checks = [
            brightness_read_check(&ok_read(1)),
            brightness_write_check(&ok_read(1), &Ok(1)),
            gamma_write_check(50, &Ok((50, 50))),
            gamma_readonly_check(&Ok((100, 100))),
            hdr_check(&[]),
            monitor_check(&Ok(Vec::new())),
            theme_check(&Ok(("x".into(), None))),
            autostart_check(&Ok(true)),
            license_check(&license::no_license()),
            log_check(None),
        ];
        for c in report_checks {
            assert!(!c.id.is_empty());
            assert!(!c.label.is_empty());
            assert!(
                matches!(c.status.as_str(), "ok" | "warn" | "bad"),
                "geçersiz durum: {}",
                c.status
            );
        }
    }
}
