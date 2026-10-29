# smart-screen

Laptop ortam ışığına göre **OpenCode temasını + laptop ekran parlaklığını** ayarlayan tray uygulaması.
Oyun / video / PDF açıkken veya kilitliyken hiçbir şeye dokunmaz. Göz sağlığı odaklı:
20-20-20 hatırlatması, gece parlaklık tavanı, okuma profili, sıcak ton.

- Platform: Windows (Tauri v2, Rust backend, vanilla TS frontend)
- Tek pencere, serbest boyutlandırılabilir (min 760×600): alt dock + dört bölüm
  (**Durum / Profiller / Geçmiş / Ayarlar**)
- Yayınlar: [GitHub Releases](https://github.com/TitanLion72/smart-screen/releases) (v0.1.0 → v2.11.1)

## Kurulum (kullanıcı)

1. [En son release](https://github.com/TitanLion72/smart-screen/releases/latest) sayfasından
   `smart-screen_<sürüm>_x64-setup.exe` indir.
2. Çift tıkla, kur. Görev çubuğunun tepside bir simge belirir.
3. Pencere açılır → sağ üstte **«Otomatik çalışıyor»** yazar. **«Şimdi yeniden ayarla»**
   düğmesiyle ilk turu başlatabilirsin.

> **SmartScreen uyarısı normaldir.** Kurulum dosyası kod imzalı değil (sertifika maliyeti
> ve bölgesel kısıtlar nedeniyle), bu yüzden Windows "bilinmeyen yayıncı" diyebilir →
> **Ek bilgi → Yine de çalıştır**. Dosyanın doğruluğunu release sayfasındaki `.sha256`
> ile kontrol edebilirsin:
> `Get-FileHash .\smart-screen_*_x64-setup.exe -Algorithm SHA256`

OpenCode temasını değiştirirken `cli.json` (`~/.config/opencode/cli.json`) içine
yazılan **yalnızca** `theme.name` ve `theme.mode` alanlarıdır; diğer ayarlar
bozulmaz (sert bir test var).

## Günlük kullanım (kısa)

Arayüz **tek sahne**: gezinme ekranın alt ortasındaki cam dock'ta (Durum · Profiller ·
Geçmiş · Ayarlar). Sekmeler arasında fareyle tıklayabilir ya da ok tuşlarını
kullanabilirsin.

| Bölüm | Ne işe yarar |
|---|---|
| **Durum** | Merkezdeki büyük rakam gerçek parlaklık; altında ulaşılmak istenen değer ve sonraki değişim saati, **neden böyle** satırı, ışık→parlaklık→sarılık eğrisi (canlı); monitör satırları; otomatik ayar seçici (**Açık / 1 saat / Bugün / Kilitli**); son olaylar; güncelleme varsa band |
| **Profiller** | İş/Film gibi paketler; kart tıklayınca yalnız düzenlenir, uygulamak için ayrı **Uygula**; kaydedilmemiş değişiklik "Kaydedilmedi" ile gösterilir; bir profili uygulama listesine bağlayabilirsin (`code.exe` gibi) |
| **Geçmiş** | Bugünün özeti + 12 saatlik grafik + **insan dilinde** zaman çizelgesi ("18:40 · akşam temasına geçildi · %42") |
| **Ayarlar** | Çalışma biçimi, **ekran rengi sıcaklığı (Kelvin)**, ekranı sarılaştırma, gece koruması, 20-20-20 mola, okuma profili, uygulama listeleri; **Görünüm**'de 4 şablon × 12 palet ve "Günün rengi"; **Kontrol**'de tek tıkla sistem tanılaması; **Gelişmiş** altında okunabilirlik denetimi, Windows açılışında başlat, lisans ve Hakkında |

Her eylem geri bildirim verir: kaydet/sil/etkinleştir gibi işlemlerde **toast** çıkar,
silme ve kayıt temizlemede **Geri al** sunulur; yalnız kaydırıcı ve anında görünen
değişiklikler sessizdir.

**Görsel dil:** 4 yerleşim şablonu (bento / sahne / dergi / konsol) × 12 palet
(obsidyen, gece, orman, gül, okyanus, lavanta, gün batımı, grafit, fildişi, kâğıt,
kum, buz). Her paletin kendi vurgu rengi vardır; istersen **"Günün rengi"** saat
dilimine göre kendisi seçer (elle seçim 10 dk korunur). Katmanlı derinlik (hero
katmanları farklı düzlemlerde), imlece hafif tepki veren paralaks. Hareket azaltma
(`prefers-reduced-motion`) açıksa paralaks ve geçiş animasyonları kapanır.

**Tepsi (tray):** sol tık **hızlı panel**i açar (parlaklık, hızlı eylemler, Ayarlar);
sağ tık menüsünde Ayarlar · 1 saat duraklat · Bugün kapat · Çıkış. Hızlı panel dışına
tıklayınca veya ESC ile kapanır.

Otomatik kurallar:

- Dakikada bir bakar, kamerayı en fazla 5 dk bir açar (pil %20 altıysa 15 dk).
- Aynı kararı 2 kez onaylamadan değiştirmez (titreşim olmaz).
- Gece 00:00–01:30 dışında parlaklığı %0'a çekmez.
- Kilitliyse / "Sabit" moddaysa / oyun-video-PDF açıkken hiçbir şeye dokunmaz.

## Monitörler

Panel'deki **Monitörler** kutusu bağlı ekranları listeler ve her birinin
parlaklığını elle ayarlamanı sağlar.

| Ekran | Yol | Not |
|---|---|---|
| Dahili (laptop paneli) | WMI `WmiMonitorBrightness` | Her zaman çalışır |
| Harici (HDMI/DP/USB-C) | DDC/CI (`SetMonitorBrightness`, VCP 0x10) | Monitörün OSD menüsünde DDC/CI **açık** olmalı |

DDC/CI desteklenmiyorsa veya OSD'den kapatılmışsa satırda net hata görünür
(hata 31); sessizce başka yola düşülmez. Tek ekranlı kurulumda sınıflandırma
kaybolursa WMI son şans olarak denenir.

> Bilinen sınır: harici monitörlerde **sıcak ton**, monitör VCP 0x0C'yi desteklemiyorsa
> yalnız gamma rampasıyla (yazılımsal) uygulanır. Uygulama monitörü bir kez yoklar:
> destekliyorsa ayar monitörün kendisinde yapılır ("Monitörün kendi ayarı"), desteklemiyorsa
> "Programla yapılıyor" notu görünür.

**Ekran rengi sıcaklığı:** Ayarlar'da **2500–6500 K** aralığında seçilir (sol sıcak, sağ
gündüz). Hazır çipler: Mum · Ampul · Halojen · Florasan · Gündüz. Tek tıkla 6500 K'ye
dönülebilir, Esc son değere döndürür. Kaydırıcı sürüklenirken canlı uygulanır; monitör
yazımı 150 ms bekletilir ki donanım yorulmasın.

