# YOL HARİTASI — v2.11.1 → v3.0.0

Bu dosya **sırayla yürütülecek** iş listesidir. Her adım: ne, neden, kabul
ölçütü, geri alma. Adım bitmeden sonrakine geçilmez; her adım ayrı commit.

Durum: `[ ]` bekliyor · `[~]` sürüyor · `[x]` bitti.

---

## 1. `[x]` Gece kanıtı — kriter 4'ü teste çevir

**Ne:** PLAN-v3 §11/4 "gece 00:00'da açık tema hiç uygulanmaz" maddesi şimdiye
kadar yalnız ertesi gün log'a bakılarak doğrulanabiliyordu. Bunu 24 saatlik
deterministik Rust testine çevir: `scene_target(Auto, h, m, level)` günün her
dakikasında gece penceresinde `light` modu **döndürmemeli**.

**Neden:** Beklemeye bağlı kanıt kanıt değildir; bir sonraki değişiklik onu
sessizce bozar.

**Kabul:** Yeni test 1440 dakikayı tarar, gece penceresinde `light` görürse
düşer; `cargo test` yeşil.

**Geri alma:** Test silinir.

---

## 2. `[x]` Otomatik karar kendi temalarımıza (`ss-*`) kilitlensin

**Ne:** Karar tablosu zaten `ss-paper`/`ss-dusk`/`ss-night` döndürüyor, ama
**öğrenilmiş tercih** (`prefs.rs`) eski yerleşik temaları (`zenburn`,
`catppuccin-macchiato`…) otomatik yola geri sokuyor. Canlı log kanıtı:
`want=zenburn/dark`.

- Yeni kural: otomatik uygulanan tema yalnız `ss-*` ailesinden olabilir.
- Öğrenilmiş tercih `ss-*` değilse **otomatik yolda yok sayılır** (elle seçim
  her zaman serbest).
- Eski kayıtlar göç eder: `smart-screen-prefs.json` içinde `ss-*` olmayan
  tema tercihleri `.bak` yedeğiyle temizlenir; parlaklık öğrenmesi korunur.

**Neden:** Ürünün görsel kimliği 12 palette ama otomatik seçim hâlâ eski
temaları yazıyor; kullanıcı "benim temam" hissini kaybediyor.

**Kabul:** `pref_get` testte eski temalı kaydı döndürmüyor; göç bir kez koşar,
yedeği durur; QA'da otomatik turda `theme=` daima `ss-*`.

**Geri alma:** `.bak` dosyası geri kopyalanır.

---

## 3. `[x]` Gamma canlı doğrulama (kriter 5)

**Ne:** `gamma.rs` içindeki `#[ignore]`lu `live_apply_and_restore` testi hiç
koşulmamıştı. Koşulacak + kriter 5 ölçülecek: `warmth=70` iken **mavi kanal
tepe değeri ≥ %18 düşmeli** ve rampa geri okunabilmeli.

**Neden:** "Ekranı ısıtıyor mu" sorusunun tek nesnel kanıtı sürücüden geri
okunan rampa. Gözle bakmak da gerekir ama bu, ölçümün yerini tutmaz.

**Kabul:** `cargo test -- --ignored live_apply_and_restore` PASS; testte mavi
tepe düşüşü assert edilir; ekranın kalibrasyonu test sonunda geri yüklenir.

**Geri alma:** Rampa `gamma_restore()` ile geri yazılır (testin kendisi yapar).

---

## 4. `[x]` Planı arşivle

**Ne:** `PLAN-v3.md` bugüne kadar untracked duruyordu (bitmiş plan). Repoya
alınır, `README.md`'den bağlantı verilir, `ROADMAP.md` bu dosya olarak eklenir.

**Neden:** Plan dosyası commit'lenmezse kaybolur; yeni katkıcı kararların
gerekçesini göremez.

**Kabul:** `git ls-files` gösterir; README'de "Tarihçe" bağlantısı var.

---

