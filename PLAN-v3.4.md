# PLAN v3.4 — sarılık otomasyonu, akıllı otomasyon, daha çok uygulama

Kullanıcı isteği (3 parça): (1) ekran sarılığı otomasyonu daha düzgün olsun,
(2) genel otomasyona bak — daha iyi sistem mümkün mü, (3) uygulama desteğini
artır + var olanları güçlendir + güzel menüler.

## Bulgular (koddan, tahmin değil)

| # | Sorun | Kanıt |
|---|---|---|
| 1 | Eğri **doğrusal** — her çapada görünür "kırılma" var | `decide.rs:196` `warmth_auto`, `decide.rs:136` `base_brightness` |
| 2 | Kamera **tonu** (sıcak/nötr/soğuk) ölçülüyor ama sarılıkta **kullanılmıyor** | `light.rs:31` tone üretiyor, `orchestr.ts:1415` medyanını tutuyor, `warmth_auto` yalnız `light_level` alıyor |
| 3 | Otomatik değişim **hız sınırı yok** — ton/ölçüm değişince 22 puan birden zıplıyor | `orchestr.ts:843` yalnız 3 puan ölü bölge var, adım sınırı yok |
| 4 | Arayüz "%70"ün ne demek olduğunu söylemiyor (çarpan, tavan değil) | `orchestr.ts:836` `auto * warmPercent / 100`; etiket "otomatikte üst sınır" |
| 5 | Kullanıcı **şu an ne uygulanıyor** göremiyor; eğrinin neresinde olduğunu bilmiyor | `#day-strip` yalnız dikey çizgi, değer yok |
| 6 | Tepsi menüsü 5 düz öğe; durum/ölçüm/sarılık erişimi yok | `lib.rs:773-780` |
| 7 | JetBrains ailesi (IntelliJ/PyCharm/WebStorm…) desteklenmiyor | `adapters/mod.rs` 5 adaptör |

## Sözleşme C1 — `decide.rs` (sarılık modeli)

```rust
pub fn warmth_auto(hour: u8, minute: u8, light_level: &str, tone: &str) -> u8
pub fn warmth_curve(step_minutes: u8) -> Vec<u8>   // 0..=1440, kamera yok varsayımı
```

**Model (yorumda gerekçesiyle yazılacak):**
1. `base` = çapa noktaları arasında **smoothstep** (3t²−2t³) ara değer. Çapalar
   AYNI kalır (00:00 88 … 08:00 0 … 23:00 88). Kırılma yok, geçiş organik.
2. `measured` = ölçülen ışık seviyesinin hedefi:
   `dark → 80`, `dim → 52`, `normal → 18`, `bright → 0`, diğer/`unknown` → `None`.
3. `core` = kamera yoksa `base` (bugünkü davranış); varsa
   `0.55 * base + 0.45 * measured` — kamera artık **toplamsal kaydırma** değil,
   ağırlıklı ortak. Gerekçe: loş oda gün ortasında da sarılık ister, aydınlık
   oda gece de istemez; toplamsal model bunu ifade edemiyordu.
4. `tone_adj` = `warm → −14`, `cool → +12`, diğer → `0`. Gerekçe: tungsten
   ışıklı oda zaten sıcak; ekranı daha da sarartmak "portakal çorbası" yapar.
   Floresan/kuzey ışığı soğuk; ısıtmak melatonin için doğru.
5. Sonuç `clamp(0, 100)`.

`base_brightness` de aynı `smoothstep` yardımcısını kullanır (çapalar aynı).
`pub fn smoothstep(t: f64) -> f64` ayrı ve testli olsun.

**Tauri komutları (`lib.rs`):**
```rust
#[tauri::command] async fn warmth_auto(hour: u8, minute: u8, light_level: String, tone: Option<String>) -> Result<u8, String>
#[tauri::command] async fn warmth_curve(step: Option<u8>) -> Vec<u8>   // varsayılan 15
```
`tone` verilmezse `"neutral"`. Mevcut çağrı biçimi bozulmaz.

**Testler (en az 10):** smoothstep uçları; eğrinin monotonluğu gece/gündüz
bölgelerinde; `dark` ölçümün gün ortasında sarılığı artırdığı; `bright` ölçümün
gece sarılığını azalttığı; `warm` tonun `neutral`'den **düşük**, `cool`'un
**yüksek** sonuç verdiği; `unknown` = eski toplamsal davranış (base) ile aynı;
0 ve 100 kelepçesi; `warmth_curve` uzunluğu ve uç değerleri.

## Sözleşme C2 — frontend (sarılık)

- `autoWarmth()` çağrısına `tone: S.camTone` eklenir.
- **Hız sınırı (yalnız otomatik kipte):** hedef ile `S.lastWarmApplied`
  arasındaki fark tur başına en fazla **6 puan** kapanır. Elle seçim (slider,
  Kelvin, hazır çipler) anında uygulanır — kullanıcı niyeti bekletilmez.
  Sabit kipte de anında.
