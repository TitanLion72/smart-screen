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

## [2.11.0] - 2026-10-29

"Günlüğü aç" — destek akışının eksik halkası; artık raporu kopyaladıktan sonra
dosyayı aramak gerekmiyor.

### Added
- **"Günlüğü aç" düğmesi** (Ayarlar → Kontrol) — `smart-screen.log` dosyasını
  varsayılan editörde açar; dosya henüz yoksa klasörünü açar. Açılan yol toast'ta
  görünür. Rapordan bağımsızdır: ilk kurulumda da çalışır.
- `open_log` komutu (`src-tauri/src/lib.rs`) — yol sunucu tarafında hesaplanır,
  komut parametre almaz (yol geçişi yüzeyi yok). `logger::log_path` artık `pub`.

### Changed
- **"Günün rengi" dwell kararı saf fonksiyona taşındı** (`engine.autoPaletteDue`).
  Kapalı/dwell/sınır/aynı palet/saat geri alma durumlarının hepsi `npm test` ile
  doğrulanıyor; önceden yalnız gözle görülebiliyordu.

### Fixed
- `tools/release-manifest.mjs` bilinmeyen seçeneği sessizce yutuyordu; bu yüzden
  v2.10.0'un `latest.json` dosyası boş `notes` ile yayınlandı. Artık bilinmeyen
  seçenek hata verir, `--notes-file` UTF-8 markdown okur ve `--notes` ile birlikte
  verilemez.

### CI
- İş akışları Node 24'e çekildi; Node 20 `.ts` test dosyasını çalıştıramıyordu.

## [2.10.0] - 2026-10-29

"Kontrol" — bir şey çalışmıyorsa **neden** çalışmadığı artık log'da değil, uygulamanın içinde.

### Added
- **Kontrol (tanılama) kartı** — Ayarlar'da, Gelişmiş'in hemen üstünde: parlaklık, sıcak ton, HDR, monitörler, tema, açılış, lisans ve günlük tek tıkla ölçülür.
- Her satırda durum noktası, sade dille neden ve yalnız sorunlu satırda "ne yapmalı" ipucu var.
- **"Raporu kopyala"** — sürüm, işletim sistemi, tarih, tüm satırlar ve o anki düzen/palet düz metin olarak panoya.
- Tanılama QA aracı (`qa/audit-diagnostics.mjs`) kartın görünürlük, koşu, pano, yan etkisizlik, `warmth=0` ve hata yolunu kalıcı denetler.

### Changed
- Parlaklık testi ekrandaki değerin aynısını yazar (görünür değişiklik yok); sıcak ton kapalıyken gamma rampası hiç yazılmaz.

### Fixed
- **"Günün rengi" kendi kendini kilitliyordu** — otomatik palet değişimi elle seçim sayılıp 10 dakikalık dwell penceresini başlatıyordu.
- **Tanılama hatasından sonra aynı rapor boş liste bırakıyordu** — hata sonrası önbellek imzası sıfırlanmıyordu; damga dolu, satırlar boş kalıyordu.

## [2.9.0] - 2026-10-29

Güvenlik + iki kullanıcı şikâyeti + Grok botunun açtığı PR'lar.

### Security
- **Yerel güvenlik kapısı** (`tools/security-check.mjs`, `npm run check:security`):
  7 kural — sır taraması (S1), kimlik dosyası (S2), kabuk komut enjeksiyonu (S3),
  statik sunucuda yol geçişi (S4), sıkı CSP (S5), en az yetki (S6), bağımlılık
  CVE'leri (S7). CI'da zorunlu; ihlal varsa birleştirme yok.
- **Kapının kendi testi** (`qa/security-selftest.mjs`): 5 ihlal sınıfının gerçekten
  yakalandığını kanıtlar (temiz taban PASS, her ihlal FAIL).
- **Üretim CSP'si sıkılaştırıldı:** `localhost:1420` üretimden çıktı (yalnız
  `devCsp`'de), `object-src`/`base-uri`/`frame-ancestors`/`form-action` eklendi,
  `script-src`/`style-src` açıkça `'self'`. Geliştirme CSP'si ayrı tanımlı.
- **`qa/run.mjs` yol geçişi açığı kapatıldı** — Grok botunun PR'ları 8 statik
  sunucudan 5'ini düzeltmişti; kapı kalan 1'ini yakaladı (`run.mjs`).
