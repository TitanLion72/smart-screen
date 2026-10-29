# PLAN v3 — tasarım sistemi + karar motoru

> Durum: **plan** (uygulama yok). Sürüm: v2.4.3 sonrası.
> Kapsam: yalnız `smart-screen`. Başka proje/klasör değişmez.
> Amaç: (1) "durduk yere kısık/parlak" ve "sıcak ton işlevsiz" şikayetlerini
> kök nedenden çözmek, (2) arayüzü tek paletli tek düzenden **şablon × palet**
> tasarım sistemine taşımak.

---

## 0. Özet (tek paragraf)

Bugünkü arayüz tek bir yerleşim dilinin (3B süzülen hero + cam dock) üzerine
beş renk paleti bindirilmiş hâlidir; kullanıcı bunu üç turda da beğenmedi.
Parlaklık şikayetinin sebebi "motor kötü" değil, **motorda birbirini ezen üç
kural**: karar değişiminde adım kuralının atlanması (tam sıçrama), ışık
ölçümünün 5 dk önbelleklenip "ikinci ölçüm" sanılması, ve öğrenilmiş tercihin
saat bazına düşerken ışığı yok sayması. Sıcak tonun "işlevsiz" olmasının sebebi
ise ölçülebilir: `warmth=35` rampada maviyi ancak **%9.8** kısıyor. Plan,
karar mantığını DOM'suz saf bir motora (`src/engine.ts`) taşıyıp histerez +
yumuşak geçiş + dış değişim koruması ekliyor, sıcak tonu gerçek CCT'ye kalibre
ediyor, arayüzü **4 şablon × 7 palet** iki eksenli bir token sistemine geçiriyor.

---

## 1. Bugünkü durum (ölçüm, tahmin değil)

| Ölçüm | Değer | Kaynak |
|---|---|---|
| `styles.css` | 2383 satır, tek dosya | `wc` |
| Palet bloğu dışında kalan ham hex | 32 satır | `src/styles.css:343-369`, `:2059-2067`, `:2147-2152`, `:2604-2605` |
| Tasarım paleti | 5 (`obsidyen/gece/orman/gul/fildisi`) | `src/catalog.ts:115-146` |
| Şablon ekseni | **yok** (geometri/tipografi/hareket ortak) | `src/styles.css:39-43` |
| Karar motoru | `orchestr.ts` 1821 satır, DOM'suz ama `invoke`'a bağlı | `src/orchestr.ts:1047-1336` |
| Tur aralığı | 60 sn (`WATCH_MS`), kamera önbelleği 5 dk | `src/main.ts:24,326-330`, `src/orchestr.ts:138` |
| Log | 500 satır, UTC damga, yazılan değeri göstermiyor | `~/.config/opencode/smart-screen.log` |
| Durum sayfası 1040×740 | ~270 px kaydırma (dock içeriği kesiyor) | v2.4.2 turu, `qa/measure-budget.mjs` |
| Sıcak ton, HDR | kapalı (gamma yolu açık) | `cargo test --lib -- --ignored live_hdr_list` |
| Sıcak ton, donanım Kelvin | **desteklenmiyor** (`destek=false`) | log `19:06:03Z`, `11:21:46Z` |

---

## 2. Teşhis A — parlaklık neden "durduk yere" değişiyor

Aşağıdaki bulgular canlı logdan (`smart-screen.log`, 26 Ekim, 500 satır) ve
koddan. **Log damgaları UTC**, kararlar yerel saatle: yerel = UTC+3. Bu
karışıklık başlı başına bir teşhis engeli (bkz. A7).

### A1. Karar değişiminde adım kuralı atlanıyor (tam sıçrama)
`src/orchestr.ts:1266-1285`: `pendingCount >= 2` olunca `target = desired + offset`
doğrudan `brightness_set` ile yazılıyor; `decide_brightness`/`next_brightness`
(yumuşak adım, `src-tauri/src/decide.rs:102-115`) **yalnız** `snapped` olmayan
turlarda çalışıyor. Yani "yumuşatma" tam olarak sahne değiştiği anda devre dışı.

### A2. "İkinci ölçüm" aslında aynı ölçüm (histerez yok)
`src/orchestr.ts:950`: kamera örneği 5 dk önbellekte; `fresh` yalnız
`odak|manuel|açılış`. 60 sn'lik `izle` turunda iki tur üst üste **aynı** örneği
okuyor, `pendingCount` 2 oluyor ve tek bir gürültülü kare sahneyi değiştiriyor.
`src-tauri/src/light.rs:21-38` eşikleri (30/80/150) keskin; histerez bandı yok.

