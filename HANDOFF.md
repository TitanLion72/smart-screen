# HANDOFF — 2026-10-17 (smart-screen) — 0.8.0 nihai

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
