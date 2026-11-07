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

/// 0..1 arası yumuşak geçiş (3t²−2t³). Uçlarda türev 0 → eğri köşesiz.
///
/// Doğrusal ara değer her çapada türevi aniden değiştiriyordu; sonuç
/// "tak" diye düşen bir parlaklık. Smoothstep uçlarda türevi sıfıra çekip
/// çapa geçişlerini görünmez yapar. Girdi 0..1 dışındaysa kelepçelenir.
pub fn smoothstep(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// Egrinin `minute` dakikasindaki degeri (yumusak ara deger, SAF).
///
/// v3.4: `ratio` yerine `smoothstep(ratio)`. Gerekce: dogrusal ara deger
/// her capada turev sicramasi yapiyordu; 07:00-08:00 arasinda parlaklik
/// "tak" diye dusuyordu (PLAN-v3.4 bulgu #1). Capalar degismedi.
pub fn base_brightness(minute: u16) -> f32 {
    let t = minute.min(1440);
    for w in BASE_ANCHORS.windows(2) {
        let (m0, v0) = w[0];
        let (m1, v1) = w[1];
        if t >= m0 && t <= m1 {
            let ratio = (t - m0) as f64 / (m1 - m0) as f64;
            return v0 + smoothstep(ratio) as f32 * (v1 - v0);
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
///
/// v3.4 (PLAN-v3.4 sozlesme C1):
/// - Capalar arasi **smoothstep**; capalar ayni, gecis organik.
/// - Kamera olcumu artik toplamsal kaydirma degil, **agirlikli ortak**:
///   los oda gunduz de sarilik ister, aydinlik oda gece de istemez.
///   Toplamsal model bunu ifade edemiyordu (bulgu #2).
/// - Kameranin **tonu** de kullanilir: sicak ortamda ekrani daha da
///   sarartmak "portakal corbasi" yapar; soguk/floresan ortamda isitmak
///   melatonin icin dogru.
pub fn warmth_auto(hour: u8, minute: u8, light_level: &str, tone: &str) -> u8 {
    // Capa noktalari (dakika, siddet): aralarinda smoothstep ara deger.
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
    let t = ((hour % 24) as u16 * 60 + (minute % 60) as u16).min(1440);
    let base = ANCHORS
        .windows(2)
        .find_map(|w| {
            let (m0, v0) = w[0];
            let (m1, v1) = w[1];
            (m0..=m1).contains(&t).then(|| {
                let ratio = (t - m0) as f64 / (m1 - m0) as f64;
                v0 + smoothstep(ratio) * (v1 - v0)
            })
        })
        .unwrap_or(0.0);
    // Olculen isik seviyesinin "istedigi" sarilik. Bu degerler 0..88
    // egrisinin uc noktalariyla uyumlu secildi: karanlik gece tepesine
    // (88) yakin, tam aydinlik sifira yakin. Taninmayan seviye (kamera
    // yok/mesgul) `None` → eski davranis korunur.
    let measured: Option<f64> = match light_level {
        "dark" => Some(80.0),
        "dim" => Some(52.0),
        "normal" => Some(18.0),
        "bright" => Some(0.0),
        _ => None,
    };
    // 55/45: saat egrisi ana omurga, olcum onu dengeler. 50/50 olsaydi
    // bulutlu bir ogleden sonra gece yarisi kadar sararirdi.
    let core = match measured {
        Some(m) => 0.55 * base + 0.45 * m,
        None => base,
    };
    // Sicak ortamda ekstra sarilik gereksiz (-14), soguk ortamda ise
    // isitmak dogru (+12). Simetrik degil: sismis sariyi geri almak
    // goze daha agir geliyor, o yuzden duzeltme biraz daha guclu.
    let tone_adj = match tone {
        "warm" => -14.0,
        "cool" => 12.0,
        _ => 0.0,
    };
    (core + tone_adj).round().clamp(0.0, 100.0) as u8
}

/// Onizleme icin egri ornekleri: 0..=1440 dakika, `step` aralikla.
/// Kamera yok varsayimiyla (`unknown`, `neutral`) hesaplanir — cunku
/// onizleme gunun TAMAMINI gosterir, su anki olcumu degil.
/// `step` 0 ise 15; 1..=240 disina cikan deger kelepcelenir.
pub fn warmth_curve(step_minutes: u8) -> Vec<u8> {
    let step = match step_minutes {
        0 => 15u16,
        s => u16::from(s).clamp(1, 240),
    };
    let mut out = Vec::with_capacity((1440 / step) as usize + 1);
    let mut m = 0u16;
    loop {
        out.push(warmth_auto(
            (m / 60) as u8,
            (m % 60) as u8,
            "unknown",
            "neutral",
        ));
        if m >= 1440 {
            break;
        }
        // Son ornek her zaman 24:00 (gun kapanisi) olsun.
        m = (m + step).min(1440);
    }
    out
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
    step_toward(current, desired, min_brightness(hour, minute))
}

/// `next_brightness`'in alt siniri disaridan alan hali. Frontend gece/okuma
/// tavanini alt sinirin altina indirdiginde ayni degeri buraya gecirir; aksi
/// halde `min_brightness` (25) hedefi yukari cekip kullanicinin tavanini
/// sessizce iptal ediyordu (v3.0.2). `floor`, `desired`i asla yukseltmez.
pub fn next_brightness_with_floor(current: u8, desired: u8, floor: u8) -> u8 {
    step_toward(current, desired, floor.min(desired))
}

fn step_toward(current: u8, desired: u8, floor: u8) -> u8 {
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
        // 18:00 egrinin inis bolgesinde: 60 (v3.4 smoothstep; eski dogrusal
        // 62, eski sabit 55 idi). Basamak yok.
        assert_eq!(
            scene_target(Source::Auto, 18, 0, Level::Normal),
            ("ss-dusk", "dark", 60)
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
        // 22:30 smoothstep ile 34 (eski dogrusal 36 idi).
        assert_eq!(
            scene_target(Source::Auto, 22, 30, Level::Normal),
            ("ss-night", "dark", 34)
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
            // Smoothstep turevi uclarda 0, ortada 1.5. En dik capa cifti
            // 07:00-08:00 (18 puan / 60 dk) → en fazla 0.45 puan/dk.
            assert!(
                (v - prev).abs() <= 0.5,
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
    fn smoothstep_clamps_and_hits_ends() {
        // Uc degerler ve kelepce: 0..1 disi girdi uclara oturur.
        assert!((smoothstep(0.0) - 0.0).abs() < 0.001);
        assert!((smoothstep(1.0) - 1.0).abs() < 0.001);
        assert!((smoothstep(0.5) - 0.5).abs() < 0.001);
        assert!((smoothstep(-3.0) - 0.0).abs() < 0.001);
        assert!((smoothstep(7.0) - 1.0).abs() < 0.001);
    }

    #[test]
    fn smoothstep_is_monotonic() {
        let mut prev = smoothstep(0.0);
        for i in 0..=1000 {
            let t = f64::from(i) / 1000.0;
            let v = smoothstep(t);
            assert!(v + 0.001 >= prev, "t={t} azaldi: {prev} -> {v}");
            prev = v;
        }
        // Uclarda turev ~0: ilk %1'lik dilimde degisim cok kucuk.
        assert!(smoothstep(0.01) < 0.001);
        assert!(smoothstep(0.99) > 0.999);
    }

    #[test]
    fn warmth_anchor_points_exact() {
        // Capalar degismedi (v3.4 sozlesme C1); kamera yok + notr ton.
        assert_eq!(warmth_auto(0, 0, "unknown", "neutral"), 88);
        assert_eq!(warmth_auto(5, 0, "unknown", "neutral"), 88);
        assert_eq!(warmth_auto(6, 0, "unknown", "neutral"), 56);
        assert_eq!(warmth_auto(7, 0, "unknown", "neutral"), 22);
        assert_eq!(warmth_auto(8, 0, "unknown", "neutral"), 0);
        assert_eq!(warmth_auto(12, 0, "unknown", "neutral"), 0);
        assert_eq!(warmth_auto(15, 0, "unknown", "neutral"), 0);
        assert_eq!(warmth_auto(17, 0, "unknown", "neutral"), 22);
        assert_eq!(warmth_auto(19, 0, "unknown", "neutral"), 56);
        assert_eq!(warmth_auto(21, 0, "unknown", "neutral"), 78);
        assert_eq!(warmth_auto(23, 0, "unknown", "neutral"), 88);
    }

    /// Regresyon korumasi: kamera yok + notr ton eski davranisin ta kendisi.
    /// Eski (v3.3 dogrusal) degerler: capalar 88/88/56/22/0/0/0/22/56/78/88,
    /// yarim noktalar 16:00=11, 18:00=39, 20:00=67, 22:00=83.
    /// Yeni egri yarim noktalarda ayni (smoothstep(0.5)=0.5), capalarda ayni.
    #[test]
    fn unknown_neutral_matches_old_curve() {
        let old = [
            (0, 0, 88),
            (5, 0, 88),
            (6, 0, 56),
            (7, 0, 22),
            (8, 0, 0),
            (15, 0, 0),
            (16, 0, 11),
            (17, 0, 22),
            (18, 0, 39),
            (19, 0, 56),
            (20, 0, 67),
            (21, 0, 78),
            (22, 0, 83),
            (23, 0, 88),
        ];
        for (h, m, want) in old {
            assert_eq!(
                warmth_auto(h, m, "unknown", "neutral"),
                want,
                "{h}:{m:02} eski degerden sapti"
            );
        }
    }

    #[test]
    fn warmth_smooth_between_anchors() {
        // Yarim noktalar dogrusal ile ayni kaldi (simetri).
        assert_eq!(warmth_auto(20, 0, "unknown", "neutral"), 67);
        assert_eq!(warmth_auto(18, 0, "unknown", "neutral"), 39);
        assert_eq!(warmth_auto(16, 0, "unknown", "neutral"), 11);
        assert_eq!(warmth_auto(22, 0, "unknown", "neutral"), 83);
        // Ceyrek nokta farki gosterir: 19:30 eski dogrusal 62 idi,
        // smoothstep(0.25)=0.15625 → 56 + 22*0.15625 = 59.4 → 59.
        assert_eq!(warmth_auto(19, 30, "unknown", "neutral"), 59);
        assert_eq!(warmth_auto(17, 30, "unknown", "neutral"), 27);
    }

    #[test]
    fn warmth_midnight_wrap_is_continuous() {
        let late = warmth_auto(23, 55, "unknown", "neutral");
        let early = warmth_auto(0, 5, "unknown", "neutral");
        assert!(
            late.abs_diff(early) < 3,
            "gece yarisi cevrimsinde kesinti olmamali: {} vs {}",
            late,
            early
        );
    }

    #[test]
    fn warmth_light_level_is_weighted_not_additive() {
        // 21:00 taban 78; olcum artik 0.55*base + 0.45*measured.
        // dark: 42.9+36 = 78.9 → 79 (eski toplamsal deger 100'dü).
        assert_eq!(warmth_auto(21, 0, "dark", "neutral"), 79);
        // dim: 42.9+23.4 = 66.3 → 66 (eski 89).
        assert_eq!(warmth_auto(21, 0, "dim", "neutral"), 66);
        // normal: 42.9+8.1 = 51 (eski 78; normal de artik hafif isitir).
        assert_eq!(warmth_auto(21, 0, "normal", "neutral"), 51);
        // bright: 42.9+0 = 42.9 → 43 (eski 67).
        assert_eq!(warmth_auto(21, 0, "bright", "neutral"), 43);
        // Taninmayan seviye kamera yok sayilir.
        assert_eq!(warmth_auto(21, 0, "unknown", "neutral"), 78);
        assert_eq!(warmth_auto(21, 0, "flas", "neutral"), 78);
    }

    #[test]
    fn dark_daytime_raises_warmth() {
        // Gunduz egri 0; los oda (dark→80) sariligi belirgin sekilde acar.
        let none = warmth_auto(12, 0, "unknown", "neutral");
        let dark = warmth_auto(12, 0, "dark", "neutral");
        assert_eq!(none, 0);
        assert_eq!(dark, 36, "0.45*80 = 36 beklenir");
        assert!(dark > none, "los oda gunduz de sarilik istemeli");
        // Ayni sey aksam ustu icin de gecerli.
        assert!(warmth_auto(16, 0, "dark", "neutral") > warmth_auto(16, 0, "unknown", "neutral"));
    }

    #[test]
    fn bright_night_lowers_warmth() {
        // 23:00 egri 88; parlak oda gece sariligi keser.
        let none = warmth_auto(23, 0, "unknown", "neutral");
        let bright = warmth_auto(23, 0, "bright", "neutral");
        assert_eq!(none, 88);
        assert_eq!(bright, 48, "0.55*88 = 48.4 → 48");
        assert!(bright < none, "parlak oda gece sariligi azaltmali");
        // Gece yarisi da ayni yonde.
        assert!(warmth_auto(0, 30, "bright", "neutral") < warmth_auto(0, 30, "unknown", "neutral"));
    }

    #[test]
    fn tone_orders_warm_below_neutral_below_cool() {
        // Ayni saat ve isik: tungsten oda daha az, floresan daha cok isitir.
        let warm = warmth_auto(21, 0, "normal", "warm");
        let neutral = warmth_auto(21, 0, "normal", "neutral");
        let cool = warmth_auto(21, 0, "normal", "cool");
        assert_eq!((warm, neutral, cool), (37, 51, 63));
        assert!(warm < neutral && neutral < cool);
        // Taninmayan ton notr sayilir.
        assert_eq!(warmth_auto(21, 0, "normal", "bilinmeyen"), neutral);
    }

    #[test]
    fn warmth_respects_bounds() {
        // Alt kelepce: 12:00 base 0 + bright 0 → -14 → 0.
        assert_eq!(warmth_auto(12, 0, "bright", "warm"), 0);
        // Ust sinir: modelin ulasabildigi en yuksek deger 00:00 dark cool:
        // 0.55*88 + 0.45*80 = 84.4; +12 = 96.4 → 96. (100'e capalar
        // izin vermiyor; kelepce yine de taranir.)
        assert_eq!(warmth_auto(0, 0, "dark", "cool"), 96);
        // Tum gun × tum girdiler: cikti hep 0..=100.
        for hour in 0..=23u8 {
            for minute in [0u8, 15, 30, 45, 59] {
                for level in ["dark", "dim", "normal", "bright", "unknown"] {
                    for tone in ["warm", "neutral", "cool", "yok"] {
                        let v = warmth_auto(hour, minute, level, tone);
                        assert!(
                            v <= 100,
                            "{}:{} {} {} -> {} 100'u asmamali",
                            hour,
                            minute,
                            level,
                            tone,
                            v
                        );
                    }
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
                    warmth_auto(hour, minute, "unknown", "neutral"),
                    0,
                    "{}:{} sifir olmali",
                    hour,
                    minute
                );
            }
        }
        assert_eq!(warmth_auto(15, 0, "unknown", "neutral"), 0);
    }

    #[test]
    fn warmth_is_stronger_than_old_scale_at_same_clock() {
        // Eski olcek 21:00'de 35 (auto tavan 45) idi; yeni olcek 78.
        assert!(warmth_auto(21, 0, "unknown", "neutral") >= 70);
        assert!(warmth_auto(0, 0, "unknown", "neutral") >= 80);
    }

    #[test]
    fn warmth_bad_clock_does_not_panic() {
        // Bozuk girdi sarmalanir/kelepcelenir; panik yok.
        assert_eq!(
            warmth_auto(30, 99, "unknown", "neutral"),
            warmth_auto(6, 39, "unknown", "neutral")
        );
        assert_eq!(
            warmth_auto(255, 255, "dark", "warm"),
            warmth_auto(255 % 24, 15, "dark", "warm")
        );
        let _ = warmth_auto(99, 200, "bright", "cool");
    }

    #[test]
    fn warmth_curve_shape() {
        // 0..=1440, 15 dk adim → (1440/15)+1 = 97 ornek.
        let curve = warmth_curve(15);
        assert_eq!(curve.len(), 97);
        assert_eq!(curve[0], warmth_auto(0, 0, "unknown", "neutral"));
        assert_eq!(curve[96], warmth_auto(0, 0, "unknown", "neutral"));
        assert_eq!(*curve.iter().max().unwrap_or(&0), 88);
        assert_eq!(*curve.iter().min().unwrap_or(&0), 0);
        // Varsayilan adim 15; 0 da 15 demek.
        assert_eq!(warmth_curve(0), curve);
    }

    /// Komsu fark siniri: capalar sabit oldugu icin 06:00→07:00 arasindaki
    /// 34 puanlik dusus 4 araliga bolunur; hicbir egri 15 dk'da 8'in altina
    /// inemez (dogrusal bile 8.5). Smoothstep'in en dik noktasi 12.75 → 12.
    /// Yani 13, "egri kendi capalarindan daha hizli degil" garantisidir.
    #[test]
    fn warmth_curve_has_no_unexpected_step() {
        let curve = warmth_curve(15);
        for (i, w) in curve.windows(2).enumerate() {
            assert!(
                w[0].abs_diff(w[1]) <= 13,
                "ornek {i}: {} -> {} capalarin zorladigindan hizli",
                w[0],
                w[1]
            );
        }
    }

    #[test]
    fn warmth_curve_step_is_clamped() {
        // step 240 → 6 aralik + kapanis = 7 ornek.
        assert_eq!(warmth_curve(240).len(), 7);
        // step 250 ust sinira kelepcelenir (240 ile ayni).
        assert_eq!(warmth_curve(250), warmth_curve(240));
        // step 1 → 1441 ornek, tam dakika cozunurlugu.
        assert_eq!(warmth_curve(1).len(), 1441);
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

    /// v3.0.2: kullanıcı gece tavanını (`sleepCap`) alt sınırın altına
    /// indirdiyse alt sınır onu YUKARI ÇEKMEMELİ. Eski davranış: cap 15,
    /// `min_brightness` 25 → ekran 25'te kalıyordu (kullanıcı 15 yazmıştı).
    #[test]
    fn cap_below_floor_wins() {
        // 01:31 sonrası `min_brightness` 25 döner.
        assert_eq!(min_brightness(3, 0), 25);
        // Tavan-kırpılmış alt sınır verilince hedef 15'e iner (25'e çıkmaz).
        let mut value = 60u8;
        for _ in 0..40 {
            value = next_brightness_with_floor(value, 15, 15);
        }
        assert!(value < 25, "gece tavani alt siniri ezemedi: {value}");
        // 2 puan esigi yuzunden 15'e tam oturmaz (16'da durur) — asil kural
        // tavanin altina inebilmek.
        assert!(value <= 16, "beklenenden yuksek: {value}");
        // Alt sınır hedefi asla yukseltmez: floor 40 > hedef 10 → hedef 10'a iner.
        assert_eq!(
            next_brightness_with_floor(50, 10, 40),
            42,
            "floor hedefi yukseltti"
        );
        // Tavan yoksa eski davranis korunur (floor gercekten korur).
        assert_eq!(next_brightness(50, 0, 12, 0), 42);
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