- Bağımlılıklar: `zip` 4.6.1 → 9.1.3 (3 RustSec açığı, biri kritik 9.1),
  `tokio` 1.53.2 → 1.54.1, `tauri-plugin-updater` 2.14.0 → 2.14.1,
  `vite` 8.3.5. `cargo audit` ve `npm audit` temiz.
- `.gitignore`: `.env`, `.env.*`, `*.p12`, `*.pfx` eklendi (`!.env.example` hariç).
- `SECURITY.md` bağlayıcı kural tablosuna dönüştürüldü + sır sızması müdahale planı.
- **Log zaman biçimi birleştirildi.** Üç Rust yazıcı UTC+nanosaniye, JS yerel saat
  yazıyordu; aynı dosyada iki zaman dilimi satırları sıralanamaz kılıyordu.
  `logger::now_local()` (yerel, saniye) tek biçim — `orchestr.localIso` ile aynı.

### Fixed
- **"Hangi paleti seçersem seçeyim ilk temadaki sarı her yerde var."** Kök neden:
  `[data-accent]` blokları `--accent`ı **global** eziyordu ve seçim kalıcıydı; bir kez
  Şampanya seçen kullanıcı 12 paletin hepsinde altın görüyordu. Artık vurgu **palet
  başına** saklanıyor (`ss:accents`), varsayılan "Palet rengi" (`--accent-base`).
  Bir palette seçilen renk başka palette sızmaz, geri dönünce hatırlanır.
- **"Yeniden ölç" çalışmıyor gibiydi.** Ölçüm çalışıyordu ama veri aynıysa render
  önbelleği listeyi yeniden çizmiyor ve hiçbir geri bildirim vermiyordu. Artık döner
  simge + sonuç toast'ı ("12 tema ölçüldü · 2 okunaksız") var; hata da toast'a düşer.

### Added
- `qa/audit-accent.mjs`: 12 palet × vurgu izolasyonu × palet hafızası × kontrast
  butonu × "Günün rengi" — kalıcı regresyon testi.
- **"Günün rengi"** (Ayarlar → Görünüm, varsayılan kapalı): saate göre palet
  kendiliğinden döner — sabah `fildisi`, gündüz `kagit`, akşam `gunbatimi`,
  gece başı `obsidyen`, gece `gece`. Elle yaptığın seçim 10 dk korunur
  (dwell), sonra saat dilimine döner. Saat dilimi eşlemesi tek yerde
  (`orchestr.paletteForHour`) ve QA bu eşlemeyi kaynaktan okuyup doğrular.

## [2.8.0] - 2026-10-28

Kullanıcı geri bildirimi turu: **"renk çoğalsın, bento ile sahne ayrışsın, oyunda
parlaklık tam olsun, toast yok, kontrast denetimi anlaşılmıyor."** Beşi de yapıldı.

### Added
- **12 renk paleti** (7 → 12): Okyanus, Lavanta, Gün batımı, Kum, Buz. Hepsi
  `palette.css`te; kontrastları WCAG eşiklerinden geçiyor (48 ölçüm).
- **Oyun/video sırasında %100 parlaklık** (Ayarlar → Oyun ve video, varsayılan
  açık): tam ekran oyun/video/PDF açıkken ekran tam parlaklığa çıkar, çıkınca
  eski değere döner. Kilit ekranında uygulanmaz; anahtar kapatılınca boost
  hemen geri alınır.
- Toast artık anlamlı eylemleri bildiriyor: düzen/palet seçimi, 1 saat
  duraklatma ve "bugün" kapatma (ikisinde **Geri al** düğmesi).
- `qa/audit-flyout.mjs` matrisi palet listesini `palette.css`ten keşfediyor:
  48 kare (4 şablon × 12 palet).

### Changed
- **Bento artık gerçekten mozaik.** v2.6/v2.7'de yalnız yüzey değişiyordu
  (cam kapanır, kutu dolar); ızgara sahne ile aynıydı — "fark yok" hissi
  buradan geliyordu. Artık Durum sayfası 12 sütunlu asimetrik ızgarada: hero
  iki satır boyunca büyük karo, sağında monitörler, altta geniş "otomatik
  ayar" ve iki satıra yayılan vurgulu "durum" karosu.
