# smart-screen tanıtım sitesi — tasarım belgesi

Tarih: 2026-11-19 · Durum: onay bekliyor · Kapsam: `gh-pages` tanıtım sitesinin
sıfırdan yeniden yazılması (TR + EN)

---

## 1. Neden

Bugünkü site (`gh-pages`, tek commit "Tanıtım sitesi", 14 KB) **v0.7.0 döneminden**
kalma ve üç ayrı yerden yanlış:

1. **Yanlış bilgi.** "v0.7.0 yayında" rozeti (bugün 3.6.1), "tamamen ücretsiz ve açık
   kaynak" (Pro sürüm var), sekmeler "Panel / Profiller / Ayarlar / Geçmiş" (bugün
   **Durum** / Profiller / Geçmiş / Ayarlar), pil davranışı "%20 altında 15 dakika"
   (bugün dört kademeli plan). Ürünle çelişen site, üründen daha çok zarar verir.
2. **Yanlış dil.** İndigo `#7c8cff` + amber, bulanık renk lekeleri, cam kartlar:
   her landing page'in görsel dili. Uygulamanın kendi dili bunun tam tersi — sıcak
   obsidyen, tek pirinç vurgu, saç teli çizgiler, ölçen rakamlar.
3. **Kanıt yok.** Ekran görüntüsü yerine elle çizilmiş kutu taklidi var. Ürünün
   asıl vaadi (ölçüyor, karar veriyor, dokunmaması gerektiğinde dokunmuyor)
   sayfada hiç görünmüyor.

Yenilemenin amacı yalnız "güzel görünsün" değil: **ziyaretçi 30 saniyede ürünün ne
yaptığını, neye dokunmadığını ve neyi vaat etmediğini anlasın**; sonra indirsin.

## 2. Niyet ve başarı

**Kim için:** ışığa göre ekran ayarı arayan Windows kullanıcısı (iki kitle: göz
yorgunluğu çeken sıradan kullanıcı, ve tema/parlaklık otomasyonu isteyen teknik
kullanıcı).

**Başarı ne demek:**
- Ziyaretçi ilk ekranda ürünü tek cümlede anlatabiliyor.
- "Oyun oynarken dokunmuyor" ve "kamera görüntüsü diske yazılmıyor" iki itirazı
  sayfada kendiliğinden cevaplanmış oluyor (en sık iki soru).
- İndirme düğmesine basınca doğru yere gidiyor (`releases/latest`), sonrasında
  SmartScreen uyarısıyla karşılaşınca şaşırmıyor.
- Türkçe ve İngilizce sayfa **birebir aynı yapıda**; biri güncellenip diğeri
  unutulmuyor.

**Ölçülebilir kapılar:** Lighthouse (mobil + masaüstü) perf/a11y/best-practices/SEO
≥ 95; dört renk fazının hepsinde metin kontrastı WCAG AA; CLS ≈ 0; JS kapalıyken
tüm metin ve indirme bağlantısı okunur; **ilk yükleme** (HTML + CSS + JS) ≤ 120 KB,
**tüm `site/dist`** ≤ 900 KB (§9'da ayrıntı).

## 3. Kapsam dışı (bilinçli)

- Blog, changelog sayfası, SSS'den fazla doküman (README ve CHANGELOG GitHub'da kalır).
- Analitik, çerez bandı, üçüncü taraf script (hiçbiri yok — gizlilik iddiası
  sayfanın kendi davranışıyla tutarlı olmalı).
