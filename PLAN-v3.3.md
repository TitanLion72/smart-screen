# PLAN v3.3 — "uygulama temaları" (çok uygulamalı tema)

Hedef: smart-screen yalnız OpenCode'u değil, **kurulu diğer uygulamaları da**
açık/koyu moda geçirsin. Varsayılan **kapalı**; Windows sistem teması ücretsiz,
uygulama bazlı adaptörler **Pro**.

## Araştırma sonucu (kanıtlı)

| Hedef | Yöntem | Canlı mı | Kaynak |
|---|---|---|---|
| Windows sistem | `HKCU\...\Themes\Personalize` → `AppsUseLightTheme` + `SystemUsesLightTheme`, sonra `WM_SETTINGCHANGE` (`ImmersiveColorSet`) yayını | ✓ | Win32 |
| Windows Terminal 1.24 | `settings.json` → `"theme": "dark"\|"light"` | ✓ (dosyayı izler) | MS Learn: Appearance |
| VS Code 1.144 | `settings.json` → `window.autoDetectColorScheme`, `workbench.preferredDark/LightColorTheme`, `workbench.colorTheme` | ✓ | VS Code Docs: Themes |
| Sublime Text | `Preferences.sublime-settings` → `"theme"` | ✓ | — |
| Zed | `settings.json` → `"theme"` | ✓ | — |
| Obsidian | `<kasa>/.obsidian/appearance.json` → `"theme": "obsidian"\|"moonstone"` | ✓ | — |
| JetBrains, Chrome, Firefox, Discord, Slack | kendi "sistemi takip et" ayarı | — | **Yazmayız**: Windows teması açıkken kendileri uyar |

**Tavan (dürüst):** tema için dosya/API sunmayan uygulamalara yazılmaz. Kartta
tek satır ipucu: *"Chrome, Firefox, Discord, Slack ve JetBrains sistemi takip
eder — Windows teması açıkken kendiliğinden uyarlar."*

## Güvenlik kuralları (pazarlık dışı)

1. **Asla veri kaybı yok.** Her yazmadan önce `<dosya>.ss-backup` (yalnız ilk
   yazmada, üzerine yazılmaz). Geri al = yedekten kopyala.
2. **Yorum korunur.** VS Code/Windows Terminal `settings.json` yorum içerebilir.
   `JSON.parse` + yeniden yazmak yorumları **siler**. Bu yüzden cerrahi metin
   düzenlemesi: yalnız ilgili anahtarın değer aralığı değişir, dosyanın geri
   kalanı bayt bayt aynı kalır. Doğrulama: yorumlar sıyrılıp `serde_json` ile
   parse edilir; parse edilemezse **yazma geri alınır**.
3. **Değişmezse yazılmaz.** Aynı değeri tekrar yazmak VS Code'u gereksiz yere
   yeniden yükler; `write` `false` döner (changed=false).
4. **Dosya yoksa oluşturulmaz.** Uygulama kurulu ama ayar dosyası yoksa
   (ör. VS Code hiç açılmamış) satır "ayar dosyası yok — uygulamayı bir kez aç"
   der. Sürpriz dosya yaratmayız.
5. **Atomik yazma:** aynı klasörde `.tmp-<pid>` + `rename`. Yarım dosya kalmaz.
6. **Pro kapısı backend'de**: `targets` içinde `"system"` dışında bir şey varsa
   ve lisans Pro değilse komut reddeder. Okuma her zaman serbest.

## Mimari

```
src-tauri/src/appearance/
  mod.rs          – Mode, AppInfo, ApplyResult, trait Adapter, komutlar
  jsonc.rs        – yorum koruyan anahtar oku/yaz + doğrulama
  system_theme.rs – kayıt defteri oku/yaz + WM_SETTINGCHANGE
  adapters/
    mod.rs        – all() -> Vec<Box<dyn Adapter>>
    windows_terminal.rs / vscode.rs / sublime.rs / zed.rs / obsidian.rs
```