- **Kontrast denetimi açıklaması yeniden yazıldı.** Liste bu ekrandaki 12
  paleti değil, **OpenCode tema dosyalarını** ölçüyor (uygulama OpenCode
  temasını da değiştiriyor). Eşikler artık metinde yazılı: 7+ çok iyi,
  4.5 iyi, 3 sınır, altı okunaksız.
- `tools/check-tokens.mjs` paletleri CSS'ten keşfediyor — yeni palet eklemek
  denetim dışında kalamıyor. `qa/run.mjs` de beklenen palet sayısını sabit
  tutmuyor.

### Fixed
- **Mozaik alan adı olarak `auto` kullanılamaz:** CSS anahtar kelimesi olduğu
  için eşleşmiyor, karolar sessizce 67px'lik şeritlere düşüyordu.
- Mozaik kuralları `#page-panel .asym > .span-side { grid-column: auto }`
  tarafından eziliyordu (aynı özgüllük, kaynak sırası kazanır); blok dosya
  sonuna taşındı.
- Flyout/konsol şablonunda sürüm "V2.7.0" görünüyordu (uppercase mirası);
  sürüm numarası artık büyütülmüyor.

## [2.7.0] - 2026-10-28

Şablon sistemi artık yarım değil: **flyout (tepsi paneli) ve ana pencerenin üç sayfası
da şablonu giyiyor.** Renk tek dosyada toplandı; 4 şablon × 7 palet her yerde aynı
sözleşmeyle çalışıyor.

### Added
- **Flyout şablon katmanı** (`src/flyout-templates.css`): bento mozaik, sahne cam +
  vurgu ışıması, dergi hairline + serif, konsol mono ızgara + LED. 340×420'de dikey
  kaydırma ve kırpılma yok.
- **Flyout görünüm senkronu:** ana pencerede seçilen şablon/palet `ss:state` ve
  `localStorage` (`ss:template`, `ss:designTheme`) ile flyout'a geçer; geçersiz değer
  `bento`/`obsidyen`'e düşer. Pencere odağa gelince tazelenir.
- **Sayfa yerleşimleri:** Profiller'de usta-ayrıntı (kartlar | editör), dergi'de tek
  kolon editoryal akış; Geçmiş'te bento mozaik özet şeridi, dergi'de tam genişlik
  grafik + altında kayıtlar, konsol'da dar sağ kolon; Ayarlar'da konsol varyantı.