- Fiyat ve satın alma. Pro fiyatı henüz belirlenmedi; uydurma fiyat yazılmaz.
- Özel alan adı (bugün `titanlion72.github.io/smart-screen/`; sonra tek ayar).
- Microsoft Store / winget rozetleri (winget PR'ı incelemede, Store ertelendi).
- Uygulama arayüzünün İngilizceye çevrilmesi (site iki dilli, **uygulama bugün
  yalnız Türkçe** — bu sayfada dürüstçe yazılır).

**Anti-hedefler** (teknik olarak çalışsa da başarısızlık sayılır):
şablon gibi görünmek; öğlen fazında okunamaz hale gelmek; mobil veride yavaşlamak;
uygulamada olmayan bir özelliği vaat etmek; uydurma referans/müşteri logosu koymak.

## 4. Kısıtlar

- GitHub Pages, alt yol barındırma: `https://titanlion72.github.io/smart-screen/`
  → tüm varlık yolları **göreli** (`./assets/...`), mutlak `/` yolu yasak.
- Dış kaynak yok: CDN, web font, izleyici, harita, ikon paketi. Yalnız depodaki
  dosyalar. (Ağ isteği sayısı: 1 HTML + 1 CSS + 1 JS + görseller.)
- Derleme bağımlılığı eklenmez; Node ESM dışında araç yok. Playwright zaten
  `qa/node_modules`'ta (1.63.0) ve **yalnız** ekran görüntüsü üretiminde,
  geliştirici makinesinde kullanılır (sitede çalışmaz); köke yeni bağımlılık
  eklenmez (`createRequire` ile `qa/package.json` üzerinden çözülür).
- Palet ve dil uygulamadan türetilir (`src/palette.css`, `src/ss-colors.json`) —
  site kendi rengini uydurmaz.

## 5. Yaklaşımlar

**A) İki dili elle yazılmış iki HTML dosyası, paylaşılan CSS/JS.**
Artı: en basit, dosya = sayfa. Eksi: 300+ satır metin iki yerde durur; bir cümleyi
düzeltince diğerini unutmak kaçınılmaz (bu depoda daha önce yaşandı: `AGENTS.md` ↔
`README.md` kısayol satırı ayrıştı). Parity denetimi yazsan bile metin çiftlenir.

**B) Tek kaynak + küçük üreteç (SEÇİLEN).**
`site/content.mjs` içinde TR ve EN blokları yan yana durur; `site/template.mjs`
iskeleti kurar; `tools/site-build.mjs` iki HTML üretir. Üreteç ~200 satır, bağımlılık
yok, `--check` kipi bayat çıktıyı yakalar (depoda aynı desen `tools/themes.mjs`'de var).
Artı: iki dil **yapısal olarak** ayrışamaz; başlık/bağlantı/SSS sayıları aynı olmak
zorunda. Eksi: HTML elle düzenlenmez, `content.mjs` düzenlenir.

**C) Siteyi Vite derlemesine katmak, uygulamanın CSS'ini paylaşmak.**
Artı: tek tema kaynağı. Eksi: uygulamanın `styles.css` (65 KB) + `templates.css`
(40 KB) dosyaları panel ızgarasına, `el()` sözleşmesine ve `data-template`
eksenine bağlı; site bunların %10'unu kullanır ama %100'ünü indirir. Ayrıca
uygulama CSS'inde değişiklik yapan her tur siteyi de kırar. Reddedildi.

Seçim gerekçesi: iki dil şartı A'yı eliyor; performans ve bağımsızlık şartı C'yi
eliyor. B, "iki dil asla ayrışmasın" hedefini mimari olarak garanti eder.

## 6. Tasarım

### 6.1 Görsel tez

**Site, ürünün yaptığını yapar: gün boyunca tonu değişir.** Sayfa dört bölüme
ayrılır ve her bölüm bir saati temsil eder; kaydırdıkça zemin/metin/vurgu renkleri
komşu fazlar arasında yumuşakça geçer. Bu süs değil kanıt: dört faz **uygulamanın
kendi üç göz konforu temasına** ve onun fiziksel ölçeğine oturur.

| Faz | Saat | Zemin | Metin | Vurgu | Hissi |
|---|---|---|---|---|---|
| Şafak | 06:00 | `#0e1014` soğuk obsidyen | `#ded9d0` | `#b9c4cf` soğuk gri | perde aralanıyor |
| Öğlen | 12:00 | `#f6f1e6` sıcak kâğıt | `#211d18` mürekkep | `#7a4a2f` kızıl kahve | tam ışık, net |
| Akşam | 18:00 | `#241c16` sıcak kahve-siyah | `#e7dccd` | `#d8b98a` pirinç | ton ısınıyor |
| Gece | 23:00 | `#0a0908` obsidyen | `#f5f1ea` krem | `#d8b98a` pirinç | sakin, karanlık |