## 5. `[x]` `identifier` göçü

**Ne:** `com.smartscreen.app` → `com.titanlion72.smart-screen`.

Tehlikeli kısım: kimlik değişince
- Tauri'nin veri klasörü (`%APPDATA%\com.smartscreen.app`),
- NSIS kaldırma kaydı (`HKLM/HKCU ...\Uninstall\<bundle-id>`)

değişir. Yanlış yapılırsa kullanıcı hem eski hem yeni kayıt görür, pencere
konumu kaybolur.

**Adımlar**
1. Eski veri klasörü yeni ada **kopyalanır** (silinmez).
2. `lib.rs` açılışta bir kez: yeni klasör yoksa eskisinden kopyala (göç).
3. Kurulum sonrası: eski kaldırma kaydı **yalnız** yeni kayıt varken ve
   hedefi eski kurulumu gösteriyorsa silinir; aksi halde dokunulmaz ve raporlanır.
4. README/HANDOFF'a "kaldırma kaydı" notu.

**Kabul:** Kurulumdan sonra tek "smart-screen" kaydı; pencere konumu korunmuş;
eski klasör yerinde (geri alma için); `cargo test` yeşil.

**Geri alma:** `identifier` eski değere döner, eski klasör zaten duruyor.

---

## 6. `[x]` Monitör başına DDC 0x0C yazma (Pro)

**Ne:** `colortemp.rs` okuma + tek monitör yazma yapıyor; `monitor_set_color_temp`
zaten var. Eksik: **otomatik** yolun (sıcak ton öngörüsü) harici monitörün kendi
renk sıcaklığını da sürmesi ve Pro kapısından geçmesi.

