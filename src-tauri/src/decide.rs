// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! Saat + isik seviyesine gore hedef tema ve parlaklik.
//!
//! v2.5 kurallari (PLAN-v3 §4.1) — eski sabit basamaklar birakildi:
//! - Isik seviyesi HISTEREZLI siniflanir: tek bir gurultulu kare sahneyi
//!   degistiremez (esik gecisi icin +-6 puan bandi).
//! - Hedef parlaklik 24 saat boyunca SURECLI bir egridir; saat basinda
//!   basamak yok. Kamera olcumu hedefi EZMEZ, yalnizca kaydirir.
//! - Tek turda en fazla 12 puanlik adim; 2 puandan kucuk fark uygulanmaz.
//! - 00:00-01:30 disinda %0 yasagi (`min_brightness`).

/// Ortamdaki baskin isik kaynagi. `Auto` saati baz alir,
/// digerleri saati yok sayip sahneyi dogrudan secer.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Source {
    Auto,
    Day,
    Warm,
    Cool,
    Night,
}

impl Source {
    pub fn from_str(s: &str) -> Self {
        match s {
            "day" => Source::Day,
            "warm" => Source::Warm,
            "cool" => Source::Cool,
            "night" => Source::Night,
            _ => Source::Auto,
        }
    }
}

/// Kamera olcumunun seviyesi. `light.rs::classify` ham sinifi verir; karar
/// motoru bir onceki seviyeyi hatirlayarak `next_level` ile gecisi yumusatir.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Level {
    Dark,
    Dim,
    Normal,
    Bright,
}

impl Level {
    pub fn as_str(self) -> &'static str {
        match self {
            Level::Dark => "dark",
            Level::Dim => "dim",
            Level::Normal => "normal",
            Level::Bright => "bright",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "dark" => Some(Level::Dark),
            "dim" => Some(Level::Dim),
            "normal" => Some(Level::Normal),
            "bright" => Some(Level::Bright),
            _ => None,
        }
    }

    /// Bir ust seviye; en ustte `None`.
    fn above(self) -> Option<Self> {
        match self {
            Level::Dark => Some(Level::Dim),
            Level::Dim => Some(Level::Normal),
            Level::Normal => Some(Level::Bright),
            Level::Bright => None,
        }
    }

    /// Bir alt seviye; en altta `None`.
    fn below(self) -> Option<Self> {
        match self {
            Level::Dark => None,
            Level::Dim => Some(Level::Dark),
            Level::Normal => Some(Level::Dim),
            Level::Bright => Some(Level::Normal),
        }
    }
}

/// Seviye gecisi icin histerez bandi (puan). Esik 34 ise: 40'in uzerinde
/// `dim`'e cikilir, 28'in altinda `dark`'a donulur; arada kaliр mevcut kalir.
pub const LEVEL_BAND: f32 = 6.0;

/// Seviye esikleri (yukari gecis) ve o esigin ustundeki seviye.
const LEVEL_EDGES: [(f32, Level); 3] = [
    (34.0, Level::Dim),
    (80.0, Level::Normal),
    (150.0, Level::Bright),
];

/// Histerezli seviye: `prev` korunur, ancak olcum esik+band disina cikarsa
/// seviye degisir. Kucuk titreme (esik etrafinda +-6) sahneyi oynatmaz (SAF).
pub fn next_level(prev: Level, lum: f32) -> Level {
    let mut level = prev;
    // Yukari: esik + band asilirsa bir (veya birden fazla) kademe cik.
    for (edge, up) in LEVEL_EDGES {
        if level == up {
            continue;
        }
        if lum > edge + LEVEL_BAND && level.above() == Some(up) {
            level = up;
        }
    }
    // Asagi: esik - band altina inilirse kademe dus.
    for (edge, up) in LEVEL_EDGES.iter().rev() {
        if level == *up && lum < edge - LEVEL_BAND {
            if let Some(down) = up.below() {
                level = down;
            }
        }
    }
    level
}