- **`#warm-now`**: `"şu an %34 · 4300 K · otomatik"` (sabit kipte "sabit",
  kapalıyken "kapalı"). Her render'da tazelenir.
- **`#warm-ceiling`**: `"gece en fazla %62 · şiddet %70"` — formülü
  `round(88 * warmPercent / 100)`; kullanıcı "%70 ne demek" sorusunun cevabını
  görür. `warmPercent === 100` iken `"tam şiddet"` yazar.
- **`#warm-curve`** (yeni SVG, `viewBox="0 0 96 28"`):
  `#wc-path` (eğri, `warmth_curve(15)` verisinden — **tek doğruluk kaynağı
  backend**, TS'te eğri kopyası YOK), `#wc-cap` (tavan çizgisi, kesikli),
  `#wc-now` (şu anki nokta, `cx/cy`). Saat etiketleri `#wc-ticks`.
- **Sözleşme tablosu**: yeni her id (`warm-now`, `warm-ceiling`, `warm-curve`,
  `wc-path`, `wc-cap`, `wc-now`, `wc-ticks`) `index.html` başındaki tabloya.
- **Uygulama temaları kartı gruplansın**: `group` alanına göre başlıklar
  — `"terminal"` → "Terminaller", `"editor"` → "Editörler", `"notes"` → "Notlar".
  Grup başlığı `.app-group` sınıfı, sıra terminal → editor → notes.
- **Tepsi eylemleri** (C4 için, bu birim yazar):
  `main.ts` `ss:action` dinleyicisine ekle:
  - `"measure"` (zaten var)
  - `"pause-30m"` → `O.pauseFor(30)` (yeni; `orchestr.ts`'te `pauseFor(minutes)`)
  - `"resume"` → `O.resume()`
  - `"lock-toggle"` → `O.toggleLock()`
  - `"warm-mode"` (`value` yok, `arg` string) → `O.setWarmMode(arg)`
  - `"warm-step"` (`value`: +5/−5) → `setWarmPercent(S.warmPercent + value)`
  - `"theme-cycle"` → sonraki palet (mevcut `cycleDesignTheme` varsa onu kullan)

## Sözleşme C3 — adaptörler

Yeni dosyalar: `src-tauri/src/appearance/xmlopt.rs`,
`src-tauri/src/appearance/adapters/jetbrains.rs`.

**`xmlopt.rs`** — dar kapsamlı XML seçenek düzenleyici (JSONC'nin XML karşılığı):
```rust
pub fn get_attr(text: &str, component: &str, option: &str) -> Option<String>;
pub fn set_attr(text: &str, component: &str, option: &str, value: &str) -> Option<String>;
pub fn is_well_formed(text: &str) -> bool;   // basit denge denetimi: <tag> </tag> sayımı
```
Kural: yalnız `<component name="X">` bloğu içindeki `<option name="Y" value="Z"/>`
satırında **value** değişir. Blok/öğe bulunamazsa `None` → yazan taraf **yazmaz**.
`set_attr` sonrası `is_well_formed` doğrulanır; bozulursa yazılmaz.
Testler: fixture XML, yorum/`<!DOCTYPE>` içeren XML, bulunamayan bileşen,
idempotentlik (aynı değer → aynı metin).

**`jetbrains.rs`** — id `"jetbrains"`, name `"JetBrains IDE"`, group `"editor"`, live `false`
- Ürün klasörleri: `%APPDATA%\JetBrains\` altında `options\laf.xml` içeren EN YENİ
  klasör (sürüm eki olabilir: `IntelliJIdea2024.3`, `PyCharm2025.1`).
  Birden fazla ürün varsa **hepsine** yaz (Obsidian'daki kasalar gibi).
- `xmlopt` ile `component = "LafManager"`, `option = "theme"`; değer
  `"Dark"` / `"Light"` (IntelliJ'in kendi değerleri).
- Klasör/`laf.xml` yoksa `locate()` `%APPDATA%\JetBrains` yolunu döndürür
  (kurulu mu bilgisi), `read`/`write` çağrılmaz.
- `live = false` → kart "yeniden başlat" rozeti gösterir (doğru bilgi).

**Mevcut adaptör güçlendirme (hepsi aynı birimde):**
- **windows_terminal**: adaylar listesi — Store `WindowsTerminal`, Store
  `WindowsTerminalPreview` (`...TerminalPreview_8wekyb3d8bbwe`), klasör kurulumu
  `%LOCALAPPDATA%\Microsoft\Windows Terminal\settings.json`. İlk var olan.
- **vscode**: adaylara `VSCodium - Insiders`, `Positron`, `Trae` ekle.
  **Hatırlama düzeltmesi:** ilk yazmada, kullanıcının o anki temasını
  **terk edilen** modun tercih alanına yaz (dark'a yazıyorsak → `preferredLightColorTheme`,
  light'a yazıyorsak → `preferredDarkColorTheme`). Böylece her iki yönde de
  kullanıcının kendi teması korunur.
- **zed**: adaylara `Zed Preview` (`%APPDATA%\Zed\settings.json` aynı; preview
  ayrı klasör kullanıyorsa `Zed Preview` dene, yoksa çalışanı kullan).
- **sublime**: adaylara `Sublime Text 3` ekle.
- Hepsi için: değişmezse `Ok(false)`; bozuk dosyaya yazma; yorum korunur.

**`adapters/mod.rs`**: `jetbrains` modülü + `all()`'a ekle (sıra: terminal,
vscode, jetbrains, sublime, zed, obsidian).

## Sözleşme C4 — tepsi menüsü (dalga 2)

`lib.rs` menüsü yeniden kurulur (mevcut `TrayChecks` + `ss:state` dinleyicisi
korunur, genişletilir):

```
▸ smart-screen · %28 · ss-dusk        (devre dışı başlık, ss:state ile tazelenir)
───
Yeniden ölç                            → ss:action measure
Sarılık            ▸ Otomatik / Sabit / Kapalı      (CheckMenuItem, radyo gibi)
                     Artır (+5) / Azalt (−5)
Duraklat           ▸ 30 dakika / 1 saat / Bugün kapat / Devam et
Kilitle                                (CheckMenuItem)
───
Ayarlar                                → show_main
Çıkış                                  → gamma restore + exit
```

- `TrayChecks` alanları: `pause`, `dayoff`, `lock`, `warm_auto`, `warm_fixed`,
  `warm_off`, `header`.
- `ss:state` yayınından işaretler + başlık metni tazelenir (mevcut desen).
  Yayında `warmMode` alanı **yoksa** (frontend henüz göndermiyorsa) işaretlere
  dokunulmaz — yalan söylemesin.
  → **C2 bu alanı `ss:state`'e ekler:** `warmMode: S.warmMode`, `warmPercent`.
- Menü eylemleri yalnız `ss:action` yayar; işi frontend yapar (tek doğruluk
  kaynağı). Yerel ters çevirme YOK (mevcut "yalan söyleyen işaret" hatası).

## Birimler

| Birim | Ajan | Dosyalar | Dalga |
|---|---|---|---|
| **U1 Rust model** | general | `src-tauri/src/decide.rs`, `src-tauri/src/lib.rs` (yalnız `warmth_auto`/`warmth_curve` komutları) | 1 |
| **U2 Frontend** | general | `src/orchestr.ts`, `src/panels.ts`, `src/main.ts`, `index.html`, `src/styles.css` | 1 |
| **U3 Adaptörler** | general | `src-tauri/src/appearance/xmlopt.rs` (yeni), `src-tauri/src/appearance/adapters/*` | 1 |
| **U4 Tepsi** | general | `src-tauri/src/lib.rs` (yalnız tray bölümü) | 2 |

**U1 ve U4 aynı dosyaya (lib.rs) dokunur → sıralı.** U1 bitmeden U4 başlamaz.

**Şef (ben):** `qa/run.mjs` stub (`warmth_auto` yeni argüman, `warmth_curve`,
yeni `ss:action`'lar) + yeni senaryo, `qa/audit-*.mjs` stub'ları, sürüm/release.

## Sıra

1. Dalga 1: U1 · U2 · U3 paralel.
2. Doğrula: dosyaları aç, `cargo test`, `npm run build`.
3. Dalga 2: U4.
4. Şef: QA stub + senaryo, tam kapı.
5. Canlı: dev + CDP; sarılık değeri gerçekten değişiyor mu, tepsi menüsü çalışıyor mu.
6. Sürüm 3.4.0 + release.

## Kabul ölçütleri

- Sarılık eğrisi köşesiz: `warmth_curve` komşu örnekler arasında ani sıçrama yok
  (15 dk adımda fark ≤ 8).
- Aynı saatte, loş oda aydınlık odadan **daha yüksek** sarılık verir.
- Sıcak ışıklı odada sarılık, nötr odadan **daha düşük** (aynı saat/ışıkta).
- Otomatik kipte tek turda değişim ≤ 6 puan; elle seçim anında.
- `#warm-now` şu anki değeri, `#warm-ceiling` gerçek tavanı yazar.
- `#warm-curve` eğrisi backend verisiyle çizilir; TS'te kopya eğri yok.
- VS Code'da hem koyu hem açık tercih korunur; JetBrains `laf.xml` yalnız
  `theme` değerini değiştirir, XML bozulursa yazmaz.
- Tepsi menüsünden sarılık kipi ve süreli duraklatma çalışır; işaretler
  gerçek durumla uyumlu.
- `npm run verify`, `cargo test/clippy/fmt`, `qa/run.mjs`, 6 audit PASS.

## Geri alma

`git revert`. Ayar şeması değişmiyor (yeni anahtar yok). `warmth_auto` imzası
geriye uyumlu (`tone` opsiyonel).