### A3. Sahne hedefi ölçülen ışığı yok sayıyor
`src-tauri/src/decide.rs:32-45` sabit: 06-15 → 80, 16-17 → 60, 18-21 → 55, gece → 30.
Kamera yalnız iki uçta devreye giriyor (`src/orchestr.ts:1185-1195`):
`dark → 30`, `bright → 80`. Sonuç: (a) 06:00'da tek adımda **30 → 80**,
(b) 23:00'te masa lambası açıkken `bright` ölçümü geceyi ezip **80** yapıyor.

**Log kanıtı:** `17:11:26Z desired=75 applied=75` → `17:12:26Z desired=30`
(aynı dakika içinde 45 puanlık hedef düşüşü, yerel 20:11 → 20:12).

### A4. Öğrenilen parlaklık, öğrenildiği andaki **ham** değeri dayatıyor
`src/orchestr.ts:898-910` `brightness_get` ile o an ekranda ne varsa onu
öğreniyor; `panels.ts:1227-1235` ofset düğmeleri her basışta bunu çağırıyor ama
yeni ofset henüz uygulanmamış oluyor. Sonra `orchestr.ts:1241` hedefi
`learned[0] ± 10` aralığına kelepçeliyor. Yani kullanıcı ofseti iki kez
artırınca **eski** değer iki "gözlem" olup hedefi sabitliyor.

Gerçek veri (`~/.config/opencode/smart-screen-prefs.json`):
`hour 22 / normal-neutral → 12 gözlem, ortalama 41.7`, `hour 19 → 19 gözlem, 55`.

### A5. Saat bazına düşen öğrenme ışığı ve modu yok sayıyor → gece yarısı açık tema
`src-tauri/src/prefs.rs:181`: `or .or_else(|| store.prefs.iter().find(|p| p.hour == hour))`
— ışık anahtarını **ve modu** atıyor, o saatteki **ilk** kaydı döndürüyor.

**Log kanıtı:** `21:00:52Z` (yerel **00:00**) `theme=github/light`, `desired=30`.
Sebep: `prefs.json` içinde `{"hour":0,"light":"normal/neutral","mode":"light","name":"github"}`
ilk sırada. Sonuç: **açık tema + %30 parlaklık** → "çok kısık, okunmuyor".

### A6. Kilit/ekran kapanması WMI'den 0 okutuyor
`10:53–11:22Z` logu `applied=0` ↔ `applied=80` arasında her dakika gidip geliyor
(`lockapp.exe` dondurması sırasında). Kilit açılınca 0'dan 80'e 25'lik adımlarla
tırmanış = "durduk yere çok parlak". `brightness_get` (`src-tauri/src/brightness.rs:11-18`)
"ekran kapalı" ile "gerçekten 0" ayrımını yapmıyor.

### A7. Disk logu teşhis edilemez
`src/orchestr.ts:1265` `appliedNow = S.lastAppliedBright` ile başlıyor; `effFixed`
dalında hiç güncellenmiyor, `!snapped` dalında okunan değerle karışıyor.
Log'da `applied=64` / `desired=30` gibi **yazılmamış** değerler var
(`17:12:26Z`). Ayrıca UTC damga + yerel saat kararı karışıklığı.
Üç ayrı yerde ayrıştırılan log biçimi: `logger.rs:38`, `stats.rs:57`, `panels.ts`.

### A8. Bağlı profil ↔ öğrenilmiş tercih salınımı
`20:55–21:06Z` logu her dakika tema değiştiriyor:
`vesper` → `catppuccin-macchiato` (bağlı profil) → `vesper` → `github/light` →
`tokyonight` → `catppuccin-macchiato`. Her değişim `theme_set` → `cli.json`
atomik yazımı (`src-tauri/src/theme.rs:49-57`). 10 dakikada 10+ disk yazımı,
üstelik OpenCode açıkken tema zıplaması. Dwell/cooldown yok
(`src/orchestr.ts:1206-1220`).

### A9. Yanlış "tam ekran" tespiti
`applicationframehost.exe` ve `lockapp.exe` tam ekran sayılıp donduruyor
(`src/orchestr.ts:1103-1113`). 5 dakikalık gereksiz donmalar logda görünüyor.

### A10. Tur maliyeti
Her okuma/yazma yeni `powershell.exe` (`src-tauri/src/brightness.rs:33-35`,
`src-tauri/src/ps.rs:19-26`); tur başına 2 okuma + 1 yazım + `theme_set` +
`warmth` = 4-6 süreç, ~1-3 sn. `tick` kuyruğu (`orchestr.ts:1020-1039`) bunu
maskeliyor ama sıralama yarışını çözmüyor.