/// Saat → hedef parlaklik egrisi (dakika, yuzde). Uc nokta 24:00 = 00:00.
const BASE_ANCHORS: [(u16, f32); 9] = [
    (0, 30.0),    // 00:00 gece taban
    (300, 30.0),  // 05:00
    (420, 62.0),  // 07:00 sabah yukselisi
    (480, 80.0),  // 08:00 gunduz
    (960, 80.0),  // 16:00
    (1110, 58.0), // 18:30 aksam
    (1260, 55.0), // 21:00
    (1380, 30.0), // 23:00 gece
    (1440, 30.0), // 24:00 = 00:00
];

/// Egrinin `minute` dakikasindaki degeri (dogrusal ara deger, SAF).
pub fn base_brightness(minute: u16) -> f32 {
    let t = minute.min(1440);
    for w in BASE_ANCHORS.windows(2) {
        let (m0, v0) = w[0];
        let (m1, v1) = w[1];
        if t >= m0 && t <= m1 {
            let ratio = (t - m0) as f32 / (m1 - m0) as f32;
            return v0 + ratio * (v1 - v0);
        }
    }
    30.0
}

/// Olcumun hedefe kaydirmasi (puan). Kamera hedefi EZMEZ; `bright` ortami
/// aydinlik diye 4 puan yukari, `dark` los diye 6 puan asagi kaydirir.
pub fn light_shift(level: Level) -> i16 {
    match level {
        Level::Dark => -6,
        Level::Dim => -3,
        Level::Normal => 0,
        Level::Bright => 4,
    }
}

/// Kaynak + saat + olcume gore (tema adi, tema modu, hedef parlaklik).
/// `Auto` surekli egriyi kullanir; acik kaynaklar kullanici niyetidir ve
/// sabit hedef verir (olcum yine +- kaydirir).
pub fn scene_target(
    source: Source,
    hour: u8,
    minute: u8,
    level: Level,
) -> (&'static str, &'static str, u8) {
    let (name, mode, base) = match source {
        Source::Day => ("ss-paper", "light", 80.0),
        Source::Warm => ("ss-dusk", "dark", 55.0),
        Source::Cool => ("ss-paper", "light", 70.0),
        Source::Night => ("ss-night", "dark", 30.0),
        Source::Auto => {
            let m = u16::from(hour % 24) * 60 + u16::from(minute % 60);
            // Tema bandi parlaklik egrisiyle ayni yerden gecer: gece teması
            // ancak eğri 30'a indikten sonra (22:30) devreye girer.
            let theme = match m {
                360..=959 => ("ss-paper", "light"),
                960..=1349 => ("ss-dusk", "dark"),
                _ => ("ss-night", "dark"),
            };
            (theme.0, theme.1, base_brightness(m))
        }
    };
    let target = (base + f32::from(light_shift(level))).clamp(20.0, 95.0);
    (name, mode, target.round() as u8)
}

