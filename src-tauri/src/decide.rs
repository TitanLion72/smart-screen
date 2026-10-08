//! Saat + lamba rengine gore hedef tema ve parlaklik adimi.
//!
//! Kurallar (AGENTS.md + plan): slot haritasi, tek adimda en fazla
//! 5 puan parlaklik degisimi, 00:00-01:30 disinda %0 yasagi.

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

/// Kaynak + saate gore (tema adi, tema modu, hedef parlaklik).
pub fn scene_target(source: Source, hour: u8) -> (&'static str, &'static str, u8) {
    match source {
        Source::Day => ("ss-paper", "light", 80),
        Source::Warm => ("ss-dusk", "dark", 55),
        Source::Cool => ("ss-paper", "light", 70),
        Source::Night => ("ss-night", "dark", 30),
        Source::Auto => match hour {
            6..=15 => ("ss-paper", "light", 80),
            16..=17 => ("ss-dusk", "dark", 60),
            18..=21 => ("ss-dusk", "dark", 55),
            _ => ("ss-night", "dark", 30),
        },
    }
}

/// Saat + isik seviyesine gore otomatik sicak ton siddeti (0..=45).
/// Gunduz sifir, aksam yavasca artar, gece tepe yapar; kamera isik
/// seviyesi bunu kaydirir ama siniri asmaz.
pub fn warmth_auto(hour: u8, minute: u8, light_level: &str) -> u8 {
    // Capa noktalari (dakika, siddet): aralarinda dogrusal ara deger.
    // 24:00 capa degeri 00:00 ile ayni (40) oldugu icin gece yarisi
    // cevrimsinde egride kesinti olmaz.
    const ANCHORS: [(u16, f64); 11] = [
        (0, 40.0),    // 00:00
        (300, 40.0),  // 05:00
        (360, 25.0),  // 06:00
        (420, 10.0),  // 07:00
        (480, 0.0),   // 08:00
        (900, 0.0),   // 15:00
        (1020, 10.0), // 17:00
        (1140, 25.0), // 19:00
        (1260, 35.0), // 21:00
        (1380, 40.0), // 23:00
        (1440, 40.0), // 24:00
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
    // Isik kaydirmasi: los ortam sicakligi artirir, aydinlik kesarir.
    let shift: i16 = match light_level {
        "dark" => 10,
        "dim" => 5,
        "bright" => -5,
        _ => 0,
    };
    (base.round() as i16 + shift).clamp(0, 45) as u8
}

/// Izin verilen alt parlaklik siniri.
pub fn min_brightness(hour: u8, minute: u8) -> u8 {
    if hour == 0 || (hour == 1 && minute <= 30) {
        0
    } else {
        25
    }
}

/// Hedefe dogru yumusak adim: kucuk farklar hic uygulanmaz (göz fark
/// etmiyor), buyuk farklar 4'te bir adimla (min 5, max 25) kapanir.
/// Alt sinirin altina inmez, hedefi asmaz.
pub fn next_brightness(current: u8, desired: u8, hour: u8, minute: u8) -> u8 {
    let floor = min_brightness(hour, minute);
    let desired = desired.max(floor).min(100);
    let gap = desired.abs_diff(current);
    if gap < 3 {
        return current;
    }
    let step = (gap / 4).clamp(5, 25).min(gap);
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
    fn morning_is_paper_light() {
        assert_eq!(scene_target(Source::Auto, 6), ("ss-paper", "light", 80));
        assert_eq!(scene_target(Source::Auto, 15), ("ss-paper", "light", 80));
    }

    #[test]
    fn transition_is_dusk_medium() {
        assert_eq!(scene_target(Source::Auto, 16), ("ss-dusk", "dark", 60));
        assert_eq!(scene_target(Source::Auto, 17), ("ss-dusk", "dark", 60));
    }

    #[test]
    fn evening_is_dusk_dark() {
        assert_eq!(scene_target(Source::Auto, 18), ("ss-dusk", "dark", 55));
        assert_eq!(scene_target(Source::Auto, 21), ("ss-dusk", "dark", 55));
    }

    #[test]
    fn night_is_ss_night() {
        assert_eq!(scene_target(Source::Auto, 22), ("ss-night", "dark", 30));
        assert_eq!(scene_target(Source::Auto, 23), ("ss-night", "dark", 30));
        assert_eq!(scene_target(Source::Auto, 3), ("ss-night", "dark", 30));
    }

    #[test]
    fn source_overrides_hour() {
        assert_eq!(scene_target(Source::Day, 23), ("ss-paper", "light", 80));
        assert_eq!(scene_target(Source::Night, 12), ("ss-night", "dark", 30));
        assert_eq!(scene_target(Source::Cool, 19), ("ss-paper", "light", 70));
        assert_eq!(scene_target(Source::Warm, 12), ("ss-dusk", "dark", 55));
    }

    #[test]
    fn unknown_source_falls_back_to_auto() {
        assert_eq!(Source::from_str("gunes"), Source::Auto);
        assert_eq!(Source::from_str("cool"), Source::Cool);
    }

    #[test]
    fn warmth_anchor_points_exact() {
        assert_eq!(warmth_auto(0, 0, "unknown"), 40);
        assert_eq!(warmth_auto(5, 0, "unknown"), 40);
        assert_eq!(warmth_auto(6, 0, "unknown"), 25);
        assert_eq!(warmth_auto(7, 0, "unknown"), 10);
        assert_eq!(warmth_auto(8, 0, "unknown"), 0);
        assert_eq!(warmth_auto(12, 0, "unknown"), 0);
        assert_eq!(warmth_auto(15, 0, "unknown"), 0);
        assert_eq!(warmth_auto(17, 0, "unknown"), 10);
        assert_eq!(warmth_auto(19, 0, "unknown"), 25);
        assert_eq!(warmth_auto(21, 0, "unknown"), 35);
        assert_eq!(warmth_auto(23, 0, "unknown"), 40);
    }

    #[test]
    fn warmth_linear_between_anchors() {
        // 19:00=25 ile 21:00=35 arasi tam orta nokta: 30.
        assert_eq!(warmth_auto(20, 0, "unknown"), 30);
        // 17:00=10 ile 19:00=25 yarim yol: 17.5 -> en yakin 18.
        assert_eq!(warmth_auto(18, 0, "unknown"), 18);
        // 15:00=0 ile 17:00=10 yarim yol: 5.
        assert_eq!(warmth_auto(16, 0, "unknown"), 5);
        // 21:00=35 ile 23:00=40 yarim yol: 37.5 -> en yakin 38.
        assert_eq!(warmth_auto(22, 0, "unknown"), 38);
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
        // 21:00 taban 35: dark +10, dim +5, bright -5, taninmayan 0.
        assert_eq!(warmth_auto(21, 0, "dark"), 45);
        assert_eq!(warmth_auto(21, 0, "dim"), 40);
        assert_eq!(warmth_auto(21, 0, "bright"), 30);
        assert_eq!(warmth_auto(21, 0, "unknown"), 35);
        assert_eq!(warmth_auto(21, 0, "flas"), 35);
    }

    #[test]
    fn warmth_respects_bounds() {
        // Gece tepe 40 + dark 10 = 50 -> 45'te kesilir.
        assert_eq!(warmth_auto(0, 0, "dark"), 45);
        assert_eq!(warmth_auto(23, 30, "dark"), 45);
        // Gunduz taban 0 + bright -5 = -5 -> 0'da kesilir.
        assert_eq!(warmth_auto(8, 0, "bright"), 0);
        assert_eq!(warmth_auto(12, 0, "bright"), 0);
        // Tum egriden tarama: cikti hep 0..=45.
        for hour in 0..=23u8 {
            for minute in [0u8, 15, 30, 45] {
                for level in ["dark", "dim", "bright", "unknown"] {
                    let v = warmth_auto(hour, minute, level);
                    assert!(
                        v <= 45,
                        "{}:{} {} -> {} 45'i asmamali",
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
    fn step_adapts_to_gap() {
        assert_eq!(next_brightness(50, 80, 12, 0), 57);
        // Geceleri taban 0 oldugu icin saf adim kurali gorunur: fark 30 -> 7 puan.
        assert_eq!(next_brightness(50, 20, 0, 15), 43);
        // Gunduz hedefi taban (25) uzerine cekilir: fark 25 -> 6 puan.
        assert_eq!(next_brightness(50, 20, 12, 0), 44);
    }

    #[test]
    fn tiny_gap_is_not_applied() {
        assert_eq!(next_brightness(50, 52, 12, 0), 50);
        assert_eq!(next_brightness(50, 53, 12, 0), 53);
    }

    #[test]
    fn big_gap_stays_within_step_cap() {
        assert_eq!(next_brightness(80, 30, 12, 0), 68);
        assert_eq!(next_brightness(30, 80, 12, 0), 42);
    }

    #[test]
    fn converges_without_overshoot() {
        let mut value = 80u8;
        let mut steps = 0;
        while value.abs_diff(30) >= 3 && steps < 40 {
            let next = next_brightness(value, 30, 12, 0);
            assert!(next <= value, "asagidaki degerin altina inmemeli");
            value = next;
            steps += 1;
        }
        assert!(
            (30..=33).contains(&value),
            "hedefe yakin bitmeli: {}",
            value
        );
        assert!(steps >= 5, "tek adimda kapanmamali, yumusak olmali");
    }

    #[test]
    fn floor_blocks_zero_outside_night() {
        assert_eq!(next_brightness(50, 0, 12, 0), 44);
        assert_eq!(next_brightness(30, 0, 12, 0), 25);
    }

    #[test]
    fn zero_allowed_in_night_window() {
        assert_eq!(next_brightness(30, 0, 0, 15), 23);
        assert_eq!(min_brightness(1, 30), 0);
        assert_eq!(min_brightness(1, 31), 25);
    }
}