### A11. Yazım doğrulanmıyor
`set_brightness` `Ok(())` dönüyor; WMI `Timeout=1` ile sessizce kırpabilir,
`parse_brightness` (`brightness.rs:38-45`) çıktıdaki **ilk** ≤100 sayıyı alıyor.
Geri okuma + tolerans kontrolü yok → "yazdım ama olmadı" sessiz kalıyor.

**Kural ihlali notu:** AGENTS "kilit açıkken ve aynı kararda 2 üst üste ölçüm
olmadan değişiklik yapma" diyor; A2 bu kuralı **biçimsel** olarak uyguluyor,
**anlamlı** uygulamıyor. Plan bunu gerçek iki bağımsız ölçüme çeviriyor.

---

## 3. Teşhis B — sıcak ton neden "işlevsiz"

### B1. Ölçek çok zayıf (asıl sebep)
`src-tauri/src/gamma.rs:44-47`: `FULL_BLUE=0.72`, `FULL_GREEN=0.88`,
`FULL_RED=1.0` — **yüzde 100'de bile** mavi ancak %28 kısılıyor.
Otomatik kip en fazla 45'e çıkıyor (`decide.rs:87`) ve `orchestr.ts:610`
`Math.min(raw, S.warmPercent)` ile varsayılan **35**'te kesiliyor.

| `warmth` | mavi çarpanı | yeşil | yaklaşık CCT |
|---|---|---|---|
| 0 | 1.000 | 1.000 | 6500 K |
| 35 (varsayılan) | 0.902 | 0.958 | ~6000 K |
| 45 (auto tavan) | 0.874 | 0.946 | ~5900 K |
| 60 (slider tavanı) | 0.832 | 0.928 | ~5700 K |
| 100 | 0.720 | 0.880 | ~4900 K |

Gerçek gece ışığı 2700-3400 K'ya iner (mavi ≈ 0.45-0.55). Yani ürünün "en sıcak"
ayarı, rakip ürünlerin **en hafif** ayarından zayıf. "İşlevsiz" hissi doğru bir
algı, yazılım hatası değil **kalibrasyon hatası**.

### B2. `warmPercent` iki iş yapıyor
Aynı değer hem `fixed` kipin şiddeti (`orchestr.ts:629`) hem `auto` kipin
**tavanı** (`:610`). Kullanıcı sabit kipte 35 bırakınca otomatik kip de 35'te
kalıyor; arayüzde bu yazmıyor.

### B3. Donanım yolu bu makinede ölü
`monitor.rs` DDC/CI renk sıcaklığı `destek=false` (log `19:06:03Z`), HDR kapalı
ama `hdr` kapısı `gamma.rs:174-184` gereği HDR açık olsaydı cihaz **sessizce**
elenecek ve hata bile dönmeyecekti (`attempted=0 → Ok`).

### B4. Gereksiz yazım
`orchestr.ts:1324` her turda (60 sn) `applyWarmth` → `capture_original_for` +
`SetDeviceGammaRamp`. Değer değişmese de sürücüye yazılıyor; flicker riski + IO.

### B5. Ölçüm yok
Uygulamadan sonra `GetDeviceGammaRamp` ile geri okunmuyor; kullanıcı "olmadı"
diyene kadar kimse fark etmiyor.

---

## 4. Hedef mimari

```
src/
  engine.ts        YENİ  saf karar motoru (DOM yok, invoke yok)
  engine.test.ts   YENİ  node --test (Node 26 → tip sıyırma yerleşik)
  orchestr.ts      incelir: invoke + zamanlayıcı + kuyruk; karar engine'de
  panels.ts        render; şablon/palet seçimi burada kablolanır
  catalog.ts       TEMPLATES + PALETTES kataloğu (tek kaynak)
  styles/
    tokens.css     YENİ  primitive + semantik + palet blokları
    base.css       YENİ  reset, tipografi, odak, kaydırma
    components.css YENİ  hero/dock/kart/kontrol (yalnız token tüketir)
    pages.css      YENİ  dört sayfa yerleşimi
    templates.css  YENİ  [data-template] geometri/tipografi/hareket
index.html        5 <link>, yeni id'ler + SÖZLEŞME güncellemesi
src-tauri/src/
  decide.rs        histerez + CCT tabanlı sıcak ton + gece penceresi
  gamma.rs         CCT kalibrasyonu, geri okuma, yazım sıklığı
  brightness.rs    "ekran kapalı" ayrımı, yazım doğrulama
  logger.rs        tek biçim: local saat + read/target/written/verified
  prefs.rs         yaş + mod + ışık duyarlı geri düşüş
```