- Test: `qa/audit-flyout.mjs` (4 şablon × 7 palet karesi) ve `qa/audit-templates.mjs`
  sayfa matrisi (4 şablon × 4 sekme; yatay taşma ve kırpılma assert'i).

### Changed
- **Renk tek kaynak:** `src/palette.css` — 7 palet + obsidyen kökü. `styles.css` ve
  `flyout.css` bunu `@import` eder; `tools/check-tokens.mjs` ölçümü bu dosyadan yapar.
- Profiller'de editör kendi içinde kayar; **Kaydet çubuğu hep görünür**
  (bento/sahne/konsol). Dergi bilinçli olarak sayfa akışında kaydırır.
- Flyout'taki sabit mavi ışıma paletin vurgu rengine bağlandı.
- Ayarlar uzun bir form olduğu için tek okunur kolonda kalır; şablon kimliği kart
  dili + tipografiden gelir.

### Fixed
- Tek kolona inen düzenlerde `.span-side`'ın `grid-column: 2`si örtük ikinci kolon
  açıyordu — Geçmiş/dergi iki kolonda kalıyordu.
- Geçmiş'te grafik (300 px) ve kayıtlar (260 px) taban yükseklikleri tek kolonda
  taşırıyordu; dergi'de grafik geniş + yassı, kayıtlar altında.

## [2.6.1] - 2026-10-27

v2.6.0 yayınlandıktan sonra uygulama **kendi penceresinde** açıldı ve iki görsel kusur
hemen sırıttı — QA bunları ölçmüyordu, çünkü ikisi de "boşluk" hatasıydı, "taşma" değil.

### Fixed
- **Büyük pencerede hero'nun yarısı boştu.** 1936×1048'de metin tepede, eğri dipte
  kalıyordu (~190px ölü boşluk). Geniş ekranda hero iki kolona döndü (metin solda, eğri
  sağda) ve rakam 60px'te oyuncak gibi kalmak yerine 64–104px arası ölçekleniyor.
- **İçerik şeridi 1180px'e sıkışıyordu** — 1920'de kenarlarda ~370px ölü boşluk vardı.
  `min(1500px, 96vw)`.
- **Hero satırı `fr` ile şişiyordu:** üst satır artık `min(40vh, 360px)` ile sınırlı,
  büyüyen pay alt satırdaki kartlara gidiyor.
- **1000×720'de sayfa 501px kaydırıyordu.** Tek kolon eşiği 1020 → **900px**: yaygın
  bir boyutta gereksiz yere tek kolona düşüyordu. Artık 1000'de de ızgara → 0px.
- **Dergi şablonunda alt yarı boştu.** Kapak düzeni: hero kalan yüksekliği alır, alt
  bölüm içeriği kadar kalır.

### Added
- **`qa/audit-templates.mjs`** — 4 şablon × 6 boyut matrisi + 7 palet karesi; taşma
  ve kırpılma ölçer. `qa/run.mjs` yalnız 800×600 ölçüyordu, bu yüzden "geniş ekranda
  boşluk" sınıfı hata hiçbir assert'e takılmıyordu.

## [2.6.0] - 2026-10-27

Kullanıcı: *"senden bir öncekiler asla benzemeyen"*, *"en iyi landingpage gibi"*,
*"3B sahneli ama yormayan"*, **birden fazla tasarım şablonu + renk kombinasyonu**.
Bu sürüm görünümü iki bağımsız eksene ayırır: **4 düzen × 7 palet = 28 görünüm**,
hepsi aynı DOM üzerinde.

### Added
- **4 düzen (şablon).** Ayarlar › Görünüm'den seçilir, `data-template` ile `<html>`'e
  yazılır, kalıcıdır. Varsayılan **Bento**.
  - **Bento** — asimetrik mozaik, dolu yüzeyler, kalın yarıçap; 1040×740'ta Durum
    sayfası **kaydırmıyor** (hero + monitörler yan yana, altta üç kart).
  - **Sahne** — cam hero + 3B paralaks + yüzen dock (v2.3'ün rafine hâli).
  - **Dergi** — masthead, serifdisplay, kart yok yalnız hairline kurallar, kâğıt dokusu,
    üst hizalı ince gezinme.
  - **Konsol** — mono readout, 1px ızgara, LED noktaları, hareket yok.
- **2 yeni palet:** **Kâğıt** (nötr sıcak açık + kiremit) ve **Grafit** (nötr soğuk
  koyu + gök mavisi). Toplam 7 palet.
- **Şablon seçici** (Ayarlar › Görünüm): her kart şablonun geometrisini 3 blokla
  gösteren iskelet önizleme taşır.
- **`tools/check-tokens.mjs`** — tasarım sisteminin bekçisi: bileşen katmanında
  (`templates.css`) ham renk yasak, 7 paletin 4 kritik kontrast oranı WCAG 2.1 ile
  ölçülür. `npm run check:tokens`, CI'da çalışır.

### Changed
- **Görünüm artık Gelişmiş'in içinde değil.** Ürünün kimliği oradaydı ama kapalı bir
  `<details>` içinde saklıydı; kimse bulamıyordu. Ayarlar sayfasında kendi kartına taşındı.
- **Fildişi paletinin vurgusu koyulaştırıldı** (`#a8763c` → `#94632d`): beyaz metinle
  oranı 3.80 idi, AA sınırı 4.5'in altında. Artık 4.95.
- Durum sayfası 1040×740'ta kaydırmıyor; kartlar kendi içinde kayar, tam liste Geçmiş'te.
- Monitör satırı dar kolonda iki satıra iner (ad kırpılması bitti: "Generic PnP Monitor").

### Fixed
- **Toast bir düğmenin üstüne denk gelince onu süresiz kilitliyordu.** Fare toast'ın
  üzerinde durdukça sayaç duruyordu (WCAG 2.2.1 gereği) ama duraklama sınırsızdı;
  altındaki düğme tıklanamıyordu. Artık duraklama en fazla 12 saniye.

## [2.5.0] - 2026-10-27

Kullanıcı iki şeyi net söyledi: *"pek stabil çalışmıyor, bazen durduk yere çok kısık bazen
durduk yere çok parlak"* ve *"sıcaklık tonu işlevsiz gibi"*. Bu sürüm yeni özellik değil,
**güven sürümü**: her iki şikâyetin kök nedeni ölçüldü ve kurallar test edilebilir hâle
getirildi (`src/engine.ts` + 12 birim testi, `decide.rs` 24 saat simülasyonu).

### Fixed
- **Parlaklık artık sıçramıyor.** Tur başına en fazla 8 puan yazılır; hedefe uçurum
  yok. Tema değişimi parlaklığı hedefe sıçratmıyor, kademeli yaklaşıyor (`decide::next_brightness`).
- **Kilit ekranı / kapalı ekran artık ayar turu değil.** `lockapp.exe` önde olduğu turda
  hiçbir yazma yapılmaz; parlaklık okuması 0 geldiğinde (ekran kapanması) yazma atlanır.
  "Durduk yere çok kısık" bunun sonucuydu: kilitte 0 okunuyor, uyanınca o 0'a yazılıyordu.
- **Dış müdahale saygı görüyor.** Yazdıktan sonraki 90 sn içinde okunan değer ±6'dan fazla
  saparsa (kullanıcı ya da başka bir yazılım) 15 dk boyunca dokunulmaz. WMI'ın bir tur
  gecikmeli yansımasına karşı 250 ms sonra doğrulama okuması yapılır — yanlış pencere açılmaz.
- **Işık seviyesi histerezli.** Eşik etrafındaki ±6 gürültü sahneyi oynatmıyor; ton için son
  üç ölçümün medyanı kullanılıyor. Tek gürültülü kamera karesi artık tema değiştiremiyor.
- **Tema değişimi frenlendi.** En az 10 dk bekleme + 3 bağımsız ölçüm (pil modunda 2).
  Kamera önbelleğinden dönen aynı kare "ikinci ölçüm" sayılmıyor (eski hâlde sayılıyordu —
  tema arka arkaya zıplıyordu).
- **Sıcak ton gerçekten uygulanıyor.** Şiddet ölçeği 0-45'ten **0-100**'e taşındı ve yüzde
  artık *tavan* değil *şiddet*: otomatik eğri (saat + ışık) bununla çarpılır. Kanal eğrisi
  kübikleştirildi (`warm_channel`), böylece %70 "biraz sarı" değil gerçekten sıcak.
  Mevcut kullanıcının %35 ayarı bir kez %70'e taşınır (`warmScale=2` işareti).
- **Sıcak ton yazımı doğrulanıyor.** `SetDeviceGammaRamp` sürücü tarafından sessizce
  reddedilebiliyor; yazımdan sonra rampa geri okunur, fark büyükse log'a
  `sıcak ton sürücüde tutmadı: warmth=… beklenen mavi=%… okunan=%…` düşer.
- **Yanlış "tam ekran" dondurması.** `applicationframehost.exe` (UWP çerçevesi) ve kabuk
  pencereleri (Başlat, arama, XAML) tam ekran boyutunda görünüp ayarı donduruyordu. Artık
  `SHQueryUserNotificationState` ile ayrıştırılıyor: gerçek tam ekran oyun/video dondurur,
  kabuk katmanı dondurmaz.

### Changed
- **Öğrenilen parlaklık artık delta.** Mutlak değer değil, hedefe göre fark (−20..+20)
  öğrenilir; en az 3 gözlem **ve** 3 farklı gün gerekir. Eski `prefs.json` kayıtları
  (mutlak değer) göçte silinir, tema tercihleri korunur (`STORE_VERSION=2`).
- **Parlaklık yazımı doğrulanır.** Yazma sonrası okunan değer ±2 dışındaysa 3 kez denenir,
  olmuyorsa "sürücü parlaklığı uygulamadı: yazılan X, okunan Y" hatası yüzeye çıkar.
- **Log damgası yerel saat + ofset** (`2026-10-27T14:32:05+03:00`). Eski UTC (`Z`) damgası
  ile saatler karışıyordu; yeni satırlarda `read=`/`written=` alanları var (geriye uyumlu).
- **Okunaksız kombinasyon kapısı.** Açık temada çok kısık, koyu temada çok parlak hedef
  okunabilir aralığa çekilir; gece tavanı ve okuma kipi verildiyse kullanıcı niyeti korunur.

## [2.4.3] - 2026-10-26

v2.4.2'yi kurup açtım: pencere **yine 816×639** geldi. Sebep `tauri-plugin-window-state` —
son pencere boyutunu hatırlıyor, yani yeni varsayılan (1040×740) mevcut kurulumlara
**hiç ulaşmıyordu**. Paket yayınlandıktan sonra fark edildi.

### Fixed
- **Eski 800×600 penceresi bir kez büyütülüyor:** `winstate` modülü, kayıtlı boyut tam
  olarak eski varsayılana eşitse (800×600) ve pencere maksimize değilse 1040×740 yapar,
  işaret dosyası bırakır ve bir daha çalışmaz. Kullanıcının kendi seçtiği boyutlara
  dokunulmaz (`kullanici_boyutu_korunur` testi).

## [2.4.2] - 2026-10-26

Kullanıcı v2.4.1'i açtı, ilk bakışta iki şey sırıttı: uygulama **800×600** açılıyor
(hero + monitörler ekranı doldurup gerisi aşağıda kalıyor) ve içerik dock'un dibine
sıfıra dayanıyor. Ayrıca 1920'de sol kolon kısa kalıp yine ölü boşluk bırakıyordu.

### Changed
- **Varsayılan pencere 1040×740** (min 760×600). 800×600'de ilk açılış sıkışıyordu.
- **Hero yatay yerleşime geçti:** parlaklık solda, eğri sağda. Dikey yığında hero
  383px yer kaplıyordu; artık 226px — 740px pencerede alt sıralar da görünüyor.
- **Durum sayfası dengelendi:** "Otomatik ayar" kartı sol kolona (olay akışının altına)
  taşındı. Sağda tek "Durum" kartı kaldığı için 1920'de sol altta oluşan ölü boşluk kapandı.
- Otomatik ayar kartında düğmeler tek satırda, ölçüm bilgisi altında hairline ile.

### Fixed
- **İçerik dock'a sıfıra dayanıyordu:** sayfa altındaki nefes payı 16 → 24px,
  dock üstüne 8px boşluk.
- **760/800px'te hero eğrisi metnin üstünden geçiyordu:** alçak pencerede eğri
  96px'e *büyüyordu* (ters mantık). Artık 56px'e küçülüyor, metne 84px pay bırakılıyor.
- **Geçmiş özet şeridi tutarsızdı:** iki hücre "—", biri "henüz yok" yazıyordu.
  Üçü de "—"; altında tek satır "İlk ölçümden sonra dolar" (yeni `#sum-hint`).

## [2.4.1] - 2026-10-26

Kullanıcı maksimize pencerede ekran görüntüsü gönderdi: *"şöyle bi bakınca düzeltmişsin
gibi görünüyo mu... şu boşlukları kaç kere söylemem lazım"*. Haklıydı — 720/800/1000 px
test ediyordum, **1920'ye hiç bakmamıştım**.

### Fixed
- **Maksimize pencerede devasa boşluk:** içerik 1920px'e yayılıyor, sol kolon kısa
  kalıp sağda ~400px ölü alan bırakıyordu. İçerik şeridi **1180px** ile sınırlandı
  ve ortalandı.
- **Hero eğrisi 6 kat geriliyordu:** saat etiketleri SVG içindeydi; geniş pencerede
  devasa ve okunmaz oluyordu. Etiketler SVG dışına alındı (00 · 06 · 12 · 18 · 24).
- **Geçmiş sayfasında alt yarı boştu:** grafik artık kalan yüksekliği dolduruyor.
- **"Durum" kartı "-" gösteriyordu** (ekran kilitliyken tur donuyor): artık
  "Henüz ölçülmedi" / "ilk ölçümde seçilir" gibi anlamlı boş durum metni var.
- **Geçmiş özet kartları "-"** → "henüz yok" + açıklama; boş grafiğe
  "Henüz grafik verisi yok" yazısı.
- Monitörler paneli artık **tam genişlik** (yarım kolonda kısa kalıp boşluk bırakıyordu);
  altında dengeli iki kolon: olay akışı | durum + otomatik ayar.

### Notes
- `qa/audit-shots.mjs` artık **1920×1040 ve 1440×900** boyutlarını da yakalıyor —
  bu sınıf hata bir daha gözden kaçmasın.

## [2.4.0] - 2026-10-26

Kullanıcı: *"hala bozuk, bi de birden fazla tema desteği ekle. 3-4 farklı tasarım
olsun premium şekilde... aynı zamanda da codebase incele"*.

### Added
- **5 premium görünüm teması** (Ayarlar → Gelişmiş → Görünüm):
  **Obsidyen** (sıcak kömür + şampanya) · **Gece** (lacinivert + buz gümüşü) ·
  **Orman** (koyu yeşil + adaçayı) · **Gül** (erik + gül kurusu) ·
  **Fildişi** (aydınlık kâğıt + bronz — ilk açık tema).
  Seçim kalıcıdır; kartlarda gerçek palet önizleme şeridi vardır.
- `qa/audit-shots.mjs` + `qa/theme-shots.mjs`: 3 pencere boyutunda tüm sekmeleri ve
  5 temayı yakalayan görsel denetim araçları (geliştirici).

### Changed
- **Hero tek kolona indi:** iki kolonlu düzenin sol yarısı boş kalıyordu; rakam,
  hedef ve eğri artık tam genişlikte akıyor.
- Hero cam plakası, arka ışıma ve dock artık **tema değişkenlerinden** türetiliyor
  (`color-mix`) — sabit koyu renkler fildişi temayı kırıyordu.
- Scrollbar temaya uyuyor (Windows'un gri varsayılanı gitti).

### Fixed
- **Monitör adı ham cihaz yolu gösteriyordu** (`\\.\DISPLAY1`) → "Dahili ekran 1".
- **Animasyon anahtarı yalan söylüyordu:** okuma profili kapanınca ayar `false`
  oluyor ama düğme "açık" kalıyordu; artık her render'da eşitleniyor.
- **Sarılık kaydırıcısı her olayda iki kez yazıyordu** (gamma 2×) → tek çağrı.
- **Bozuk `ss:profiles` JSON'u pencereyi düşürüyordu** → dizi değilse boş listeye düşer.
- Eğri noktası tüm temalarda şampanya kalıyordu (çift CSS tanımı) → accent türevi.
- Profiller sayfasındaki geliştirici notu ("kart: ad • özet...") kaldırıldı.
- Tema kartları vurgu rengi bölümünün üstüne biniyordu → sabit yükseklik + `overflow`.

### Notes
- Kod tabanı incelemesi (15 bulgu) yapıldı; kullanıcıyı etkileyen 6'sı bu sürümde
  kapatıldı. Kalanlar (log biçiminin 3 yerde ayrıştırılması, sarılık çapa tablosunun
  3 kopyası, TS karar katmanının testsizliği) v2.5 için kayıtlı.

## [2.3.2] - 2026-10-26

Kullanıcı geri bildirimi: *"ui çok bozuk, bir kontrol etsen iyiydi"*. Haklıydı —
2.3.0/2.3.1'in ekran görüntülerine bakmadan yayınlamıştım.

### Fixed
- **Hero her sekmede görünüyordu:** büyük durum kartı `#page-panel`'in dışında
  tanımlıydı; Ayarlar ve Profiller'de ekranın yarısını boş yere kaplıyordu.
  Artık yalnız Durum sekmesinde.
- **Hero eğrisi karmaşıktı:** üç eğri (ışık/parlaklık/sarılık) üst üste biniyor,
  "00/12/24" etiketleri çizgilerle çakışıyordu. Tek anlamlı eğri kaldı: **gün
  boyunca ekran sarılığı**, çapa noktaları `decide.rs`'in gerçek `warmth_auto`
  eğrisiyle birebir aynı; "şu an" kesikli çizgiyle işaretli.
- **Yatay kaydırma çubuğu:** `.hero-glow` katmanı `inset: -56px -36px` ile 36px
  taşıyordu → 0'a çekildi. QA artık bunu ölçüyor.
- **Geliştirici notu ekranda:** Profiller sekmesinde "kart: ad • özet • tema
  şeridi • aktif vurgu" yazıyordu — kaldırıldı.

### Notes
- `qa/run.mjs`: "hero yalnız Durum'da görünür" assert'i eklendi; yatay taşma
  ölçümü zaten vardı ve bu hatayı ilk kez yakaladı.

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