/// Saat + isik seviyesine gore otomatik sicak ton siddeti (0..=100).
/// Gunduz sifir, aksam yavasca artar, gece tepe yapar; kamera isik
/// seviyesi bunu kaydirir ama siniri asmaz.
///
/// v2.5: olcek 0-45'ten 0-100'e tasindi. Eski tavan (45) kalibre edilmis
/// `gamma` egrisiyle "islevsiz" kaliyordu (PLAN-v3 §3/§4.2).
pub fn warmth_auto(hour: u8, minute: u8, light_level: &str) -> u8 {
    // Capa noktalari (dakika, siddet): aralarinda dogrusal ara deger.
    // 24:00 capa degeri 00:00 ile ayni (88) oldugu icin gece yarisi
    // cevrimsinde egride kesinti olmaz.
    const ANCHORS: [(u16, f64); 11] = [
        (0, 88.0),    // 00:00
        (300, 88.0),  // 05:00
        (360, 56.0),  // 06:00
        (420, 22.0),  // 07:00
        (480, 0.0),   // 08:00
        (900, 0.0),   // 15:00
        (1020, 22.0), // 17:00
        (1140, 56.0), // 19:00
        (1260, 78.0), // 21:00
        (1380, 88.0), // 23:00
        (1440, 88.0), // 24:00
    ];
    // Saat + dakika tek egriye dokunur; bozuk girdi 24:00'e kelepcelenir.
    let t = ((hour as u16) * 60 + (minute as u16 % 60)).min(1440);
    let base = ANCHORS
        .windows(2)
        .find_map(|w| {
            let (m0, v0) = w[0];
            let (m1, v1) = w[1];
            (m0..=m1).contains(&t).then(|| {
                let ratio = (t - m0) as f64 / (m1 - m0) as f64;
                v0 + ratio * (v1 - v0)
            })
        })
        .unwrap_or(0.0);
    // Isik kaydirmasi: los ortam sicakligi artirir, aydinlik keser.
    let shift: i16 = match light_level {
        "dark" => 22,
        "dim" => 11,
        "bright" => -11,
        _ => 0,
    };
    (base.round() as i16 + shift).clamp(0, 100) as u8
}

/// Izin verilen alt parlaklik siniri.
pub fn min_brightness(hour: u8, minute: u8) -> u8 {
    if hour == 0 || (hour == 1 && minute <= 30) {
        0
    } else {
        25
    }
}