### 4.1 Karar motoru (`src/engine.ts`)

Saf fonksiyonlar; girdi `Reading`, çıktı `Decision`. Test edilebilir, saat/ışık
enjekte edilir.

```ts
export interface Reading {
  at: number; hour: number; minute: number;
  lum: number | null; level: LightLevel; tone: Tone;   // ham
  current: number | null;                               // WMI okuması
  exe: string | null; fullscreen: boolean; locked: boolean;
  lastWritten: { value: number; at: number } | null;
}
export interface Decision {
  brightness: number | null;   // null = yazma
  theme: string; mode: string;
  warmth: number;              // 0-100, kalibre
  reason: string;              // log/UI için tek kelimelik gerekçe
}
export function decide(r: Reading, s: Settings): Decision
```

Kurallar (hepsi test edilecek):

1. **Histerezli ışık seviyesi.** Eşikler çift yönlü: `dark` < 34, `dark`'tan
   çıkış > 42; `bright` > 145, çıkış < 132. Aynı kare iki farklı seviyeye
   düşemez. Ton için son 3 örneğin **medyanı**; ton değişimi için en az 3
   bağımsız örnek.
2. **Gerçek iki ölçüm.** `pendingCount` yalnız `reading.at` farklı ve en az
   45 sn arayla artar; önbellekten gelen örnek sayılmaz.
