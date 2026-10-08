//! Log dosyasini 12 saatlik kovalara boler; Geçmis sekmesinin grafigi bunu cizer.
//!
//! Log satiri (sabit format): `iso | source=.. | level=.. | tone=..
//! | desired=55 | applied=50 | theme=ad/mod | note=izle`
//!
//! Zaman damgalari UTC ISO-8601. Kovalar "saat once" ekseninde durur:
//! hours_ago 0 (en yeni) -> 11 (en eski).

use std::fs;
use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::Serialize;

pub const BUCKET_COUNT: u8 = 12;

#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Bucket {
    pub hours_ago: u8,
    pub applied_avg: u8,
    pub desired_avg: u8,
    pub samples: u32,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub buckets: Vec<Bucket>,
    pub theme_changes_today: u32,
    pub avg_applied_today: u8,
    pub frozen_ticks_today: u32,
    pub ticks_today: u32,
}

struct Entry {
    at: DateTime<Utc>,
    applied: Option<u8>,
    desired: Option<u8>,
    theme: String,
    note: String,
}

fn log_path() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE").map_err(|e| format!("USERPROFILE yok: {e}"))?;
    Ok(PathBuf::from(home)
        .join(".config")
        .join("opencode")
        .join("smart-screen.log"))
}

/// Ayraclar arasindaki tum alanlari toplar; ilk alan zaman damgasidir.
/// Bilinmeyen anahtarlar yok sayilir.
fn parse_line(line: &str) -> Option<Entry> {
    let mut parts = line.split('|');
    let at = DateTime::parse_from_rfc3339(parts.next()?.trim())
        .ok()?
        .with_timezone(&Utc);
    let mut entry = Entry {
        at,
        applied: None,
        desired: None,
        theme: String::new(),
        note: String::new(),
    };
    for field in parts {
        let Some((key, value)) = field.trim().split_once('=') else {
            continue;
        };
        let value = value.trim();
        match key {
            "applied" => entry.applied = value.parse().ok(),
            "desired" => entry.desired = value.parse().ok(),
            "theme" => entry.theme = value.to_string(),
            "note" => entry.note = value.to_string(),
            _ => {}
        }
    }
    Some(entry)
}

fn is_frozen(note: &str) -> bool {
    let n = note.trim();
    n.starts_with("dondur") || n.starts_with("film")
}

pub fn summarize(lines: &[String], now: DateTime<Utc>) -> Summary {
    let mut applied_sum = [0u32; BUCKET_COUNT as usize];
    let mut desired_sum = [0u32; BUCKET_COUNT as usize];
    let mut samples = [0u32; BUCKET_COUNT as usize];

    let mut today: Vec<Entry> = Vec::new();
    for line in lines {
        let Some(entry) = parse_line(line) else {
            continue;
        };
        let hours = now.signed_duration_since(entry.at).num_hours();
        if (0..i64::from(BUCKET_COUNT)).contains(&hours) {
            let idx = hours as usize;
            samples[idx] += 1;
            if let Some(v) = entry.applied {
                applied_sum[idx] += u32::from(v);
            }
            if let Some(v) = entry.desired {
                desired_sum[idx] += u32::from(v);
            }
        }
        if entry.at.date_naive() == now.date_naive() {
            today.push(entry);
        }
    }

    let buckets = (0..BUCKET_COUNT)
        .map(|i| {
            let idx = i as usize;
            let n = samples[idx].max(1);
            Bucket {
                hours_ago: i,
                applied_avg: (applied_sum[idx] / n) as u8,
                desired_avg: (desired_sum[idx] / n) as u8,
                samples: samples[idx],
            }
        })
        .collect();

    let mut theme_changes = 0u32;
    let mut applied_total = 0u32;
    let mut applied_count = 0u32;
    let mut frozen = 0u32;
    let mut prev: Option<String> = None;
    for entry in &today {
        if let Some(before) = &prev {
            if *before != entry.theme {
                theme_changes += 1;
            }
        }
        prev = Some(entry.theme.clone());
        if is_frozen(&entry.note) {
            frozen += 1;
        }
        if let Some(v) = entry.applied {
            applied_total += u32::from(v);
            applied_count += 1;
        }
    }

    Summary {
        buckets,
        theme_changes_today: theme_changes,
        avg_applied_today: (applied_total / applied_count.max(1)) as u8,
        frozen_ticks_today: frozen,
        ticks_today: today.len() as u32,
    }
}

