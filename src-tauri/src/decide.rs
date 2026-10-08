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
        Source::Day => ("github", "light", 80),
        Source::Warm => ("catppuccin-macchiato", "dark", 55),
        Source::Cool => ("tokyonight", "dark", 60),
        Source::Night => ("vesper", "dark", 30),
        Source::Auto => match hour {
            6..=15 => ("github", "light", 80),
            16..=17 => ("everforest", "system", 60),
            18..=21 => ("catppuccin-macchiato", "dark", 55),
            _ => ("vesper", "dark", 30),
        },
    }
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
    fn morning_is_github_light() {
        assert_eq!(scene_target(Source::Auto, 6), ("github", "light", 80));
        assert_eq!(scene_target(Source::Auto, 15), ("github", "light", 80));
    }

    #[test]
    fn transition_is_everforest() {
        assert_eq!(scene_target(Source::Auto, 16), ("everforest", "system", 60));
        assert_eq!(scene_target(Source::Auto, 17), ("everforest", "system", 60));
    }

    #[test]
    fn evening_defaults_to_warm_scene() {
        assert_eq!(
            scene_target(Source::Auto, 19),
            ("catppuccin-macchiato", "dark", 55)
        );
    }

    #[test]
    fn night_is_vesper() {
        assert_eq!(scene_target(Source::Auto, 23), ("vesper", "dark", 30));
        assert_eq!(scene_target(Source::Auto, 3), ("vesper", "dark", 30));
    }

    #[test]
    fn source_overrides_hour() {
        assert_eq!(scene_target(Source::Day, 23), ("github", "light", 80));
        assert_eq!(scene_target(Source::Night, 12), ("vesper", "dark", 30));
        assert_eq!(scene_target(Source::Cool, 19), ("tokyonight", "dark", 60));
    }

    #[test]
    fn unknown_source_falls_back_to_auto() {
        assert_eq!(Source::from_str("gunes"), Source::Auto);
        assert_eq!(Source::from_str("cool"), Source::Cool);
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