Öğlen fazı **gerçekten açık tema** (kâğıt), saf beyaz değil. Bu, sayfanın en
riskli ve en ayırt edici kararı: ürünün "gündüz parlak, gece sıcak" iddiasını
sayfanın kendisi taşır. Kontrast her fazda ölçülür (§9).

**Yasak listesi (AI/şablon hissinin kaynağı):** bulanık renk lekeleri (blob), cam
yüzey + arka plan bulanıklığı, mor/indigo vurgu, emoji ikon, "🚀", üç kolonlu
ikon-kart ızgarası (ana iskelet olarak), uydurma müşteri logosu/referans, stok
fotoğraf, parıldayan gradyan başlık, "Trusted by", yuvarlatılmış 24px kutular
yığını. Yerine: **saç teli 1px kurallar, geniş beyaz alan, tabular rakamlar,
gerçek veri.**

### 6.2 Tipografi

Web font **indirilmez** (kısıt). Craft, tipografik kontrolden gelir:

- **Başlık:** sistem sans (`Segoe UI Variable`, `-apple-system`, `Inter`), ağırlık
  300–400, harf aralığı `-0.035em`, satır yüksekliği `0.95–1.05`, `clamp()` ile
  akışkan boyut (mobil 2.1rem → masaüstü 4.4rem).
- **Veri/etiket:** sistem mono (`Cascadia Mono`, `Consolas`, `ui-monospace`),
  `font-variant-numeric: tabular-nums`, büyük harf + `0.16em` aralık, 11–12px.
  Bu, uygulamanın "ŞU ANKİ PARLAKLIK" diliyle aynı.
- **Bölüm numarası:** `06` / `12` / `18` / `23` — mono, ağırlık 200, `clamp(3.5rem,
  9vw, 7rem)`, `opacity: .35`, metnin solunda asılı (hanging) durur. Sayfanın
  ritmi bu dört sayıdan gelir; ikon yok.

### 6.3 İskelet (iki dilde aynı)

```
[üst çubuk]  ▪ smart-screen        Nasıl çalışır  Özellikler  SSS   TR|EN   [İndir 3.6.1]
──────────────────────────────────────────────────────────────────────────────────────
[HERO]  06 ────────────────────────────────────────────────────────────────
        Ekranınız odanın ışığını ölçer.
        Parlaklığı, sıcaklığı ve temayı buna göre ayarlar.
        Oyun, video, PDF ve kilit ekranında hiçbir şeye dokunmaz.
        ┌───────────────── 24 saat eğrisi (SVG, gerçek warmth_curve) ─┐
        │  şu an 21:04 → sıcak ton %55 · 4600 K      (canlı saate göre)│
        └──────────────────────────────────────────────────────────────┘
        [İndir (Windows)]   [Kaynak kodu]
        GPL-3.0 · imzasız kurulum · hesap yok · telemetri yok

[06:00 ŞAFAK]   kamera birkaç kare okur → ışık seviyesi → parlaklık yükselir
                → gerçek ekran görüntüsü (Durum sayfası, ss-paper açık tema)

[12:00 ÖĞLEN]   gündüz tavanı + kontrast kapısı: ölçülüp FAIL çıkan tema
                otomatik seçimde uygulanmaz → ekran görüntüsü (Ayarlar/kontrast)

[18:00 AKŞAM]   sıcak ton rampası, Kelvin, monitör başına gamma
                → ekran görüntüsü (sıcak ton kartı + eğri)

[23:00 GECE]    gece tavanı, 20-20-20 tek seferlik uyarı, boşta dönüş rampası
                → ekran görüntüsü (gece, ss-night)

[DOKUNMADIĞI YERLER]  üç sütun DEĞİL: iki sütunlu karşılaştırma
                "dokunur" | "dokunmaz" — oyun/video/tam ekran/PDF/kilit

[ÖZELLİKLER]    7 madde, saç teli kurallı liste (ikon-kart ızgarası değil)

[GERÇEKLER]     imzasız kurulum adımları · sha256 komutu · winget durumu
                · telemetri yok · lisans çevrimdışı · kaldırınca geri alma

[ÜCRETSİZ / PRO]  tek tablo, tek dürüst satır: "Pro fiyatı henüz belirlenmedi."
                Ücretsiz: parlaklık, sıcak ton, tema, 3 profil, kontrast kapısı,
                20-20-20, **Windows sistem teması**.
                Pro: 6 profil, harici monitör DDC **ve** harici monitöre sıcak ton,
                uygulamaya bağlama, **uygulama başına tema** (Windows teması Pro
                değildir — README'deki ayrım esas).

[SSS]           7 soru (kamera, pil, HDR, harici monitör, oyun, kaldırma, dil)

[KAPANIŞ]       "Kur, unut." + İndir + sürüm/changelog bağlantısı
──────────────────────────────────────────────────────────────────────────────────────
[altlık]  © 2026 TitanLion72 · GPL-3.0 · GitHub · Sürümler · Gizlilik (tek paragraf)
```