pub fn summarize_now() -> Result<Summary, String> {
    let path = log_path()?;
    let lines: Vec<String> = if path.exists() {
        fs::read_to_string(&path)
            .map_err(|e| format!("log okunamadi: {e}"))?
            .lines()
            .map(|l| l.to_string())
            .collect()
    } else {
        Vec::new()
    };
    let now = Utc::now();
    Ok(summarize(&lines, now))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, SecondsFormat};

    fn now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-10-06T12:00:00.000Z")
            .unwrap()
            .with_timezone(&Utc)
    }

    fn hours_ago_iso(now: DateTime<Utc>, hours: i64) -> String {
        (now - Duration::hours(hours)).to_rfc3339_opts(SecondsFormat::Millis, true)
    }

    fn line(hours: i64, applied: u8, theme: &str, note: &str) -> String {
        format!(
            "{} | source=auto/auto | level=dim | tone=warm | desired=55 | applied={} | theme={} | note={}",
            hours_ago_iso(now(), hours),
            applied,
            theme,
            note
        )
    }

    #[test]
    fn empty_gives_twelve_empty_buckets() {
        let s = summarize(&[], now());
        assert_eq!(s.buckets.len(), 12);
        assert!(s.buckets.iter().all(|b| b.samples == 0));
        assert_eq!(s.ticks_today, 0);
    }

    #[test]
    fn buckets_are_ordered_newest_first() {
        let lines = vec![
            line(0, 40, "vesper/dark", "izle"),
            line(3, 60, "github/light", "izle"),
        ];
        let s = summarize(&lines, now());
        assert_eq!(s.buckets[0].hours_ago, 0);
        assert_eq!(s.buckets[3].hours_ago, 3);
        assert_eq!(s.buckets[3].samples, 1);
        assert_eq!(s.buckets[3].applied_avg, 60);
        assert_eq!(s.buckets[1].samples, 0);
    }

    #[test]
    fn averages_per_bucket() {
        let lines = vec![line(0, 40, "a/b", "izle"), line(0, 60, "a/b", "izle")];
        let s = summarize(&lines, now());
        assert_eq!(s.buckets[0].samples, 2);
        assert_eq!(s.buckets[0].applied_avg, 50);
    }

    #[test]
    fn entries_older_than_twelve_hours_are_dropped() {
        let lines = vec![line(13, 99, "a/b", "izle")];
        let s = summarize(&lines, now());
        assert!(s.buckets.iter().all(|b| b.samples == 0));
    }

    #[test]
    fn corrupt_lines_are_skipped() {
        let lines = vec![
            "bu bir satır değil".to_string(),
            String::new(),
            line(0, 50, "vesper/dark", "izle"),
        ];
        let s = summarize(&lines, now());
        assert_eq!(s.ticks_today, 1);
    }

    #[test]
    fn counts_theme_changes_and_average() {
        let lines = vec![
            line(0, 30, "vesper/dark", "izle"),
            line(1, 50, "vesper/dark", "izle"),
            line(2, 70, "github/light", "izle"),
        ];
        let s = summarize(&lines, now());
        assert_eq!(s.theme_changes_today, 1);
        assert_eq!(s.avg_applied_today, 50);
        assert_eq!(s.ticks_today, 3);
    }

    #[test]
    fn counts_frozen_notes() {
        let lines = vec![
            line(0, 30, "a/b", "donduruldu tam ekran"),
            line(1, 30, "a/b", "film otomatik kilit vlc.exe"),
            line(2, 30, "a/b", "izle"),
            line(3, 30, "a/b", "bekliyor 1/2"),
        ];
        let s = summarize(&lines, now());
        assert_eq!(s.frozen_ticks_today, 2);
    }

    #[test]
    fn other_days_are_not_counted_as_today() {
        let yesterday = (now() - Duration::days(1)).to_rfc3339();
        let lines = vec![
            format!("{yesterday} | source=auto/auto | level=- | tone=- | desired=10 | applied=10 | theme=a/b | note=donduruldu"),
            line(0, 40, "vesper/dark", "izle"),
        ];
        let s = summarize(&lines, now());
        assert_eq!(s.ticks_today, 1);
        assert_eq!(s.theme_changes_today, 0);
        assert_eq!(s.frozen_ticks_today, 0);
    }
}
