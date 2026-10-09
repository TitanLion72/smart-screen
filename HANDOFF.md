# HANDOFF — 2026-10-09 (smart-screen) — 0.7.0 tamam

> 4 geri bildirimin 4'ü de islendi. Detaylar asagida; "0.7.0 cizgisi yarim"
> bolumunun tum maddeleri kapandi.

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

## ONCEKI DURUMLAR (arsiv)

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

## ONCEKI DURUMLAR (0.6.0, arsiv)

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

## Kurulum paketi

`src-tauri/target/release/bundle/nsis/smart-screen_0.6.0_x64-setup.exe`

## Bilinen sınırlar

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