### 6.4 Hero'daki canlı eğri

Sayfanın imzası: uygulamanın kendi `warmth_auto` eğrisi
(`src-tauri/src/decide.rs`) SVG olarak çizilir; ziyaretçinin **kendi saatine**
göre bir imleç ve "şu an" okuması yerleşir. Değerler **uydurulmaz**, iki gerçek
formülden gelir:

```
şiddet  = smoothstep_eğri(dakika)            # decide.rs ANCHORS, 11 çapa
uygulanan = round(şiddet × warmPercent/100)  # warmPercent varsayılanı 70
kelvin  = 6500 - 3500 × (uygulanan/100)      # engine.warmthToKelvin
```

Doğrulanmış referans değerleri (varsayılan `warmPercent=70`):

| Saat | Ham şiddet | Uygulanan | Kelvin |
|---|---|---|---|
| 06:00 | 56.0 | %39 | 5100 K |
| 12:00 | 0.0 | %0 | 6500 K |
| 18:00 | 39.0 | %27 | 5600 K |
| 21:04 | 78.0 | %55 | 4600 K |
| 23:00 | 88.0 | **%62** | 4300 K |

Gece tavanı %62'dir (88 × 0.70) — uygulamanın Ayarlar ekranındaki "gece en fazla
%62" satırıyla aynı sayı. Hero bunu açıkça yazar: *"varsayılan ayarlarla"*. Bu
tablo `site/curve.test.mjs` içinde **birebir** test edilir; eğri şekli değişirse
site sessizce yalan söyleyemez.

JS kapalıysa: imleç ve okuma yok, eğri ve statik başlıklar durur (içerik kaybolmaz).

### 6.5 Hareket

- Kaydırma ile renk geçişi: `requestAnimationFrame` + `scroll` (passive), faz
  ağırlıkları sürekli; CSS değişkenleri `:root`'a yazılır.
- Eğri ilk görünümde soldan sağa çizilir (600 ms, tek kez).
- Bölüm başlıkları 8px yukarıdan gelir (200 ms).
- `prefers-reduced-motion: reduce`: renk geçişi yok (fazlar keskin), çizim yok,
  kayma yok. Bu bir "nice to have" değil, kapı.

### 6.6 İki dil

- TR: `/index.html` (`<html lang="tr">`), EN: `/en/index.html` (`lang="en"`).
- `hreflang` + `canonical` çiftleri; üst çubukta `TR | EN` bağlantısı, bulunduğun
  dil işaretli.
- Çeviri **kelimesi kelimesine değil**: EN metin İngilizce okunacak şekilde
  yazılır, aynı uzunlukta olmak zorunda değil; ama bölüm sayısı, bağlantı
  hedefleri ve SSS sayısı aynı (üreteç bunu zorlar).
- Uygulamanın arayüzü Türkçe; EN sayfada bu tek cümleyle yazılır
  ("The app interface is currently Turkish only.") — sürpriz olmasın.

## 7. Teknik yapı ve dosya sahipliği

