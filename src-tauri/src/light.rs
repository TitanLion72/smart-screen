// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! Kameradan tek kare alip ortam isigini tahmin eder.
//!
//! Kural (AGENTS.md): kare diske yazilmaz, kamera mesgulse hata
//! dondurulur ve karar motoru zaman moduna duser.

use nokhwa::{
    pixel_format::RgbFormat,
    utils::{CameraIndex, RequestedFormat, RequestedFormatType},
    Camera,
};

/// 0-255 arasi ortalama parlaklik + kirmizi/mavi orani.
pub struct LightSample {
    pub luminance: f32,
    pub warm_ratio: f32,
}

/// Seviye (dark/dim/normal/bright) + ton (warm/neutral/cool).
pub fn classify(luminance: f32, warm_ratio: f32) -> (&'static str, &'static str) {
    let level = if luminance < 30.0 {
        "dark"
    } else if luminance < 80.0 {
        "dim"
    } else if luminance < 150.0 {
        "normal"
    } else {
        "bright"
    };
    let tone = if luminance < 10.0 {
        // Karenin neredeyse tamami gurultu; renk orani guvenilmez.
        "neutral"
    } else if warm_ratio > 1.15 {
        "warm"
    } else if warm_ratio < 0.9 {
        "cool"
    } else {
        "neutral"
    };
    (level, tone)
}

/// Kamerayi acar, tek kare okuyup kapatir.
pub fn sample_light() -> Result<LightSample, String> {
    let format = RequestedFormat::new::<RgbFormat>(RequestedFormatType::AbsoluteHighestFrameRate);
    let mut camera =
        Camera::new(CameraIndex::Index(0), format).map_err(|e| format!("kamera acilamadi: {e}"))?;
    camera
        .open_stream()
        .map_err(|e| format!("kamera akisi acilamadi: {e}"))?;
    let frame = camera.frame().map_err(|e| format!("kare okunamadi: {e}"))?;
    let img = frame
        .decode_image::<RgbFormat>()
        .map_err(|e| format!("kare cozulemedi: {e}"))?;
    Ok(analyze(
        img.pixels().step_by(16).map(|p| (p[0], p[1], p[2])),
    ))
}

/// Piksellerden isik ornegi uretir (test edilebilir saf fonksiyon).
fn analyze(pixels: impl Iterator<Item = (u8, u8, u8)>) -> LightSample {
    let mut sum_lum = 0.0f32;
    let mut sum_r = 0.0f32;
    let mut sum_b = 0.0f32;
    let mut n = 0u32;
    for (r, g, b) in pixels {
        let (rf, gf, bf) = (r as f32, g as f32, b as f32);
        sum_lum += 0.2126 * rf + 0.7152 * gf + 0.0722 * bf;
        sum_r += rf;
        sum_b += bf;
        n += 1;
    }
    if n == 0 {
        return LightSample {
            luminance: 0.0,
            warm_ratio: 1.0,
        };
    }
    LightSample {
        luminance: sum_lum / n as f32,
        warm_ratio: sum_r / sum_b.max(1.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dark_room_sample() {
        let px = vec![(10u8, 10u8, 12u8); 100];
        let s = analyze(px.into_iter());
        assert!(s.luminance < 30.0);
        assert_eq!(classify(s.luminance, s.warm_ratio).0, "dark");
    }

    #[test]
    fn warm_lamp_detected() {
        let px = vec![(200u8, 140u8, 80u8); 100];
        let s = analyze(px.into_iter());
        assert_eq!(classify(s.luminance, s.warm_ratio).1, "warm");
    }

    #[test]
    fn cool_daylight_detected() {
        let px = vec![(120u8, 150u8, 200u8); 100];
        let s = analyze(px.into_iter());
        assert_eq!(classify(s.luminance, s.warm_ratio).1, "cool");
    }

    #[test]
    fn empty_sample_is_safe() {
        let s = analyze(Vec::new().into_iter());
        assert_eq!(s.luminance, 0.0);
    }

    #[test]
    fn near_black_tone_is_neutral() {
        let px = vec![(2u8, 2u8, 8u8); 100];
        let s = analyze(px.into_iter());
        assert_eq!(classify(s.luminance, s.warm_ratio).1, "neutral");
    }

    #[test]
    #[ignore]
    fn live_camera_probe() {
        let s = sample_light().expect("kamera ornegi alinamadi");
        let (level, tone) = classify(s.luminance, s.warm_ratio);
        println!(
            "kamera: luminance={:.1} warm_ratio={:.2} level={level} tone={tone}",
            s.luminance, s.warm_ratio
        );
    }
}