**Kabul:** Pro yokken yazma denenmez (kapı backend'de), Pro varken sıcak ton
döngüsü monitör Kelvin'ini değiştirir; log'da tek satır; HDR açıkken atlanır.

**Geri alma:** Özellik anahtarı kapatılır (varsayılan kapalı).

---

## 7. `[x]` Windows gece ışığı entegrasyonu

**Ne:** Registry blob'u bu makinede boş; programatik kontrol desteklenmiyor.
Yapılabilir olan: **algılama** (açık mı) + kullanıcıya doğru yönlendirme.

- Gece ışığı açıksa uygulama kendi gamma'sını yazmaz (çifte sararma olmaz).
- Ayarlar'da durum satırı: "Gece ışığı açık — sıcak ton devre dışı".

**Kabul:** Durum okunamıyorsa "bilinmiyor" denir, tahmin edilmez; çifte yazma
yok; QA'da iki durum da denenir.

**Geri alma:** Anahtar kaldırılır.

---

## 8. `[x]` Sahne şablonuna WebGL katmanı

**Ne:** `sahne` şablonunda hero arkasına gerçek WebGL (shader) ışık/gradient
katmanı. Zorunlu kurallar:
- Palet değişince renkler CSS değişkenlerinden okunur (tek kaynak).
- `prefers-reduced-motion` ve "animasyonlar kapalı" → statik tek kare.
- WebGL yoksa/bağlam kaybolursa CSS degradeye düşer (sessiz, kırılmaz).
- Diğer 3 şablon etkilenmez; kare bütçesi (%10 CPU) ölçülür.

**Kabul:** 4 şablon QA'sı geçer; sahne kareleri gözle onaylanır; WebGL kapalı
tarayıcıda da bozulmaz; `check:tokens` yeşil (ham hex yok).

**Geri alma:** `data-template` katmanı kaldırılır, CSS degrade kalır.

---

## 9. `[x]` v3.0.0 sürümü

Doküman (CHANGELOG/HANDOFF/README), tam doğrulama (npm test, cargo test,
clippy, fmt, check:tokens, check:security, test:security, 5 QA aracı), kurulum,
canlı log turü, release.

---

## 10. `[~]` Kod imzalama (Authenticode) — hazırlık bitti, sertifika bekliyor

Kurulum dosyası imzasız olduğu için SmartScreen "bilinmeyen yayıncı" diyor.
Karar ve seçenek tablosu: [`CODE-SIGNING.md`](CODE-SIGNING.md) (Ekim 2026
fiyat/koşulları doğrulanmış: SignPath Foundation ücretsiz ama yayıncı adı vakıf;
Certum €49/yıl, yayıncı kendi adımız; Azure Artifact Signing Türkiye'ye kapalı).

**Bitti (bu turda):**
- `tools/sign-artifacts.mjs` — PFX (dosya) veya depo parmak izi (HSM/token) ile
  imzalar; zaman damgası zorunlu; sertifika yoksa hata verir.
- `tools/verify-signature.mjs` — durum/yayıncı/damga okur, imzasız dosyada
  sıfırdan farklı çıkar; `--expect` ile yayıncı adı denetlenir.
- `npm.cmd run sign` / `npm.cmd run verify:signature` kısayolları.
- Kendinden imzalı sertifikayla uçtan uca doğrulandı (imzasız → FAIL, imzalı →
  yayıncı + RFC3161 damga görüldü); test sertifikası makineden silindi.

**Kaldı (bizim yapamayacağımız kısım):** sertifika başvurusu/kimlik doğrulama
ve ödeme. SignPath başvurusu ya da Certum siparişi tamamlanınca:
`npm.cmd run sign -- --pfx …` → `verify:signature` PASS → release.
SignPath seçilirse `CODE-SIGNING.md` sonundaki "Code signing policy" bölümü
siteye eklenir (koşullar gereği). Kabul: v3.1.0 setup dosyası `Valid` +
zaman damgalı, README'deki SmartScreen uyarısı güncellenir.

**Geri alma:** imza adımı build hattından çıkarılır; dosyalar zaten `.sha256`
ile yayınlanıyor, imzasız sürüme dönmek tek adım.

---

## 11. `[x]` v3.0.1 "cila" — sahada bulunan davranış hataları

Kullanıcı "son cilaları at, hata/UI bozukluğu var mı bak; ön plan uygulamalarını
kazayla sildim" dedi. Üç gerçek hata + eksik geri alma yolu çıktı.

- **Bağlı profil teması hiç uygulanmıyordu** (canlı log: 40 tur `want=` gidip
  geldi, `applied` sabit). Tema kapısı 10 dk + 3 tur istiyor, bağlı/bağsız
  geçişte sayaç sıfırlanıyordu → `engine.isIntentTheme` + birim test.
- **Tanılama `auto` kipte "sıcak ton kapalı" diyebiliyordu** → yazmadan
  uygulanacak değeri hesaplıyor.
- **Kaybolan uygulama listesi geri getirilemiyordu** → boş `apps` doldurulur,
  dolu listeye/alanlara dokunulmaz (`src/store.test.ts`, 7 test).
- Programatik liste değişikliği ekrana yansımıyordu (`syncLists` kancası),
  "Varsayılan listeleri geri getir" düğmesi, etiket silmede "Geri al".
- Tohum temalar `ss-dusk`/`ss-night`; var olan profiller ezilmez.
- `qa/cdp-localstorage.mjs`: canlı WebView2 localStorage okuma/yazma — kullanıcının
  silinen listesi bu aletle kurtarıldı (6 uygulama).

Kabul: 23 test, 6 QA aracı PASS, clippy/fmt temiz, 3.0.1 kuruldu ve canlı log
bağlı profil temasını **uyguladı** (`theme=catppuccin-macchiato|dark`).
Geri alma: `git revert 74be204` (veri şeması değişmedi).

---

## 12. `[x]` v3.0.2 "toparlama" — review + canlı UI taraması

Bağımsız kod incelemesi + gerçek uygulama kareleri. 12 bulgu, hepsi düzeltildi.

**Davranış (en ciddiden):**
- **Gece tavanı fiilen çalışmıyordu:** `min(cap)` sonra `max(floor)` sırası
  yüzünden 15 yazan kullanıcı 25 görüyordu; Rust da hedefi yukarı çekiyordu.
  İki katman birlikte düzeltildi (`next_brightness_with_floor` + test).
- **Hero eğrisi 0–45 ölçeğindeydi**, `warmth_auto` 0–100 (tepe 88) → grafik
  yanlış veri. Çapalar backend ile birebir, ölçek 100.
- **Duraklatma/kilit oyun parlaklığını geri almıyordu** (%100'de takılı kalma).
- Profil kartı kayıttan sonra bayat; tray işaretleri gerçek durumla senkron
  değil; `applyProfile` başarısız yazmayı başarı sayıyor; okuma profili tema
  tercihine yazılıyor; çıkışta gamma geri alınmıyor; flyout parlaklığı dış
  müdahale sayılıyor; yarım kimlik göçü işaretleniyor; HDR bağlantısı yanlış
  sayfa; ofset düğmeleri çöp kalibrasyon yazıyor.

**UI (canlı kareden):** hero dikey ortalandı, tek monitörde kart içerik boyunda,
uzun DDC/CI hatası kendi satırında okunur.

Kabul: 23 frontend + 219 Rust testi, 6 QA aracı PASS, clippy/fmt temiz.
Geri alma: `git revert` (şema değişmedi).

---

## 13. `[x]` v3.0.3 "yerleşim" — iki şablonun üst bölümü

Kullanıcı ekran görüntüsüyle bildirdi: dergi ve sahne şablonlarında üst bölüm
bozuk. İki kök neden:

- **Dergi satır tanımı tersti** (`minmax(0,1fr) auto`): hero satırı 66px'e
  iniyor, 190px'lik hero satırını taşıyıp alt kartlara biniyordu. Doğrusu
  `auto minmax(180px, 1fr)`.
- **Dergi hero'sunun `min-height`'ı ölü kuraldı**: `[data-template] .hero`
  (0,2,0) özgüllüğünü `#page-panel > .hero` (1,1,0) eziyordu. `#page-panel`
  id'siyle yazıldı.
- Kısa pencerede (≤720px) hero gövdesi satırını taşıyordu → dikey akışa geçiş
  (kaydırır, ezmez). Alt satıra 180px taban.

**Kabul:** `audit-templates` §3b geometri denetimi (4 şablon × 4 boyut, mola
bandı açık) eklendi; kırık hâl geri konunca 4 şablonun hepsinde FAIL, düzeltmeyle
PASS — assert gerçekten yakalıyor. 23 frontend + 219 Rust testi, tüm audit'ler
yeşil. Geri alma: `git revert` (şema değişmedi).
---

## 14. `[x]` v3.1.0 "satışa hazır" — güncelleme, tema, lisans, ikon

Dört kullanıcı isteği:

- **Elle güncelleme denetimi** (Ayarlar → Hakkında): anında `check()`, sonuç ve
  son kontrol saati. Zamanlanmış kontrol 24 saatte bir olduğu için "yeni sürüm
  var mı?" sorusunun pratikte cevabı yoktu.
- **"Günün rengi" varsayılan açık**: uygulamanın kendi teması da saate göre
  akıyor. Palet seçimi `engine.paletteForHour`e taşındı (test edilebilir hale
  geldi; gece açık palet seçilmediğini doğrulayan test var).
- **Pro lisans akışı**: lisans kartı (ne dahil / Pro), "Anahtarım var" +
  "Pro'yu al", Enter ile etkinleştirme; `tools/license-batch.mjs` (toplu üretim,
  çıktıyı ezmez) + `tools/license-check.mjs` (özel anahtar gerektirmeyen
  doğrulama). Satın alma adresi `PURCHASE_URL` — tek satır.
- **Yeni ikon**: `assets/icon.svg` tek kaynak, `tools/make-icon.mjs` 14 PNG +
  `icon.ico` (16–256) + 9 Store logosu üretir; 16/32px'te okunurluk gözle
  doğrulandı.

**Kabul:** 25 frontend + 219 Rust testi, `qa/run.mjs` 24 senaryo, 5 audit aracı,
clippy/fmt temiz; lisans batch→check uçtan uca 3/3 geçerli. Geri alma:
`git revert` (lisans şeması değişmedi).

**Açık kalan (bilinçli):** gerçek ödeme sağlayıcı entegrasyonu — `PURCHASE_URL`
doldurulunca uygulama tarafı hazır; anahtar dağıtımı hâlâ elle/CSV.

---

## 15. `[x]` v3.2.0 "güven ve dayanıklılık" - söyle, yedekle, göster

Yedi iş, üç ayrı dosya sahipliğiyle paralel yürütüldü (Rust · frontend ·
doküman); şef yalnız QA stub'larını ve denetim araçlarını yazdı.

- **Kamera ifşası + tanılama kontrolü**: uygulama 5 dakikada bir webcam'den tek
  kare okuyordu, arayüzde "kamera" kelimesi hiç geçmiyordu. Artık "Durum"
  karosunda tek satır, tanılamada 11. satır (`light::probe` gerçek kare okur).
  Kamera yoksa satır **uyarı**: uygulama zaman moduna düşer, çalışmaya devam eder.
- **Ayar yedeği**: 19 ayar + profiller yalnız localStorage'daydı. Yedek al /
  geri yükle / sıfırla; dosya biçimi sürüm alanlı, uymayan dosya **hiçbir şey
  yazmaz**.
- **İlk açılış tanıtımı**: üç madde (kamera, otomatiğin sınırları, veri cihazda).
- **Kısayollar**: Ctrl+Alt+M/P/L + altbilgi ipucu.
- **Gece penceresi özeti**: "22:00–06:00 · 8 saat", sarma ve "kapalı" doğru.
- **Tepsi tooltip'i** durumu söylüyor (duraklatıldı / bugün kapalı / kilitli).
- **`THIRD-PARTY.md`**: 14 Rust + 5 npm doğrudan bağımlılık, `cargo metadata` /
  `npm ls` çıktısından.

**İki yerleşim dersi (ikisi de şefin birleştirmesinde yakalandı):**
1) Altbilgi `#page-panel` grid'inin akışındaydı → 4. satırı açıp hero'yu 42px
   kısaltıyordu (bento 1040×740, `audit-templates` §3b FAIL). Çözüm: altbilgi
   sayfanın `padding-bottom` payına mutlak konum.
2) Kamera notu 251px'lik "Durum" karosunda iki satıra taşıp alt satırı
   kırpıyordu; tek satıra indirildi, QA satır yüksekliğini ölçüyor.
3) Onboarding modal olduğu için 23/24 QA senaryosu kırıldı (tıklamaları örtüyor).
   Varsayılan senaryo artık `ss:onboarded=1` kuruyor; tanıtım kendi senaryosunda.

**Kabul:** 25 frontend + 223 Rust testi, `qa/run.mjs` senaryoları, 6 denetim
aracı, clippy/fmt temiz. Canlı doğrulama (dev + CDP): tanıtım bir kez çıkıp
kapanıyor, kısayollar duraklatma/kilit çeviriyor, gece özeti 23→06 için "7 saat",
kamera satırı `ok`, gerçek diyalogla yedek alındı → ayar bozuldu → geri yüklendi
(değer döndü), sıfırlama anahtarları temizledi. Geri alma: `git revert`
(ayar şeması değişmedi, yalnız `ss:onboarded` eklendi).

**Elle doğrulanacak:** tepsi simgesine fareyle gelince ipucunun görünmesi
(makine okunamıyor; biçim birim testiyle doğrulandı).

---

## Yapılmayacaklar (bilinçli)

- Kamera dışı ortam ışığı (ALS yok, doğrulandı).
- Bulut hesap/lisans sunucusu (offline tasarım kararı).
