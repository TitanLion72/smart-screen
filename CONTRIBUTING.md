# Katkı Rehberi

smart-screen'e ilgi gösterdiğin için teşekkürler. Bu proje tek kişilik bir bakım
temposunda ilerliyor; net ve küçük katkılar en hızlı birleşen katkılardır.

## Başlamadan önce

- **Hata bildirimi:** önce [mevcut issue'lara](https://github.com/TitanLion72/smart-screen/issues)
  bak. Yeni kayıtta `.github/ISSUE_TEMPLATE/bug_report.yml` formunu doldur; sürüm,
  Windows sürümü, monitör düzeni ve `smart-screen.log` son satırları çok işe yarar.
- **Güvenlik açığı:** issue açma — [SECURITY.md](SECURITY.md) yolunu izle.
- **Büyük değişiklik** (yeni özellik, mimari dokunuş): önce issue açıp yaklaşımı
  konuşalım. Reddedilmeyecek bir emeğin heba olmasını istemem.

## Geliştirme ortamı

```powershell
npm.cmd install
npm.cmd run tauri dev
```

- Rust: `cargo` (stable). Frontend: vanilla TS + Vite.
- `npm.ps1` PowerShell execution policy'de engelli olabilir → **`npm.cmd`** kullan.
- Windows dışı platformlar derlenmez (Win32 API'leri kullanılıyor).

## Değişiklik göndermeden önce

Tümü yeşil olmalı — CI bunları zorunlu tutuyor:

```powershell
cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cd ..
npm.cmd run build
cd qa; node run.mjs      # 15 senaryo, ekran görüntüleri qa/shots/
```

## Kod kuralları

- **Türkçe** hata mesajları ve yorumlar (kullanıcıya görünen metinler Türkçe).
- Komut yolunda `unwrap`/`expect` yok; hata `Result` ile taşınır.
- Sayısal değerler: parlaklık her zaman `Math.round` ile u8'e indirilir.
- DOM tarafında `el(id)` eksik id'de throw eder — yeni id eklerken **hem**
  `index.html` (SÖZLEŞME bloğu) **hem** `qa/run.mjs` güncellenir.
- Backend komutları `async`; uzun süren işler `spawn_blocking` içinde.
- Yeni bağımlılık eklerken lisansın GPL-3.0 ile uyumlu olduğunu kontrol et
  (izin verici lisanslar sorunsuz; yeni copyleft bağımlılıklar tartışılır).

## Commit mesajı

Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
Örnek: `fix(tray): sol tik hizli paneli kapatmiyordu`.

## Lisans

Katkı göndererek kodunun **GPL-3.0-or-later** altında yayınlanmasına izin verdiğini
kabul edersin. Ayrı bir CLA yok.