3. **Sahne = saat tabanı × ışık düzeltmesi, sürekli eğri.** Basamak yok:
   `desired = clamp(base(hour) + lightAdj(level) , 25, 95)`, `base` 24 saat
   boyunca doğrusal (06:00'da 80'e 20 dk'da çıkar).
4. **Yumuşak geçiş her zaman.** `snapped` yolu kaldırılır; hedef değişimi
   `max 8 puan/tur`, `toplam geçiş ≥ 4 tur`. `decision.brightness` hedef değil
   **bu turun değeri**.
5. **Dış değişim koruması.** `|current − lastWritten| > 6` ve son yazımdan
   < 90 sn geçmişse kullanıcı/başka yazılım müdahale etti: 15 dk **saygı
   penceresi** (yazma yok, sadece log). Kilit/ekran kapalı `current===0` ise
   tur tamamen atlanır.
6. **Okunaksız kombinasyon kapısı.** `mode==="light"` ve hedef < 55 → hedef 60'a
   çekilir **veya** sahne temasına dönülür (kullanıcı tercihi tema ise ışık
   yükseltilir, tercih değilse tema düşer). `mode==="dark"` ve hedef > 80 → 80.
   Kontrast modülü zaten `text.base/background.base` ölçüyor; burada mod bayrağı
   yeterli.
7. **Öğrenme ±10 kelepçesi kaldırılır.** Öğrenilen değer **mutlak parlaklık**
   değil, hedefe göre **delta** olarak saklanır (`-20..+20`), en az 3 farklı
   günde gözlem şartı. Tek oturumdaki 5 tıklama öğrenme saymaz.
8. **Dwell.** Tema değişimi için: son değişimden ≥ 10 dk, aynı karar için ≥ 3
   bağımsız tur, ve `theme_set` yalnız `name|mode` gerçekten farklıysa.
   Bağlı profil ↔ öğrenilmiş tercih arasında 15 dk cooldown.

Beklenen kazanç: aynı 24 saatte yazılan parlaklık serisinde
**`max |Δ| ≤ 8`** ve **30 dk içinde yön değişimi ≤ 2** (bugün 50-80 puanlık
sıçramalar var). Bunlar testlere assert olarak girecek — şikayet regresyon testine
dönüşür.

### 4.2 Sıcak ton

1. **CCT kalibrasyonu.** `warmth 0..100` → Kelvin `6500 → 2700` eşlemesi
   (`kelvin = 6500 - 38 * warmth`). Rampa, hedef Kelvin'in siyah cisim
   spektrumundan türetilen RGB çarpanlarıyla üretilir (2700 K'da mavi ≈ 0.55).
   Sürücü sınırı (`MAX_DEVIATION=32768`, `gamma.rs:42`) için düşük girişlerde
   hafif S eğrisi; monotonluk ve sınır testleri korunur.
2. **İki eksen ayrılır.** `otomatik eğri` (saat × ışık, 0-100) ve kullanıcı
   `şiddet` (0-100, varsayılan 70) çarpımsal birleşir; `warmPercent` artık tavan
   değil şiddet. `fixed` kip doğrudan şiddeti yazar.
3. **Gece profili.** 19:00-23:00 arası görünür sıcaklık (mavi ~%20 kısık),
   23:00-06:00 tam (2700-3000 K). Gündüz 0.
4. **Yazım disiplini.** Yalnız `|yeni − son| ≥ 3` veya monitör/oturum değişiminde
   yaz; her turda yazma yok.
5. **Geri okuma.** Yazımdan sonra `GetDeviceGammaRamp` ile ölç, mavi tepe farkını
   `smart-screen.log`'a yaz (`warmth=70 blue=-%21`). Fark < %2 ise "sürücü
   reddetti" uyarısı.
6. **Görünürlük.** HDR nedeniyle atlanan cihaz varsa panelde yaz:
   "HDR açık — yazılımsal sıcak ton uygulanmıyor". `warmKelvinHw` durumu
   (`orchestr.ts:651-672`) zaten var, arayüzde görünmüyor.

### 4.3 Tasarım sistemi

**İki bağımsız eksen**, tek kaynak `src/catalog.ts`:

```ts
export interface Template { id: string; label: string; note: string; }
export const TEMPLATES = ["sahne", "dergi", "konsol", "bento"];
export interface Palette { id: string; label: string; mode: "dark"|"light";
  swatch: { bg: string; surface: string; text: string; accent: string }; }
export const PALETTES = [obsidyen, gece, orman, gul, fildisi, kagit, grafit];
```

- `<html data-template="dergi" data-theme="orman">` — `data-theme` **korunur**
  (kayıtlı ayar + QA uyumu), `data-template` yeni.
- **Değişken sözleşmesi korunur**: `--bg-0..2`, `--surface-1..3`, `--input`,
  `--border-*`, `--text-1..4`, `--accent*`, `--on-accent`, `--success/warning/danger`,
  `--r-*`, `--shadow-1/2`, `--ease-out`, `--dur-*`, `--font-*`, `--sp-1..6`,
  `--hero-fs`, `--track`, `--mx/--my`. `toast.css`, `drawChart`, `[data-accent]`
  bunlara bağlı (`styles.css:20-26`).
- **Yeni token'lar**: `--line-1/2`, `--panel-pad`, `--panel-gap`, `--hero-num`,
  `--hero-h`, `--dock-h`, `--dock-style`, `--nav`, `--curve-a/b/c`, `--glow-a/b`,
  `--grain` (0-1), `--card-r`, `--label-track`, `--num-font`.

**Katman kuralı:** bileşen CSS'i **hiç hex içermez**; renk yalnız palet
bloğundan gelir. `tools/check-tokens.mjs` bunu ve kontrast oranlarını ölçer
(node, tarayıcısız). Bugünkü 32 ham hex buraya taşınır
(`--curve-a/b/c`, `--glow-a/b`).

**Craft kuralları (yormayan "landing page" hissi):**
- Her ekranda **tek** kahraman öğe; gerisi ona göre 2-3 basamak küçük.
- En fazla **3 derinlik katmanı**; blur ≤ 40px; gölge yerine hairline + katman farkı.
- Sürekli animasyon yok; 3B paralaks yalnız `sahne` şablonunda, 30 fps, fare
  üstündeyken (`main.ts:340-368` aynen kalır).
- Her bileşen en fazla **bir** vurgu rengi; ikinci vurgu = hata.
- Tipografi 5 basamak (display / başlık / gövde / etiket / mono sayı), 3 ağırlık.
- 8 px ızgara; yarıçaplar şablonun karakteri (sahne 20, dergi 2, konsol 4, bento 24).

---

## 5. Dört şablon (1040×740 eskizleri)

### 5.1 `sahne` — bugünkü dilin rafine hâli
```
┌──────────────────────────────────────────────┐
│ ışık · 20 dk · Otomatik çalışıyor     2.5.0  │
├──────────────────────────────────────────────┤
│   ╭──────────────────────────────────────╮   │ hero 200px
│   │ ŞU AN  %42              [eğri]       │   │
│   │ Ulaşılmak istenen %30 · 21:00         │   │
│   ╰──────────────────────────────────────╯   │
│   ╭──────────────╮ ╭──────────────╮          │
│   │ Monitörler   │ │ Işık         │          │
│   ╰──────────────╯ ╰──────────────╯          │
│          ( Durum  Profiller  Geçmiş  Ayarlar )│
└──────────────────────────────────────────────┘
```
Cam yalnız hero + dock. 3B paralaks. Varsayılan **değil** (kullanıcı üç kez
reddetti; "maksimum ifade" seçeneği olarak kalır).

### 5.2 `dergi` — editoryal, kâğıt hissi
```
┌──────────────────────────────────────────────┐
│ SMART-SCREEN          Cuma 27 Ekim    2.5.0  │ masthead 56px
├──────────────────────────────────────────────┤
│ ŞU AN                                        │
│ 42 %   ← 72px serif display                  │ headline 132px
│ ─────────────────────────────────────────────│ 2px kural
│ Hedef %30 · 21:00'da değişecek               │
│                                              │
│ Bugün               │ Işık                   │ 2 sütun
│ ▁▂▃▅▆▇  eğri        │ Loş · nötr             │
│                     │ 2 monitör · dahili+DDC │
├──────────────────────────────────────────────┤
│ Durum   Profiller   Geçmiş   Ayarlar         │ üst hizalı ince nav
└──────────────────────────────────────────────┘
```
Kart yok, gölge yok, yarıçap 2px, serif başlık (Georgia/Cambria yığını),
hairline kurallar. `--grain: 0.03` opsiyonel. En "premium dergi" duruşu.

### 5.3 `konsol` — enstrüman paneli
```
┌──────────────────────────────────────────────┐
│ ● SS │ PARLAKLIK 42 │ HEDEF 30 │ IŞIK DIM    │ readout 72px
├──────────────────────────────────────────────┤
│ 00 ─── 06 ─── 12 ─── 18 ─── 24   eğri        │
│ ┌────────────┬─────────────┬───────────────┐ │
│ │ MONITÖRLER │ ÖĞRENİLEN   │ OLAY          │ │ 3 sütun
│ └────────────┴─────────────┴───────────────┘ │
│ Durum · Profiller · Geçmiş · Ayarlar         │
└──────────────────────────────────────────────┘
```
Mono sayılar (Cascadia), 1px ızgara çizgileri, büyük harf + 0.08em tracking
etiketler, LED noktaları. Motion ≈ 0. Yoğun bilgi, en çok "alet" hissi.

### 5.4 `bento` — mozaik (önerilen varsayılan)
```
┌──────────────────────────────────────────────┐
│ ╭───────────────╮ ╭────────────────────────╮ │
│ │  %42          │ │ Işık · loş             │ │
│ │  parlaklık    │ │ Tema · ss-dusk         │ │
│ ╰───────────────╯ ╰────────────────────────╯ │
│ ╭───────────────╮ ╭────────────────────────╮ │
│ │ Hedef %30     │ │ Monitörler · 2         │ │
│ │ 21:00         │ │ dahili · Dell U2415    │ │
│ ╰───────────────╯ ╰────────────────────────╯ │
│          ( Durum  Profiller  Geçmiş  Ayarlar )│
└──────────────────────────────────────────────┘
```
Asimetrik 4 kutu, her kutu tek gerçek, yarıçap 24, dolu yüzey, dock. 740 px'te
kaydırma yok; bilgi hiyerarşisi en net olan şablon. **Varsayılan önerisi bu.**

Her şablon için teslim: hero/masthead/readout bileşeni, kart geometrisi, nav
biçimi, tipografi ölçeği, 5 kırılım (1040×740, 1000×720, 800×600, 760×600,
1440×900), boş durumlar, `prefers-contrast`, `forced-colors`.

---

## 6. Yedi palet

| id | mod | zemin | yüzey | metin | vurgu | not |
|---|---|---|---|---|---|---|
| `obsidyen` | dark | #0a0908 | #1a1714 | #f5f1ea | #d8b98a | mevcut |
| `gece` | dark | #07090d | #121821 | #eef3fa | #a9c6e0 | mevcut |
| `orman` | dark | #070a08 | #121a14 | #eff5ee | #a8c8a4 | mevcut |
| `gul` | dark | #0b0709 | #1b1319 | #f9eff4 | #e0b0c4 | mevcut |
| `fildisi` | light | #f6f2ea | #ffffff | #241c12 | #a8763c | mevcut |
| `kagit` | light | #faf8f4 | #ffffff | #1c1a17 | #b4553a | **yeni** nötr sıcak |
| `grafit` | dark | #14161a | #1d2026 | #e6e9ee | #6ea8d8 | **yeni** nötr soğuk |

Ek olarak her palet üç rampa tanımlar: `--glow-a/b` (hero ışıması),
`--curve-a/b/c` (eğri gradyanı), `--track`. Bugün bu 9 renk `styles.css:2059-2067`
ve `:2147-2152`'de iki palete sabitlenmiş; yeni paletlerde bugün **çalışmıyor**
(obsidyen gradyanı fildişinde de görünüyor) — sistem bunu da düzeltir.

**Görünüm otomatiği:** "Işığa göre" seçilirse palet üçlüsü devreye girer ve
uygulamanın kendi karar motoruyla **aynı** saat/ışık sinyalini kullanır:
gündüz → açık palet (`kagit`/`fildisi`), akşam → `obsidyen`, gece → `gece`.
Üçlü kullanıcı tarafından değiştirilebilir. Bu, ürünün "kendi kendini
ayarlayan" kimliğini arayüze taşır; ek maliyeti düşük (aynı `decide` çıktısı).

---

## 7. Ekran bazlı yerleşim ve dikey bütçe

Hedef: **1040×740'ta Durum sayfası kaydırmasız** (bugün ~270 px kaydırıyor).

| Şablon | üst şerit | kahraman | ikincil | dock | toplam |
|---|---|---|---|---|---|
| sahne | 44 | 200 | 2×150 | 64+24 | 690 |
| dergi | 56 | 132 | 2×160 | 44 | 690 |
| konsol | 72 | 96 | 3×150 | 44 | 690 |
| bento | 44 | 2×170 | 2×150 | 64+24 | 700 |

Sayfa yüksekliği = 740 − (üst şerit + dock + 8 px pay). Uygulama detayları:
- Hero eğrisi 96 → 72 px, `max-height:660` bloğunda 56 → 40.
- İkincil kartlarda "ayrıntı" satırları `<details>` benzeri açılır kutuya.
- 980 px altında tek sütun; 760×600'de kaydırma ≤ 120 px (kabul).
- Her şablon için `qa/measure-budget.mjs` assert: `scrollHeight - clientHeight`.

---

## 8. QA ve test planı

1. **`src/engine.test.ts` — `node --test`** (Node 26 tip sıyırmayı yerleşik
   yapar, yeni bağımlılık yok). En az:
   - histerez: 33→dark, 35→dark kalır, 43→dim; tekrarlı gürültü serisi
   - iki bağımsız ölçüm: aynı `at` iki kez sayılmaz (A2 regresyonu)
   - 24 saat × 4 ışık taraması: `max |Δ| ≤ 8`, yön değişimi ≤ 2 / 30 dk
   - dış değişim: `current=64, lastWritten=30` → yazma yok
   - kilit/0 okuma → tur atlanır
   - mod kapısı: `light` + hedef 30 → 60; `dark` + hedef 90 → 80
   - öğrenme: 3 gün kuralı, delta ±20 sınırı, tek oturum 5 tık = öğrenme yok
2. **`decide.rs` birim testleri**: CCT eşlemesi monoton, 2700 K'da mavi ≤ 0.60,
   `within_driver_limits` tüm `warmth 0..100` için doğru, `warmth_auto` eğrisi
   sürekli (gece yarısı sıçraması yok).
3. **`prefs.rs`**: saat bazına düşüş mod/ışık duyarlı; 30 günden eski kayıt
   ağırlığı düşer; gece yarısı `light` tema dönmez (A5 regresyonu, gerçek
   `prefs.json` kopyasıyla).
4. **`qa/run.mjs`**: mevcut 21 senaryo + şablon/palet matrisi (4×7 = 28 seçim,
   her biri `data-template`/`data-theme` doğrulaması) + yeni id'lerin sözleşme
   kontrolü.
5. **`qa/theme-shots.mjs`**: 4 şablon × 7 palet × (Durum, Ayarlar) = 56 kare;
   taşma/sızıntı/ölü düğme assert'i. Kareler **gözle** incelenir (HANDOFF kuralı).
6. **`qa/measure-budget.mjs`**: her şablon için 5 boyut, kaydırma bütçesi.
7. **`tools/check-tokens.mjs`** (yeni): bileşen CSS'inde hex yasak; her palet
   için `text-1/bg-0 ≥ 7`, `text-2/bg-0 ≥ 4.5`, `accent/bg-0 ≥ 3`, `on-accent/accent ≥ 4.5`.
8. **Canlı doğrulama**: kurulu exe ile 24 saat log; kabul: sıçrama yok, tema
   dwell ≥ 10 dk, sıcak ton geri okumada mavi ≥ %15 (gece).
9. **Performans**: tur süresi ≤ 700 ms (bugün 1-3 sn), `brightness_get` çağrısı
   tur başına ≤ 1.

---

## 9. Sürüm sırası

### v2.5.0 — "güven" (davranış, arayüz değişmez)
- `engine.ts` + testler, `orchestr.ts` inceltme
- histerez, yumuşak geçiş, dış değişim koruması, kilit/0 koruması
- öğrenme modeli (delta + 3 gün) ve `prefs.rs` geri düşüş düzeltmesi
- sıcak ton CCT kalibrasyonu + geri okuma + yazım disiplini
- log biçimi tekilleştirme (yerel saat + read/target/written/verified)
- `applicationframehost`/`lockapp` dondurma düzeltmesi
- **Kabul:** 24 saat canlı log, sıçrama yok; eski/yeni yan yana grafik.

### v2.6.0 — "tasarım sistemi"
- `styles/` 5 dosyaya bölünür, token katmanı, `check-tokens.mjs`
- `sahne` + `dergi` şablonları, 7 palet, "ışığa göre görünüm"
- Ayarlar > Görünüm: şablon kartları (SVG iskelet önizleme) + palet şeritleri
- Durum sayfası 740 px bütçesi
- **Kabul:** 56 kare gözle onay, tüm şablonlarda kaydırma 0 (1040×740).

### v2.7.0 — "tam"
- `konsol` + `bento`, varsayılan `bento`
- tray flyout'un yeni dile taşınması (ertelenen madde)
- Geçmiş/Profiller/Ayarlar sayfalarının şablon duyarlı yerleşimi
- **Kabul:** 4 şablon × 7 palet × 5 boyut matrisi tam yeşil.

### v3.0.0 — "derinlik" (opsiyonel)
- gerçek WebGL/gölgelendirici sahne (yalnız `sahne`)
- monitör-başına DDC 0x0C yazma (Pro), gece ışığı entegrasyonu
- `identifier` göçü (veri kaybı riski → ayrı, onaylı tur)

---

## 10. Riskler ve geri alma

| Risk | Etki | Önlem |
|---|---|---|
| Şablon sayısı bakım yükü | 4×7 CSS kombinasyonu | Token zorunluluğu + `check-tokens.mjs`; şablonlar yalnız geometri ezer |
| 740 px bütçesi tutmaz | kullanıcı yine "berbat" der | `measure-budget.mjs` assert + 4 şablon eskizi önceden onay |
| `data-theme` adları değişir | kayıtlı ayar/QA kırılır | Palet id'leri sabit; yalnız `data-template` eklenir |
| Karar motoru yeniden yazımı | regresyon | Saf motor + 24 saat simülasyon testi; eski `orchestr` bir sürüm yedek dalda |
| Sıcak ton güçlenince "fazla sarı" | yeni şikayet | Varsayılan şiddet 70, slider 0-100, gündüz 0; geri okuma ile ölçülü |
| Gamma geri yükleme başarısız | ekran sarı kalır | Mevcut `restore_original` + disk kaydı korunur; kurtarma testi |
| `cli.json` çok yazımı | OpenCode oturumu zorlanır | Dwell + cooldown + aynı değeri yazmama |

---

## 11. Ölçülebilir kabul kriterleri (tek liste)

1. 24 saatlik logda `|Δ brightness| > 12` **sıfır**; `|Δ| > 8` en fazla 2.
2. Aynı 30 dakikada yön değişimi ≤ 2.
3. `theme_set` çağrısı günde ≤ 20 (bugün 10 dakikada 10).
4. Gece 00:00'da açık tema (light) **hiç** uygulanmaz (A5).
5. `warmth=70` gece: mavi tepe farkı ≥ %18, geri okuma doğrular.
6. Durum sayfası 1040×740'ta kaydırmasız; 4 şablonun hepsinde.
7. Bileşen CSS'inde ham hex 0; palet kontrastları testte geçer.
8. `cargo test` + `node --test` + `qa/run.mjs` + matris kareleri yeşil,
   kareler gözle onaylı, kurulu exe açılıp görülmüş.

---

## 12. Karar bekleyen üç nokta

1. **Sıra:** v2.5 (stabilite) → v2.6/v2.7 (tasarım) mi, yoksa tasarım önce mi?
   Öneri: stabilite önce — "durduk yere kısık/parlak" güveni tasarımdan önce yıkar.
2. **Varsayılan şablon:** `bento` (öneri) mi, `dergi` mi, `sahne` (mevcut) mi?
3. **Şablon sayısı:** dördü de şimdi mi, önce iki (`sahne` + `bento`) mi?
   Öneri: v2.6'da iki, v2.7'de dört — 56 kareyi tek turda gözle denetlemek zor.
