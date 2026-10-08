//! Tur basina tek satir disk logu. Grafik ve gecmise bakis buradan okunur.
//!
//! Format (sabit, bozma): `iso | source=.. | level=.. | tone=.. |
//! desired=.. | applied=.. | theme=.. | note=..`

use std::fs;
use std::path::PathBuf;

const MAX_LINES: usize = 500;

fn log_path() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE").map_err(|e| format!("USERPROFILE yok: {e}"))?;
    Ok(PathBuf::from(home)
        .join(".config")
        .join("opencode")
        .join("smart-screen.log"))
}

pub fn log_tick(line: &str) {
    let _ = append_line(
        &log_path().unwrap_or_else(|_| PathBuf::from("smart-screen.log")),
        line,
    );
}

pub fn read_lines(max: usize) -> Result<Vec<String>, String> {
    read_tail(&log_path()?, max)
}

pub fn clear_log() -> Result<(), String> {
    let path = log_path()?;
    fs::write(&path, "").map_err(|e| format!("log silinemedi: {e}"))?;
    Ok(())
}

fn append_line(path: &PathBuf, line: &str) -> Result<(), String> {
    let mut lines = read_tail(path, usize::MAX)?;
    lines.push(line.to_string());
    if lines.len() > MAX_LINES {
        let cut = lines.len() - MAX_LINES;
        lines.drain(..cut);
    }
    fs::write(path, lines.join("\n") + "\n").map_err(|e| format!("log yazilamadi: {e}"))
}

fn read_tail(path: &PathBuf, max: usize) -> Result<Vec<String>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(path).map_err(|e| format!("log okunamadi: {e}"))?;
    let mut lines: Vec<String> = text
        .lines()
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect();
    if lines.len() > max {
        let cut = lines.len() - max;
        lines.drain(..cut);
    }
    Ok(lines)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ss-log-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir.join(format!("{name}.log"))
    }

    #[test]
    fn appends_and_reads() {
        let p = tmp("append");
        append_line(&p, "a").unwrap();
        append_line(&p, "b").unwrap();
        assert_eq!(read_tail(&p, 10).unwrap(), vec!["a", "b"]);
        fs::remove_file(&p).ok();
    }

    #[test]
    fn read_tail_limits_to_last() {
        let p = tmp("tail");
        for i in 0..5 {
            append_line(&p, &format!("l{i}")).unwrap();
        }
        assert_eq!(read_tail(&p, 2).unwrap(), vec!["l3", "l4"]);
        fs::remove_file(&p).ok();
    }

    #[test]
    fn rotates_at_500() {
        let p = tmp("rotate");
        for i in 0..600 {
            append_line(&p, &format!("l{i}")).unwrap();
        }
        let lines = read_tail(&p, usize::MAX).unwrap();
        assert_eq!(lines.len(), 500);
        assert_eq!(lines.first().unwrap(), "l100");
        fs::remove_file(&p).ok();
    }

    #[test]
    fn missing_file_is_empty() {
        let p = std::env::temp_dir().join("ss-yok-bir-log.tmp");
        assert!(read_tail(&p, 5).unwrap().is_empty());
    }

    #[test]
    fn clear_empties() {
        let p = tmp("clear");
        append_line(&p, "x").unwrap();
        fs::write(&p, "").unwrap();
        assert!(read_tail(&p, 5).unwrap().is_empty());
        fs::remove_file(&p).ok();
    }
}