| Dosya | Ne | Kim yazar |
|---|---|---|
| `site/content.mjs` | TR+EN metin, tek kaynak (`nav`, `hero`, `chapters[4]`, `features[7]`, `facts`, `plans`, `faq[7]`, `footer`) | elle |
| `site/curve.mjs` | saf fonksiyon: saat → eğri noktaları + hedef + Kelvin | elle, **birim testli** |
| `site/curve.test.mjs` | referans tablo (§6.4) birebir; sınır saatler, tavan | elle |
| `site/template.mjs` | HTML iskeleti (semantik: `header/main/section/footer`, `aria`), JSON-LD | elle |
| `site/assets/site.css` | tüm stiller, faz token'ları, `@media` kırılımları | elle |
| `site/assets/site.js` | faz geçişi, canlı imleç, reduced-motion, dil bağlantısı | elle, ≤ 5 KB |
| `site/assets/shots/*.webp` | 4 gerçek ekran görüntüsü + `og.png` | `tools/site-shots.mjs` |
| `site/dist/**` | üretilen HTML (commit edilir, diff'te görünür) | `tools/site-build.mjs` |
| `tools/site-build.mjs` | üreteç + `--check` (bayat çıktı = hata) | elle |
| `tools/site-shots.mjs` | Playwright ile öğe-kırpmalı @2x kareler + og görseli | elle |
| `tools/site-check.mjs` | parity + kontrast (4 faz × AA) + bağlantı/görsel + ağırlık bütçesi | elle |
| `tools/site-publish.mjs` | `site/dist` → `gh-pages` tek commit + push | elle |

Yayın akışı: `npm run site:build` → `npm run site:check` → `npm run site:publish`.
Pages ayarı **değişmez** (kaynak `gh-pages`, kök). `gh-pages` yalnız yayınlanan
çıktıyı taşır; kaynak `main`'de `site/` altındadır → dahili belgeler (`HANDOFF`,
`PLAN-*`, `REKABET-*`) yayınlanmaz.

`.gitignore`'daki çıplak `dist` satırı `site/dist`'i de yutar; `!site/dist/`
olumsuzlaması eklenir (yoksa `--check` ve yayın sessizce boş dizinle çalışır).

Yeni npm script'leri: `site:build`, `site:shots`, `site:check`, `site:publish`.

## 8. Ekran görüntüleri

**Çerçeveleme: tam pencere değil, hedef öğe.** 1440×900'lük pencerenin tamamı
küçültülünce hiçbir şey okunmaz; ayrıca "kontrast kartı" gibi hedefler katlanma
çizgisinin altında kalır. Bu yüzden her kare, **belirli bir öğenin** sınır kutusu
+ 32px dolgu ile kırpılır (`locator.boundingBox()` + `clip`), 2× ölçekte.
Hedefler `tools/site-shots.mjs` içindeki `SHOTS` tablosunda açıkça yazılıdır
(ör. `#hero-brightness` kartı, `#contrast-card`, `#warm-card`, `#monitor-list`).

- Üretim: `tools/site-shots.mjs` **kendi deterministik stub'ını** taşır
  (3 monitör; üçüncüsünde DDC hatası; ışık `dim`; lisans **ücretsiz**).
  Gerekçe: site karelerinin fixture'ı QA'nınkinden farklı ve pazarlama
  görselleri bir QA senaryosu değiştiğinde sessizce değişmemeli. Kopya stub'ın
  ayrışma riski, `SHOTS` tablosundaki seçicilerin **var olması** şartıyla
  sınırlanır: kart kimliği değişirse üretim gürültülü biçimde patlar.
- Playwright kökte yok, `qa/node_modules`'ta (1.63.0). Yeni kök bağımlılık
  eklenmez; araç `createRequire(qa/package.json)` ile çözer ve yoksa anlaşılır
  hata verir ("önce `cd qa && npm install`").
- Boyut: `deviceScaleFactor: 2`, WebP kalite 82, **kare başına ≤ 120 KB**.
- Dört kare fazla uyumlu tema ile alınır: şafak → `ss-paper` açık, öğlen →
  `ss-paper` açık + kontrast kartı, akşam → `ss-dusk`, gece → `ss-night`.
