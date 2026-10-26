# Değişiklik Günlüğü

Bu projenin dikkate değer değişiklikleri bu dosyada tutulur.

Biçim [Keep a Changelog 1.1.0](https://keepachangelog.com/tr/1.1.0/) temellidir;
sürümleme [Semantic Versioning](https://semver.org/lang/tr/) izler.

> **Not:** Bu dosya elle tutulur; sürüm çıkarırken `Unreleased` maddeleri yeni sürüm
> başlığı altına taşınır. `tools/release-notes.mjs` bu dosyayı okuyup kullanıcıya
> dönük sürüm notunu üretir (chore/refactor/test/ci/docs maddeleri sürüm notuna girmez).
> Sürüm notu ile changelog arasındaki fark: changelog teknik olabilir, sürüm notu
> "benim için ne değişti" dilinde yazılır.

## [Unreleased]

_(henüz yayınlanmadı)_

## [2.3.1] - 2026-10-26

v2.3.0'ın yayın sonrası incelemesinden çıkan düzeltmeler (sürüm notu: ilk 2.3.0
kurulumunu yaptıysan bunu da kur — ışık göstergesi yanlış ölçekteydi).

### Fixed
- **Işık göstergesi yanlış ölçekteydi:** kamera parlaklığı 0–255 aralığında gelirken
  0–1000 sanılıp 10'a bölünüyordu; nokta hep eğrinin en alt çeyreğinde kalıyordu.
- **Açılış hatası artık pencereyi düşürmüyor:** ilk çizim ve periyodik yenileme
  `try/catch` ile sarıldı; bir bölüm patlarsa hata olay akışına yazılır, uygulama açık kalır.
  (2.3.0'daki "api is not defined" çökmesinin sınıfı sistemik olarak kapatıldı.)
- **Hero eğrileri artık çiziliyor:** yalnız noktalar taşınıyordu, eğri çizgileri sabit
  kalıyordu; 24 saatlik eğriler ölçüme göre yeniden üretiliyor.
- **Hareket azaltma ayarı sonradan değişince** paralaks yeniden başlıyor (restart gerekmiyor).
- `#pf-name` yanlış türde (`HTMLButtonElement`) çağrılıyordu.

### Notes
- `qa/run.mjs`: **bayat `dist/` koruması** eklendi — `src/` daha yeniyse test
  başlamadan durur ve `npm.cmd run build` hatırlatır. 2.3.0'daki çökmenin QA'da
  görünmemesinin en olası nedeni eski `dist` ile test edilmesiydi.

## [2.3.0] - 2026-10-26

v2.3 turu — "premium 3B sahne". Arayüz bu kez **mekânsal dille** yeniden yazıldı;
önceki kart yığını ve sol ray tamamen kalktı. Bu tur da final değildir.

### Changed
- **Tek sahne, katmanlı derinlik:** sol dikey ray kaldırıldı; gezinme ekranın alt
  ortasında **yüzen cam dock**. Sahne gerçek 3B (`perspective: 1200px`); hero
  katmanları farklı Z düzlemlerinde (ışıma −80px, cam plaka −20px, içerik 0,
  yansıma +10px). Sayfalar derinlikten öne süzülerek açılır.
- **Premium palet:** sıcak obsidyen zemin (`#0a0908` → `#262019`), **şampanya**
  vurgu (`#d8b98a`) + bakır; hairline'lar altın tonunda. Mavi ağırlıklı koyu tema gitti.
- **Tipografi:** 64px/300 ağırlık dev parlaklık rakamı, sıkı harf aralığı, tüm
  sayılarda `tabular-nums` (değer oynarken genişlik zıplamaz).
- **Asimetrik yerleşim:** eşit kart ızgarası yerine geniş ana kolon + ince yan kolon.
- **Fare paralaksı:** hero katmanları imlece göre hafifçe döner (rAF + ~30 fps sınırı;
  `prefers-reduced-motion` açıksa kapalı).
- **Hero eğrisi gerçek veriye bağlandı:** ışık/parlaklık/sarılık noktaları sabit
  değerlerden kurtuldu; gün içi saate ve son ölçüme göre konumlanır.
- **Vurgu renkleri** yeni palete taşındı: Mavi · Yeşil · Gül · Şampanya (dördü de
  eksiksiz tanımlı; "Mavi" seçilince tema gerçekten değişiyor).

### Fixed
- **Uygulama açılışta çöküyordu:** monitör satırı yenilenirken tanımsız değişkene
  erişim (`api is not defined`) pencereyi düşürüyordu; QA bunu görmemişti.
- **Yüzen dock içeriği örtüyordu:** alttaki düğmeler/paneller tıklanamıyordu. Dock
  artık kendi alanında (fixed değil, akışta).
- **Toast'lar dock'ı kapatıyordu:** sağdaki iki sekmeye 4 saniye tıklanamıyordu.
- **Profil çubuğu ("Kaydet/Çoğalt/Sil") üstteki düğmeleri örtüyordu** → yapışkanlık
  kaldırıldı.
- Monitör satırında **aynı bilgi iki rozet** olarak yazılıyordu ("dahili" + "dahili
  panel") → tek rozet.
- Monitör hatası metni 52px'e sıkışıp kırpılıyordu → sütun düzeni düzeltildi.
- Geçmiş'e **`source=vcp/vcp`** gibi iç jargon sızıyordu → insan diline çevrildi.
- "normal / nötr" ışık değerleri Türkçeye çevrilmiyordu.
- İkincil metin kontrastı WCAG AA altındaydı (`--text-4`) → eşiğin üstüne çekildi.
- Aktif dock sekmesinde odak halkası görünmüyordu (aynı rengin üstüne aynı renk).
- Sekmelerde **ok tuşlarıyla gezinme** ve roving tabindex eklendi (WAI-ARIA tabs).

### Notes
- `qa/run.mjs`: senaryolar arası `localStorage` sızıntısı giderildi (önceki senaryonun
  3 profili `#pf-add`'i devre dışı bırakıyordu).

## [2.2.0] - 2026-10-26

v2.2 turu — "anlaşılır dil + geri bildirim + tatlı arayüz". Bu tur da final değildir.

### Added
- **Bilgi mimarisi sadeleşti:** 4 sekme yerine 3 sekme + 1 ayar alanı — `Durum`,
  `Profiller`, `Geçmiş`, `Ayarlar`; "Ritim" adı kalktı, içeriği Ayarlar'a taşındı.
- **Toast/geri bildirim sistemi** (`src/toast.ts`, kendi kendine mount): `toast.ok`,
  `toast.info`, `toast.err`, `toast.action` (Geri al), `toast.busy`; sağ-alt, yeni üstte,
  ekranda en fazla 2 bildirim, kuyruk; başarı 4 sn, hata 6 sn, aksiyonlu bildirim
  kendiliğinden kapanmaz; hover/focus'ta sayaç durur; `role="status"`/`role="alert"`,
  `aria-live` desteği, Esc ve × ile kapatma, otomatik kapanan bildirime focus taşınmaz.
- **Sessiz eylemlere geri bildirim:** profil kaydet/uygula/çoğalt/sil (+Geri al), lisans
  etkinleştir/kaldır, uygulama bağla/kaldır, "Windows açılışında başlat", kalibrasyon,
  log temizle (+Geri al), "otomatik"e alma, güncelleme kurulumu artık toast üretir.
- **Renk sıcaklığı Kelvin ile:** 2500–6500 K kaydırıcı (sol sıcak), 100 K adım, sürekli
  gradyan, büyük değer "4200 K" + altında ad ("Florasan"), hazır çipler
  (2500 Mum · 2700 Ampul · 3400 Halojen · 4200 Florasan · 5500 Gündüz),
  "6500 K'ye dön" ve Esc ile geri alma.
- **Hero'da zincir eğrisi:** ışık → parlaklık → sarılık ilişkisini gösteren ince, canlı
  güncellenen SVG eğri (tek "wow" noktası).
- **Kaydedilmemiş değişiklik göstergesi:** profil editöründe yapışkan "Kaydet /
  Kaydedilmedi" çubuğu.
- Disabled düğmelerde nedeni görünür; Pro kapısı uyarısı düğmeden erişilebilir.

### Changed
- **Dil sözlüğü uygulandı:** kip/mod/kaynak → "Çalışma biçimi"; sıcak ton/ton/renk →
  "Ekranı sarılaştırma"; şiddet → "Sarılık düzeyi"; kalibrasyon → "Öğrenilen tercih";
  dondurma/kilit → "Ayar yapılmıyor" (+ nedeni); tur → "Ölçüm"; WCAG/AAA/FAIL →
  "çok iyi / iyi / sınır / okunaksız"; wmi/ddc/donanımsal/yazılımsal →
  "dahili panel / harici" + "monitörün kendi ayarı / programla yapılıyor";
  Otostart → "Windows açılışında başlat".
- Tasarım dili: 3 kademeli zemin merdiveni, kartlarda 2 katmanlı yumuşak gölge ve ince
  üst ışık kenarı, yalnız sol rayda cam yüzey (`backdrop-filter`), hero'da ≤3°
  perspektif; 180 ms varsayılan hareket, `prefers-reduced-motion` desteği.
- Erişilebilirlik: `:focus-visible` her yerde görünür, `forced-colors: active` ve
  `prefers-contrast: more` desteği, sidebar'da roving tabindex + ok tuşları, sidebar
  etiketi her genişlikte görünür (ikon-only mod kalktı).
- Geçmiş sekmesi ham backend dökümü yerine insan dilinde zaman çizelgesi gösterir.
- HDR açıkken renk sıcaklığı kontrolü soluk ama yerinde kalır; altında tek satır neden
  ve "HDR ayarlarını aç" bağlantısı bulunur.

### Fixed
- `accent-picker` seçilen vurgu rengini artık kalıcı yazar (yeniden açılışta sıfırlanmaz).
- Okuma profili kapandığında tema ve animasyon geri gelir.
- `sleep-cap` ipucu metni kodun tersini yazıyordu → düzeltildi.
- `#break-text` artık güncelleniyor.
- `pf-add` sınırda nedensiz devre dışı kalmıyor, Pro uyarısı erişilebilir.
- `break-switch` sessiz değil, değişiklik bildiriliyor.
- Profil kartına tıklama "seç" ve "uygula" olarak ayrıldı (sürpriz uygulama yok).
- `editorDirty` artık çiziliyor → kaydedilmemiş değişiklik uyarısı görünüyor.
- Log temizleme `window.confirm` yerine toast + Geri al kullanıyor.
- `pause-btn` ve `day-off-btn` aynı `pauseUntil` alanını paylaşıp birbirini iptal ediyordu →
  ayrı durumlar.
- `autoLock` iki yönlü çalışıyor (uygulama kapanınca kilit açılır); "Film" tohum
  profilinde `autoLock` kapalı.
- Yanlış bilgi veren metinler düzeltildi: gece tavanı "bu tavanın altına inmez" →
  "gece bu değerin üstüne çıkmaz"; "canlı önizleme" yalnız etkisi olan kipte yazılıyor.
- İngilizce sızıntılar temizlendi ("bright/cool", "dark/dim", ham `wmi`/`ddc` rozetleri).
- Metin taşması/kırpma giderildi (hero'da çift etiket, uzun tema adı, boş form alanları).

### Removed
- "Ritim" sekmesi adı ve Bugün'deki profil çipleri (Profiller'de mevcut).
- Geçmiş'teki `lic-mini` (lisans durumu Ayarlar'da).
- Üç ayrı durum düğmesi → tek "Otomatik ayar" seçici (Açık · 1 saat · Bugün · Kilitli).
- Ham jargon rozetleri ve kullanıcıya gösterilen kısaltmalar (`VCP`, `DDC`, `WMI`,
  `rampa`, `invoke`).

## [2.1.0] - 2026-10-25

[karşılaştırma](https://github.com/TitanLion72/smart-screen/compare/v2.0.0...v2.1.0)

### Added
- **Tepside hızlı panel (flyout):** 340×420, çerçevesiz, her zaman üstte; parlaklık
  kaydırıcısı + ±10, dört hızlı eylem, Ayarlar bağlantısı; dışına tık veya ESC kapatır.
- **Pencere-arası olay köprüsü:** `ss:action` (measure / pause-1h / day-off / lock /
  open-main / brightness-set) ve `ss:state` (1 sn throttle); ana pencere tek doğru kaynak.
- **Sağ tık tray menüsü:** Ayarlar · 1 saat duraklat · Bugün kapat · Çıkış.
- **Otomatik güncelleme:** `tauri-plugin-updater` + `process`, `installMode: passive`,
  minisign imza doğrulaması; açılıştan 10 sn sonra ve günde bir kontrol; güncelleme
  bandı + "Ertele" (24 saat); onaysız yeniden başlatma yok.
- **`tools/release-manifest.mjs`:** `latest.json` + `.sha256` üretir.
- **HDR farkındalığı:** `GET_ADVANCED_COLOR_INFO` bit-1 ile tespit; HDR açıkken sıcak ton
  uygulanmaz; `unwarm_device` ısıtma öncesi orijinal rampaya döner (kalibrasyon ezilmez);
  monitör satırında HDR rozeti + neden satırı, HDR değişimi sonraki turda yakalanır.
- **Donanımsal renk sıcaklığı altyapısı (VCP 0x0C):** MCCS caps parser (0x0C / 0x0B /
  0x14-User), `K = 3000 + değer × artış`, 2500–6500 kelepçe, >250 K eşik, 10 dk hız
  sınırı, 3 hatada o monitörde kapatma; destek yoksa yazılımsal gamma'ya düşer.
- **Açık kaynak hazırlığı:** `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
  issue/PR şablonları, GitHub topics; 32 kaynak dosyaya SPDX başlığı
  (`tools/add-spdx.mjs`, `--check`).

### Changed
- Tray sol tık artık menüyü değil hızlı paneli açar.
- Lisans MIT → **GPL-3.0-or-later**; README'de GPLv3 §6(d) Corresponding Source açıklaması,
  Hakkında kartında sürüm + lisans + kaynak bağlantısı.
- Flyout parlaklık yazımı ana pencerenin durumunu da günceller.
- `CloseRequested` ve `Focused(false)` olayları pencere etiketine göre filtreleniyor;
  `window-state` flyout geometrisini kaydetmiyor.

### Fixed
- Tray toggle yarışı: açık panel kapanmıyordu → 300 ms autohide damgası + saf fonksiyon
  + 3 test.
- Güncelleme ertelemesi bandı 48 saat sonra dönüyordu → 24 saat.
- HDR sonradan açılınca sıcak ton takılı kalıyordu.
- `gamma.rs` hata kıyası HDR'de elenen cihazları saymıyordu.
- `kelvin_to_value` sabit üst sınır ve yanlış `last_write` değeri.
- Geçici DDC hatası kalıcı "desteklenmiyor" olarak işaretleniyordu.
- Flyout "Ayarlar" için eksik `core:window:allow-show` / `allow-set-focus` izinleri.
- Opener kapsamı yalnız `ms-settings` olduğu için GPL kaynak bağlantısı ölüydü.
- QA'da flyout taşma kontrolü ve kurulum yolu testi eksikti.

### Removed
- Ölü `flyout_show` komutu ve kullanılmayan `ColorTempInfo.kelvin` alanı.

### Security
- Güncelleme yükü yalnız proje özel anahtarıyla imzalanmışsa kabul edilir; `latest.json`
  ele geçirilse bile imzasız paket yükletilemez.
- Git geçmişinde `.pem`, `.key`, `.env` sızıntısı tam tarandı — bulunamadı; bağımlılık
  lisansları GPL ile uyumlu (MIT/Apache/BSD/ISC/Zlib/MPL-2.0).

## [2.0.0] - 2026-10-24

[karşılaştırma](https://github.com/TitanLion72/smart-screen/compare/v1.0.0...v2.0.0)

### Added
- **Arayüz sıfırdan:** sol ray + dört bölüm (Bugün / Ritim / Profiller / Geçmiş),
  119 id'lik DOM sözleşmesi (`index.html` başındaki `<!-- SÖZLEŞME -->` bloğu),
  serbest boyutlandırma (min 720×560).
- **"Şu an" hero kartı:** gerçek/hedef yüzde, mod rozeti, sonraki değişim saati,
  neden satırı; monitör satırları, zamanlı duraklatma (1 saat / Bugün kapat),
  24 saatlik ton şeridi.
- **Frontend bölünmesi:** `main.ts` 123 satır boot + `orchestr.ts` (durum ve tick, DOM'suz)
  + `panels.ts` (render); bağımlılık tek yönlü.
- **CI:** `.github/workflows/ci.yml` — fmt / clippy / test, `cargo-audit`, frontend build.
- `LICENSE` (MIT) ve README güncellemesi.

### Changed
- Tüm komutlar `async`; uzun işler `spawn_blocking` ile ana thread dışında.
- `ps.rs` 15 sn zaman aşımı; `monitor.rs` tek tarama (`snapshot()`) ve tanıtıcı sızıntısı
  kapatıldı.
- Lisans bellek önbelleği; `prefs`/`logger`/`theme` yazmaları `Mutex` + `.tmp-<pid>` ile
  atomik; `gamma.rs` `OPS` kilidi; crash log append + 64 KB rollover.
- Sessiz hata yutma bitti; `tick` yeniden giriş koruması ve `pendingCount` sıfırlaması.
- Pencere serbest boyutlandırılabilir oldu (`resizable: true`).

### Fixed
- `#risk-band` / `#risk-text` hiç render edilmiyordu → `renderRisk()` eklendi (FAIL temada
  bant + "Güvenli temaya dön").
- QA taşma assert'i etkisizdi → gerçek `scrollWidth` ölçümü.
- Dondurulan tur sayacı şişiyordu (bağlı profil notu öneki).
- `#warm-range` üst sınırı 100 iken durum 60'a kelepçeleniyordu → max 60.
- `#day-off-btn` etkin durumu `pausedNow()` ile hesaplanıyor.
- Ölü `if (!S.editorDirty)` koşulu ve soğuk açılışta anlamsız `pushUndo` kaydı.
- QA gece koruması assert'i artık `localStorage ss:sleepStart` ile kalıcılığı ölçüyor.
- Sil düğmesinde eksik `aria-label`; `renderAudit` gereksiz yeniden kurulum yapmıyor.
- CSP `connect-src`'e dev HMR (`localhost:1420`, `ws://localhost:1420`) eklendi.

### Security
- CSP dolduruldu, `withGlobalTauri` kapatıldı, capabilities daraltıldı
  (`opener:allow-open-url` + `ms-settings` kapsamı).

## [1.0.0] - 2026-10-20

[karşılaştırma](https://github.com/TitanLion72/smart-screen/compare/v0.10.0...v1.0.0)

### Added
- **Offline lisans (Ed25519):** `license.rs`; anahtar = `SS-` + Crockford Base32
  (u16 BE + `v1|email|tarih` + 64 B imza); `status` / `activate` / `deactivate`,
  atomik depo, gömülü Pro açık anahtarı.
- **Ayarlar'da Lisans kartı** (etkinleştirme, durum, kaldırma).
- **`tools/license-gen.mjs`:** satıcı anahtar üreteci.

### Changed
- **Pro kapıları:** harici monitöre yazma lisanssızken reddedilir; sınıflandırma
  kaybında fail-open (dahili panel yanlış engellenmez); okuma ve dahili panel serbest.
- Ücretsiz sürüm: 3 profil + uygulama bağlama kapalı; mevcut kullanıcının fazla
  kayıtları silinmez.
- Sürüm numarası 1.0.0'a çekildi — satışa hazır ilk sürüm.

### Security
- Özel anahtar repoya girmez (`.gitignore`: `*.pem`).
- E2E: gerçek özel anahtarla üretilen anahtar, Rust tarafındaki gömülü açık anahtarla
  doğrulandı.

## [0.10.0] - 2026-10-19

[karşılaştırma](https://github.com/TitanLion72/smart-screen/compare/v0.9.0...v0.10.0)

### Changed
- **Monitör-başına sıcak ton:** `gamma.rs` içinde `ORIGINAL: HashMap<device, Ramp>`,
  `CreateDCW` ile her ekran için ayrı yakalama/uygulama/geri yükleme; cihaz başına
  `.bin` dosyası ve eski tek dosyadan migrasyon. Komut imzaları değişmedi.
- Otomatik karar harici monitörlere de yazılıyor (deadband 3, tek hata logu,
  `monWriteChain` ile sıralı yazma).
- Hotplug: odakta ve dakikalık turda monitör listesi değişimi yakalanıyor.

## [0.9.0] - 2026-10-18

[karşılaştırma](https://github.com/TitanLion72/smart-screen/compare/v0.8.1...v0.9.0)

### Added
- **`monitor.rs` monitör katmanı:** `EnumDisplayMonitors` + `MONITORINFOEXW` ve
  `QueryDisplayConfig` ile dahili/harici ayrımı (eDP/LVDS/UDI_EMBEDDED dahili sayılır).
- Harici monitörlerde DDC/CI (`SetMonitorBrightness`), dahili panelde WMI; DDC hatası
  satır içinde gösterilir, sessiz düşüş yok; tek ekran + sınıflandırma kaybında WMI
  son şans.
- Üç yeni komut: `monitor_list`, `brightness_get_monitor`, `brightness_set_monitor`
  (eski komutlar değişmedi).
- Panelde **Monitörler** kutusu: seçim, kaydırıcı (change/debounce), −/+ düğmeleri,
  hata durumunda kilit; yazmalar serileştirildi.

## [0.8.1] - 2026-10-17

[karşılaştırma](https://github.com/TitanLion72/smart-screen/compare/v0.8.0...v0.8.1)

### Fixed
- `brightness_set` u8 hatası (float 82.5 → tam sayıya yuvarlanıyor).
- `loadNumber` 0 değeri korunuyor.

## [0.8.0] - 2026-10-17

[karşılaştırma](https://github.com/TitanLion72/smart-screen/compare/v0.7.0...v0.8.0)

### Changed
- Cilalama turu: Wave 1 (B1–B27 bulguları), Wave 2 (durum/async/erişilebilirlik),
  Wave 3 (dokümantasyon).
- Gerçek README ve `cargo clippy` temizliği.

[Unreleased]: https://github.com/TitanLion72/smart-screen/compare/v2.1.0...HEAD