**HDR:** HDR açık bir monitörde yazılımsal sıcak ton uygulanmaz (Windows rampaları
HDR'da yok sayar). Uygulama bunu tespit eder, monitör satırında `HDR` rozeti gösterir
ve neden uygulamadığını yazar. Parlaklık DDC üzerinden çalışmaya devam eder.

## Otomatik güncelleme

Uygulama açılıştan 10 sn sonra ve günde bir kez `latest.json` üzerinden yeni sürüm
kontrol eder. Güncelleme varsa **Durum** sekmesinde tek satır band çıkar: *"v2.2.1
hazır — şimdi kur?"*. Kurulum yalnız senin onayınla başlar ve uygulamayı yeniden
başlatır; "Ertele" 24 saat susturur. Güncelleme paketi ayrıca minisign ile imzalıdır
(uygulama içi doğrulama), kurulum dosyasının Authenticode imzası yoktur.

## Sorun giderme (Kontrol)

Ayarlar → **Kontrol** kartı, "bir şey çalışmıyor" dendiğinde log istemeden cevap verir:
parlaklık okuma/yazma, sıcak ton sürücüsü, HDR, monitörler, OpenCode teması, açılışta
başlatma, lisans ve günlük tek tıkla ölçülür. Her satırda durum ve sade neden, yalnız
sorunlu satırda "ne yapmalı" ipucu bulunur.

**"Raporu kopyala"** düz metin raporu panoya yazar (sürüm, işletim sistemi, tarih,
satırlar, o anki düzen/palet). Raporda Pro lisans e-postası görünebilir; herkese açık
bir yere yapıştırmadan önce kontrol et.

**"Günlüğü aç"** `smart-screen.log` dosyasını varsayılan editörde açar; dosya henüz
yoksa klasörünü açar. Rapordaki "son satır" ile günlüğün ayrıntısını yan yana
okumak için: önce kopyala, sonra aç.

Testler görünür değişiklik yapmaz: parlaklık testi ekrandaki değerin **aynısını**
yazar, sıcak ton kapalıyken gamma rampası **hiç yazılmaz**.

## Tarihçe ve plan

- [`ROADMAP.md`](ROADMAP.md) — v2.11.1 → v3.0.0 sırası, her adımın kabul ölçütü ve geri alma yolu.
- [`PLAN-v3.md`](PLAN-v3.md) — tasarım sistemi + karar motorunun (v2.5–v2.11) gerekçeli arşivi.
- [`CHANGELOG.md`](CHANGELOG.md) — sürüm sürüm ne değişti.
- [`HANDOFF.md`](HANDOFF.md) — her turun kalıcı dersleri ve bilinen sınırlar.

## Lisans (freemium + Pro)

| Sürüm | Kapsam |
|---|---|
| **Ücretsiz** | Otomatik tema/parlaklık (dahili panel), sıcak ton, 3 profil, 20-20-20 molası, geçmiş/istatistik |
| **Pro** | Harici monitör DDC kontrolü (elle + otomatik), 6 profil, uygulama bağlı profiller |

- Etkinleştirme: **Ayarlar → Lisans** → anahtarı yapıştır → Etkinleştir.
- Lisans offline doğrulanır (Ed25519 imzası, sunucu yok, makineye bağlı değil).
- Kapı backend'de: harici monitöre yazma lisanssızken reddedilir; okuma ve
  dahili panel her zaman serbesttir.

### Anahtar üretimi (satıcı)

```bash
node tools/license-gen.mjs --email musteri@ornek.com
```

Özel anahtar `%USERPROFILE%\.config\opencode\smart-screen-license-private.pem`
konumunda tutulur ve **asla repoya girmez** (`.gitignore`: `*.pem`). Açık
anahtar `src-tauri/src/license.rs` içinde gömülüdür. Anahtar biçimi ve
doğrulama mantığının tanımı `license.rs` başlık yorumundadır.

## Geliştirme

```bash
npm.cmd install        # bağımlılıklar
npm.cmd run tauri dev  # dev pencere

# Testler
npm.cmd test                       # karar motoru (13)
cd src-tauri; cargo test; cd ..    # backend (204 + 2 canlı test)
npm.cmd run build                  # tsc + vite → dist/
cd qa && node run.mjs              # görsel/işlevsel QA (22 senaryo)
```

- `npm.ps1` execution policy'de engelli; projede hep `npm.cmd` kullan.
- Rust: `cargo fmt --check` ve `cargo clippy -D warnings` temiz.
- Sıcak ton: `gamma.rs` — `SetDeviceGammaRamp` sessiz reddettiği için rampa
  monotonluk + ±32768 kontrolünden geçer; yazımdan sonra geri okunur. Harici
  monitör yazımı `monitor.rs` DDC/CI üzerinden ve Pro kapısına bağlıdır.

## Veri yolları

| Dosya | Konum | İçerik |
|---|---|---|
| `smart-screen.log` | `~/.config/opencode/` | Her turdan bir satır, 500 satırda döner |
| `smart-screen-prefs.json` | `~/.config/opencode/` | Öğrenilen tema/parlaklık tercihleri |
| `smart-screen-gamma-<DISPLAYn>.bin` | `~/.config/opencode/` | Monitör başına sıcak ton öncesi rampa (kalibrasyon korunur); eski tek dosya açılışta taşınır |
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
# Güncelleme imzası için anahtar şart (yoksa build hata verir):
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\smart-screen-updater.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<anahtar şifresi>"

npm.cmd run tauri build           # nsis/*-setup.exe + msi + *.sig (updater artefaktları)
node tools/release-notes.mjs --version 2.1.0 --out release-notes.md
node tools/release-manifest.mjs --version 2.1.0 --notes-file release-notes.md \
  --base-url https://github.com/TitanLion72/smart-screen/releases/download/v2.1.0
```

`release-manifest.mjs` kökte `latest.json` üretir (updater'ın okuduğu dosya) ve her
installer için `.sha256` yazar. `latest.json` ve `.sig` dosyaları **release'e yüklenmeli**,
yoksa otomatik güncelleme çalışmaz.

> **Anahtar yedeği kritik:** `smart-screen-updater.key` kaybolursa mevcut kullanıcılara
> güncelleme yayınlanamaz. İki kopya tut (biri çevrimdışı); anahtar ve şifresi repoya
> girmez (`*.key` `.gitignore`'da).

Sürümler CI doğrulamasından sonra manuel push + release komutlarıyla açılır;
`AGENTS.md`/`HANDOFF.md` güncellemeleri her sürüm notuna temel olur.

## Lisans

Kaynak kodu **GNU GPL v3** (veya sonrası) altındadır — tam metin `LICENSE`
dosyasında. Bu, yazılımı özgürce çalıştırma, inceleme, değiştirme ve paylaşma
hakkını garanti eder; değiştirilmiş sürümler de aynı lisansla paylaşılmalıdır
(copyleft). v2.0.0 ve öncesi sürümler MIT lisansıyla yayınlanmıştı; bu değişiklik
sonraki sürümler için geçerlidir.

Uygulamanın kendisi freemium'dur: temel göz konforu özellikleri ücretsiz, Pro
(harici monitör kontrolü, 6 profil, uygulama bağlı profiller) lisans anahtarıyla
açılır. GPL, yazılımı satmayı yasaklamaz; Pro anahtarı geliştirmeyi desteklemenin
yoludur. Kod açık olduğu için kapıyı kaldıran fork'lar mümkündür — bu lisansın
bilinçli bir sonucudur.

Bağımlılıklar: Tauri 2, serde, windows 0.62, nokhwa, chrono, ed25519-dalek.
Tüm bağımlılıklar izin verici lisanslıdır (MIT / Apache-2.0 / BSD / ISC / Zlib /
MPL-2.0) ve GPL-3.0 ile uyumludur.

### Kaynak kodu (GPL uyumu)

Yayınlanan her kurulum dosyası için **Corresponding Source**, aynı sürümün git
etiketindedir:
`https://github.com/TitanLion72/smart-screen/tree/v<sürüm>`

Kurulum paketiyle birlikte kaynağı ayrıca göndermeye gerek yoktur; genel ağ
üzerinden ücretsiz erişim GPLv3 §6(d) koşulunu karşılar. Kaynağı değiştirip
dağıtırsan aynı yükümlülük senin için de geçerlidir.

Katkı kuralları: [CONTRIBUTING.md](CONTRIBUTING.md) · Güvenlik:
[SECURITY.md](SECURITY.md) · Davranış: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