- `og.png` (1200×630): zemin `#0a0908`, büyük mono `%38`, pirinç eğri, tek satır
  başlık. Sosyal kartta da şablon değil. (Sayfaya yüklenmez; bütçeye girmez.)
- `<img width/height>` verilir (CLS = 0), `loading="lazy"`, `decoding="async"`,
  `alt` gerçek içeriği anlatır.

**Ağırlık bütçesi — iki ayrı sayı** (ilk sürümdeki tek sayı matematiksel olarak
imkânsızdı: 4 × 120 KB tek başına 480 KB):

| Ölçü | Sınır | Ne dahil |
|---|---|---|
| İlk yükleme (raw) | ≤ 120 KB | HTML + CSS + JS (hero'da ekran görüntüsü **yok**, eğri SVG) |
| İlk yükleme (gzip) | ≤ 40 KB | aynı üçü, sıkıştırılmış |
| JS toplam | ≤ 20 KB | site.js + curve.js + phase-math.js |
| Tek kare | ≤ 120 KB | WebP |
| Tüm `site/dist` | ≤ 900 KB | 4 kare + og.png + kod + HTML'ler |

> İlk taslakta "JS ≤ 5 KB" yazılmıştı; ölçüm 15.7 KB (gzip 6.6) gösterdi. Üç ayrı
> modülün toplamı için 5 KB gerçekçi değildi; sınır ölçüme göre düzeltildi.

`site-check.mjs` üçünü ayrı ayrı ölçer ve aşımı hata sayar.

## 9. Doğrulama (kapılar)

İki katman: **hızlı kapı** (tarayıcı gerekmez, her değişiklikte) ve **duman**
(Playwright, yayın öncesi).

**A) `node tools/site-check.mjs`** — tarayıcı yok, saniyeler sürer:

1. `node tools/site-build.mjs --check` — çıktı bayat değil.
2. TR/EN parity: bölüm kimlikleri, SSS sayısı, bağlantı hedefleri, `alt` sayısı eşit.
   - **Kontrast:** her fazda `metin/zemin`, `ikincil metin/zemin`, `vurgu/zemin`,
     `düğme metni/düğme zemini` ≥ 4.5 (büyük metin ≥ 3.0). Dört fazın **hepsi**.
   - Bağlantılar: her `href` ya `#` çapası (hedef var) ya da `https://…`; kırık iç
     bağlantı yok. Görseller mevcut.
   - Yasak desen taraması: `TODO`, `lorem`, `XXX`, `placeholder`, `example.com`.
   - Ağırlık bütçesi: ilk yükleme (HTML+CSS+JS) ≤ 120 KB, kare ≤ 120 KB,
     tüm `site/dist` ≤ 900 KB, CSS ≤ 20 KB, JS ≤ 5 KB.
3. `node site/curve.test.mjs` — §6.4 referans tablosu birebir (sınır saatler,
   tavan, gece sıfırı).

**B) `node tools/site-check.mjs --smoke`** — Playwright (yayın öncesi):

- 360 / 768 / 1440 px'te yatay taşma yok, konsol hatası yok.
- Dil bağlantısı gidiş-dönüş yapıyor (`/` ↔ `/en/`), `lang` ve `hreflang` doğru.
- JS kapalıyken tüm başlıklar ve indirme bağlantısı duruyor.
- `prefers-reduced-motion: reduce` açıkken renk geçişi yapılmıyor (fazlar keskin).

**C) Gözle:** `site/dist` yerel sunucuda açılır, dört fazın karesi alınır
(`site/preview-*.png`) ve birlikte bakılır. Kapılar "çalışıyor" der; "güzel
görünüyor" demez — o karar senin.

## 10. Yapımcıya bırakılanlar

- Kesin `clamp()` değerleri, boşluk ölçeği, kırılım noktaları.
- Faz renklerinin ara tonları (interpolasyon uzayı: linear sRGB).
- Bölüm içi mikro-yerleşim (görsel solda mı sağda mı — faz başına değişebilir).
- SSS cevaplarının tam metni (içerik `content.mjs`'e yazılırken).
- OG görselinin kompozisyonu.
- `site.js` içinde faz ağırlığı hesabının ayrıntısı (hangi bölüm hangi aralıkta).
