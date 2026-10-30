# HANDOFF — smart-screen (güncel: v3.0.1, 2026-10-31)

## ⚠️ KURAL (2026-10-26, acı deneyimle): ARAYÜZ GÖRMEDEN YAYIN YOK

v2.3.0 ve v2.3.1 "QA 21 senaryo PASS" diyerek yayınlandı; kullanıcı **"ui çok bozuk"**
dedi ve haklıydı. Somut bozukluklar: hero her sekmede görünüyordu (ekranın yarısını
kaplıyordu), eğri çizgileri birbirine giriyordu, yatay kaydırma çubuğu vardı, ekranda
geliştirici notu duruyordu.

**Neden kaçtı:** QA DOM'u ölçer (id var mı, taşma var mı, tıklanabiliyor mu). "Bu ekran
çirkin mi / anlamsız mı / yarım mı" ölçmez. `checkOverflow` uzun süre `body.scrollHeight`
ölçtüğü için hiçbir şeyi yakalamıyordu.

**Kural (bağlayıcı):**
1. Her arayüz turundan sonra `qa/shots/*.png` dosyalarına **kendi gözünle** bak —
   en az Durum, Profiller, Ayarlar, Geçmiş + flyout. Onaylamadan release yok.
2. Her turda **gerçek exe'yi çalıştır** (stub QA yetmez). Kurulu exe açılışta çökerse
   QA yeşil olsa da sürüm çöptür (v2.3.0'da `api is not defined` böyle kaçtı).
3. Bir bölümün **nerede** durduğunu doğrula: hero `#page-panel` içinde mi, dock içeriği
   örtüyor mu, sekmede olmaması gereken şey var mı.
4. Taşma assert'i `scrollWidth/scrollHeight` + kırpılan öğe listesi ile ölçülür
   (`body.scrollHeight` işe yaramaz).


## Güncel durum: v3.0.0 — gerçekten geçerli sınırlar

`ROADMAP.md`'teki dokuz adımın hepsi kapalı, son yayın **v3.0.0**. Aşağısı tur
tur tarihsel kayıttır (en yeniden en eskiye). **0.6.0 ve öncesine ait "Kalan" /
"Bilinen sınırlar" başlıkları o günü anlatır, bugünü değil** — örneğin orada
"gamma gözle doğrulanmadı" ve "otomatik seçim hâlâ eski temaları seçiyor"
yazıyor; ikisi de v3.0.0'da kapandı (canlı sürücü testi mavi kanalda %38.2
düşüş ölçüyor, otomatik yol yalnız `ss-*` temalarından seçiyor).

Bugün geçerli olan sınırlar — her biri bilinçli karar ya da dış koşul:

