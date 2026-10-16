# smart-screen

Laptop ortam ışığına göre **OpenCode temasını + laptop ekran parlaklığını** ayarlayan tray uygulaması.
Oyun / video / PDF açıkken veya kilitliyken hiçbir şeye dokunmaz. Göz sağlığı odaklı:
20-20-20 hatırlatması, gece parlaklık tavanı, okuma profili, sıcak ton.

- Platform: Windows (Tauri v2, Rust backend, vanilla TS frontend)
- Tek pencere: 800×600, dört sekme (Panel / Profiller / Ayarlar / Geçmiş)
- Yayınlar: [GitHub Releases](https://github.com/TitanLion72/smart-screen/releases) (v0.1.0 → v0.7.0)

## Kurulum (kullanıcı)

1. [En son release](https://github.com/TitanLion72/smart-screen/releases/latest) sayfasından
   `smart-screen_<sürüm>_x64-setup.exe` indir.
2. Çift tıkla, kur. Görev çubuğunun tepside bir simge belirir.
3. Pencere açılır → sağ üstte **«İzliyor»** yazar. "Şimdi Ölç" düğmesiyle ilk turu
   başlatabilirsin.

OpenCode temasını değiştirirken `cli.json` (`~/.config/opencode/cli.json`) içine
yazılan **yalnızca** `theme.name` ve `theme.mode` alanlarıdır; diğer ayarlar
bozulmaz (sert bir test var).

## Günlük kullanım (kısa)

| Sekme | Ne işe yarar |
|---|---|
| **Panel** | Parlaklık, ışık, tema, durum kartları + "Şimdi Ölç / Kilit / Duraklat / Geri Al" |
| **Profiller** | İş/Film gibi paketler; bir profil uygulama listesine bağlanabilir (`code.exe` gibi) |
| **Ayarlar** | Tema seçimi + **kontrast denetimi** (WCAG), otomasyon modu, sıcak ton (`Oto/Sabit/Kapalı`), okuma profili, gece koruması, uygulama listeleri |
| **Geçmiş** | Bugünün özeti + 12 saatlik grafik + kayıtlar |

Otomatik kurallar:

- Dakikada bir bakar, kamerayı en fazla 5 dk bir açar (pil %20 altıysa 15 dk).
- Aynı kararı 2 kez onaylamadan değiştirmez (titreşim olmaz).
- Gece 00:00–01:30 dışında parlaklığı %0'a çekmez.
- Kilitliyse / "Sabit" moddaysa / oyun-video-PDF açıkken hiçbir şeye dokunmaz.

## Geliştirme

```bash
npm.cmd install        # bağımlılıklar
npm.cmd run tauri dev  # dev pencere

# Testler
cd src-tauri; cargo test; cd ..    # 99 test
npm.cmd run build                  # tsc + vite → dist/
cd qa && node run.mjs              # görsel/işlevsel QA (8 senaryo)
```

- `npm.ps1` execution policy'de engelli; projede hep `npm.cmd` kullan.
- Rust: `cargo fmt --check` şu an temiz; clippy temiz.
- Sıcak ton: `gamma.rs` — `SetDeviceGammaRamp` sessiz reddettiği için rampa
  monotonluk + ±32768 kontrolünden geçer. DDC/CI bu laptopta çalışmıyor (hata 31);
  çoklu ekran desteği şu an için yapılmadı.

## Veri yolları

| Dosya | Konum | İçerik |
|---|---|---|
| `smart-screen.log` | `~/.config/opencode/` | Her turdan bir satır, 500 satırda döner |
| `smart-screen-prefs.json` | `~/.config/opencode/` | Öğrenilen tema/parlaklık tercihleri |
| `smart-screen-gamma.bin` | `~/.config/opencode/` | Sıcak ton açılıken ekran rampası (kalibrasyon korunur) |
| Temalar (`ss-paper`/`ss-dusk`/`ss-night`) | `~/.config/opencode/themes/` | Uygulama açılışta eksikse kurar, var olana dokunmaz |
| `cli.json`, `opencode.json` | `~/.config/opencode/` | Tema seçimi buraya öğretilir; diğer alanlar bozulmaz |

## Tema üretme (bakım)

```bash
node tools/themes.mjs              # ss-* temaları üretir + ölçer (PASS koşulu)
node tools/extract-theme-colors.mjs # yerleşik tema renklerini src/theme-colors.json'a yazar
```

Her iki betik de WCAG karşılaştırmasını yapar; `PASS` almadan commit/paket açmayın.

## Paketleme

```bash
npm.cmd run tauri build           # src-tauri/target/release/bundle/nsis/*-setup.exe
```

Sürümler GitHub Actions doğamationı yerine manuel olarak push + release komutlarıyla açılacak;
`AGENTS.md`/`HANDOFF.md` güncellemeleri her sürüm notuna temel.

## Lisans

Tauri v2 topluluk şablonu. Bağımlılıklar: Tauri 2, serde, windows 0.62, nokhwa, chrono.