/// Hedefe dogru yumusak adim: 2 puandan kucuk farklar hic uygulanmaz (goz
/// fark etmiyor), buyuk farklar ucte bir adimla (min 3, **max 8**) kapanir.
/// Alt sinirin altina inmez, hedefi asmaz. Ust sinir PLAN-v3 §4.1/4 ve kabul
/// kriteri (§11) ile ayni: tek turda 8 puandan fazla degisim yok.
pub fn next_brightness(current: u8, desired: u8, hour: u8, minute: u8) -> u8 {
    let floor = min_brightness(hour, minute);
    let desired = desired.max(floor).min(100);
    let gap = desired.abs_diff(current);
    if gap < 2 {
        return current;
    }
    let step = (gap / 3).clamp(3, 8).min(gap);
    if desired > current {
        current.saturating_add(step)
    } else {
        current.saturating_sub(step)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn morning_is_paper_and_rises_slowly() {
        // 06:00 artik 80 degil: egri 05:00'te 30'dan 08:00'te 80'e tirmanir.
        assert_eq!(
            scene_target(Source::Auto, 6, 0, Level::Normal),
            ("ss-paper", "light", 46)
        );
        assert_eq!(
            scene_target(Source::Auto, 7, 0, Level::Normal),
            ("ss-paper", "light", 62)
        );
        assert_eq!(
            scene_target(Source::Auto, 15, 0, Level::Normal),
            ("ss-paper", "light", 80)
        );
    }

    #[test]
    fn transition_is_dusk_medium() {
        // 16:00 hala 80; tema dusk'a gecer ama parlaklik basamak yapmaz.
        assert_eq!(
            scene_target(Source::Auto, 16, 0, Level::Normal),
            ("ss-dusk", "dark", 80)
        );
        assert_eq!(
            scene_target(Source::Auto, 18, 30, Level::Normal),
            ("ss-dusk", "dark", 58)
        );
    }
    #[test]
    fn evening_is_dusk_dark() {
        // 18:00 egrinin inis bolgesinde: 62 (eski sabit 55 idi, basamak yok).
        assert_eq!(
            scene_target(Source::Auto, 18, 0, Level::Normal),
            ("ss-dusk", "dark", 62)
        );
        assert_eq!(
            scene_target(Source::Auto, 21, 0, Level::Normal),
            ("ss-dusk", "dark", 55)
        );
    }

    /// kabul kriteri (§11/4): gece 00:00'da açık tema HİÇ uygulanmaz.
    ///
    /// v3.0: kanıt beklemeye bağlıydı ("yarın log'a bakarız"). Günün her
    /// dakikası taranır, ışık seviyesinin dört değeri de denenir; gece
    /// penceresinde `light` dönerse test düşer. Beklemeye bağlı kanıt kanıt
    /// değildir — bir sonraki değişiklik onu sessizce bozar.
    #[test]
    fn auto_never_picks_light_theme_at_night() {
        // Açık tema bandı 06:00–16:00. Dışında `light` yasak.
        const LIGHT_FROM: u16 = 6 * 60;
        const LIGHT_TO: u16 = 16 * 60;
        let levels = [Level::Dark, Level::Dim, Level::Normal, Level::Bright];
        for m in 0..1440u16 {
            let hour = (m / 60) as u8;
            let minute = (m % 60) as u8;
            for level in levels {
                let (name, mode, _) = scene_target(Source::Auto, hour, minute, level);
                if !(LIGHT_FROM..LIGHT_TO).contains(&m) {
                    assert_ne!(
                        mode, "light",
                        "{hour}:{minute:02} ({level:?}) gece açık tema seçti: {name}"
                    );
                }
                // Karar her zaman kendi temalarımızdan olmalı (v3.0 md.2).
                assert!(
                    name.starts_with("ss-"),
                    "{hour}:{minute:02} ({level:?}) yabancı tema seçti: {name}"
                );
            }
        }
        // Gece yarısı tam olarak gece teması (parlaklık eğriden; burada
        // ölçülen şey tema kararı, parlaklık değil).
        let (name, mode, bright) = scene_target(Source::Auto, 0, 0, Level::Bright);
        assert_eq!((name, mode), ("ss-night", "dark"));
        assert!(bright <= 40, "gece yarısı parlak olmamalı: {bright}");
    }

    #[test]
    fn night_is_ss_night() {
        // Gece temasi 22:30'da baslar; eğri 23:00'te 30'a iner.
        assert_eq!(
            scene_target(Source::Auto, 22, 30, Level::Normal),
            ("ss-night", "dark", 36)
        );
        assert_eq!(
            scene_target(Source::Auto, 23, 0, Level::Normal),
            ("ss-night", "dark", 30)
        );
        assert_eq!(
            scene_target(Source::Auto, 3, 0, Level::Normal),
            ("ss-night", "dark", 30)
        );
        // 22:00 hala dusk ve 43: tema ile parlaklik ayni yerden gecer.
        assert_eq!(
            scene_target(Source::Auto, 22, 0, Level::Normal),
            ("ss-dusk", "dark", 43)
        );
    }

    #[test]
    fn source_overrides_hour() {
        assert_eq!(
            scene_target(Source::Day, 23, 0, Level::Normal),
            ("ss-paper", "light", 80)
        );
        assert_eq!(
            scene_target(Source::Night, 12, 0, Level::Normal),
            ("ss-night", "dark", 30)
        );
        assert_eq!(
            scene_target(Source::Cool, 19, 0, Level::Normal),
            ("ss-paper", "light", 70)
        );
        assert_eq!(
            scene_target(Source::Warm, 12, 0, Level::Normal),
            ("ss-dusk", "dark", 55)
        );
    }

    #[test]
    fn unknown_source_falls_back_to_auto() {
        assert_eq!(Source::from_str("gunes"), Source::Auto);
        assert_eq!(Source::from_str("cool"), Source::Cool);
    }

    #[test]
    fn base_curve_is_continuous_all_day() {
        let mut prev = base_brightness(0);
        for m in 1..=1440u16 {
            let v = base_brightness(m);
            assert!(
                (v - prev).abs() <= 0.35,
                "dakika {m} basamak yapti: {prev} -> {v}"
            );
            prev = v;
        }
        // 24:00 ile 00:00 ayni deger: gun cevrimi kesintisiz.
        assert!((base_brightness(1440) - base_brightness(0)).abs() < 0.01);
    }

    #[test]
    fn scene_has_no_hour_step() {
        // Her saat sinirinda hedef parlaklik en fazla 1 puan oynar.
        for hour in 0..24u8 {
            let a = scene_target(Source::Auto, hour, 59, Level::Normal).2;
            let b = scene_target(Source::Auto, (hour + 1) % 24, 0, Level::Normal).2;
            assert!(
                a.abs_diff(b) <= 1,
                "{hour}:59 -> {hour}+1:00 sicradi: {a} -> {b}"
            );
        }
    }

    #[test]
    fn light_measurement_shifts_but_does_not_override() {
        let normal = scene_target(Source::Auto, 20, 0, Level::Normal).2;
        let dark = scene_target(Source::Auto, 20, 0, Level::Dark).2;
        let bright = scene_target(Source::Auto, 20, 0, Level::Bright).2;
        assert_eq!(dark + 6, normal);
        assert_eq!(bright, normal + 4);
        // Eski davranis: gece + parlak oda -> 80. Yeni: yalnizca +4.
        let night_bright = scene_target(Source::Auto, 23, 0, Level::Bright).2;
        assert!(night_bright <= 34, "gece parlak oda hedefi: {night_bright}");
    }

    #[test]
    fn hysteresis_ignores_threshold_noise() {
        // 34 esigi +-6 band: 36 hala dark, 41 dim.
        assert_eq!(next_level(Level::Dark, 36.0), Level::Dark);
        assert_eq!(next_level(Level::Dark, 40.0), Level::Dark);
        assert_eq!(next_level(Level::Dark, 41.0), Level::Dim);
        // 80 esigi: 79 hala normal, 73 dim'e doner.
        assert_eq!(next_level(Level::Normal, 79.0), Level::Normal);
        assert_eq!(next_level(Level::Normal, 73.0), Level::Dim);
        // 150 esigi.
        assert_eq!(next_level(Level::Normal, 155.0), Level::Normal);
        assert_eq!(next_level(Level::Normal, 157.0), Level::Bright);
        assert_eq!(next_level(Level::Bright, 145.0), Level::Bright);
        assert_eq!(next_level(Level::Bright, 143.0), Level::Normal);
        // Buyuk sicrama tek cagrida ust seviyeye cikar.
        assert_eq!(next_level(Level::Dark, 220.0), Level::Bright);
        assert_eq!(next_level(Level::Bright, 0.0), Level::Dark);
    }

    #[test]
    fn hysteresis_stops_flapping_across_edge() {
        // Esik etrafinda salinim: bir kez yukari cikinca geri donmez.
        let mut level = Level::Dark;
        for lum in [33.0, 41.0, 33.0, 41.0, 33.0, 41.0] {
            level = next_level(level, lum);
        }
        assert_eq!(level, Level::Dim, "salinim sahneyi oynatmamali");
    }

    #[test]
    fn level_roundtrips_strings() {
        for l in [Level::Dark, Level::Dim, Level::Normal, Level::Bright] {
            assert_eq!(Level::from_str(l.as_str()), Some(l));
        }
        assert_eq!(Level::from_str("flas"), None);
    }

    #[test]
    fn warmth_anchor_points_exact() {
        assert_eq!(warmth_auto(0, 0, "unknown"), 88);
        assert_eq!(warmth_auto(5, 0, "unknown"), 88);
        assert_eq!(warmth_auto(6, 0, "unknown"), 56);
        assert_eq!(warmth_auto(7, 0, "unknown"), 22);
        assert_eq!(warmth_auto(8, 0, "unknown"), 0);
        assert_eq!(warmth_auto(12, 0, "unknown"), 0);
        assert_eq!(warmth_auto(15, 0, "unknown"), 0);
        assert_eq!(warmth_auto(17, 0, "unknown"), 22);
        assert_eq!(warmth_auto(19, 0, "unknown"), 56);
        assert_eq!(warmth_auto(21, 0, "unknown"), 78);
        assert_eq!(warmth_auto(23, 0, "unknown"), 88);
    }

    #[test]
    fn warmth_linear_between_anchors() {
        // 19:00=56 ile 21:00=78 arasi tam orta nokta: 67.
        assert_eq!(warmth_auto(20, 0, "unknown"), 67);
        // 17:00=22 ile 19:00=56 yarim yol: 39.
        assert_eq!(warmth_auto(18, 0, "unknown"), 39);
        // 15:00=0 ile 17:00=22 yarim yol: 11.
        assert_eq!(warmth_auto(16, 0, "unknown"), 11);
        // 21:00=78 ile 23:00=88 yarim yol: 83.
        assert_eq!(warmth_auto(22, 0, "unknown"), 83);
    }

    #[test]
    fn warmth_midnight_wrap_is_continuous() {
        let late = warmth_auto(23, 55, "unknown");
        let early = warmth_auto(0, 5, "unknown");
        assert!(
            late.abs_diff(early) < 3,
            "gece yarisi cevrimsinde kesinti olmamali: {} vs {}",
            late,
            early
        );
    }

    #[test]
    fn warmth_light_level_shifts() {
        // 21:00 taban 78: dark +22, dim +11, bright -11, taninmayan 0.
        assert_eq!(warmth_auto(21, 0, "dark"), 100);
        assert_eq!(warmth_auto(21, 0, "dim"), 89);
        assert_eq!(warmth_auto(21, 0, "bright"), 67);
        assert_eq!(warmth_auto(21, 0, "unknown"), 78);
        assert_eq!(warmth_auto(21, 0, "flas"), 78);
    }

    #[test]
    fn warmth_respects_bounds() {
        // Gece tepe 88 + dark 22 = 110 -> 100'de kesilir.
        assert_eq!(warmth_auto(0, 0, "dark"), 100);
        assert_eq!(warmth_auto(23, 30, "dark"), 100);
        // Gunduz taban 0 + bright -11 = -11 -> 0'da kesilir.
        assert_eq!(warmth_auto(8, 0, "bright"), 0);
        assert_eq!(warmth_auto(12, 0, "bright"), 0);
        // Tum egriden tarama: cikti hep 0..=100.
        for hour in 0..=23u8 {
            for minute in [0u8, 15, 30, 45] {
                for level in ["dark", "dim", "bright", "unknown"] {
                    let v = warmth_auto(hour, minute, level);
                    assert!(
                        v <= 100,
                        "{}:{} {} -> {} 100'u asmamali",
                        hour,
                        minute,
                        level,
                        v
                    );
                }
            }
        }
    }

    #[test]
    fn warmth_daytime_flat_zero() {
        // 08:00-15:00 arasi egrinin duz sifir bolgesi; 15:00'ten
        // hemen sonra yukselis basladigi icin 15:xx dahil degil.
        for hour in 8..=14u8 {
            for minute in [0u8, 20, 40, 59] {
                assert_eq!(
                    warmth_auto(hour, minute, "unknown"),
                    0,
                    "{}:{} sifir olmali",
                    hour,
                    minute
                );
            }
        }
        assert_eq!(warmth_auto(15, 0, "unknown"), 0);
    }

    #[test]
    fn warmth_is_stronger_than_old_scale_at_same_clock() {
        // Eski olcek 21:00'de 35 (auto tavan 45) idi; yeni olcek 78.
        assert!(warmth_auto(21, 0, "unknown") >= 70);
        assert!(warmth_auto(0, 0, "unknown") >= 80);
    }

    #[test]
    fn step_adapts_to_gap() {
        // Fark 30 -> 10 puanlik adim, tavan 8.
        assert_eq!(next_brightness(50, 80, 12, 0), 58);
        // Gece tabani 0 oldugu icin saf adim kurali: 30 -> 8.
        assert_eq!(next_brightness(50, 20, 0, 15), 42);
        // Gunduz tabani (25) hedefi yukari ceker: fark 25 -> 8.
        assert_eq!(next_brightness(50, 20, 12, 0), 42);
    }

    #[test]
    fn tiny_gap_is_not_applied() {
        assert_eq!(next_brightness(50, 51, 12, 0), 50);
        assert_eq!(next_brightness(50, 53, 12, 0), 53);
    }

    #[test]
    fn big_gap_stays_within_step_cap() {
        assert_eq!(next_brightness(80, 30, 12, 0), 72);
        assert_eq!(next_brightness(30, 80, 12, 0), 38);
        // Hicbir turda 8 puandan fazla degisim yok (PLAN-v3 §11).
        for current in 0..=100u8 {
            for desired in 0..=100u8 {
                let next = next_brightness(current, desired, 12, 0);
                assert!(
                    next.abs_diff(current) <= 8,
                    "{current} -> {next} (hedef {desired}) 8 puani asti"
                );
            }
        }
    }

    #[test]
    fn converges_without_overshoot() {
        let mut value = 80u8;
        let mut steps = 0;
        while value.abs_diff(30) >= 2 && steps < 40 {
            let next = next_brightness(value, 30, 12, 0);
            assert!(next <= value, "asagidaki degerin altina inmemeli");
            value = next;
            steps += 1;
        }
        assert!(
            (29..=32).contains(&value),
            "hedefe yakin bitmeli: {}",
            value
        );
        assert!(steps >= 3, "tek adimda kapanmamali, yumusak olmali");
    }

    #[test]
    fn floor_blocks_zero_outside_night() {
        assert_eq!(next_brightness(50, 0, 12, 0), 42);
        // Taban 25: 30'dan 25'e 3 puandan kucuk kalan farkla iner (27).
        assert_eq!(next_brightness(30, 0, 12, 0), 27);
    }

    #[test]
    fn zero_allowed_in_night_window() {
        assert_eq!(next_brightness(30, 0, 0, 15), 22);
        assert_eq!(min_brightness(1, 30), 0);
        assert_eq!(min_brightness(1, 31), 25);
    }

    /// kabul kriteri (§11): 24 saatlik seride tek turda |degisim| <= 8,
    /// 30 dakikalik pencerede yon degisimi <= 2.
    #[test]
    fn simulated_day_has_no_jumps_or_flapping() {
        let mut current = 30u8;
        let mut series = vec![current];
        for m in 0..1440u16 {
            let hour = (m / 60) as u8;
            let minute = (m % 60) as u8;
            // Gercekci kamera: aksam/gece karanlik, sabah los, gunduz normal.
            let level = match hour {
                6..=8 => Level::Dim,
                9..=21 => Level::Normal,
                _ => Level::Dark,
            };
            let desired = scene_target(Source::Auto, hour, minute, level).2;
            let next = next_brightness(current, desired, hour, minute);
            assert!(
                next.abs_diff(current) <= 8,
                "{hour}:{minute:02} sicradi: {current} -> {next} (hedef {desired})"
            );
            if next != current {
                current = next;
            }
            series.push(current);
        }

        // Yon degisimi: 30 dakikalik pencerede en fazla 2.
        let deltas: Vec<i8> = series.windows(2).map(|w| w[1] as i8 - w[0] as i8).collect();
        for w in deltas.windows(30) {
            let dirs: Vec<i8> = w.iter().copied().filter(|d| *d != 0).collect();
            let flips = dirs.windows(2).filter(|p| p[0] != p[1]).count();
            assert!(flips <= 2, "30 dk icinde {flips} yon degisimi: {w:?}");
        }
        // Gunduz hedefine ulasir, gece tabanina iner.
        assert!(
            series[12 * 60] >= 70,
            "oglen parlak olmali: {}",
            series[12 * 60]
        );
        assert!(
            series[3 * 60] <= 32,
            "gece kisasi kalmali: {}",
            series[3 * 60]
        );
    }
}