### Sözleşme C1 — trait (A1 yazar, A2 uygular)

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode { Dark, Light }
impl Mode {
    pub fn as_str(self) -> &'static str;          // "dark" | "light"
    pub fn parse(s: &str) -> Option<Mode>;        // tr/lowercase toleranslı
}

pub struct AppInfo {
    pub id: String, pub name: String, pub group: String, // "terminal"|"editor"|"notes"
    pub installed: bool, pub live: bool,
    pub path: Option<String>,
    pub current: Option<String>,   // "dark"|"light"|"system"|"unknown"
    pub error: Option<String>,
}

pub trait Adapter: Send + Sync {
    fn id(&self) -> &'static str;
    fn name(&self) -> &'static str;
    fn group(&self) -> &'static str;
    fn live(&self) -> bool { true }
    fn locate(&self) -> Option<std::path::PathBuf>;      // ayar dosyası (varsa)
    fn read(&self, path: &Path) -> Result<Option<Mode>, String>;
    fn write(&self, path: &Path, mode: Mode) -> Result<bool, String>; // true = yazıldı
}
```

`adapters::all() -> Vec<Box<dyn Adapter>>` — sıra: terminal, vscode, sublime, zed, obsidian.

### Sözleşme C2 — `jsonc.rs` (A1 yazar, A2 kullanır)

```rust
pub fn get_string(text: &str, key: &str) -> Option<String>;
pub fn set_string(text: &str, key: &str, value: &str) -> String;   // cerrahi
pub fn get_bool(text: &str, key: &str) -> Option<bool>;
pub fn set_bool(text: &str, key: &str, value: bool) -> String;
pub fn strip_comments(text: &str) -> String;   // doğrulama için
pub fn is_valid(text: &str) -> bool;           // strip + serde_json
```
Kurallar: `//` ve `/* */` yorumları ile `"..."` içindeki kaçışlar doğru atlanır;
anahtar varsa **yalnız değer aralığı** değişir; yoksa son `}` öncesine eklenir
(virgül yönetimi doğru). Testler: yorumlu dosya, sonda virgül, iç içe obje,
kaçışlı tırnak, anahtar yokken ekleme, idempotentlik.

### Sözleşme C3 — komutlar (`lib.rs`)

```rust
appearance_apps() -> Vec<AppInfo>                              // okuma, Pro'suz
appearance_apply(mode: String, targets: Vec<String>) -> Result<Vec<ApplyResult>, String>
appearance_restore() -> Vec<ApplyResult>                       // yedeklerden geri
```
`ApplyResult { id, ok, changed, error }`. `"system"` hedefi Pro'suz; diğerleri Pro.
`appearance_restore` da Pro (yedek yalnız adaptörlerde oluşur).

### Sözleşme C4 — adaptör davranışları

- **windows_terminal**: `theme` = `"dark"|"light"`. `read` bu alanı okur; yoksa
  `None` (WT varsayılanı "system").
