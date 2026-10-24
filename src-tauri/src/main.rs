// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Coktuysse sebebi diske yaz: abort olsa bile hook calisir.
    std::panic::set_hook(Box::new(|info| {
        if let Ok(home) = std::env::var("USERPROFILE") {
            let path = std::path::PathBuf::from(home)
                .join(".config")
                .join("opencode")
                .join("smart-screen-crash.log");
            append_crash_line(&path, &format!("{info}"));
        }
    }));
    smart_screen_lib::run()
}

/// Crash satirini zaman damgasiyla EKLER (onceki kayitlarin uzerine yazmaz).
/// Dosya 64 KB'i asarsa `.log.prev` olarak yeniden adlandirilir ve taze
/// baslanir; boylece dosya sinirsiz buyumez.
fn append_crash_line(path: &std::path::Path, message: &str) {
    use std::io::Write;
    const MAX_BYTES: u64 = 64 * 1024;
    if let Ok(meta) = std::fs::metadata(path) {
        if meta.len() > MAX_BYTES {
            let _ = std::fs::rename(path, path.with_extension("log.prev"));
        }
    }
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let stamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let _ = writeln!(file, "{stamp} | {message}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("ss-crash-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(format!("{name}.log"))
    }

    #[test]
    fn crash_lines_append_with_timestamp() {
        let p = tmp("append");
        append_crash_line(&p, "ilk");
        append_crash_line(&p, "ikinci");
        let text = std::fs::read_to_string(&p).unwrap();
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines.len(), 2, "iki satir eklenmeli, uzerine yazilmamali");
        assert!(
            lines[0].ends_with("| ilk"),
            "zaman damgali satir: {}",
            lines[0]
        );
        assert!(lines[1].ends_with("| ikinci"));
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn oversized_crash_log_rolls_over() {
        let p = tmp("rollover");
        std::fs::write(&p, vec![b'x'; 70 * 1024]).unwrap();
        append_crash_line(&p, "yeniden basladi");
        let text = std::fs::read_to_string(&p).unwrap();
        assert!(
            text.ends_with("| yeniden basladi\n"),
            "taze dosya tek satir olmali"
        );
        assert!(
            p.with_extension("log.prev").exists(),
            "eski icerik .prev olarak kalmali"
        );
        std::fs::remove_file(&p).ok();
        std::fs::remove_file(p.with_extension("log.prev")).ok();
    }
}