- **Kod imzası yok.** Kurulum dosyası Authenticode imzalı değil; SmartScreen
  "bilinmeyen yayıncı" der. **Hazırlık tamam:** `tools/sign-artifacts.mjs`
  (PFX veya depo parmak izi, zorunlu RFC3161 damga) + `tools/verify-signature.mjs`
  (imzasız dosyada FAIL) + `npm.cmd run sign` / `verify:signature` kısayolları.
  Kalan tek adım sertifika başvurusu/kimlik doğrulama — bu bizim yerimize
  yapılabilecek bir iş değil. Seçenekler ve fiyatlar: `CODE-SIGNING.md`
  (SignPath Foundation ücretsiz; Certum ≈ €49/yıl; Azure Artifact Signing
  Türkiye'den bireysel/kurumsal başvuruya kapalı). Güncelleme paketi ayrıca
  minisign ile imzalı ve uygulama içinde doğrulanır.
- **Pro anahtarı elle üretiliyor.** `node tools/license-gen.mjs --email ...`;
  mağaza/ödeme akışı yok. Lisans offline Ed25519, sunucu yok (bilinçli tasarım).
- **Windows gece ışığı yalnız okunur.** Belgesiz registry blob'u; tanınmayan
  şema "bilinmiyor" döner, tahmin edilmez. Bu makinede blob boş.
- **Harici renk sıcaklığı panelin VCP 0x0C desteğine bağlı.** Canlı log:
  `DISPLAY1: renk sıcaklığı destek=false` — desteklemeyen panelde yalnız gamma
  çalışır. Harici **yazma** (parlaklık + renk sıcaklığı) Pro kapılı.
- **Ortam ışığı kameradan okunur** (ALS yok, doğrulandı); kamera meşgulse
  zaman moduna düşer, karanlıkta renk tonu sayılmaz.
- **OpenCode'nin gömülü temaları denetlenemez.** Okunabilirlik denetimi diskteki
  tema dosyalarını ölçer; binary'ye gömülü yerleşikler için `catalog.ts`'deki
  RISKY listesi yedek. Otomatik seçim artık yalnız `ss-*` olduğu için bu kapı
  pratikte yalnız elle seçimde devreye girer.
- **Profil sayısı ve uygulama bağlama kapısı arayüzde.** Profiller
  localStorage'da tutulur, backend'de zorlanacak bir veri yok; harici monitör
  yazımı ise backend'de (`license::is_pro` / `require_pro`) kapılı.
- **Tek pencere, min 760×600.** Dört bölüm (Durum/Profiller/Geçmiş/Ayarlar) alt
  dock'tan geçer; küçük pencerede bölüm kendi içinde kayar.
- **20-20-20 tek seferliktir** — onay gelene kadar tekrar etmez (bilinçli).

## V3.0.1 TURU (2026-10-31) — "cila": sahada bulunan üç davranış hatası

**Tetik:** kullanıcı "uygulamaya son cilaları at, hata/UI bozukluğu var mı bak;
ben ön plan uygulamalarını kazayla sildim, geri getir".

**1. Bağlı profil teması hiç uygulanmıyordu (gerçek hata).** Canlı log'da 40 tur
boyunca `want=catppuccin-macchiato` ile `want=ss-dusk` gidip geldi, `applied`
hiç değişmedi. Kök neden: tema kapısı **10 dk + 3 bağımsız tur** istiyor; bağlı
profil ile bağsız tur arasında geçişte `pendingKey` her turda değiştiği için
sayaç 3'e hiç ulaşmıyordu. Yani "uygulamaya bağlı profil ön plana gelince o turda
devralır" kuralı kağıtta vardı, kodda **hiç** çalışmıyordu. Bağlı profil artık
niyet sayılıyor (`engine.isIntentTheme` + test) ve QA bunu gerçek zamanlayıcı
turunda doğruluyor.

**2. Tanılama "sıcak ton kapalı" diyebiliyordu.** Açılışta ilk tur çalışmadan
"Sistemi kontrol et"e basınca `auto` kipte bile "rampa yazılmadı" görünüyordu.
Artık tanılama **yazmadan** uygulanacak değeri hesaplıyor (kalibrasyonu ezme
kuralı korunuyor) — ölçüm "şu an ne kullanılıyor" sorusunun doğru cevabı.

**3. Kayıp uygulama listeleri geri getirilemiyordu.** `restoreSeedProfiles`
profili zaten var sayıp hiçbir şey yapmıyordu; kullanıcı listeyi elle yeniden
yazmak zorundaydı. Artık **boş** `apps` listesini doldurur; dolu listeye ve
diğer alanlara (ad/mod/tema/kaydırma) dokunmaz. "Var olanı ezme" kuralı korundu,
7 birim testiyle (`src/store.test.ts`).

**4. Programatik liste değişikliği ekrana yansımıyordu.** Listeler yalnız
`bootWidgets`'ta çiziliyordu. `syncLists` kancası eklendi; "geri getir" hem
diske hem ekrana yazıyor. **Ders: "diske yazdım" ≠ "ekranda göründü"** — QA
assert'i ekranı okumasa bu sessiz kalırdı.

**5. Tohum temalar ss-*'a çekildi.** `İş` → `ss-dusk`, `Film` → `ss-night`.
Var olan profiller ezilmiyor (kullanıcı verisi).

**Ayrıca (altyapı):**
- `qa/cdp-localstorage.mjs` — çalışan WebView2'ye DevTools protokolüyle bağlanıp
  localStorage okuma/yazma. Kazayla silinen veriyi leveldb kurcalamadan kurtardı
  (canlı doğrulama: `ss:allowlist` 6 uygulama geri yazıldı, uygulama yenilendi).
- `npm.cmd run verify` (test + token + güvenlik + build) ve `qa` / `qa:audit`
  kısayolları.
- `npm.cmd test` artık iki dosya koşuyor (23 test).

**Doğrulama:** `npm test` 23/23 · `npm run verify` temiz · `qa/run.mjs` 23
senaryo PASS · `audit-templates` · `audit-diagnostics` · `audit-scene` ·
`audit-flyout` (48 kare) · `audit-accent` · canlı tanılama: `%35 şiddet yazıldı
— mavi %36 (beklenen %36)` · canlı log: bağlı profil teması uygulandı.

**Yayın:** v3.0.1 (tag + release, 7 varlık) kuruldu; `latest.json` canlıda
`3.0.1`, imza eşleşiyor. Kurulum sonrası canlı log:
`want=catppuccin-macchiato | theme=catppuccin-macchiato|dark | note=bağlı profil
windowsterminal.exe` — yani düzeltme gerçekten çalışıyor (eskiden `theme=` sabit
kalıyordu). `ss:allowlist` 6 uygulama, sürüm etiketi `3.0.1`.

**Ders (kalıcı)**
1. **Dwell sayacı "her turda sıfırlanan" bir durumdaysa hiç dolmaz.** Bağlı
   profil 40 turda bir kez olsun uygulanmadı çünkü bekleyen anahtar turdan tura
   değişiyordu. Kural "3 bağımsız tur" diyorsa, **bağımsız olmayan** turlarda
   sayacın sıfırlanması tasarımın kendisini iptal eder.
2. **"Diske yazdım" ≠ "ekranda göründü".** Listeler yalnız kurulumda çiziliyordu;
   QA ekranı okumasaydı bu sessiz kalırdı.
3. **Tanılama yazmamalı ama doğru söylemeli.** Kalibrasyonu ezmemek için
   "yazma" kuralı doğru; çözüm yazmak değil, **uygulanacak değeri hesaplamak**.
4. **Canlı kullanıcı verisini kurtarmanın doğru yolu API'sidir.** leveldb
   dosyasını elle düzenlemek yerine çalışan WebView2'ye CDP ile bağlanıp
   `localStorage` yazmak hem güvenli hem doğrulaması kolay (`qa/cdp-localstorage.mjs`).

## 2026-10-30 — kod imzalama hazırlığı (v3.0.0 sonrası)

**Tetik:** kullanıcı "final mi?" sorusundan sonra dağıtım tarafındaki üç eksikten
birincisini (Authenticode) seçti.

**Yapılan:** `CODE-SIGNING.md` (seçenek tablosu, Ekim 2026 fiyat/koşulları
kaynaklarıyla), `tools/sign-artifacts.mjs`, `tools/verify-signature.mjs`,
`npm.cmd run sign` + `verify:signature`, README "Kod imzalama" bölümü,
ROADMAP adım 10.

**Uçtan uca kanıt:** makinede geçici kendinden imzalı kod imzalama sertifikası
üretildi → PFX modu ve depo-parmak-izi modu ile `signtool` imzaladı → RFC3161
zaman damgası alındı (`timestamped: true`) → `verify-signature.mjs` yayıncıyı
gördü. Test sertifikası ve geçici dosyalar silindi; repoda sertifika yok.

**Ders (kalıcı)**
1. **PowerShell çıktısı UTF-8 değilse Türkçe hata mesajı mojibake olur** ve
   ona bakan regex sessizce tutmaz ("kök sertifikasında" → `k�k sertifikas`).
   Bu yüzden `[Console]::OutputEncoding = UTF8` betiğin başında sabitlendi.
2. **`/sm` varsayılan olmamalı.** signtool'a makine deposu bayrağı kondurulunca
   kullanıcı deposundaki sertifika (token/HSM/SimplySign) "No certificates were
   found" verir; varsayılan kullanıcı deposu, makine deposu `--machine-store`.
3. **Bölge gerçeği araştırılmadan "imza pahalı" denmemeli.** Azure Artifact
   Signing $9.99/ay görünüyor ama bireysel geliştirici yalnız ABD/Kanada,
   kuruluş yalnız ABD/Kanada/AB/BK — Türkiye kapsam dışı. SignPath Foundation
   ise açık kaynak için ücretsiz ama yayıncı adı "SignPath Foundation" oluyor.
4. **Araç "sessizce imzasız" bırakmamalı.** Sertifika yoksa sign aracı hata
   veriyor; verify aracı imzasız dosyada sıfırdan farklı çıkıyor; damgasız imza
   uyarı olarak görünüyor.

## V3.0.0 TURU (2026-10-30) — "derinlik": planın son katmanı

**Tetik:** kullanıcı "hepsini yap, sırayla gidişat planını hazırlayıp" dedi.
`ROADMAP.md` yazıldı ve sırayla yürütüldü; her adım ayrı commit.

**1. Gece kuralı teste bağlandı.** PLAN-v3 §11/4 ("00:00'da açık tema yok")
ertesi gün log'a bakmayı gerektiriyordu. Artık `auto_never_picks_light_theme_at_night`
1440 dakikayı × 4 ışık seviyesini tarıyor. **Beklemeye bağlı kanıt kanıt değildir.**

**2. Otomatik tema kendi ailemize kilitlendi.** Karar tablosu `ss-*` döndürüyordu
ama öğrenilmiş tercih eski temaları geri sokuyordu (canlı log: `want=zenburn/dark`).
Artık `is_own_theme` + **mod eşleşmesi** şart; gece öğrenilmiş `light` tercih
kriter 4'ü delemez. Depo sürümü 3: yabancı temalı kayıtlar `.bak` yedeğiyle
temizlenir, parlaklık öğrenmesi korunur.

**3. Sıcak ton gerçekten ısıtıyor — ve ölçüldü.** `#[ignore]`lu canlı test hiç
koşulmamıştı; koşunca kriter 5'in **hiç tutmadığı** görüldü: mavi %4.2 düşüyordu.
Kök neden: kübik eğri `x=1`'i bilerek koruyordu, yani **saf beyaz hiç ısınmıyordu**
(PLAN-v3 §3/B1 tam da bunu söylüyordu). Eğriye tepe kısması eklendi
(mavi −35 %·s, yeşil −10 %·s), sürücü sınırı (±32768) içinde kalıyor.
Sonuç: %38.2 düşüş, hedef ≥ %18. **Bir kriter "geçiyor" görünüyorsa testi
koşulmamış olabilir.**

**4. `identifier` göçü.** `com.smartscreen.app` → `com.titanlion72.smart-screen`.
Kimlik değişince iki veri klasörü değişir; `identity::migrate_once` pencere
yaratılmadan önce kopyalar (roaming 2 + local 541 dosya doğrulandı), kaynağı
**silmez** (geri alma tek adım), hedefteki mevcut dosyanın üzerine yazmaz,
kilitli dosyayı atlar. localStorage anahtarları ve maksimize pencere durumu korundu.

**5. Monitör katmanı + lisans kapısı.** Sıcak ton artık destekli harici
monitörlerin VCP 0x0C ayarını da sürüyor (`warmthToKelvin`). Bu sırada gerçek bir
güvenlik açığı çıktı: **`monitor_set_color_temp` lisans kapısı yoktu** —
`brightness_set_monitor` vardı. Tek karar noktası `license::gate` + test.

**6. Windows gece ışığı.** Belgesiz registry blob'u; yalnız bilinen kodlamalar
tanınır, gerisi `None`. **Tahmin etmemek kural:** "kapalı" varsaymak çifte
sararma, "açık" varsaymak özelliği sessizce kapatmak olurdu.

**7. Sahne WebGL katmanı.** Dekoratif; `sahne` dışında çalışmaz, ~15 fps,
gizli pencerede durur, hareket azaltmada tek kare, WebGL yoksa sessiz düşüş.
Renkler `getComputedStyle` ile palet değişkenlerinden (JS'te hex yok).

**Ders (kalıcı)**
1. **"Test var" ≠ "test koşuyor".** `#[ignore]`lu test 4 sürümdür oradaydı ve
   geçtiği varsayılıyordu; ilk koşuda kriterin tutmadığı ortaya çıktı.
2. **Korunan uç, görünmeyen kusurdur.** Eğrinin `x=1`'i koruması "beyaz
   kırpılmasın" diye konmuştu; sonuç özelliğin tamamen görünmez olmasıydı.
   Estetik gerekçe ölçümün önüne geçmemeli.
3. **Kimlik göçünde kaynak silinmez.** Kopyala, işaretle, bırak. Geri alma tek
   satır olmalı; "temizlik" sonradan yapılır.
4. **Kapıyı tek yere koy.** Aynı kural iki komutta iki yerde yazılırsa biri
   unutulur — `monitor_set_color_temp` tam olarak böyle kaçmıştı.
5. **Canvas'ı opak yaptıysan arkasındaki katmanı göremezsin.** WebGL katmanı
   ilk denemede "çalışıyordu" ama QA karesi düz siyahtı: cam plaka opaktı.
   Piksel assert'i olmasa bu "tamam" diye geçerdi.

**Doğrulama:** `npm test` 15/15 · `cargo test` 218+2 · `cargo test -- --ignored
live_apply_and_restore` PASS (mavi %38.2) · `cargo clippy -D warnings` ·
`cargo fmt --check` · `check:tokens` PASS · `check:security` PASS ·
`test:security` PASS · `qa/run.mjs` · `audit-scene` · `audit-diagnostics` ·
`audit-templates` · `audit-flyout` (48 kare) · `audit-accent` · kareler gözle
incelendi (WebGL ışıması koyu/açık palette görünür, metin okunaklı).

## V2.11.1 TURU (2026-10-29) — canlı log'un yakaladığı sessiz kilitlenme

**Tetik:** v2.11.0 kurulduktan sonra canlı log okunurken `note=bekliyor 1/3`
satırının **dokuz dakika boyunca hiç değişmediği** görüldü. Parlaklık
uygulanıyor, tema hiç değişmiyordu.

**Kök neden**
- Tema kapısı "aynı karar 3 bağımsız turda görülmeli" diyor; sayaç yalnız
  `cam !== null && isNewMeasurement(...)` olduğunda artıyordu.
- Kamera okunamayınca `cam` null dönüyor (zaman moduna düşülüyor, bu desteklenen
  bir durum) → sayaç hiç ilerlemiyor → kapı kalıcı olarak `1/3`te asılı kalıyor.
  Yani kamerasi çalışmayan her kullanıcıda otomatik tema ölüdür.
- Hata görünmüyordu çünkü `log()` uygulama içi günlüğe yazıyor, dosyaya yalnız
  `diskLog()` tur satırı düşüyor. Kamera hatası dosyada **hiç** yok.

**Düzeltme**
- `engine.isIndependentTurn`: kameranın olmadığı durumda her tur bağımsızdır
  (zaman kararı önbelleklenmez); kamera varsa eski önbellek kuralı aynen sürer.
- `orchestr` yalnız girdiyi topluyor; `lastCountedCamAt` yalnız gerçek kare
  sayıldığında güncelleniyor.
- `npm test` 13 → 14 (kamera yok · aynı kare · sınır · ilk ölçüm).

**Ders (kalıcı)**
1. **Sayaç, "veri yok" durumunda ilerlemeli ya da açıkça durmalı** — sessizce
   donmak en kötüsü: ürün çalışıyor görünür, tek özelliği ölmüştür.
2. **Kurulumdan sonra canlı log okumak testtir.** Bu hata birim testlerden,
   QA'dan ve clippy'den geçti; on satır log'u okuyunca çıktı. Sürüm sonrası
   `note=` alanının tur tur değiştiğini doğrula.
3. **`log()` ≠ dosya.** Teşhis için dosyaya bakıyorsan, orada olmayan bir hata
   sınıfı vardır; kamera/tema hataları yalnız arayüz günlüğünde.
4. **Bayat önbellek + kapı = ölü özellik.** Kapı sayacının girdisi (ölçüm)
   üretilemiyorsa, kapı "bekliyor" demek zorunda değil; tur sayılmalı.

**Doğrulama:** `npm test` 14/14 · `cargo test` 204+2 · `cargo clippy -D warnings` ·
`cargo fmt --check` · `check:tokens` PASS · `check:security` PASS ·
`qa/run.mjs` PASS (22 senaryo) · kurulum sonrası canlı log'da `note=` alanının
tur tur ilerlediği doğrulandı.

## V2.11.0 TURU (2026-10-29) — destek akışını kapat

**Tetik:** v2.10 "Kontrol" kartını getirdi ama raporu kopyalayan kullanıcı hâlâ
`~/.config/opencode` altında `smart-screen.log` arıyordu. Tanılama "ne" diyor,
günlük "ne zaman" diyor; ikisi arasında köprü yoktu.

**Ne yapıldı**
- `open_log` komutu: `logger::log_path()` (artık `pub`) ile yolu hesaplar,
  `tauri-plugin-opener` ile dosyayı açar. Dosya yoksa **klasörünü** açar —
  ilk kurulumda da düğme işe yarar. Komut parametre almaz: yol geçişi yüzeyi yok.
- "Günlüğü aç" düğmesi (`#diag-log`) Kontrol kartının toolbar'ında, "Raporu
  kopyala"nın yanında; her zaman etkin, açtığı yolu toast'ta yazar.
- `qa/audit-diagnostics.mjs` adım 3b + `qa/run.mjs` assert'i: düğme `open_log`
  çağırıyor mu, toast yolu yazıyor mu, rapor yokken de çalışıyor mu.

**İkinci iş: test edilemeyen karar test edilebilir oldu**
- "Günün rengi" dwell mantığı `orchestr.applyAutoPalette` içine gömülüydü;
  "kullanıcı seçtikten sonra 10 dk dokunma" davranışı yalnız gözle görülüyordu.
- `engine.autoPaletteDue` saf fonksiyonu eklendi (kapalı · dwell · tam sınır ·
  aynı palet · saat geri alma · hiç elle seçim yok). `npm test` 12 → 13.
- `orchestr` yalnız zaman/palet girdisini topluyor; karar tek yerde.

**Ders (kalıcı)**
1. **Tanılama + günlük ayrı yerlerdeyse köprü gerekir.** "Raporu kopyala" iyi bir
   ilk adım ama kullanıcı dosyayı bulamıyorsa ikinci adım eksik kalıyor. Bir
   ürünün destek akışı, kullanıcının dosya sistemi bilgisini varsaymamalı.
2. **"Dosya yok" durumu tasarlanmalı.** `open_log` dosya yokken hata vermiyor,
   klasörü açıyor; aksi halde yeni kurulumda düğme "bozuk" görünürdü.
3. **Gömülü zaman kararı test edilemez.** `Date.now()` çağrısı fonksiyonun içinde
   kalırsa davranış ancak 10 dakika bekleyerek doğrulanır; zamanı parametre yap.
4. **Toast testinde `.first()` / `.last()` tuzağı.** Yeni toast `prepend` ile üste
   gelir; `.last()` bir önceki toast'ı okur ve assert sessizce yanlış yeri denetler
   (bu turda yaşandı: "günlük toast'ı yok" hatası aslında kopyalama toast'ıydı).

**Doğrulama:** `npm test` 13/13 · `cargo test` 204+2 · `cargo clippy -D warnings` ·
`cargo fmt --check` · `check:tokens` PASS · `check:security` PASS ·
`qa/audit-diagnostics` PASS (5 kare) · `qa/run.mjs` PASS (22 senaryo) ·
`npm run build` temiz.

## V2.10.0 TURU (2026-10-29) — "Kontrol": çalışmayanın nedenini söyle
**Tetik:** ürün olgunlaştı ama "bir şey olmadı" diyen kullanıcıya verilecek cevap hâlâ
`smart-screen.log` idi: DDC/CI kapalı mı, HDR mi engelliyor, gamma sürücüsü yazımı
yutuyor mu, parlaklık gerçekten tutuyor mu? Hiçbiri arayüzde yoktu (PLAN-v3 §3/B5).

**Ne yapıldı**
- `src-tauri/src/diagnose.rs`: 9 kontrol, her biri **saf fonksiyon** (G/Ç `Result`
  olarak dışarıdan verilir, karar testte doğrulanır). `run(warmth)` bunları sırayla
  koşar. 11 yeni birim testi (toplam 204).
- `lib.rs`: `diagnose(warmth)` komutu `spawn_blocking` ile bağlandı.
- Ayarlar'da **görünür** "Kontrol" kartı: `#diag-run`, `#diag-list`, `#diag-copy`,
  `#diag-stamp`. Gelişmiş'in içine gömülmedi — destek yolu bulunmalı.
- Rapor düz metin kopyalanabilir (sürüm, OS, tarih, satırlar, düzen/palet).
- `qa/audit-diagnostics.mjs`: 7 adım + 5 kare; kart sözleşmesini kalıcı denetler.

**İki gerçek hata (ikisi de bu turda yakalandı)**
1. **"Günün rengi" kendi kendini kilitliyordu.** `setDesignTheme` her çağrıda
   `noteManualPalette()` yapıyordu; otomatik palet de elle seçim sayılıp 10 dk
   dwell başlatıyordu. `{ manual: false }` ile ayrıldı.
2. **Hata sonrası aynı rapor boş liste bırakıyordu.** `diagSignature` hata
   durumunda sıfırlanmıyordu; yeniden koşan aynı rapor "değişmedi" sanılıp satırlar
   hiç kurulmuyordu (damga dolu, liste boş). İmza sıfırlanır + `childElementCount`
   ile satır sayısı ayrıca doğrulanır.

**Ders (kalıcı)**
1. **Tanılama bir ürün özelliğidir, log ayrıntısı değil.** Kullanıcı "olmadı"
   dediğinde log istemek, ürünün cevabı olmadığını kabul etmektir.
2. **Yazma testi görünür değişiklik yapmamalı.** Parlaklık testi ekrandaki değerin
   aynısını yazar; sıcak ton kapalıyken rampa HİÇ yazılmaz. "Test" adı altında
   kullanıcının kalibrasyonunu ezmek, düzeltmekten çok bozar.
3. **Önbellek imzası "DOM doğru" demek değildir.** Hata/boş durum DOM'u değiştirir
   ama imza değişmez; imza sıfırlanmalı ya da satır sayısıyla çapraz doğrulanmalı.
4. **Otomatik değişiklik "elle" sayılmamalı.** Dwell penceresi otomatik seçimi
   beslediğinde özellik kendi kendini kilitler; "kim yaptı" bilgisi çağrıya geçmeli.
5. **Panoya yazılan metin de test edilmeli.** `[SORUN]` + iki boşluk gibi biçim
   ayrıntıları `includes` assert'ini sessizce yalancı yapar; regex kullan.

**Doğrulama:** `npm test` 12/12 · `cargo test` 204+2 · `cargo clippy -D warnings` ·
`cargo fmt --check` · `check:tokens` PASS (12 palet, 48 ölçüm) · `check:security` PASS ·
`security-selftest` PASS · `qa/run.mjs` PASS (22 senaryo) · `audit-diagnostics` PASS ·
`audit-templates` PASS · `audit-flyout` PASS (48 kare) · `audit-accent` PASS ·
kareler gözle incelendi (bento/sahne/dergi/konsol + fildisi).

## V2.9.0 TURU (2026-10-29) — güvenlik kapısı + vurgu sızıntısı

**Tetik:** kullanıcı (a) "ne palet seçersem seçeyim ilk temadaki sarı her yerde",
(b) "kontrastta yeniden ölç doğru çalışıyor mu", (c) Grok botunun açtığı güvenlik
PR'ları, (d) "katı bir güvenlik kontrolü kur — açık kaynak, açıklar çok önemli".

**Kök nedenler (ikisi de gerçek hata, ikisi de kullanıcı haklı)**
1. **Vurgu sızıntısı.** `[data-accent="amber"]` gibi bloklar `styles.css`'te
   `--accent`ı GLOBAL yazıyordu ve seçim kalıcıydı (`ss:accent`). Palet blokları
   `palette.css`te, accent blokları ondan sonra geldiği için her paletin kendi
   vurgusunu eziyordu. Kullanıcı bir kez altın seçtiyse 12 paletin hepsi altın.
   **Çözüm:** `--accent-base` (paletin kendi rengi, hiç ezilmez) + vurgu
   `ss:accents` içinde PALET BAŞINA saklanır. Varsayılan = palet rengi.
2. **"Yeniden ölç" sessizliği.** `loadAudit()` çalışıyordu ama `renderAudit()`
   `auditSignature` önbelleği yüzünden aynı veride DOM'a dokunmuyordu; ayrıca
   hiç geri bildirim yoktu. **Çözüm:** `toast.busy` → `done("N tema ölçüldü")`,
   hata → `toast.err`.

**Güvenlik kapısı (kalıcı altyapı)**
- `tools/security-check.mjs`: S1 sır · S2 kimlik dosyası · S3 kabuk enjeksiyonu ·
  S4 yol geçişi · S5 CSP · S6 yetki · S7 bağımlılık. CI + yerel.
- `qa/security-selftest.mjs`: kapının kendi testi. **Denetleyici yazıp "PASS"
  demek yetmez; yakaladığını kanıtlamak gerekir.** 5 ihlal sınıfı + temiz taban.
- Üretim CSP'si sıkılaştırıldı; dev CSP ayrıldı (`devCsp`). Üretimde `localhost`
  yok, `unsafe-eval` yok, `object-src`/`base-uri`/`frame-ancestors` var.

**Grok PR'ları**
- #3 ve #4 (yol geçişi) doğruydu, squash-merge edildi.
- #1 ve #2 kapatıldı: bağımlılık yükseltmeleri doğrudan main'e uygulandı
  (#1 ayrıca `package-lock` sürümünü 1.0.0'a çekiyordu — yan etki).
- **Kapı, PR'ların atladığı bir dosyayı buldu:** `qa/run.mjs` (8 sunucudan 1'i).
  Bu, "elle denetim eksik kalır" tezinin kanıtı.

**Ders (kalıcı)**
1. **Katman sırası = renk sızıntısı.** Palet dosyası `@import` ile geliyor ama
   `[data-accent]` blokları ondan SONRA yazılıyor → her zaman kazanır. Bir token
   "palet başına" ise onu ayrı bir değişkende tut (`--accent-base`) ve override
   katmanının onu ezmediğinden emin ol.
2. **Kalıcı ayar + global override = sızıntı.** Seçim `localStorage`'da tek
   anahtardaysa, palet değişince eski seçim yeni palete taşınır. Anahtar palet
   kimliğiyle birleştirilmeli (`{palet: seçim}`).
3. **"Buton çalışmıyor" genelde "geri bildirim yok"tur.** Önce ölçüm yolunu
   doğrula, sonra görünür geri bildirim ekle — kullanıcı ikisini ayırt edemez.
4. **Güvenlik denetleyicisi de test edilmeli.** Aksi halde "PASS" yazan ama hiçbir
   şey yakalamayan bir tiyatro olur. `qa/security-selftest.mjs` bunun için var.
5. **Bot PR'ı "hepsini düzeltti" demek değil.** Grok 5 dosya düzeltmiş, 1'i kalmış;
   regex tabanlı kapı hepsini tarar, göz taraması taramaz.

**Doğrulama:** `npm test` 12/12 · `cargo test` 193+2 · `check:tokens` PASS ·
`check:security` PASS (S1-S6) · `security-selftest` PASS (5 sınıf) ·
`audit-accent` PASS (12 palet + günün rengi) · `audit-flyout` PASS (48 kare) ·
`audit-templates` PASS · `qa/run.mjs` PASS · `cargo audit` temiz ·
`npm audit` 0 açık · canlı exe sıkı CSP ile açıldı.

**Ek (tavsiye edilen geliştirme, yapıldı): "Günün rengi".** 12 palette sahip
bir üründe en doğal eksik buydu: renkleri var ama kimse kullanmıyor. Saat
dilimine göre palet dönüyor (sabah aydınlık → gündüz nötr → akşam sıcak →
gece derin). Elle seçim 10 dk kutsal; varsayılan kapalı (sürpriz yapmasın).
`orchestr.paletteForHour` tek kaynak, QA eşlemeyi oradan okuyup doğruluyor.

**Ayrıca düzeltilen teşhis borcu:** log'da `theme=` iki farklı şeyi yazıyordu
(normal turda karar, donmuş turda uygulanmış). Artık `theme=` daima
**uygulanmış**, `want=` **karar verilen**. Örnek eski satır: 21:33 `theme=catppuccin`
(dwell dolmadı, uygulanmadı) → 21:34 `theme=zenburn`; teşhis imkânsızdı.

**Bir de zaman biçimi birleştirildi (canlı log'da yakalandı).** Üç Rust yazıcı
(`colortemp`, `hdr`, `lib` setup) `Utc::now().to_rfc3339()` ile **UTC +
nanosaniye** yazıyordu; JS tarafı yerel saat yazıyordu. Aynı dosyada iki zaman
dilimi: `2026-10-29T01:07:15+03:00` satırının hemen altında
`2026-10-28T22:07:15.162307200+00:00`. Satırlar sıralanamıyordu.
**Çözüm:** `logger::now_local()` (yerel, saniye) — `orchestr.localIso` ile
birebir aynı biçim; üç yazıcı da ona bağlandı.

## V2.8.0 TURU (2026-10-28, akşam) — kullanıcı geri bildirimi: 5 madde

**Tetik:** kullanıcı beş şey söyledi: renkler çoğalsın · sahne ile bento farkı
anlaşılmıyor · oyundayken parlaklık %100 olsun · kontrast denetimi anlaşılmadı ·
toast hiç yok.

**Yapılanlar**
- 12 palet (7 → 12): okyanus · lavanta · gunbatimi · kum · buz. `palette.css`.
- Bento **gerçek mozaik**: Durum 12 sütunlu asimetrik ızgara (hero 2 satır, sağda
  monitörler, altta geniş ctl + 2 satırlık vurgulu durum). Sahne cam+3B kaldı.
- Oyun/video sırasında %100 parlaklık: `gameBoostOn/Off`, Ayarlar anahtarı
  (`gameBright`, varsayılan açık), kilit ekranında daima kapalı, çıkışta eski değer.
- Toast: düzen/palet seçimi + 1 saat duraklatma + "bugün" (son ikisinde Geri al).
- Kontrast denetimi metni: **OpenCode tema dosyalarını** ölçtüğü ve eşiklerin ne
  demek olduğu yazıldı.

**Ders (kalıcı)**
1. **`grid-template-areas` içinde `auto` alan adı olmaz.** CSS anahtar kelimesi;
   eşleşmez, karo sessizce otomatik yerleşir (67px'lik şerit). Ölçüm:
   `gridTemplateAreas` doğru görünüyor ama `getBoundingClientRect().width` 67px.
2. **Aynı özgüllükte kaynak sırası kazanır** — yine: `#page-panel .asym > .span-side
   { grid-column: auto }` mozaiği eziyordu. Mozaik bloğu dosya SONUNA taşındı.
   Çözüm `>` ile özgüllüğü artırmak değil, sırayı düzeltmek (daha kırılgan olurdu).
3. **Elle tutulan palet listesi = sessiz kapsam kaybı.** `check-tokens`, `run.mjs`
   ve `audit-flyout` üçünde de sabit 7 vardı; 5 yeni palet denetim dışı kalacaktı.
   Üçü de artık `palette.css`ten keşfediyor (48 flyout karesi, 48 kontrast ölçümü).
4. **"Fark yok" geri bildirimi genelde yüzey değil YERLEŞİM sorunudur.** Bento'da
   renk/yarıçap değişiyordu ama ızgara sahne ile birebir aynıydı; kullanıcı haklıydı.
5. **Toast altyapısı olması "toast var" demek değil.** `toast.ts` vardı ama yalnız
   6 yerde çağrılıyordu; kullanıcı hiç görmemiş. Anlamlı eylemlere bağlandı.

**Doğrulama:** `npm test` 12/12 · `cargo test` 193+2 · `check-tokens` PASS
(12 palet, 48 ölçüm) · `qa/run.mjs` PASS · `audit-templates` PASS ·
`audit-flyout` PASS (**48 kare**) · yeni 5 palet + bento mozaik + toast kareleri
gözle incelendi.

## V2.7.0 TURU (2026-10-28) — "tam": flyout + sayfalar da şablon giyer

**Tetik:** v2.6 tasarım sistemini kurdu ama yarısı eksikti: flyout eski dildeydi,
Profiller/Geçmiş/Ayarlar yalnız renk alıyordu. Bu tur "sistem her yerde" turu.

**Yapılanlar**
- Renk tek kaynağa taşındı: `src/palette.css` (7 palet + obsidyen kökü). `styles.css`
  ve `flyout.css` `@import` eder; `check-tokens` ölçümü buradan.
- `src/flyout-templates.css`: flyout 4 şablon (bento/sahne/dergi/konsol) × 7 palet.
  `flyout.ts` `syncLivery()` + `ss:state`/`localStorage`; geçersiz değer bento/obsidyen.
- Sayfa yerleşimleri (`templates.css` sonunda, ≥901px): Profiller usta-ayrıntı,
  Geçmiş bento mozaik / dergi tek kolon / konsol dar kolon, Ayarlar konsol varyantı.
- Profiller'de editör iç kaydırma: kaydet çubuğu hep görünür.
- QA: `qa/audit-flyout.mjs` (28 kare), `qa/audit-templates.mjs` sayfa matrisi.

**Ders (kalıcı)**
1. **`grid-template-columns: 1fr` tek başına yetmez.** `.span-side { grid-column: 2 }`
   örtük ikinci kolon açar; hesaplanan değer `560px 332px` görünür ve *inline
   `!important` bile* değiştirmez — çünkü ikinci iz örtük. Tek kolona inerken
   `.span-main`/`.span-side`'ı da `grid-column: 1`e sabitle.
2. **`min-height` tabanları şablon değiştirince taşırır.** Grafik 300px + kayıtlar
   260px iki kolonda sorunsuz, tek kolonda 60px taşma. Şablon kuralı kendi tabanını
   sıfırlamalı (`min-height: 0`) ve grafiğe kendi tabanını vermeli.
3. **Editörü kaydırırken "kesik" görünüm normaldir** ama kaydırma çubuğu görünmeli:
   `scrollbar-color: var(--text-3)`, alta `padding-bottom: var(--sp-6)`.
4. **Ayarlar bilinçli tek kolon.** 2 kolon denemesi mozaik boşluklar ve üst üste
   binme üretti (ekran görüntüsüyle doğrulandı); form okunurluğu daha değerli.
5. Ölçüm tuzağı: `getComputedStyle().gridTemplateColumns` *kullanılan* izleri verir;
   `1fr` yazıp iki değer okuyorsan örtük iz ara, kuralı suçlama.

**Doğrulama:** `npm test` 12/12 · `check-tokens` PASS (7 palet, 28 ölçüm, 4 şablon) ·
`qa/run.mjs` 22 senaryo PASS · `audit-flyout` PASS (28 kare) · `audit-templates`
PASS (4 şablon × 4 sekme; yatay taşma 0, kırpılma 0, Geçmiş 0 kaydırma).

## V2.6.1 TURU (2026-10-27, gece) — "kendi penceresinde açtım": boşluk hataları

**Tetik:** kullanıcı "pc açık, yapman gerekeni yap" dedi. v2.6.0'ın canlı görsel
doğrulaması yarım kalmıştı (makine kilitliydi, ekran görüntüsü kilit ekranını döndürdü).
Kurulu exe'yi açtım, kendi gözümle baktım — **iki kusur hemen sırıttı**:
hero kartının üst yarısı boş (metin tepede, eğri dipte) ve 1920'de kenarlarda ~370px
ölü boşluk.

**Kök neden: QA yalnız 800×600 ölçüyordu.** Bu sınıf hata "taşma" değil "boşluk"
hatası; `checkOverflow` yatay taşmaya bakar, `run.mjs` matrisi de 1040×740'ta bütçe
ölçer. 1200px üstü hiç test edilmiyordu. **Ders: pencere büyüyünce de bozulur —
"geniş ekran" da bir kırılım noktasıdır.**

**Yeni araç (kalıcı): `qa/audit-templates.mjs`** — 4 şablon × 6 boyut (1040/1000/800/
760/1920/1440) + 7 palet karesi; `scrollHeight−clientHeight`, yatay taşma ve kırpılan
öğe listesi. Kareler `qa/audit/` (git dışı). Bu araç olmadan bu turdaki üç hatanın
hiçbiri görülmezdi.

**Bulunan ve düzeltilen (hepsi ölçümle):**
| bulgu | ölçüm | düzeltme |
|---|---|---|
| hero alt yarısı boş | 1936×1048'de ~190px | geniş ekranda 2 kolon (metin \| eğri) |
| kenarlarda ölü boşluk | `.stage` 1180px, ekran 1920 | `min(1500px, 96vw)` |
| hero satırı şişiyor | `1.05fr` → 450px | `min(40vh, 360px)` |
| 1000×720 kaydırıyor | +501px | tek kolon eşiği 1020 → **900** → 0px |
| dergi alt yarısı boş | 1040'ta ekranın yarısı | kapak düzeni (hero `1fr`, alt `auto`) |
| rakam küçük kalıyor | 60px @ 1936px | `clamp(64px, 5.4vw, 104px)` |

**Şablon bütçesi (son hâl, 6 boyut × 4 şablon):** 1040/1000/1920/1440 → **hepsi 0px**;
800/760 tek kolona iner ve doğal kaydırır (kabul, PLAN §7 "≤120px" hedefi aşılıyor ama
800×600'de içerik zaten sığmıyor — kart içi kaydırma yerine sayfa kaydırma tercih edildi).

**CSS tuzağı (kayda değer):** aynı özgüllükte `@media` bloğu taban kuraldan ÖNCE
yazılırsa taban kazanır. `.hero-num` bir kez böyle ters düştü; dosyada yorumla işaretli.

**Doğrulama:** `npm test` 12/12 · `check-tokens` PASS · `run.mjs` PASS · `audit-templates`
PASS · kurulu exe 2.6.1 açıldı, canlı ekran görüntüsüyle onaylandı.


## V2.6.0 TURU (2026-10-27) — "tasarım sistemi": 4 düzen × 7 palet

**Kullanıcı:** *"senden bir öncekiler asla benzemeyen"* · *"en iyi landingpage gibi"* ·
*"3b sahneli ama yormayan"* · birden fazla tasarım şablonu + renk kombinasyonu.

**Karar (onaylı):** iki bağımsız eksen — `data-template` (4) × `data-theme` (7 palet).
Varsayılan **bento**. `data-theme` sözleşmesi v2.4'ten beri korunuyor (kayıtlı ayar, QA,
`[data-accent]` seçicileri, `drawChart` buna bağlı).

**Yeni dosya: `src/templates.css`.** Şablon katmanı. Kural: burada **renk hex'i yok**;
şablon blokları yalnız token yazar (`--card-r`, `--panel-pad`, `--num-font`, `--grain`,
`--hero-glass-on`, `--hero-parallax`…), bileşen kuralları bu token'ları bir kez tüketir.
`tools/check-tokens.mjs` hem hex yasağını hem 4×7 kontrastı ölçer — iddia test edilebilir
hâle geldi.

**Dört şablonun karakteri (kopyala-yapıştır değil, gerçekten farklı):**
| | geometri | tipografi | gezinme | süs |
|---|---|---|---|---|
| bento | 2 sütun üst + 3 kart alt, kalın yarıçap (24) | sans, 60px | dolu çip dock | yüzey farkı |
| sahne | tek kolon, cam plaka | sans, 64px/300 | yüzen cam dock | 3B paralaks + glow |
| dergi | kart yok, hairline kurallar | **serif**, 84px italic alt satır | alt kural + sekme altı çizgi | kâğıt grain 0.03 |
| konsol | 1px ızgara zemin, 3 sütun | **mono**, büyük harf etiket | bölmeli düz çubuk | LED noktası, motion 0 |

**Dikey bütçe (PLAN-v3 §7) — asıl iş buradaydı.** İlk denemede Durum sayfası 183–454px
kaydırıyordu. Ölçümle (QA `measure` çıktısı) sebep bulundu: hero+monitörler dikey
yığıldığında 460px, alt sıra 470px, bütçe 578px. Çözüm: 1040px üstünde hero + monitörler
**yan yana**, alt satırda üç kart yan yana (`.col-stack` → `display: contents`); kartlar
kendi içinde kayar. Sonuç: **4 şablonun hepsi 0px**. ≤1020px'te tek kolona iner.

**Yol boyunca bulunan gerçek hatalar (QA karelerinden, gözle):**
1. **Toast düğmeyi süresiz kilitliyordu.** `#pf-save` 30 sn tıklanamadı: fare toast'ın
   üstünde kaldıkça sayaç duruyor (WCAG 2.2.1), duraklama sınırsızdı. `MAX_PAUSE_MS=12s`
   bekçisi eklendi. Bu bir QA artefaktı değil, gerçek kullanıcı hatasıydı.
2. **Monitör adı "Gene..." diye kırpılıyordu** (sağ kolon 1040'ta ~%40). Dar kolonda iki
   satırlık düzene geçildi; ≤1020'de tek satıra döner.
3. **Konsol'da hero alt satırı kesiliyordu** (uppercase mono, `white-space:nowrap`).
4. **Fildişi vurgusu AA altıydı** (`on-accent/accent` = 3.80). `#a8763c` → `#94632d` (4.95).
   check-tokens bunu yakaladı.

**Doğrulama:** `npm test` 12/12 · `check-tokens` **PASS** (7 palet, 28 ölçüm, 4 şablon) ·
`cargo test` 193 · clippy 0 · fmt temiz · build temiz · QA **PASS** (28 matris + bütçe +
760×600 taşma) · **32 kare gözle incelendi**.

**Bilinçli ertelenen (v2.7):** tray flyout'un yeni dile taşınması, Geçmiş/Profiller/Ayarlar
sayfalarının şablon duyarlı yerleşimi (bugün ortak token'larla giyiniyorlar), "ışığa göre
görünüm" otomatiği (palet üçlüsü), gerçek WebGL sahne.


## V2.5.0 TURU (2026-10-27) — "güven": parlaklık düzensizliği + işlevsiz sıcak ton

**Kullanıcı (birebir):** *"pek stabil çalışmıyor bazen durduk yere çok kısık bazen durduk
yere çok parlak"* · *"sıcaklık tonu işlevsiz gibi"* · *"büyük oranda geliştirme gerek
detaylı"*. Karar: **önce stabilite**, sonra tasarım sistemi (v2.6).

**Kök nedenler (log + kod kanıtıyla):**
1. **Kilit ekranı bir ayar turuydu.** `lockapp.exe` ön plandayken WMI parlaklığı **0**
   okuyor, o 0 hedefe yazılıyor; kilit açılınca ekran "durduk yere çok kısık" geliyordu.
2. **Tema kararı sıçratıyordu.** İki tur üst üste aynı karar → hedef parlaklık *doğrudan*
   yazılıyordu (30 → 80 gibi), adım kuralı atlanıyordu.
3. **Kamera önbelleği "ikinci ölçüm" sayılıyordu.** 5 dk'lık önbellek aynı kareyi döndürürken
   `pendingCount` artıyor → tema arka arkaya zıplıyordu.
4. **Işık eşiği gürültüye açıktı.** Histerez yoktu; ton tek kareyle dönüyordu.
5. **Sıcak ton ölçeği yanlıştı.** `warmPercent` 0-45 bandında *tavan* olarak kullanılıyor,
   otomatik eğri (0-40) onunla `min()`'leniyordu → pratikte hep aynı, silik sarılık.
6. **`GetDeviceGammaRamp` hiç okunmuyordu** → sürücü reddetse bile "uygulandı" loglanıyordu.

**Mimari:** tüm karar kuralları **saf** hâle getirildi.
- `src/engine.ts` (yeni, DOM/invoke/`Date.now()` yok) + `src/engine.test.ts` (12 test,
  `npm test` = `node --test src/engine.test.ts`): `isNewMeasurement`, `skipReason`,
  `isExternalChange`, `extendRespect`, `learnDelta`, `learnAllowed`, `readableTarget`,
  `finalTarget`, `themeGate`, `medianTone`, `lightKey`.
- Rust: `decide.rs` yeniden (`Level`+`next_level` ±6 histerez, sürekli taban eğrisi,
  `scene_target`, `next_brightness` adımı, `warmth_auto` 0-100) — **24 saat simülasyon
  testi**: hiçbir adım >8, 30 dk'da en fazla 2 yön değişimi.
- `prefs.rs` sema v2: öğrenme **delta** (−20..+20), en az 3 gözlem + 3 farklı gün;
  v1'deki mutlak `bright` kayıtları göçte silinir (tema tercihleri korunur).
- `gamma.rs`: kübik `warm_channel`, `verify_warmth` (yazım sonrası mavi orta ton geri
  okuma) → `lib.rs gamma_verify_warmth` → `orchestr.applyWarmth` loglar.
- `activity.rs`: `SHELL_HOSTS` + `SHQueryUserNotificationState` — kabuk penceresi
  (`applicationframehost.exe`, Başlat, arama) artık tam ekran sayılmıyor; gerçek tam ekran
  oyun/video hâlâ donduruyor.

**Ölçüm disiplini:** tur başına tek `brightness_get`, sonra tek yazma; yazma sonrası okunan
değer ±2 dışındaysa 3 deneme (`brightness.rs`), olmuyorsa görünür hata. Dış müdahale:
yazımdan sonraki 90 sn içinde ±6 sapma → 15 dk saygı (250 ms sonra doğrulama okuması).

**Doğrulama:** `cargo test` **193** yeşil (7 ignored) · clippy `-D warnings` 0 · fmt temiz ·
`npx tsc --noEmit` temiz · `npm run build` temiz · QA `node run.mjs` **PASS** ·
kareler gözle incelendi.

**Ders:** "QA PASS" bu sınıf hatayı yakalamıyordu; hata *zaman* ve *durum* (kilit, önbellek,
dış müdahale) içindeydi. Bu yüzden kurallar saf fonksiyona alınıp sahte saatle test edildi.


## V2.4.2 TURU (2026-10-26) — ilk açılış sıkışıyordu

**Kullanıcı:** *"deneyeyim, açıldı mı"* → uygulamayı `target/release`'ten açtım, canlı
ekran görüntüsü çektim. İlk açılış **800×600**: hero + monitörler ekranı doldurup gerisi
aşağıda kalıyor, içerik dock'un dibine sıfıra dayanıyor.

**Yapılanlar:**
- Varsayılan pencere **1040×740** (min 760×600).
- **Hero yatay:** metin solda, eğri sağda → 383px → 226px. (`@media 980px` bloğu zaten
  `grid-template-columns` yazıyordu; taban flex kalmış, hedeflediği düzen hiç kurulmamış.)
- **Sol/sağ denge:** "Otomatik ayar" sol kolona (olay akışının altına) taşındı; sağda tek
  "Durum" kartı. 1920'de sol altta oluşan ~200px ölü boşluk kapandı. `asym` 658 → 439px.
- **Dock payı:** `.page` alt boşluğu 24px, dock üstü 8px.
- **760/800'de eğri metne biniyordu:** `max-height:660` bloğu eğriyi 96px'e *büyütüyordu*;
  artık 56px, metne 84px pay.
- **Geçmiş özet şeridi:** üç "—" + tek `#sum-hint` satırı (yeni id; SÖZLEŞME'ye de yazıldı).

**Yeni ölçüm araçları (kalıcı):**- `qa/measure-budget.mjs` — sayfa/dikey bütçe: `pageScroll` vs `pageClient`, hero/monitör/asym
  yükseklikleri. Boşluk ve "ekrana sığmıyor" sınıfı hatalar buradan görülür.
- `qa/check-topbar.mjs` — üst şeritte taşma (audit'in `scrollWidth` kontrolü bunu yakalamıyor).
- `qa/audit-shots.mjs` boyutları: 1040×740 (varsayılan), 800×600, 1000×720, 760×600,
  1920×1040, 1440×900.

**Ders:** pencere varsayılanı değiştiğinde QA boyut listesine **o boyutu ekle**; yoksa
kullanıcının ilk gördüğü ekran test edilmemiş olur.

**v2.4.3 (aynı gün):** v2.4.2 kurulup açıldı — pencere **yine 800×600**. Sebep
`tauri-plugin-window-state`: son boyutu hatırlıyor, `tauri.conf.json` varsayılanı
mevcut kurulumda hiç okunmuyor. Çözüm `src-tauri/src/winstate.rs`: pencere
yaratılmadan **önce** (`run()` başında, plugin dosyayı okumadan) kayıtlı boyut tam
olarak eski varsayılana eşitse 1040×740'a çek, `.layout-242` işareti bırak; kullanıcı
kendi boyutunu seçtiyse dokunma. 5 birim testi var.
**Ders:** "varsayılanı değiştirdim" demek yetmez — kalıcı durum (window-state,
localStorage, prefs) eski değeri geri getiriyorsa göç yaz.**



## V2.3 TURU (2026-10-26) — "premium 3B sahne"

**Kullanıcı talimatı (birebir):** v2.2 tesliminden sonra — *"UI daha değişecek mi bu nihai
hali mi… beğenmedim eskisine benziyor, ben baştan sona yeni istemiştim, 3dsi de az"* ·
*"lüks hissettiren premium bir UI ayrıca"*. Karar: **3B sahne — derinlikli tek ekran** +
**belirgin 3B (gerçek katman derinliği)**.

**Kök neden (şef özeleştirisi):** v2.2 brifinde "mevcut CSS değişken sözleşmesini koru,
4 sekmeyi koru, kart düzenini koru" yazmıştım → tasarımcı "yeniden yarat" değil "cilala"
yaptı. Sol ray + kart yığını + koyu lacivert aynı kaldı, 3D yalnız 3°'lik hover eğimiydi.
Bu turda bu kısıtlar kaldırıldı.

**Dalga haritası:**
- [K1] paralel: (a) premium/3B research (DeepSeek), (b) sıfırdan sahne tasarımı (glm).
- [K2] şef birleştirme + canlı uygulamada gerçek test (stub değil).
- [K3] reviewer + 8 bulgu düzeltmesi.
- [K4] v2.3.0 release.

### [K1] sonuç (2026-10-26)
Araştırma ve tasarım **bağımsız olarak aynı yere çıktı**: obsidyen + şampanya palet,
alt ortada cam dock, tam sayı Z katmanları (`translateZ` −80/−20/0/+10), hareket yalnız
`transform`/`opacity`, metin asla dönmez (rasterleşme), blur ≤2 yüzey.
Uygulanmayan bilinçli: WebGL/three.js (tray uygulamasında maliyet/fayda negatif),
sürekli ambient animasyon.

### [K2] UYGULAMA (2026-10-26)
- `index.html` + `src/styles.css` sıfırdan: sol ray → **alt ortada cam dock**; 3 kademeli
  sıcak obsidyen zemin (`#0a0908`→`#262019`); **şampanya** `#d8b98a` + bakır; altın
  hairline; 64px/300 dev rakam + `tabular-nums`; asimetrik grid (eşit kart ızgarası yok);
  `.app{perspective:1200px}`; `page-in` ile 3B sayfa geçişi; fare paralaksı (rAF, ~30 fps,
  `reduced-motion`'da kapalı).
- **146 id'nin tamamı korundu** (panels/orchestr/main `el()` çağrıları), `.tab`+`data-tab`
  + `#page-*` sözleşmesi aynı.

### [K2b] CANLI TESTTE BULUNAN GERÇEK HATALAR (QA'nın görmediği)
Kurulu uygulama **açılışta çöküyordu**: `panels.ts` monitör satırında kaldırılan `api`
değişkenine erişim (`ReferenceError: api is not defined`) → `renderAll` düşüyor, pencere
boş kalıyor. QA stub'ı bu yolu çalıştırmadığı için 21 senaryo yeşil geçmişti.
Ders: **QA yeşil ≠ uygulama açılıyor**. Her turda en az bir kez gerçek exe çalıştırılmalı.
Ayrıca: dock içeriği örtüyordu (fixed → flex akışına alındı), toast'lar dock'ı kapatıyordu
(`bottom: 96px`), profil çubuğu üstteki düğmeleri örtüyordu (sticky kaldırıldı), monitör
satırında çift rozet, hata metni 52px'e sıkışıyordu, Geçmiş'e `source=vcp/vcp` sızıyordu,
`normal`/`neutral` çevrilmiyordu.

### [K3] reviewer (REVISE → 8/8 düzeltildi)
MAJOR: `[data-accent="blue"]` CSS'te yoktu → "Mavi" seçilince `--accent` hiç değişmiyordu
(sadece seçici noktası). MINOR: toast dock'ı örtüyordu; sekme erişilebilirliği (roving
tabindex + ok tuşları yoktu); hero eğrisi hiç güncellenmiyordu (sabit 40/45/55);
`--text-4` kontrastı 3.2:1 (AA altı); aktif sekmede odak halkası görünmüyordu;
`--mx/--my` paralaksı ölüydü (JS yoktu); eski sözleşme/sticky doküman artıkları.

### [K4] doğrulama + release
- `cargo test` **171 + 2** yeşil (7 ignored) · clippy `-D warnings` **0** · `fmt` temiz
- `npm.cmd run build` temiz · QA **21 senaryo PASS** (localStorage sızıntısı giderildi)
- Sürüm 2.3.0 (package.json, Cargo.toml, tauri.conf.json, Cargo.lock, flyout)

**Bilinçli ertelenen (v2.4+):** Authenticode imzalama (Azure Trusted Signing bireysel
geliştirici için ABD/Kanada sınırlı → TR kapsam dışı), gerçek WebGL sahne (talep olursa),
tray flyout'un da yeni sahne diline taşınması (şu an ayrı ve sade).

### [K5] YAYIN SONRASI REVIEW → v2.3.1 (2026-10-26)
Bağımsız reviewer 2 MAJOR buldu; ikisi de gerçekti:
1. **Işık ölçeği 10 kat yanlıştı:** `light.rs` `luminance` **0-255** döndürürken ben
   0-1000 sanıp `lum/10` yazmıştım → nokta hep alt çeyrekte. `lum/255*100` yapıldı.
   Ders: bir alanın birimini **kaynak koddan** doğrula, yorumdan değil.
2. **Açılış render'ı korumasızdı:** `el()` bilinçli throw eder; herhangi bir `renderX`
   patlarsa pencere düşer. `safeRender()` sarmalayıcısı ilk çizim + zamanlayıcıya uygulandı.
MINOR/NIT: hero eğri yolları da gerçek veriden çiziliyor (yalnız noktalar değil) ·
reduced-motion sonradan değişince paralaks çalışıyor · `#pf-name` `inputEl` ·
flyout sürüm yorumları · **QA bayat-dist koruması** (`src/` > `dist/` ise test durur).
**v2.3.1 yayınlandı** — 171+2 test, clippy 0, fmt, build, QA PASS.


## V2.2 TURU (2026-10-25) — "anlaşılır dil + geri bildirim + tatlı arayüz"

**Kullanıcı talimatı (birebir):** "kullanıcıların anlam veremediği, kullanıcıya uygun dil
kullanılmayan çok sekme var" · "bazı sekmelerin işlevini yerine getirdiğinden emin değilim;
tıklıyorsun ama ne bir push bildirim ne bir toast bildirim" · "UI biraz amatör ve fazla
kötü duruyor; tatlı, modern, yenilikçi, gerekirse 3D bir uygulama olmalı".
Ayrıca **v2.2 için ertelenen konular** da bu turda: DDC 0x0C arayüzü, imzalama/SmartScreen,
CHANGELOG. KURAL: yalnız smart-screen reposu; bu tur da final değil.

**Ön tarama (şef, 2026-10-25):** `index.html` 43 KB / 129 id · `styles.css` 36 KB ·
`panels.ts` 31 KB · `orchestr.ts` 54 KB. Geri bildirim **yalnız** 20-20-20 molasında
(`orchestr.ts:1202 sendNotification`); parlaklık, tema, profil, lisans, ayar kaydı SESSİZ.

**Dalga haritası:**
- [K1] **keşif (4 paralel, salt-okuma):** (a) UX dil + işlev denetimi (jargon envanteri,
  sessiz eylemler, ölü kontroller, sekme amaçları), (b) modern/3D UI trendleri + WebView2
  performans sınırları, (c) geri bildirim hiyerarşisi (toast/OS bildirim/inline + sayısal
  kurallar), (d) renk sıcaklığı arayüzü + CHANGELOG/araç seçimi.
- [K2] **tasarım (şef):** bilgi mimarisi (≤3 sekme + ayar alanı), Türkçe sözlük (jargon →
  insan dili), tasarım dili (3D derinlik nereye, nereye değil), geri bildirim matrisi
  (eylem → kanal → süre), DDC 0x0C sunumu, CHANGELOG formatı.
- [K3] **uygulama:** (a) tasarım sistemi + ana pencere (`styles.css` + `index.html`) ∥
  (b) geri bildirim altyapısı (`src/toast.ts` + orchestr kablolama) → (c) dil geçişi
  (panels/orchestr metinleri) + DDC 0x0C arayüzü → (d) QA senaryoları.
- [K4] **doğrulama + reviewer + release v2.2.0** (updater artefaktları dahil).

**Dosya sahipliği (çakışma önleme):** tasarım yazarı yalnız `index.html` +
`src/styles.css`; geri bildirim yazarı yalnız `src/toast.ts` + `src/toast.css` + kablolama
noktaları; dil geçişi ve QA sıralı (tek yazar). `flyout.*` dil geçişinden ayrı yazar.

**Değişmezler:** `el()` id sözleşmesi (silinen id varsa QA + sözleşme birlikte güncellenir) ·
`--accent` vb. CSS değişken sözleşmesi · parlaklık `Math.round` · kilit/dondurma kuralları ·
00:00-01:30 %0 yazmama · ücretsiz/Pro kapıları.

### [K1d] renk sıcaklığı + CHANGELOG sonucu (2026-10-25, PASS)
- **Kelvin birincil, yüzde ikincil:** f.lux/redshift Kelvin + hazır adlar kullanıyor
  (Ampul 2700, Halojen 3400, Florasan 4200, Gündüz 5500); Windows Night Light kullanıcıya
  yüzde gösterip içeride Kelvin'e çeviriyor. Karar: **"4200 K · Florasan"** biçimi; yüzde
  yalnız ipucu satırında. Yalın "2700 K" soğuk, yalın "%70" yönsüz.
- **Kaydırıcı:** sol = sıcak (2500 K), sağ = gündüz (6500 K) — gradyan ve sayı ekseni aynı
  yönde; adım **100 K**; DDC yavaş (~50-100 ms) → **150-200 ms debounce**, `change`'te tek
  yazma; "6500 K'ye dön" + Esc ile geri alma (5 sn toast).
- **Donanım/yazılım ayrımı iç detay** → rozet YOK: başarılıysa hiç gösterme; DDC
  desteklemiyorsa tek gri satır "Ekran katmanıyla uygulanıyor" + (i) açıklaması. `DDC`,
  `VCP 0x0C`, `wmı` gibi kısaltmalar kullanıcıya GÖSTERİLMEZ.
- **HDR:** gizleme ve devre dışı bırakma yok — kontrol yerinde, soluk; altında kalıcı tek
  satır "HDR açıkken renk sıcaklığı uygulanamıyor" + "HDR ayarlarını aç"; HDR kapanınca
  değer kendiliğinden döner.
- **CHANGELOG:** Keep a Changelog 1.1.0 + SemVer, elle tutulan `Unreleased` bölümü
  (standard-version deprecated; release-please tek kişide gereksiz yük). Sürüm notu ayrı:
  "benim için ne değişti" dili, refactor/chore satırları girmez.
- **Doğrulanamadı:** HDR'ın Night Light'ı bloklaması resmî MS kaynağıyla yok (topluluk);
  Lunar sunumu; VESA 0x0C eşlemesi bu turda teyit edilemedi.

### [K1c2] geri bildirim sistemi sonucu (2026-10-25, PASS)
- **Hiyerarşi:** etkisi ekranda görünen 0-100 ms eylem → sessiz; başarı (kaydet/etkinleştir)
  → **toast 4-6 s**; alan hatası → inline (kalıcı); geri alınabilir yıkıcı işlem →
  **toast + "Geri al", 8-10 s, kendiliğinden kapanmaz**; 1 s üstü iş → düğme "Kaydediliyor…"
  + disabled + spinner (statik "İşleniyor…" YASAK); ≥10 s → yüzde + İptal.
- **Toast kuralları:** sağ-alt, yeni **üstte**, ekranda **en fazla 3** (fazlası kuyruk),
  genişlik sabit, en fazla 2 satır, 4-8 px aralık. Başarı/bilgi `role="status"`
  (`aria-live="polite"`), hata `role="alert"` (`assertive`). **Otomatik kapanan toast'a asla
  focus taşınmaz** (APG). `×` + Esc ile kapatma; hover/focus'ta sayaç durur (WCAG 2.2.1).
  Aksiyon düğmesi Tab ile erişilebilir.
- **OS bildirimi yalnız:** (a) pencere kapalı/tray'deyken biten iş, (b) beklenen olay
  (20-20-20, lisans). Uygulama öndeyse in-app toast. İzin reddedilirse **tekrar sorma**,
  sessizce in-app'e düş + Ayarlar'da "Bildirimler kapalı — aç" bağlantısı.
  Tauri kısıtı: Windows'ta yalnız **kurulu** uygulamada çalışır; yönetici olarak çalışan
  uygulama bildirim gönderemez.
- **Yorgunluk:** kullanıcı tetiklemeyen OS bildirimi **günde ≤1-2**, aynı türden saatte ≤1
  (mühendislik önerisi; kaynakta masaüstü için sayısal tavan yok).
- **Sessiz kalması DOĞRU:** slider sürükleme, anında görünen toggle, tema uygulama
  (tüm UI değişir), sekme geçişi, filtre. **Zorunlu onay:** kaydet, sil, lisans
  etkinleştir/kaldır, uygulama bağla, otostart (registry görünmez).
- **Hata dili:** "ne oldu + neden + ne yapmalı", suçlamasız, teknik kod yalnız "Ayrıntılar"
  altında. Modal yalnız kritik hatada.
- **Eylem→kanal matrisi** (K2'ye girdi): parlaklık sessiz · tema seçimi sessiz · "otomatik"e
  alma toast · profil kaydet/uygula toast (+sil'de Geri al) · lisans 6 s toast veya inline
  hata · uygulama bağla toast · otostart toast · kalibrasyon spinner+toast · log temizle
  toast+Geri al · Pro kapısı inline banner · kontrast denetimi inline sonuç.

### [K1e] dil + işlev denetimi sonucu (2026-10-25, PASS)
**Dil (44 bulgu; en kritikleri):**
- Sekme adları içeriği anlatmıyor: "Ritim" → **Ayarlar**, "Bugün" → **Durum**.
- Aynı kavrama üç ad: "kip" / "mod" / "kaynak" → **Çalışma biçimi**; "sıcak ton" /
  "ton" / "renk" → **Ekranı sarılaştırma**; "dondurma" / "kilit" / "donduruldu" →
  **Ayar yapılmıyor**; "kalibrasyon" → **Öğrenilen tercih**; "tur" → **Ölçüm**.
- `index.html:435` **yanlış bilgi**: "bu tavanın altına inmez" — kod üst sınır uyguluyor
  (`orchestr.ts:803-805`) → "gece bu değerin üstüne çıkmaz".
- İngilizce sızıntı: `orchestr.ts:1035` "bright/cool", "dark/dim"; `panels.ts:539`
  "mod: dark"; `panels.ts:304` ham `wmi`/`ddc` rozeti; "donanımsal/yazılımsal".
- `index.html:483` "7+ AAA, 4.5+ AA, 3+ AA-large, altı FAIL" → "7+ çok iyi, 4.5+ iyi,
  3+ sınır, altı okunaksız".
- `panels.ts:630` **yanıltıcı**: "canlı önizleme" yazıyor ama `Kapalı` kipte etkisi yok.

**Ölü / yarım kontroller (13):**
1. `accent-picker` rengi değiştiriyor ama **kaydetmiyor** (`panels.ts:180-185`) → yeniden
   açılışta sıfır.
2. Okuma profili kapanışı temayı/animasyonu geri almıyor (`orchestr.ts:597-603`).
3. `sleep-cap` ipucu kodun tersini yazıyor.
4. `#break-text` hiç güncellenmiyor.
5. `pf-add` sınırda **nedensiz disabled**; Pro uyarısı düğmeden ulaşılamaz.
6. `break-switch` hiç log yazmıyor (tamamen sessiz).
7. Profil kartı tıklaması hem düzenliyor hem uyguluyor (sürpriz).
8. `editorDirty` yazılıyor ama **hiç çizilmiyor** → kaydedilmemiş değişiklik uyarısı yok.
9. `hist-panel` ham backend dökümü basıyor (`source=auto/auto | level=… | tone=…`).
10. `log-clear-btn` `window.confirm` kullanıyor (uygulama içi desenle tutarsız).
11. `pause-btn` + `day-off-btn` **aynı `pauseUntil` alanını** paylaşıp birbirini iptal ediyor.
12. `autoLock` tek yönlü: uygulama kapansa da kilit açılmıyor (kasıtlı mı doğrulanamadı).
13. "Film" tohum profilinde `autoLock:true` → ücretsiz kullanıcıda kalıcı kilit riski.
- Ek: `now-btn` kilit/sabit biçimde hiçbir şey yapmıyor ve **sessiz**; `#break-text`
  ve `#sub-bright`/`#hero-target` çift bilgi.

**Bilgi mimarisi kararı (uygulanacak):** 3 sekme + 1 ayar alanı —
**Durum** (hero + monitörler + 3 eylem + son 5 olay) · **Profiller** (kartlar + editör +
yapışkan "Kaydet / Kaydedilmedi" çubuğu) · **Geçmiş** (özet + grafik + insan dilinde
zaman çizelgesi) · **Ayarlar** (biçim, sarılaştırma, gece, mola, listeler, Gelişmiş).
Kaldır: "Ritim" adı, Bugün'deki profil çipleri (Profiller'de var), Geçmiş'teki `lic-mini`.
Ekle: eylem sonrası toast + geri al, kaydedilmedi göstergesi, disabled nedenleri.

### [K2] TASARIM KARARLARI — v2.2 (2026-10-25, şef)

**A) Bilgi mimarisi (4 → 3 sekme + Ayarlar):**
| Sekme | İçerik | Neden |
|---|---|---|
| **Durum** | hero (parlaklık + neden + sonraki değişim, tek kez), monitör satırları, 3 eylem, son 5 olay | Günlük tek soru: "şu an ne durumda" |
| **Profiller** | kartlar + editör + yapışkan "Kaydet / Kaydedilmedi" çubuğu | Tek başına anlaşılan iş |
| **Geçmiş** | özet + grafik + **insan dilinde** zaman çizelgesi | Ham log okunmuyor |
| **Ayarlar** | çalışma biçimi, sarılaştırma, gece, mola, listeler, Gelişmiş (tema, okunabilirlik, lisans, hakkında) | "Ritim" adı içeriği anlatmıyordu |

Kaldırılan: Bugün'deki profil çipleri (Profiller'de var) · Geçmiş'teki `lic-mini` (Ayarlar'da var)
· 3 ayrı durum düğmesi → tek **"Otomatik ayar" seçici** (Açık · 1 saat · Bugün · Kilitli).

**B) Dil sözlüğü (bağlayıcı):**
| Eski | Yeni |
|---|---|
| kip / mod / kaynak | **Çalışma biçimi** |
| sıcak ton / ton / renk | **Ekranı sarılaştırma** |
| şiddet | **Sarılık düzeyi** |
| kalibrasyon | **Öğrenilen tercih** |
| dondurma / kilit / donduruldu | **Ayar yapılmıyor** (+ nedeni) |
| tur / ölçüm turu | **Ölçüm** |
| hedef | **Ulaşılmak istenen** (tek yerde) |
| kaynak (Gün/Sarı/Beyaz/Gece) | **Işık varsayımı** |
| Ritim | **Ayarlar** |
| Bugün | **Durum** |
| WCAG / AAA / FAIL | **çok iyi / iyi / sınır / okunaksız** |
| wmi / ddc / donanımsal / yazılımsal | **dahili panel / harici** + "monitörün kendi ayarı" / "programla yapılıyor" |
| Otostart | **Windows açılışında başlat** |
| HDR (rozet) | "HDR açıkken ekran sarılaştırılamıyor" |

Kural: kullanıcıya görünen hiçbir metinde `VCP`, `DDC`, `gamma`, `WMI`, `kelvin` (birim
olarak `K` serbest), `rampa`, `AA/AAA`, `FAIL`, `invoke` geçmez.

**C) Tasarım dili — "tatlı ama oyuncak değil":**
1. **Derinlik:** zemin merdiveni 3 kademe (bg / surface / raised), saf siyah yok. Kartlarda
   2 katmanlı yumuşak gölge + ince üst ışık kenarı (`inset 0 1px 0 rgba(255,255,255,.07)`).
2. **Tek cam yüzey:** yalnız sol ray `backdrop-filter: blur(14px) saturate(1.2)` (Liquid Glass
   mantığı: functional layer). Kartlar **opak** — çok katmanlı blur YOK (Tauri: acrylic
   Win11'de yeniden boyutlandırmada kötü performans).
3. **3D:** yalnız hero kartında `perspective: 900px` + hover `rotateX(1.5deg) rotateY(-2deg)`
   (≤3°), `transform-style: preserve-3d` sadece o alt ağaçta. **WebGL/three.js YOK.**
   Transform'lu katmana kritik metin konmaz (rasterleşme).
4. **Motion:** varsayılan **180 ms**, giriş 200-250, çıkış 120-150; `cubic-bezier(0.2,0,0,1)`.
   Yalnız `transform`/`opacity` animate edilir; gölge `::after` opacity ile. Sürekli ambient
   animasyon YOK. `prefers-reduced-motion: reduce` → transform/parallax kapalı, opacity 100 ms.
5. **Tipografi:** 12/14/16/20/32/48; gövde 14-16, satır 1.5, başlık 1.2; ağırlık 400/500/600.
   Sayılarda `font-variant-numeric: tabular-nums` (değer oynarken genişlik zıplamasın).
6. **Renk:** tek accent + 3 durum (başarı/uyarı/hata). Durum asla yalnız renkle anlatılmaz —
   nokta + metin. Kontrast: metin ≥4.5:1, ikon/sınır ≥3:1. İkincil gri "zaten soluk" diye
   ilden kaçınılmaz: 3:1 altına inilmez.
7. **Erişilebilirlik:** `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`
   (asla `none`) · `forced-colors: active` → cam/gölge kapanır, `1px solid CanvasText` ·
   `prefers-contrast: more` → kenarlıklar koyulaşır · sidebar'da roving tabindex + ok tuşları.
8. **"Wow" tek yerde:** hero'da ışık→parlaklık→sarılık zincirini gösteren ince SVG eğri,
   canlı güncellenen; maliyeti düşük, ürüne özgü. Başka süs yok.
9. **Layout:** `border-image`/`clip-path` yok; 8px tabanlı aralık; taşma yok; sidebar etiketi
   **her genişlikte** görünür (ikon-only mod kaldırılır).

**D) Geri bildirim sistemi (`src/toast.ts`, kendi kendine mount):**
- API: `toast.ok(msg)` · `toast.info(msg)` · `toast.err(msg, {detail?})` ·
  `toast.action(msg, {label, onAct, ms?})` · `toast.busy(msg)` → `done()`.
- Sağ-alt, yeni üstte, **en fazla 3** (fazlası kuyruk), sabit genişlik, ≤2 satır, 4-8 px aralık.
- Süre: başarı/bilgi **4 s**, hata **6 s**, aksiyonlu (Geri al) **kendiliğinden kapanmaz**.
  Hover/focus'ta sayaç durur. `×` + Esc kapatır.
- `role="status"` + `aria-live="polite"` (başarı/bilgi), `role="alert"` + `assertive` (hata).
  Otomatik kapanan toast'a **focus taşınmaz**; içindeki düğme Tab ile erişilebilir.
- `forced-colors` ve `prefers-reduced-motion` desteği. Z-index en üstte, flyout'ta da kullanılır.
- **Sessiz kalacaklar:** parlaklık kaydırıcı, tema seçimi, sekme geçişi, toggle'lar.
- **Toast üretecekler:** profil kaydet/uygula/çoğalt/sil(+Geri al), lisans etkinleştir/kaldır,
  uygulama bağla/kaldır, Windows açılışında başlat, kalibrasyon, log temizle(+Geri al),
  "otomatik"e alma, güncelleme kurulumu, monitör yazma hatası.
- **Inline kalacaklar:** lisans hatası (alan yanında), Pro kapısı (banner), kontrast denetimi
  sonucu (liste), okunaksız tema uyarısı (bant).

**E) Ölü kontrol düzeltmeleri (13 madde → bu turda kapanacak):**
`accent-picker` kalıcı (`setSetting`) · okuma profili kapanınca tema+animasyon geri ·
`sleep-cap` ipucu düzelt · `#break-text` güncelle · `pf-add` disabled nedeni + Pro uyarısı
erişilebilir · `break-switch` toast · profil kartı tıklaması ayrıştır (seç vs uygula) ·
`editorDirty` "Kaydedilmedi" göstergesi · Geçmiş insan dilinde · `log-clear` toast+Geri al
(confirm kaldır) · `pause`/`day-off` ayrı durumlar · `autoLock` iki yönlü ·
Film tohumunda `autoLock` kapalı.

**F) Renk sıcaklığı (yeni, Kelvin):**
2500-6500 K kaydırıcı, **sol sıcak**, 100 K adım, gradyan sürekli; büyük değer "4200 K" +
altında "Florasan" adı; hazır çipler (2500 Mum, 2700 Ampul, 3400 Halojen, 4200 Florasan,
5500 Gündüz); 150 ms debounce, `change`'te tek yazma; "6500 K'ye dön" + Esc geri alma.
Donanım destekliyorsa hiç rozet yok; desteklemiyorsa tek gri satır "Programla yapılıyor"
+ (i). HDR'de kontrol **soluk ama yerinde** + tek satır neden + "HDR ayarlarını aç".
Yüzde yalnız ipucu satırında (geriye uyum).

**G) CHANGELOG + sürüm notu:** `CHANGELOG.md` Keep a Changelog 1.1.0, `Unreleased` bölümü
elle; sürüm notu ayrı yazılır ("benim için ne değişti" dili, chore/refactor girmez).

**H) İmzalama (v2.2'de kod değişmez):** README + SECURITY'de gerekçe zaten var; v2.2'de
release notuna "neden imzasız" tek paragraf + `.sha256` doğrulama komutu eklenir.

### [K3] UYGULAMA — v2.2 (2026-10-25/26)
- **Tasarım sistemi (PASS):** `index.html` + `src/styles.css` sıfırdan — 146 id, 3 kademeli
  derinlik, cam YALNIZ ray, 3D YALNIZ hero (≤3°, metin transform'suz katmanda), motion 180 ms
  yalnız transform/opacity, tabular-nums, `forced-colors`/`prefers-contrast`/`reduced-motion`
  kapıları. Ray etiketleri artık **her genişlikte** görünür (şikâyetin kök nedeni).
- **Toast sistemi (PASS):** `src/toast.ts` + `toast.css` — `ok/info/err/action/busy`,
  role=status/alert, hover'da sayaç durur, ×/Esc, `prefers-reduced-motion` + `forced-colors`.
  **Ekranda en fazla 2** (800x600'de 3 toast içeriğin ~%30'unu kapatıyordu — şef düzeltti).
- **Dil geçişi (PASS):** ~50 görünür metin; sözlük uygulandı (Çalışma biçimi, Ekranı
  sarılaştırma, Sarılık düzeyi, Öğrenilen tercih, Ayar yapılmıyor, Ölçüm, Ulaşılmak istenen,
  Işık varsayımı, dahili panel/harici, çok iyi/iyi/sınır/okunaksız). Görünür metinde
  VCP/DDC/gamma/WMI/AAA/FAIL yok (yalnız kod karşılaştırmaları).
- **13 ölü kontrol kapandı:** accent kalıcı · okuma profili tema+animasyon geri alır ·
  sleep-cap ipucu · `#break-text` · `pf-add` neden + Pro ipucu · break-switch toast ·
  kart tıklaması yalnız seçer (ayrı "Uygula") · `#pf-dirty` "Kaydedilmedi" · Geçmiş insan
  dilinde (`source=/level=/tone=` yok) · log-clear toast+Geri al · pause/day-off ayrı durumlar ·
  autoLock iki yönlü · Film tohumunda autoLock kapalı.
- **Kelvin arayüzü (PASS):** 2500-6500 K, sol sıcak, 100 K adım, 150 ms debounce, ad tablosu
  (Mum/Ampul/Halojen/Florasan/Gündüz/Berrak), preset çipleri, "6500 K'ye dön", Esc geri alma,
  `#warm-tech-note` "Monitörün kendi ayarı" / "Programla yapılıyor", HDR'de soluk+neden+link.
  Destekliyorsa `monitor_set_color_temp`, değilse sessizce `setWarmPercent`.
- **CHANGELOG (PASS):** `CHANGELOG.md` (Keep a Changelog, 8 sürüm, Unreleased = v2.2),
  `tools/release-notes.mjs` (chore/docs/refactor atlar, `.sha256` bloğu ekler),
  `.github/release.yml` (kategoriler).
- **QA (PASS):** 21 senaryo (15 uyarlama + 6 yeni: toast, Kelvin, auto-seg, profil editörü,
  okuma geri dönüşü, geçmiş dili). Kare sayısı 36. Koşu: PASS ×2.
- **Şef düzeltmeleri (QA harness):** `openAdvanced` idempotent yapıldı (körlemesine tıklama
  zaten açıkken kapatıyordu → `#lic-key` görünmez kalıp 30 sn timeout) · yapışkan çubuk için
  `scrollIntoViewIfNeeded` · `fill()` change tetiklemediği için `dispatchEvent("change")` ·
  toast limiti 3→2 · marka adı 14→13px + letter-spacing (kırpılıyordu) · flyout sürümü
  `getVersion()`'a bağlandı (sabit "v2.1" kalıyordu).
- **Sürüm:** 2.2.0 (package.json, Cargo.toml, tauri.conf.json, Cargo.lock).


### [K1.0] şef gözlemi — ekran görüntülerinden (2026-10-25, salt-okuma)
`qa/shots/1-bugun.png`, `3-ritim.png`, `4-profiller.png` incelendi. Somut kusurlar:
1. **Sekme rayı 800x600'de yalnız ikon** — etiket yok → "hangi sekme ne işe yarıyor"
   şikâyetinin doğrudan sebebi. Etiket her genişlikte görünmeli.
2. **Hero'da çift etiket:** "HEDEF %30" satırı + hemen üstünde "hedef: %30"; ayrıca
   "SONRAKI DEĞİŞİM" başlığı + "sonraki değişim: 06:00" metni. Aynı bilgi iki kez.
3. **Metin taşması/kırpma:** ışık kartı "zaman + dim/neu…", tema kartı
   "catppuccin-macc…" — kullanıcı değeri göremiyor. `text-overflow` çözüm değil,
   kısaltma/en-boyutlandırma tasarlanmalı.
4. **Saf jargon rozetleri:** `wmı`, `ddc`, `donanımsal`, `yazılımsal` — kullanıcı için
   anlamsız; üstelik İngilizce/Türkçe karışık (`ddc` küçük, `Pro` büyük).
5. **Başlık `ORTAM IŞIĞI`** geniş harf aralıklı mono büyük harf → geliştirici aracı izlenimi.
6. **Form alanları boş ve geniş** (gece koruması "Bitiş saati"/"Gece tavanı" boş, hizasız) →
   "bozuk" görünüm. Boş durum + placeholder + birim (saat/% ) tasarlanmalı.
7. **Hiyerarşi ters:** "sonraki mola: kapalı" en büyük yazı; asıl değer (parlaklık) ile
   yarışıyor.
8. **Geri bildirim yok:** hiçbir ekran görüntüsünde onay/hata/toast izi yok.
9. Vurgu rengi (`#5b8def` benzeri mavi) tek başına taşınıyor; durum renkleri (uyarı/hata/
   başarı) sistematik değil; yüzey katmanları birbirine çok yakın → derinlik yok.


## V2.1 TURU (2026-10-24) — "hızlı erişim + güven"

**Hedef v2.1.0:** v2'nin üstüne üç şey: (1) tray'den tek tıkla **hızlı panel (flyout)**,
(2) **otomatik güncelleme** altyapısı, (3) **GPL uyumu** (Hakkında/yasal bildirim,
kurulumda lisans metni) + kullanıcının v2 testinden çıkan düzeltmeler.
KURAL: v2.1 de final değil; sürüm numarası artar, geliştirme sürer.

**Dalga haritası:**
- [K1] **araştırma (3 paralel, arka planda):** (a) Tauri updater + kod imzalama maliyeti/
  SmartScreen, (b) DDC/CI VCP 0x0C renk sıcaklığı + HDR davranışı, (c) tray flyout
  kalıpları + Tauri'de ikinci pencere tuzağı. Hepsi salt-okuma.
- [K1.5] **kullanıcı test triyajı:** kullanıcı v2'yi test ediyor; gelen bulgular
  dalgaları kesebilir ve önceliklidir. Bulgular HANDOFF'a `[v2-test]` etiketiyle yazılır.
- [K2] **tasarım (şef):** flyout yerleşimi (hangi 4 kontrol), updater UX (ne zaman sorar,
  nasıl ertelenir), Hakkında/lisans ekranı, güncelleme sonrası ilk açılış.
- [K3] **uygulama:** (a) backend: updater plugin + `latest.json` üretimi, DDC sıcaklık
  (varsa), monitör önbelleği ∥ (b) UI: flyout penceresi (`flyout.html` + TS/CSS,
  ayrı dosya sahipliği) → (c) kablolama + QA senaryoları (flyout + updater stub).
- [K4] **doğrulama + reviewer + release v2.1.0.**

**Dosya sahipliği (çakışma önleme):** backend yazarı yalnız `src-tauri/`; flyout yazarı
yalnız `flyout.html`, `src/flyout.ts`, `src/flyout.css`; ana UI/QA bağlaması sıralı ve
tek yazar (`src/main.ts`, `src/panels.ts`, `index.html`, `qa/run.mjs`).

**Açık kararlar (K1 sonuçlarıyla netleşecek):** imzalama şimdi mi (aylık ücret) yoksa
sonra mı; VCP 0x0C desteklemeyen monitörde sessiz yedek mi yoksa gizli mi; updater
`installMode` ve kanal (stable only).

### [K1a] updater + imzalama sonucu (2026-10-24, PASS)
- **Updater YAPILACAK (v2.1):** `tauri-plugin-updater` (+ `plugin-process` relaunch),
  `bundle.createUpdaterArtifacts: true`, `plugins.updater` = GitHub
  `releases/latest/download/latest.json`, `installMode: "passive"` (varsayılan/önerilen).
  `latest.json` şeması: `version`, `notes`, `pub_date` (RFC3339),
  `platforms."windows-x86_64".{signature,url}`; **signature = .sig dosyasının İÇERİĞİ**.
  `gh release` ile elle üretilebilir; `tauri-action` `uploadUpdaterJson` +
  `updaterJsonPreferNsis:true` ile otomatikleştirir (varsayılan MSI'yi tercih ediyor, biz
  setup.exe dağıtıyoruz → NSIS'e çevir).
- **Anahtar:** `tauri signer generate`; private key ASLA repoya girmez (`*.key` ignore),
  GitHub Actions secret + offline yedek. **Kaybedilirse mevcut kullanıcılara güncelleme
  yayınlanamaz** — iki kopya yedek zorunlu. Public key repoda güvenli.
- **Kod imzalama ERTELENDİ (coğrafi engel):** Azure Artifact Signing public trust
  sertifikaları bireysel geliştiriciler için yalnız ABD/Kanada; **Türkiye listede yok** →
  kullanılamıyor. OV ~$129–530/yıl, EV ~$349–669/yıl + HSM zorunlu. 2024'ten beri EV
  itibar avantajı YOK; SmartScreen itibarı zaman+hacimle geliyor. Alternatif: release'e
  `.sha256` + README "bilinmeyen yayıncı normaldir" notu; ileride Certum €69 OSS
  sertifikası değerlendirilebilir.
- **Rollback:** düşük sürüm yayınlamak yerine derhal patch (v2.1.1); `latest.json`
  geri çevrilebilir ama downgrade koruması sunucu lehine override edilir → meşru yol.
- **Risk:** `latest.json` ele geçirilse bile saldırgan ancak **private key ile imzalanmış**
  yük yükletebilir — asıl kapı imza, TLS değil.

### [K1b] DDC sıcaklık + HDR sonucu (2026-10-24, PASS)
- **VCP 0x0C mutlak Kelvin DEĞİL:** `K = 3000 + değer × VCP 0x0B (increment)`;
  increment yok/0 ise yorum geçersiz. Etkin olması için VCP 0x14 "User 1/2/3" olmalı;
  bazı monitörler 0x0C'yi yok sayar. `SaveCurrentSettings` çoğu monitörde desteklenmez
  → güç kesintisi sonrası kalıcılık garanti değil. Maliyet: set ~50 ms, get ~40 ms.
- **Çakışma:** 0x0C panel white point'ini, gamma rampası da white point'i çarpar →
  ikisi birlikte kullanılırsa sıcaklık iki kez uygulanır. Kural: **monitör başına tek yol**.
- **HDR:** `SetDeviceGammaRamp` HDR modunda "tanımsız davranış" (MS resmî); pratikte
  Windows rampaları yok sayıyor. **HDR açıkken sıcak ton uygulanmayacak** (mevcut rampa
  identity'ye döner). Tespit: `DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO`
  (`DisplayConfigGetDeviceInfo`); **projede HDR tespiti yok — v2.1 ön koşulu**.
- **Öneri sırası:** (1) HDR tespiti + kapı, (2) monitör başına bir kez capability probe
  (`0x0C`/`0x14`/`0x0B`) + önbellek, (3) varsa 0x0C yazımı (yalnız >250 K değişimde,
  monitör başına en fazla 10 dk'da bir, `SaveCurrentSettings` YOK), yoksa kalıcı gamma
  yedeği + UI rozeti "yazılımsal", (4) 3 üst üste hatada o monitörde yolu kapat,
  (5) log'a tanılama satırı.
- **Gece ışığı registry API'si KULLANILMAYACAK:** belgesiz, global (monitör-başına değil),
  HDR'da belirsiz, CloudStore senkronizasyonuyla dövüşür.
- **Doğrulanamadı:** 0x0C destek oranı ve HDR açıkken DDC parlaklık davranışı — harici
  monitörde ampirik test gerekir.

### [K1c] tray flyout sonucu (2026-10-24, PASS)
- **Mevcut kod düzeltmesi:** `lib.rs:308` `show_menu_on_left_click(true)` + tray olay
  dinleyicisi yok → **sol tık bugün menüyü açıyor**, pencere değil. Flyout için sol tık
  olayı, sağ tık menüsü.
- **Deadlock tuzağı:** `WebviewWindowBuilder` Windows'ta **senkron komut ve olay
  işleyicilerinde kilitleniyor** (Tauri docs). Pencere `setup`'ta yaratılacak, gösterme
  async komutla.
- **Kapanma tuzağı:** `lib.rs:322` her pencerede `CloseRequested`'ı yutup `hide()` ediyor →
  label filtresi şart. `window-state` plugin'i flyout geometrisini kaydedebilir → filtre.
- **Pencere:** 340×420 logical, `decorations:false`, `alwaysOnTop`, `skipTaskbar`,
  `resizable:false`, `transparent:false` (bilinen hayalet kenar hataları), `shadow:true`.
  Konum: tray `rect` merkezi + `Monitor::work_area()` alt kenarı - 8, doğru monitör
  `monitor_from_point`, `scale_factor` ile physical hesap.
- **Kapanma davranışı:** dışına tık → `Focused(false)` → `hide()`; ESC → gizle; tray'e
  tekrar tık → toggle. Sağ tık menüsü sırası: **Ayarlar** (kalın) → "1 saat duraklat"
  (check) → "Bugün kapat" → ayırıcı → **Çıkış**. MS UX kılavuzu: flyout'ta yalnız en sık
  ayarlar, hepsi anında etkili.
- **Maliyet:** ikinci webview ≈ +95 MB renderer (bu makinede ölçüldü), gizli webview ~5 dk
  sonra throttle. Flyout hafif tutulacak (grafik/kamera yok).
- **Erişilebilirlik:** ESC ile kapanma (WCAG 2.1.2), `forced-colors` desteği.

### [K2] TASARIM KARARLARI (2026-10-24)

**Flyout içeriği (340×420):** (1) üst şerit: aktif tema adı + parlaklık yüzdesi + kip
rozeti; (2) parlaklık kaydırıcısı + ±10 düğmeleri (anında yazar); (3) hızlı eylemler:
**Şimdi ölç / 1 saat duraklat / Bugün kapat / Kilitle**; (4) alt bağlantı: **Ayarlar**
(ana pencereyi açar). Sıcak ton flyout'a GİRMEZ (canlı önizleme ana pencerede; flyout
hafif kalacak).

**Pencere-arası sözleşme (tek doğru kaynak):**
- Flyout → ana pencere: `emit("ss:action", { action })`; `action ∈ {"measure","pause-1h",
  "day-off","lock","open-main"}`.
- Ana pencere → flyout: `emit("ss:state", { brightness, theme, mode, pausedUntil, licensed })`
  her render sonrası (throttle 1 sn).
- Flyout komutları: `brightness_get`, `brightness_set`, `flyout_hide` (backend).
- Görünürlük: backend `flyout_show` / `flyout_hide`; tray sol tık toggle; ESC → hide.

**Updater UX:** açılışta 10 sn sonra + 24 saatte bir kontrol; sessiz başarısızlık yok ama
spam de yok (tek satır log). Güncelleme varsa Bugün sekmesinde **tek satır band**:
"v2.1.1 hazır — İndir ve yeniden başlat / Ertele". Onaysız yeniden başlatma YOK.
`installMode: "passive"`. `latest.json` + `.sha256` release'e eklenecek
(`tools/release-manifest.mjs` üretir).

**GPL/Hakkında:** Gelişmiş kartının en altında: sürüm · "GPL-3.0-or-later" · kaynak
bağlantısı · "garanti yok" satırı. Kurulumda lisans metni: Tauri'nin NSIS lisans sayfası
desteği doğrulanacak (desteklenmiyorsa README + Hakkında yeterli, abartma).

**DDC sıcaklık:** capability probe monitör başına bir kez önbelleklenir; destekleyende
"donanımsal", desteklemeyende "yazılımsal" rozeti; HDR açıkken sıcak ton kapalı ve
"neden" satırında görünür.

### [K3] UYGULAMA (2026-10-24/25)
- **Backend (PASS, şef doğruladı):** `tauri-plugin-updater` + `process`; `createUpdaterArtifacts`,
  `plugins.updater` (pubkey = `~/.tauri/smart-screen-updater.key.pub` ile birebir doğrulandı,
  GitHub endpoint, `installMode: passive`). `hdr.rs`: `GET_ADVANCED_COLOR_INFO` bit-1 +
  `warm_allowed` kapısı + `unwarm_device` (orijinal rampaya döner, identity yazıp kalibrasyonu
  EZMEZ). `colortemp.rs`: MCCS caps parser (0x0C/0x0B/0x14-User), `K = 3000 + değer×artış`,
  2500–6500 kelepçe, >250 K eşik, 10 dk hız sınırı, 3 hatada kapat, HDR'de `Err`,
  `SaveCurrentSettings` YOK, `Caps::Unknown` + 3 tur yeniden deneme, max VCP'den okunur.
  Tray: sol tık toggle (`should_toggle_open` + 300 ms autohide damgası), sağ tık menü
  (Ayarlar/pause✓/dayoff✓/Çıkış), `CloseRequested` + `Focused(false)` label filtreli,
  window-state denylist. `tools/release-manifest.mjs` (latest.json + .sha256).
- **Flyout UI (PASS):** `flyout.html` + `src/flyout.ts` + `src/flyout.css`, 340×420, 16 `fx-*` id,
  `vite.config.ts` ikinci giriş (`dist/flyout.html`).
- **Bağlama + QA (PASS):** `ss:action` (measure/pause-1h/day-off/lock/open-main/brightness-set)
  ↔ `ss:state` (1 sn throttle). Updater: 10 sn sonra + günde bir, `update-band` + "Ertele" 24 saat
  (yalnız bandı bastırır, kontrol devam eder), onaysız restart yok. HDR rozeti + `warm-hdr-note`.
  GPL Hakkında bloğu. QA 11 → **15 senaryo** (flyout, güncelleme, HDR, Hakkında); stub
  bilinmeyen komutta throw.
- **K4 reviewer (REVISE → 12/12 düzeltildi):** MAJOR: (1) flyout "Ayarlar" için
  `core:window:allow-show/allow-set-focus` eksikti; (2) opener scope yalnız ms-settings'ti,
  GPL kaynak bağlantısı ölüydü → `https://github.com/TitanLion72/*`; (3) tray toggle yarışı
  (açık flyout kapanmıyordu) → 300 ms autohide damgası + saf fonksiyon + 3 test.
  MINOR: güncelleme ertelemesi bandı 48 saat sonra döndürüyordu; `gamma.rs` hata kıyası HDR'de
  elenen cihazları saymıyordu; HDR sonradan açılınca sıcak ton takılı kalıyordu; `kelvin_to_value`
  sabit üst sınır + yanlış `last_write`; geçici DDC hatası kalıcı "desteklenmiyor" oluyordu;
  flyout parlaklık yazımı ana state'i güncellemiyordu; QA'da flyout taşma kontrolü yoktu ve
  kurulum yolu test edilmiyordu. NIT: ölü `flyout_show` komutu kaldırıldı, `ColorTempInfo.kelvin`.
- **K4 şef doğrulaması (kendi eliyle):** `cargo test` **171 + 2** yeşil (7 ignored) ·
  `clippy --all-targets -D warnings` **0** · `fmt --check` temiz · `npm.cmd run build` temiz
  (index + flyout) · `node qa/run.mjs` **PASS ×2** · 30 ekran görüntüsü.
- **Açık kaynak hazırlığı:** `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
  issue/PR şablonları, GitHub topics, README'de GPLv3 §6(d) Corresponding Source açıklaması.
  **SPDX** başlıkları 32 kaynak dosyaya eklendi (`tools/add-spdx.mjs`, `--check` CI'ya uygun).
  Bağımlılık lisans taraması: tümü izin verici (MIT/Apache/BSD/ISC/Zlib/MPL-2.0) → GPL uyumlu.
  Git geçmişinde `.pem`/`.key`/`.env` sızıntısı YOK (tam tarama).
- **Bilinçli ertelenen (v2.2+):** Authenticode kod imzalama (Azure Trusted Signing bireysel
  geliştirici için ABD/Kanada ile sınırlı → TR kapsam dışı; OV ~$129+/yıl + HSM), DDC 0x0C
  için UI'da yazma kontrolü (altyapı hazır, arayüz yok), gece ışığı entegrasyonu (belgesiz,
  global), CHANGELOG dosyası.

### [K4 RELEASE] v2.1.0 (2026-10-25)
- Commit `8598641`, tag `v2.1.0`.
- **Release:** https://github.com/TitanLion72/smart-screen/releases/tag/v2.1.0
- Paketler: `setup.exe` 2.52 MiB · `msi` 3.54 MiB · her ikisinin `.sig` + `.sha256`'si ·
  `latest.json`. Release `--latest` işaretli.
- **Canlı zincir doğrulandı (şef):** `releases/latest/download/latest.json` HTTP 200,
  içerik yerel dosyayla **birebir**, `signature` = `.sig` içeriğiyle **birebir** (444 kr),
  setup.exe URL 200, `.sha256` hesaplanan hash ile eşleşti
  (`ba8660533dd4…b6f7be0a`).
- **İmza anahtarı:** `~/.tauri/smart-screen-updater.key` (+ şifre
  `~/.config/opencode/smart-screen-updater-password.txt`). Pubkey `tauri.conf.json` ile
  birebir eşleştiği doğrulandı. **İki kopya yedeklenmeli; kayıp = güncelleme yayını biter.**
- Not: `tauri build` çıktısı PowerShell hattında `ExitCode 1` döndürüyor (npm kabuğu
  artefaktı) ama Tauri "Finished 2 bundles + 2 updater signatures" diyor ve dosyalar
  diskte/release'te doğrulandı — gerçek hata yok.
- `latest.json` repoya **commit edilmez** (üretilen yayın varlığı; `.gitignore`'a eklenebilir).




## V2.0 TURU (2026-10-23) — repo PUBLIC: UI/UX sıfırdan + stabilite

Kullanıcı talimatı: arayüz hiç anlaşılır değil → **yepyeni, yaratıcı UI/UX (sıfırdan)**;
sistem stabil değil → **sağlamlaştır, kapsamlı yap**; bol araştırma.
KURAL: yalnız smart-screen reposuna dokunulur.

Dalga haritası:
- [K1] paralel keşif (3 ajan): (a) kod/stabilite denetimi, (b) rakip UX araştırması
  (f.lux/Twinkle Tray/Monitorian/Lunar/LightBulb vb.), (c) Tauri v2 güvenlik — repo public
  (CSP şu an null!, withGlobalTauri, secrets taraması, code signing/SmartScreen).
- [K2] şef tasarımı: yeni bilgi mimarisi (ekran akışı, kartlar, kopya) + tasarım dili.
- [K3] uygulama: (a) backend stabilite src-tauri ∥ (b) UI kabuk index.html+styles.css →
  (c) main.ts bağlama + QA senaryoları yeniden. UI zinciri sıralı (DOM sözleşmesi).
- [K4] şef doğrulama + reviewer + release v2.0.0.

Kayıtlar: (aşağıya)

### [K1] keşif sonuçları (2026-10-23)
- **UX araştırması (PASS):** altın kalıplar — (1) "şu an" kartı: mod + hedef/gerçek % + sonraki geçiş saati (Monitorian/Lunar); (2) "neden" satırı (f.lux/ön plan uygulaması); (3) geçici duraklat "1 saat kapat" (f.lux); (4) sağlık ayrı sekme (CareUEyes); (5) monitör-başına satır/slider (Twinkle Tray, linked-slider kafa karışıklığından kaçın); (6) ileri ayarlar ikincil (NN/g progressive disclosure: "Initially, show users only a few of the most important options"); (7) tray sol tık = flyout, en sık ayar (MS UX guide); (8) f.lux ihlalleri: ilk ekranda konum+saat+ışık+renk boğması — biz yapmayacağız.
- **Tauri güvenlik (FAIL — kamu için hazır değil):** (1) `csp: null` → Tauri önerisi: `default-src 'self' customprotocol: asset:`, `connect-src ipc: http://ipc.localhost`, img-src 'self' asset: blob: data:; (2) `withGlobalTauri: true` gereksiz (main.ts npm import kullanıyor, `window.__TAURI__` yok) → kapat; (3) capabilities fazla geniş: `core:default` (9 modül) + `opener:default` → daralt (yalnız gerekli `core:window:allow-*`, `opener:allow-open-url` + URL allowlist); (4) imzasız installer = SmartScreen uyarısı; EV bile SmartScreen'i bypass etmiyor artık; Azure Artifact Signing $9.99/ay — kararı kullanıcıya bırak (bütçe); (5) updater minisign pubkey public repoda GÜVENLİ, private env'de; (6) CI: `rustsec/audit-check@v2.0.0` + cargo test/build — ekleyeceğiz; (7) webview2 `downloadBootstrapper` varsayılan kalabilir.
- **Kod/stabilite denetimi (REVISE, 15 bulgu):** CRITICAL: (1) tick yeniden giriş koruması yok (main.ts:526; 9 çağrı noktası, çift yazma/pendingCount bozulması); (2) TÜM komutlar senkron → ana thread'de 5 PowerShell süreci/tur (lib.rs:37-238; pencere donması). MAJOR: ps.rs timeout yok; DDC+lisans her yazışta yeniden enumerasyon/imza; prefs/logger/theme kilitsiz RMW + sabit .tmp; sessiz hata yutma (autoWarmth→0, kamera, lib.rs setup `let _`); tema tıklaması kalibrasyonu kirletiyor (main.ts:286); erken dönüşte pendingCount sıfırlanmıyor; gamma kilit bırak-al yarışı; QA stub'ı backend'i taklit ediyor (gerçek regresyon yeşil geçebilir); main.ts 1777 satır monolit (kesim noktaları belli); monitor.rs tanıtıcı sızıntısı; crash log üzerine yazma; pil hatası sessiz [100,true]. Gizli anahtar repoda YOK.
- **Lisans:** kullanıcı MIT onayladı → `LICENSE` eklendi, README güncellendi.


### [K3] UYGULAMA (2026-10-23/24)
- **K3a backend (PASS, şef doğruladı):** 36 `async fn` komut (imzalar aynı), uzun işler `spawn_blocking`; `ps.rs` 15 sn timeout (spawn+try_wait+kill, pipe'lar ayrı thread); `monitor.rs` `snapshot()` tek tarama + `set_brightness_checked` (3-4 tarama → 1) + tanıtıcı sızıntısı kapandı; `license.rs` bellek önbelleği; prefs/logger/theme `Mutex` + `.tmp-<pid>`; `gamma.rs` `OPS` kilidi; `main.rs` crash log append + 64 KB rollover; `tauri.conf.json` CSP dolu + `withGlobalTauri:false` + `resizable:true` (min 720x560); capabilities daraltıldı (`opener:allow-open-url` + ms-settings scope).
- **K3b UI kabuğu (PASS):** `index.html` + `styles.css` sıfırdan — sol dikey ray, 4 bölüm, **119 id** (eski 101 aynı isimle + 18 yeni), başında `<!-- SÖZLEŞME -->` bloğu (tür+amaç+etkileşim). 720x560/800x600/1200x800'de taşma yok.
- **K3c bağlama + QA (PASS):** `main.ts` 123 satır (boot), `orchestr.ts` 1512 (durum+tick, DOM'suz), `panels.ts` 797 (render); bağımlılık tek yönlü `panels → orchestr ← main`. Stabilite (a-g) `"stabilite:"` yorumlu: tick re-entry, `resetPending`, pickTheme kalibrasyonu kirletmez, autoWarmth hatada son şiddet, tek kamera uyarısı, pil bilinmiyor + muhafazakar, `pauseUntil` zamana bağlı duraklatma. `qa/run.mjs` 11 senaryo baştan; bilinmeyen invoke → **throw** (sessiz null yok), taşma assert'i yatay kırpma + `scrollWidth` ölçer.
- **K4 reviewer turu (REVISE → düzeltildi):** (1) MAJOR: `#risk-band`/`#risk-text` hiç render edilmiyordu → `renderRisk()` eklendi (FAIL temada bant + "Güvenli temaya dön" erişilebilir); (2) taşma assert'i etkisizdi → gerçek ölçüm; (3) dondurulan tur sayacı şişiyordu (bağlı profil notu `uygulama` önekliydi) → `bağlı profil`; (4) `#warm-range` max 100 ama durum 60'a kelepçeli → max 60; (5) `#day-off-btn` active durumu `pausedNow()` ile; (6) ölü `if (!S.editorDirty)` koşulu; (7) QA gece koruması assert'i `localStorage ss:sleepStart` ile kalıcılık; (8) `pushUndo` soğuk açılışta anlamsız kayıt yazmıyor; (9) etiket sil düğmesine `aria-label`; (10) `renderAudit` imza ile gereksiz yeniden kurulum yok; (11) sözleşmede ±10 adım; (12) CSP `connect-src`'e dev HMR (`localhost:1420`, `ws://localhost:1420`).
- **K4 doğrulama (şef eliyle):** `npm.cmd run build` temiz · `node qa/run.mjs` **PASS ×2** · `cargo test` **137 + 2** yeşil (6 ignored) · `clippy --all-targets -D warnings` **0** · `fmt --check` temiz.
- **CI:** `.github/workflows/ci.yml` — rust (fmt/clippy/test), audit (cargo-audit), frontend (npm build).
- **Lisans:** MIT (`LICENSE`), README "freemium + Pro destekçi" çerçevesi.
- **Sürüm:** **2.0.0** — bu bir dönüm noktası, *final değil*; geliştirme sürüyor.
- **Release (2026-10-24):** https://github.com/TitanLion72/smart-screen/releases/tag/v2.0.0 · commit `e5724a0` · paketler: `smart-screen_2.0.0_x64-setup.exe` (1.72 MiB), `smart-screen_2.0.0_x64_en-US.msi` (2.52 MiB). `gh release create` ile yayınlandı, imzasız (SmartScreen uyarısı beklenir).
- **Bilinçli ertelenen (v2.1+):** code signing (Azure Artifact Signing $9.99/ay kararı kullanıcıda), auto-updater, tray flyout hızlı panel, monitör-başına DDC sıcaklık (VCP 0x0C), "bütün uygulamaların teması" adaptör işi.



**Tasarım ilkeleri:** (1) ilk ekranda üç şey: durum, monitörler, hızlı eylem; (2) her
otomatik kararın görünür "neden"i; (3) canlı önizleme (sıcak ton kaydırıcısı ekranı
anında değiştirir); (4) jargon temizliği: "mod/kaynak/ton" yerine insan dili; (5) pencere
serbest boyutlandırılır (min 720x560) + konum hatırlanır (window-state zaten var;
`resizable: false` kalkacak); (6) CSS değişken sözleşmesi (`--accent` vb.) KORUNUR —
accent seçici sistemi buna bağlı.

**Bilgi mimarisi (4 sekme):**
1. **Bugün** — hero durum kartı: büyük yüzde (gerçek + hedef), mod rozeti, "sonraki
   değişim: 21:00", "neden" satırı (kilit/ön plan uygulama/pil); altında monitör
   satırları (satır başına ad+rozet+slider+%, Pro kilidi); hızlı eylem çubuğu:
   [Şimdi ölç] [1 saat duraklat] [Bugün kapat]; son 5 olay akışı.
2. **Ritim** — otomasyon: kip seçici (Oto/Işığa göre/Saate göre/Sabit) büyük
   segmented; sıcak ton: gün çizgisi önizlemesi (gradient, 24s) + şiddet kaydırıcısı
   (canlı); gece koruması (saat aralığı + taban); 20-20-20 mola; okuma profili.
   Altta "Gelişmiş" detay kartı (eski Ayarlar'ın kalanı: otostart, kontrast kapısı,
   tema seçici önizlemeli çipler, lisans kartı).
3. **Profiller** — kart listesi (önek rozetleri, aktif vurgusu), uygulama bağlama
   (Pro), yeni/çiftle/sil; profil başına özet satırı.
4. **Geçmiş** — özet kartları (bugün: değişim/ortalama/dondurulan tur), 12 saatlik
   grafik, kayıt listesi, lisans durumu altta.
- Tray sol tık = pencere (flyout benzeri hızlı panel ileride; v2 kapsamı değil).
- `el()` id sözleşmesi yeniden kurulacak; QA senaryoları yeni id'lerle baştan yazılacak.



## ORKESTRASYON GÜNÜĞÜ — v1.0 satışa yönelik "Ekran Katmanı" turu (2026-10-18)

**Plan (onaylı):** Windows derin → freemium+Pro → önce ekran katmanı.
Faz 1 hedefi: monitör enumerasyonu + monitör-başına DDC/CI/WMI parlaklık yolu.

**Faz 1 dosya sahipliği haritası:**
- `src-tauri/src/monitor.rs` (YENİ) + `lib.rs` + `brightness.rs` → backend sahibi (1 ajan, tek zincir)
- `src/main.ts` + `index.html` + `styles.css` → frontend sahibi (backend sözleşmesi bitince)
- review: `reviewer` (yalnız metin, png yok) → sonra şef doğrulama (cargo test + build + QA)

**Aşamalar:**
1. [A] paralel keşif: web-API araştırması + mevcut kod temassızlık denetimi  ← ŞİMDİ
2. [B] backend: monitor.rs sözleşmesi (enumerasyon JSON + per-monitor get/set)
3. [C] frontend: monitör seçici UI
4. [D] review + shef doğrulama + release v0.9.0

**Kısıt:** bu laptopta harici monitör yok — DDC/CI canlı doğrulama kullanıcı
harici monitör bağlayana kadar test+statik incelemeye tabi; enumerasyon ve WMI
yolu bu makinede birebir doğrulanır. `evren/glm-5.3` yazıcı, `deepseek-v4.1-flash`
araştırma/inceleyici; opencode provider modelleri kullanılmaz (kota).

**DALGA 2 haritası (2026-10-19):**
- [A] backend `gamma.rs` + `lib.rs` (+monitor.rs'e küçük `device_ids()` helper): monitör-başına ramp capture/apply/restore, `HashMap<device, Ramp>`, dosya adı `smart-screen-gamma-<DISPLAYn>.bin`, eski tek dosya migrasyonu. Komut imzaları DEĞİŞMEZ (`gamma_set_warmth(percent)`, `gamma_restore`).
- [B] frontend `main.ts` + `qa/run.mjs`: karar uygulanınca harici monitörlere de yaz (aynı target, deadband 3), tick içi; hotplug: odak + dakikalık turda liste değişimi varsa yeniden render (seçim korunur); QA stub DISPLAY2 başarılı, DISPLAY3 hatalı olacak şekilde güncellenir + otomatik yazma assert'i.
- A ve B aynı dosyaya dokunmaz. Ortak nokta: komut imzaları sabit kalır.

- [B] frontend TAMAM: `applyAutoMonitors` (main.ts:1335) karar anında harici monitörlere aynı hedefi yazar (deadband 3, `monWriteChain` ile sıralı, monitör başına tek hata logu); `refreshMonitorList` (main.ts:1190) odak + dakikalık turda id kümesi değiştiyse yeniden çizer; QA senaryo 10 (otomatik DISPLAY2 yazımı, DISPLAY3 DDC hatası, karar değişmezken tekrar yok, elle yazma hâlâ çalışıyor).
- ŞEF DOĞRULAMASI (Dalga 2): 119 test + 5 ignored, clippy 0, fmt temiz, `lib.rs` değişmedi (komut imzaları sabit), build temiz, QA 10 senaryo PASS, **canlı `live_apply_and_restore` GEÇTİ** (CreateDCW + SetDeviceGammaRamp gerçek sürücüde kabul edildi ve geri alındı) — "gamma fiziksel doğrulanmadı" borcu kapandı (gözle teyit kullanıcıda).

**DALGA 3 haritası (2026-10-20 — kullanıcı PC başında değil, şef tam yetki):**
- Anahtar: Ed25519. Açık anahtar (hex) `c2b3483b3f4e1e71af18dffeedb491c6b28530e2e3880c79050a1632f52c5033` license.rs'e gömülü. Özel anahtar `~/.config/opencode/smart-screen-license-private.pem` — REPOYA ASLA.
- Anahtar formatı: `SS-` öneki + Crockford Base32(u16 payload_len BE + payload + 64B imza), 5'li gruplar `-` ile. payload = `v1|<email>|<YYYY-MM-DD>`.
- Komutlar: `license_status`, `license_activate(key)`, `license_deactivate()`. Depo: `~/.config/opencode/smart-screen-license.json` (yalnız key; yüklerken yeniden doğrulanır).
- Rust kapısı: `brightness_set_monitor` harici monitörde + lisans yok → Err("Pro gerekli"). monitor_list/okuma serbest (teaser). Profil limiti (3) ve uygulama bağlama frontend'de.
- Dosya sahipliği: backend ajanı = `license.rs`, `lib.rs`, `Cargo.toml`, `tools/license-gen.mjs`. Frontend ajanı (sonra) = `index.html`, `src/main.ts`, `qa/run.mjs`. `.gitignore` şefte.

**DALGA 3 kayıtları (2026-10-20):**
- Backend TAMAM: `license.rs` (Ed25519, Crockford Base32, u16 BE + payload `v1|email|tarih` + 64B imza; status/activate/deactivate; atomik depo `smart-screen-license.json`), `lib.rs` 3 komut + `brightness_set_monitor` kapısı, `monitor.rs` `is_internal`/`classification_failed`, `Cargo.toml` ed25519-dalek 2.2, `tools/license-gen.mjs`.
- Frontend TAMAM: Ayarlar'da Lisans kartı (`lic-*`), `applyProGates` (ücretsiz: 3 profil `FREE_MAX_PROFILES`, uygulama bağlama kapalı; mevcut kayıtlara dokunulmaz), `applyAutoMonitors` ücretsizde harici yazma denemez, QA senaryo 11 (kilitli/etkin/kaldırılmış + otomatik yol kilidi).
- İnceleme PASS + 4 MINOR/3 NIT düzeltildi (şef): "sınırsız profil" metni gerçeğe çekildi (6), sınıflandırma kaybında kapı fail-open (dahili panel yanlış engellenmesin), silmede `applyProGates`, deactivate sonrası otomatik yol kilidi QA assert'i, `lic-key` temizleme, ilk tur lisans sonrası koşar, get_monitor bilinçli-serbest yorumu.
- E2E kanıt: gerçek özel anahtarla `license-gen.mjs` ürettiği 199 karakterlik anahtar, gömülü Pro açık anahtarıyla Rust'ta doğrulandı (`live_generated_key_verifies_with_prod_key`, ignored, env `SMART_SCREEN_TEST_LICENSE`).
- Şef doğrulaması: 134 test + 6 ignored, clippy 0, fmt temiz, build temiz, QA 11 senaryo PASS. Özel anahtar repoda değil (`.gitignore: *.pem`).
- v1.0.0 damgası bu turda basıldı.

**Faz 1 kayıtları:**- [A] keşif TAMAM (2026-10-18): DDC feature=`Win32_Devices_Display`; enumerasyon=EnumDisplayMonitors→GetPhysicalMonitorsFromHMONITOR; dahili/harici=QueryDisplayConfig OUTPUT_TECHNOLOGY_INTERNAL; hata 31=dahili panel/OSD kapalı; HDR resmi kaynak yok→ertelendi. Kod haritası: brightness.rs First-1 WMI varsayımı, gamma.rs tek ORIGINAL (monitör-başına gamma ERTELENDİ), activity.rs hmon zaten var, prefs version=1 hazır.
- [B] backend TAMAM: `src-tauri/src/monitor.rs` (yeni, 379 satır) + `lib.rs` (3 komut: monitor_list/brightness_get_monitor/brightness_set_monitor) + `Cargo.toml` (Win32_Devices_Display). Eski brightness_get/set/gamma komutları DEĞİŞMEDİ. Şef doğrulaması: 111 test + 5 ignored, clippy 0, fmt temiz. Canlı: `\\.\DISPLAY1 | Generic PnP Monitor | internal=true api=wmi`.
- [C] frontend TAMAM: Panel'e "Monitörler" kutusu (`index.html:65-76`), `src/main.ts:1122-1278` (initMonitors, seçim, okuma/yazma, satır içi DDC hatası), slider `change` + −/+ anında, yazmalar tek zincirde serileştirildi; `styles.css:1071-1180`; `qa/run.mjs` senaryo 9 (DDC hata yolu + yazma argümanı). Eski otomatik tick DEĞİŞMEDİ.
- [D] inceleme REVISE→düzeltildi: eDP/LVDS/UDI_EMBEDDED panelleri dahili say (satılabilirlik için kritik), QueryDisplayConfig kaybında tek ekran→WMI son şans, tek monitör adı okunamazsa listeyi düşürme, seçimde slider disable (yanlış monitöre yazma yarışı), yazma serileştirme, dahili elle yazımda `lastAppliedBright` tabanı, aria-live, QA `.at(-1)`.
- Şef doğrulaması: 111 test + 5 ignored, clippy 0, fmt temiz, canlı `\\.\DISPLAY1 | Generic PnP Monitor | internal=true api=wmi`, `npm run build` temiz, QA senaryo 1-9 `PASS`.
- ERTELENEN (dokümante): monitör-başına gamma rampası, HDR-DDC davranışı, otomatik tick'in harici monitöre uygulanması (şimdilik dahili WMI yolu korunur, regression yok), monitör tak/çıkar hotplug yenilemesi.

> "Kusursuz/profesyonel" turu. Kapsamlı araştırma (Rust audit + frontend audit +
> Tauri v2 tray/WebView2/Windows brightness/gamma/gece ışığı/autostart/OpenCode
> V2 tema formatı web araştırması) + uygulama. Detaylar aşağıda.

## Bu turda yapılanlar (0.7.0 → 0.8.0)

**Bloklayıcılar (düzeltildi):**
- `gamma.rs`: `set_warmth(0)`/`restore_original` kimlik rampa fallback'i kalibrasyonu siliyordu → saklı orijinal yoksa ekrana DOKUNMUYOR; orijinal rampa identity±32768 monotonluk doğrulamasından muaf (gerçek kalibrasyon rampaları monoton değil).
- `contrast.rs`: WCAG luminance sabiti `12.4` → `12.92` (düşük kanal dalı). Test eklendi.
- `theme.rs`: `cli.json` kök obje değilse `expect` panik → graceful error; atomic temp+rename yazma.
- `prefs.rs`: `prefs`/`bright`/`version` alanları `#[serde(default)]`; `version` alanı + migration hook; atomic yazma; `save` kök obje değilse hata.
- `stats.rs`: "bugün" UTC yerine yerel gün (TR'de gün sınırı 03:00'tü); `is_frozen` not eşleşmesi genişletildi (kilitli/uygulama/reddedildi).
- `activity.rs`: tek monitör varsayımı kaldırıldı — `MonitorFromWindow` + `GetMonitorInfoW` ile pencerenin bulunduğu monitörün tamamını kaplıyorsa tam ekran sayılır.
- `battery.rs`: şarj durumu kodları (2/6/7/9) anlamlı yorum.
- `ps.rs`/`autostart.rs`: PowerShell quoting (tek tırnak + iç tek tırnak escape) — injection/bozulma riski kapatıldı.
- `logger.rs`: USERPROFILE yoksa CWD'ye sessiz yazma yerine hata; atomic yazma.

**Mimari/profesyonel dokunuşlar:**
- `tauri-plugin-single-instance`: ikinci kopya açılırsa ilk pencere öne getirilir, ikinci çıkar (iki tray ikonu sorunu).
- `tauri-plugin-window-state`: pencere konumu/boyutu yeniden başlatmada geri yüklenir; `resizable: false` + `center: true` (800×600 tasarım sabit).
- `main.rs` (binary): panic hook → `smart-screen-crash.log` (abort öncesi sebep yazılır).
- `cargo clippy` temiz (2 uyarı temizlendi: `is_blocked` → `.contains`, `then(|| exe)` → `then_some`).
- `cargo fmt --check` temiz.

**Frontend hijyeni (audit bulguları):**
- `applyProfile`/`saveDraft`/silme sonrası global state senkronizasyonu (state tutarsızlığı giderildi).
- `log()` defensive (DOM yoksa console'a düşer; orijinal hata kaybolmaz).
- `.catch` eksik invokes (theme_set, diskLog, autostart_set, sendNotification) tamamlandı.
- `visibilitychange` listener eklendi (tray'de gizli pencere throttle telafisi).
- `breakEnabled` kapalı/açık döngüsünde `breakDueAt` sıfırlanıyor.
- A11Y: `role="tab"`/`aria-selected`/`aria-controls` + `role="tabpanel"` + `aria-pressed` seg + renk seçici `aria-label`.
- Panel log boş başlangıçta yönlendirme (`.log-empty` artık üretiliyor).
- Ölü CSS temizlendi (`#off-val` → `#pf-off-val`, `.preferred::after`).
- `store.ts` profil şema doğrulaması (geçersiz alanlar onarılır, atılır).
- `loadNumber` helper: 0 değeri artık sessizce fallback'e ezilmiyor (warmPercent/sleepStart/sleepEnd/sleepCap).
- `README.md` gerçek içeriğe kavuşturuldu.

**Doğrulama (gerçekten koşuldu):**
- `cargo test` → 99 geçti, 4 ignored.
- `cargo clippy` → 0 uyarı.
- `cargo fmt --check` → 0 fark.
- `npm.cmd run build` → temiz (tsc + vite).
- `cd qa && node run.mjs` → SONUC: PASS (8 senaryo).

## Açık (bilerek kapalı) maddeler

- **Gamma'nın gerçek ekranı ısıttığı hâlâ gözle doğrulanmadı** (`gamma.rs` içindeki `#[ignore]`lı `live_apply_and_restore` hiç koşulmadı). Bu tek "fiziksel" doğrulama.
- **Çoklu monitör DDC/CI** — bu laptopta MCCS destek yok (hata 31); ikinci monitor için WMI/DDC ayrımı ve per-monitor gamma yazma henüz yok.
- **Kroppy oranı ölçümü** (kamera skin masking) — pahalısına ertelenmişti, bu sürümde de yok.
- **Otomatik güncelleme** (tauri-plugin-updater) — code signing + key yönetimi gerektirir; manuel release akışı devam.

## Öneri

Bu sürüm **profesyonel ve kusursuz** bir seviyeye yaklaştı: tüm panik noktaları graceful, tüm IO atomik, tüm state senkron, A11Y temel seviyede, test/QA geçiyor. Kalan 4 madde **donanım/kurumsal** (multi-monitor, auto-update) — bunlar "final" etiketini hak ediyor mu etmiyor mu senin kararın. Benim görüşüm: gamma'yı gözle doğrula, sonra `v0.8.0 "nihai"` damgasını bas.

## 0.7.0 turunda yapilanlar

1. **Hazir profiller geri geliyor** — `store.ts::restoreSeedProfiles()` (isim
   bazli, var olani EZMEZ, `MAX_PROFILES` saygili) + Profiller'da
   "Hazır profilleri geri getir" dugmesi (`#pf-restore`).
   `Sil` iki asamali: ilk tik "Emin misin?" (3 sn), ikinci tik gercekten siler.
2. **Sicak ton otomatik** — `warmEnabled` -> `warmMode: "auto" | "fixed" | "off"`
   (Ayarlar'da 3 kademeli segment `#warm-seg`). auto: her turda
   `warmth_auto(hour, minute, light_level)` cagirilir, `warmPercent` TAVAN olur.
   Diger kiplerde tur icinde dokunulmaz (kimlik rampaya her dakika yazmamak icin).
   Okuma profili `fixed`'a gecip kapaninca onceki kipe DONER.
3. **Otomasyon tamamlandi** — `scene_target` ve `main.ts`'teki isik modu
   dallanmasi artik `ss-paper`/`ss-dusk`/`ss-night` kullaniyor; elle tiklama
   beklemiyor. Kalan tek elle is: kendi istedigin temayi secmek.
4. **Tema onizlemesi + cilalar** — ciplerin altinda 3 renkli serit (zemin/metin/
   vurgu), profil kartlarinda `.pc-strip`, profil editorunde `<select>` yerine
   ayni renkli cipler (`#pf-theme-picker`). Renkler UYDURULMADI:
   - yerlesik 9 tema -> `src/theme-colors.json` (tema aracinin paketinden
     cikarildi, `tools/extract-theme-colors.mjs`)
   - kendi 3 temamiz -> `src/ss-colors.json` (`tools/themes.mjs` uretiyor)

## Inceleme turu (reviewer / deepseek-v4.1-flash) — VERDICT: PASS, 2 MINOR

- `.pc-strip` olu CSS'ti, kartlara serit konmamisti -> eklendi.
- `warmPercent` 0 yapilirsa sonraki acilista 35'e donuyordu
  (`Number(...) || 35` falsy tuzagi) -> `loadNumber()` yardimcisi; ayni tuzak
  `sleepStart`/`sleepEnd`/`sleepCap` icin de vardi (orn. baslangic 0 yapilabiliyor).
- Not: eski `warmEnabled` kaydi "0" olan kullanicilar acilista "auto"ya geciyor —
  bu bilerek boyle (kullanicinin istegi: otomatik olsun).
- Not: okuma profili sicak ton kipini kalici degistiriyordu -> artik geri donuyor.

Benim kendi gozumle buldugum (inceleme degil): "Ac / kapat" dugmesi iki satira
kiriliyordu (`white-space: nowrap`), tema cipleri cok yer kapliyordu
(min 44px -> 34px). Ikisi de duzeltildi.

## Dogrulama (bu turda GERCEKTEN kosuldu)

- `npm.cmd run build` -> temiz (tsc + vite).
- `cd qa && node run.mjs` -> SONUC: PASS (8 senaryo; yeni assert'ler: tema
  onizleme seridi, `#warm-seg` kipi, hazir profil geri getirme, iki asamali silme).
- `cargo test` -> 99 gecti, 4 ignored.
- Kareler `qa/shots/2-ayarlar.png` ve `4-profiller.png` gozle incelendi.

## Dagitim haritası (0.7.0 turu — orkestrasyon)

- `general`/`evren/glm-5.3` #1: `src-tauri/src/lib.rs`, `src/store.ts`,
  `src/catalog.ts`, `tools/themes.mjs` (+ `src/ss-colors.json` verisi).
  Iddiasi PASS; ben dosyayi acip dogruladim (sozlesme id'leri birebir,
  `ss-colors.json` null'suz, `warmth_auto is never used` uyarisi gercekten gitmis).
- `general`/`evren/glm-5.3` #2: `index.html`, `src/styles.css`. Iddiasi PASS;
  dogrulandi (eski `#warm-switch`/`#pf-theme` tamamen kalkmis).
- Ben: `src/main.ts` + `qa/run.mjs` (kesisim noktasi + davranis + testler).
- `reviewer`/`evren/deepseek-v4.1-flash`: 2 MINOR buldu (yukarida).

## Önceki durumlar (arşiv — tarihsel kayıt, güncel değil)

> Bu başlığın altındaki "Kalan / YARIM / HENÜZ YAPILMADI" listesi **2026-10-17
> itibarıyla** yazıldı. Dördü de sonradan kapandı ve kodda doğrulandı:
> hazır profilleri geri getirme (`store.ts:127 restoreSeedProfiles`) ve iki
> aşamalı silme (`panels.ts:1486 "Emin misin? Sil"`), sıcak ton otomasyonunun
> bağlanması (`orchestr.ts WarmMode = auto | fixed | off`), eski tema adlarının
> kalkması (`main.ts`/`orchestr.ts`'te `vesper`/`catppuccin`/`tokyonight` yok) ve
> tema çiplerindeki renk şeridi (`panels.ts:168 swatch-strip`). Güncel sınırlar
> için yukarıdaki *"Güncel durum: v3.0.0"* bölümüne bak.

## 1. Hazir profilleri kazayla sildim — HENUZ YAPILMADI

- `store.ts`'e `restoreSeedProfiles(): Profile[]` ekle (eksik olanlari eklesin,
  var olani ezmesin) + Profiller sekmesine "Hazir profilleri geri getir" dugmesi.
- `Sil` iki asamali onay olsun: etiket 3 saniye "Emin misin?" olup ayni sure
  icinde tekrar basilinca gercekten silinsin (`lib.rs`/dialoga gerek yok).

## 2. Sicak ton otomatik degil — BACKEND BITTI, BAGLANTI YOK

- Bitti: `src-tauri/src/decide.rs::warmth_auto(hour, minute, light_level) -> 0..=45`
  11 capa noktasi arasinda dakika-bazli dogrusal egri (00:00=40, 06:00=25,
  08:00=0, 15:00=0, 17:00=10, 19:00=25, 21:00=35, 23:00=40) + isik kaydirmasi
  (dark +10, dim +5, bright -5, tavan 45, gece yarisi cevrimi surekli).
  6 test; `cargo test` gecti.
- Kalan: `lib.rs`'i `warmth_auto` komutu olarak disari ac; ana dongude (dakikada
  bir, parlaklikla birlikte uygula); `main.ts`'te `warmEnabled` bool'unu
  `warmMode: "auto" | "fixed" | "off"` yap (segmented), `warmPercent` "sabit/
  azami siddet" olsun. Ayarlar'daki mevcut acma-kapama anahtarinin yerine gecer.

## 3. Otomasyon tam degil — YARIM

- Bitti: `decide.rs::scene_target` artik OLULMUS temalara donuyor
  (Day/Cool -> ss-paper, Warm/18-21 -> ss-dusk, Night -> ss-night).
- Kalan: `src/main.ts`'teki `light` modu dallanmasi HALA elle yazilmis eski
  adlari kullaniyor (`vesper`, `github`, `catppuccin-macchiato`, `tokyonight`) —
  ss-* adlarina cekilsin. `catalog.ts` notlari guncellensin.

## 4. Onizleme + UI/UX — VERI HAZIR, ARAYUZ YOK

- Yeni: `tools/extract-theme-colors.mjs` -> tema aracinin paketinden 9 yerlesik
  temanin GERCEK renklerini cikarip `src/theme-colors.json`'a yazdi (tahmin yok):
  mod basina `background`, `text`, `textMuted`, `syntaxKeyword`, `syntaxFunction`.
  Ornek: github dark bg #0d1117 / text #c9d1d9; vesper dark bg #101010.
- `ss-*` renkleri `src-tauri/themes/*.json` icinde (onizleme icin ucunu de ekle).
- Kalan: `catalog.ts`'te `ThemeEntry`'ye renk bilgisi + secicide her cipin
  altinda 3 renkli serit (zemin/metin/vurgu); profil kartlarinda tema seridi;
  genel bosluk ve hiyerarsi cilasi; kayip durumlar (bos tema dizini vb.).

## Dogrulama (bu turda gercekten kosulan)

- `cargo test` -> 99 gecti, 4 ignored. Tek uyari: `warmth_auto is never used`
  (baglanti bekledigi icin normal).
- `node tools/extract-theme-colors.mjs` -> 9 tema yazildi.
- `node tools/themes.mjs` -> PASS (degismedi).
- `npm.cmd run build` ve QA bu degisikliklerden SONRA kosulmadi — once onlari coş.

### 0.6.0 turu durumu (arşiv)

## Tamamlanan

- 4 sekmeli IA: Panel / Profiller / Ayarlar / Geçmiş (`index.html`).
- Bileşen sistemi: `src/widgets.ts` (segmented, switch, tag editörü),
  `src/catalog.ts` (etiket/tema/renk), `src/store.ts` (localStorage + profil CRUD).
- Ayarlanabilir profiller: maks 6, varsayılan İş+Film, oluştur/çoğalt/sil/kaydet,
  otomatik kilit davranışı profille taşınır, aktif profil Panel'de hızlı seçilir.
- `stats.rs`: log → 12 saatlik kova, tema değişimi / ortalama parlaklık /
  dondurulan tur. `lib.rs`'e `stats_summary` olarak bağlı. 8 test.
- Geçmiş sekmesi: özet kartları + saf SVG grafik (çubuk + kesik hedef çizgisi).
- 20-20-20 tek seferlik uyarı (`waiting`/`alerting`), saniyelik koruma tuzağı yok.
- QA: `qa/run.mjs` 5 senaryo, 800x600, ekran görüntülü; kart-dolu ve
  "hata:" kontrolü ekli (tick içi yutulan hataları yakalamak için).
- `AGENTS.md` güncel: mimari, QA komutu, 20-20-20 kuralı, `el()` tuzağı.

### 0.6.0 turu (Faz 5 + Faz 6)

- **Kontrast denetimi**: `src-tauri/src/contrast.rs` tema dosyasındaki
  `text.base`/`background.base` oranını WCAG 2.1 ile ölçer. `$hue.ad.adim`
  alias zinciri ve `$token.yol` referansları çözülür; derinlik kelepçesi
  sonsuz döngüyü keser (referans çemberi testi var). Ayarlar'da liste +
  "FAIL olanı otomatik seçimde engelle" kapısı (varsayılan açık).
- **Göz konforu temaları**: `tools/themes.mjs` `ss-paper`/`ss-dusk`/`ss-night`
  üretir ve ölçer (metin AAA, ikincil metin AA — 6 modun hepsi). Ürettiği
  yerler: `src-tauri/themes/` (derlemeye gömülü) + `~/.config/opencode/themes/`.
  `install.rs` açılışta eksik olanı kopyalar, var olana dokunmaz.
  Okuma profili artık `ss-dusk` açıyor (zenburn değil).
- **Uygulamaya bağlı profiller**: profilin `apps` listesindeki exe ön plana
  gelince o turda mod/kaynak/tema/düzeltme profilden okunur; öğrenilmiş tercih
  onu ezmez. Kilit ve dondurma her durumda önde. Rozette `İş → Film` görünür.
- **Rozet renk düzeltmesi**: `.badge.ok`/`.badge.bad` CSS'te yoktu — yani FAIL
  rozeti yeşil görünüyordu. Eklendi (FAIL kırmızı).
- QA 8 senaryo (kontrast paneli + uygulama bağlama eklendi).

## Doğrulama durumu

- `cargo test` → 91 geçti (4 ignored: 3 donanım + 1 kurulu tema denetimi).
- `npm.cmd run build` → temiz.
- `node qa/run.mjs` → SONUC: PASS (8 senaryo; taşma, sızıntı, ölü düğme, konsol hatası yok).
- `node tools/themes.mjs` → SONUC: PASS (6 mod, hepsi AA+).

### Kurulum paketi (0.6.0 — tarihsel yol)

`src-tauri/target/release/bundle/nsis/smart-screen_0.6.0_x64-setup.exe`

### Bilinen sınırlar (0.6.0 itibarıyla — bugün geçerli değil)

> Bu liste 0.6.0 günü yazıldı. İlk iki madde v3.0.0'da kapandı: gamma canlı
> testle ölçüldü (`cargo test -- --ignored`) ve otomatik seçim yalnız `ss-*`
> temalarına kilitlendi. Kalan maddeler donanım/arayüz sınırı olarak sürüyor.

- Grafik tema değişimi işaretini çizmiyor (yalnız özet sayıda); ipucu metni
  buna göre sadeleştirildi.
- Kamera hâlâ tek sensör (ALS yok); karanlıkta renk tonu sayılmıyor.
- Pencere sabit 800x600; sekmeler kendi içinde kayıyor.
- Denetim yalnız diskteki temaları ölçebilir. OpenCode yerleşik temalarının
  (github, vesper, catppuccin...) dosyası yok, binary gömülü — bu yüzden onlar
  için kapı çalışmaz; `catalog.ts`'deki RISKY ad listesi yedeği olarak duruyor.
- Karar metni "AA" olarak raporlanıyor çünkü ölçüm **metin + renk kodu**nun en
  kötüsüne göre veriliyor (AAA demek için ikisi de 7+ olmalı). Bu bilerek
  böyle: gece temasında parlak renk kodu parlama yaratır.
- Gamma'nın gerçek ekranı ısıttığı **gözle doğrulanmadı** (`gamma.rs` içindeki
  `#[ignore]`lı `live_apply_and_restore` hiç koşulmadı).
- Otomatik seçim hâlâ eski temaları seçiyor; `ss-*` temaları elle seçiliyor.

## Model durumu (2026-10-08)

Evren kotalari yenilendi. Gamma arastirmasi `explore`/`deepseek` ile yapildi
(PASS, birebir alintili). `gamma.rs` `general`/`glm-5.3` tarafindan yazildi VE
dogrulandi (kod gercekti). `decide.rs` ayni modele verildi, SESSIZ BOŞ döndü
(dosyaya dokunulmadi) — ben yazdim. glm-5.3 ayni ise ikinci kez verilmedi.

**Kural (kullanicidan):** orkestrasyonda opencode modelleri KULLANILMAZ (kota
dolu) — yalniz `evren/*` modelleri.

## Dağıtım haritası (Faz 1-4 oturumu)

- explore/deepseek: DDC/CI API arastirmasi — PASS, 3 alt madde BULUNAMADI (HDR davranisi, desteksiz ayarin hata kodu, "sicak yon" etiketi). Dosya yok.
- Donanim probu (ben): tek dahili panel 1920x1080, 1 fiziksel monitor, tum DDC/CI sorgulari HATA 31 (MCCS desteksiz).
- general/glm-5.3 #1: `gamma.rs` (9.8 KB) + Cargo.toml feature'lari — yazildi, ben okuyup dogruladim.
- general/glm-5.3 #2: `decide.rs` yumusak gecis — bos dondu, ben yazdim (68->71 test).
- `theme.rs` `set_animations`, `prefs.rs` kalibrasyon (learn_bright/get_bright) + `lib.rs` baglamalari benim.

## Dağıtım haritası (0.6.0 turu)

- Ben yazdim: `contrast.rs`, `install.rs`, `tools/themes.mjs`, `src-tauri/themes/*`,
  `store.ts`/`catalog.ts`/`main.ts`/`index.html`/`styles.css`/`qa/run.mjs` degisiklikleri.
- Basarisiz dagitim: `general`/`glm-5.3` `contrast.rs` icin gorevlendirildi,
  **bos dondu** (kod yoktu). Kendim yazdim; ayni ise ayni modele ikinci kez verilmedi.
- Inceleme: `reviewer`/`zai/glm-5.3-fp8` **COCKTU** ("multimodal degil" — png
  okumaya kalkmis). `reviewer`/`deepseek-v4.1-flash` VERDICT: REVISE verdi ve
  **gercek bug yakaladi** (asagida). Ayni gorev ayni modele ikinci kez verilmedi.

## Inceleme bulgulari (deepseek-v4.1-flash) ve duzeltmeleri

1. KRITIK — `tools/themes.mjs` `hsl()` yuzde bekliyordu, `ramp()` kesir veriyordu:
   tum renkli hue skalalari siyaha iniyordu (`purple.400 = #020102`). Yani
   sozdizimi renkleri gorunmez olacakti. GREY olcegi elle yazildigi icin
   metin/zemin olcumu AAA diyip bunu gormezden geliyordu.
   -> Duzeltildi (ramp l x100).
2. ONEMLI — denetim yalniz `text.base`/`text.muted`/`background.base` olcuyordu;
   `syntax.*`/`feedback.*`/`markdown.*` denetime girmiyordu. Yukaridaki sinif
   hata bu yuzden "AAA" geciyordu.
   -> `Report.syntax_min` eklendi (11 zorunlu tokenin en kotusu), karar
   `min(text_on_bg, syntax_min)` uzerinden veriliyor. `tools/themes.mjs` de
   ayni listeyi cozumleyerek olcuyor; iki bagimsiz uygulama AYNI sayilari veriyor.
3. Acik modda renk kodu 2.4-2.7:1 idi (pastel ustune beyaz) -> acik mod 200,
   koyu mod 300 adimina cekildi; alti modun hepsi 4.6+ oldu.
4. `resolve_path` ara segmentte referansa rastlarsa kalan yolu yutuyordu
   (latent) -> artik `None` donuyor + test.
5. Log, gate reddederken bile "uygulama -> profil" yaziyordu; ve bagli profilin
   temasi gate ile engellenebiliyordu. Kapi "yalniz otomatik secim" oldu:
   bagli profil acik niyettir, veto edilmez. Not metni de buna gore yaziliyor.
6. XDG uyumu: `themes.mjs` homedir(), Rust XDG onceliyordu -> ayni kurala
   cekildi.

## Kalan

- **Canlı doğrulama (kullanıcı):** sıcak tonun ekranı gerçekten ısıtması, okuma
  profili, kalibrasyon metni. Henüz gözle görülmedi.
- Karar tablosunun `ss-*` temalarına geçmesi otomatik davranışı değiştirir —
  kullanıcı onayı bekliyor.
- İnceleme turu tamam: bulgular ve düzeltmeleri yukarıdaki bölümde.
- Ertelenmiş: çoklu ekran (DDC/CI hata 31), kırpma oranı ölçümü.