- **vscode**: adaylar (ilk bulunan): Code, Code - Insiders, VSCodium, Cursor,
  Windsurf. `window.autoDetectColorScheme == true` ise **yazmaz**, `read` →
  `Some(System)` yerine `current="system"` + `error=None` (kart "zaten sistemi
  takip ediyor" der). Aksi halde `workbench.colorTheme` =
  `preferredDarkColorTheme` / `preferredLightColorTheme` (yoksa
  `"Default Dark Modern"` / `"Default Light Modern"`).
- **sublime**: `theme` = `"Default Dark.sublime-theme"` / `"Default Light.sublime-theme"`.
- **zed**: `theme` = `"One Dark"` / `"One Light"`.
- **obsidian**: `%APPDATA%\obsidian\obsidian.json` içindeki kasa yolları;
  her kasanın `.obsidian/appearance.json` → `"theme" = "obsidian"(koyu) |
  "moonstone"(açık)`. Kasa yoksa `installed=false`.

### Sözleşme C5 — frontend

Ayarlar → **Görünüm** altına yeni kart "Uygulama temaları":
- `#app-theme-system` (anahtar): "Windows teması (Explorer, Başlat, uyumlu uygulamalar)". Varsayılan **kapalı**.
- `#app-list`: her satır `[anahtar] Ad · şu an: koyu · canlı|yeniden başlat` — `#app-row-<id>`, `#app-sw-<id>`.
- `#app-restore` ("Geri al"), `#app-pro-lock` (Pro değilse kilit satırı).
- `#app-theme-note` (ipucu: sistemi takip edenler).
- Boş durum: "Algılanan uygulama yok".
- Pref anahtarları: `ss:appThemeSystem` ("1"/"0", varsayılan "0"),
  `ss:appThemeTargets` (virgüllü id listesi).
- Döngü: karar modu değiştiğinde `appearance_apply`; 30 turda bir drift kontrolü.
- **Yeni id'lerin hepsi `index.html` başındaki SÖZLEŞME tablosuna yazılır.**

## Birimler ve dosya sahipliği

| Birim | Dosyalar (SADECE) | Dalga |
|---|---|---|
| **A1 çekirdek** | `src-tauri/src/appearance/mod.rs`, `jsonc.rs`, `system_theme.rs`, `adapters/mod.rs` (boş kabuk), `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml` | 1 |
| **B frontend** | `index.html`, `src/panels.ts`, `src/main.ts`, `src/store.ts`, `src/catalog.ts`, `src/styles.css` | 1 |
| **C doküman** | `README.md`, `CHANGELOG.md`, `ROADMAP.md` | 1 |
| **A2 adaptörler** | `src-tauri/src/appearance/adapters/*.rs` (6 dosya) | 2 (A1'den sonra) |

**Şef (ben):** `qa/run.mjs` stub'ları + yeni senaryo, `qa/audit-appearance.mjs`,
`src-tauri/src/diagnose.rs` (uygulama teması kontrolü — A2 sonrası), sürüm/release.

## Sıra

1. Dalga 1: A1 · B · C paralel.
2. Doğrula: `cargo check` + dosyaları aç. `adapters::all()` boş döner (A2 bekliyor).
3. Dalga 2: A2.
4. Şef: tanılama kontrolü + QA stub/senaryo + audit aracı.
5. Kapı: `npm run verify` · `cargo test/clippy/fmt` · `qa/run.mjs` · audit'ler.
6. Canlı: dev + CDP; gerçek dosyalarda yedek/geri al; VT canlı geçiş gözle.
7. Sürüm 3.3.0 + release.

## Kabul ölçütleri

- Windows teması kapalıyken hiçbir uygulamaya yazılmaz (varsayılan kapalı).
- Açıkken `AppsUseLightTheme` gerçekten değişir; Explorer koyu/açık olur.
- WT: `theme` yazılır, **açık terminal penceresi yeniden başlatmadan** döner.
- VS Code: yorumlu `settings.json` yazıldıktan sonra **yorumlar yerinde**.
- Aynı mod iki kez uygulanınca hiçbir dosyanın mtime'ı değişmez.
- Bozuk/parse edilemeyen dosyaya yazılmaz; satırda hata görünür, diğerleri etkilenmez.
- "Geri al" dosyaları yedek hâline döndürür.
- Pro değilken adaptör hedefi reddedilir (backend), sistem teması çalışır.
- `qa/run.mjs` + audit PASS, 3 dosyada sürüm 3.3.0.

## Geri alma

`git revert`. Ayar şeması: yalnız `ss:appThemeSystem`, `ss:appThemeTargets`
eklenir (yeni anahtarlar, eski sürüm görmezden gelir). Yedekler `.ss-backup`
uzantılı, kullanıcı silebilir.
