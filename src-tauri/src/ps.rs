//! PowerShell'i penceresiz calistirir: odak calmaz, pencere acip kapatmaz.
//! Asilip kalmasin diye 15 saniye sonunda oldurulur (try_wait dongusu).

use std::io::Read;
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Toplam calisma suresi siniri.
const TIMEOUT: Duration = Duration::from_secs(15);

/// try_wait dongusunun adim araligi.
const POLL: Duration = Duration::from_millis(50);

pub fn run(script: &str) -> Result<String, String> {
    let mut child = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("powershell calistirilamadi: {e}"))?;

    // Borulari ayri is parcaciklarinda oku: dogrudan okumak donguyu bloklar.
    let out_reader = reader_thread(child.stdout.take());
    let err_reader = reader_thread(child.stderr.take());

    let deadline = Instant::now() + TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    out_reader.join().ok();
                    err_reader.join().ok();
                    return Err("powershell zaman aşımı (15 sn)".to_string());
                }
                std::thread::sleep(POLL);
            }
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                out_reader.join().ok();
                err_reader.join().ok();
                return Err(format!("powershell beklenemedi: {e}"));
            }
        }
    };

    let stdout = out_reader.join().unwrap_or_default();
    let stderr = err_reader.join().unwrap_or_default();
    if !status.success() {
        return Err(format!("powershell hata: {}", stderr.trim()));
    }
    Ok(stdout)
}

/// Borudan sonuna kadar okuyan is parcacigi; pipe kapaliysa bos doner.
fn reader_thread(pipe: Option<impl Read + Send + 'static>) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut p) = pipe {
            let _ = p.read_to_end(&mut buf);
        }
        String::from_utf8_lossy(&buf).into_owned()
    })
}
