# PLAN v3.2 — güven ve dayanıklılık

Araştırma sonucu çıkan 7 iş. Sıra **bağımlılığa** göre değil, **dosya
sahipliğine** göre bölündü: aynı dosyaya iki el dokunmaz.

## İş listesi ve öncelik

| # | İş | Neden (kanıt) |
|---|---|---|
| 1 | Kamera kullanımını arayüzde söyle + tanılamaya ekle | `index.html`'de "kamera" 0 kez geçiyor; uygulama 5 dk'da bir webcam açıyor (`orchestr.ts:169`, `light.rs:46`). `diagnose.rs`'de kamera kontrolü yok → kamera bozukken "hepsi sağlam" diyor. |
| 2 | Ayar yedekleme (dışa/içe aktar) + sıfırla | 19 ayar + profiller yalnız localStorage'da. Kullanıcı bir kez listelerini kaybetti; kurtarma aracı sonradan yazıldı. Yedeğin kendisi yok. |
| 3 | Tray tooltip + durum | `lib.rs`'de `set_tooltip`/`set_icon` yok; duraklatılmış/kilitli iken simge hiçbir şey anlatmıyor. |
| 4 | İlk açılış tanıtımı (onboarding) | Hiç yok. Kullanıcı "Akıllı · %42" görüyor, uygulamanın ne yaptığını ve kamerayı kullandığını öğrenmiyor. |
| 5 | Klavye kısayolları | Ölç / Duraklat / Kilit için kısayol yok; her eylem fare. |
| 6 | Gece penceresi özeti | İki çıplak sayı kutusu; "22:00–06:00 · 8 saat" ve sarma durumu görünmüyor. |
| 7 | Üçüncü taraf lisans bildirimi | GPL uygulama, 5 npm + ~14 crate. `THIRD-PARTY.md` yok. |

## Sözleşmeler (tüm birimler bunlara uyar)

### C1 — Tanılama kamera kontrolü
- `diagnose.rs`: `pub fn camera_check(res: &Result<(), String>) -> Check`
- **id** `"camera"`, **label** `"Ortam ışığı (kamera)"`
- `Ok(())` → `status: "ok"`, detail `"kamera tek kare okuyabiliyor"`, hint `""`
- `Err(e)` → `status: "warn"` (**bad değil**: zaman moduna düşer, uygulama çalışır),
  detail `format!("kamera okunamadı: {e} — zaman moduna düşülür")`,
  hint `"Kamerayı başka bir uygulama kullanıyor olabilir; ışık ölçümü zaman moduna düşer."`
- `light.rs`: `pub fn probe() -> Result<(), String>` — kamerayı aç, tek kare al, kapat;
  hata mesajı kısa (panik yok).
- `diagnose::run()` içinde `probe()` çağrılır — imza değişmez.

### C2 — Ayar yedeği
Dosya biçimi (sürüm alanlı, tek JSON):
```json
{ "app": "smart-screen", "version": 1, "exportedAt": "<ISO>", "settings": { "ss:mode": "fixed" }, "profiles": "<ss:profiles içeriği, string>" }
```
- Rust: `settings_export(json: String) -> Result<String, String>` (kaydet diyaloğu
  açar, yazar, yolu döner); `settings_import() -> Result<String, String>` (aç
  diyaloğu, içeriği döner). Diyalog için `tauri-plugin-dialog`.
- Frontend: `ss:` ile başlayan tüm anahtarlar + `ss:profiles` toplanır.
  İçe aktarmada `app`/`version` doğrulanır; uymuyorsa **hiçbir şey yazılmaz**.
- "Ayarları sıfırla": `ss:` anahtarlarını siler (lisans Rust deposunda, etkilenmez),
  onay ister, sonra sayfayı yeniler.

### C3 — Tray tooltip
`smart-screen · %<parlaklık> · <tema> · <durum>`; durum ∈ `duraklatıldı` /
`bugün kapalı` / `kilitli` / `otomatik`. Mevcut `ss:state` dinleyicisi kullanılır.

### C4 — Onboarding
- `ss:onboarded` = `"1"` kapatınca; yoksa açılışta gösterilir.
- `#onboard` overlay, `#onboard-done` düğmesi, `#onboard` sözleşmede.
- Metin kamerayı **açıkça** söyler (madde 1 ile aynı gerçek).
- Esc kapatır.

### C5 — Kısayollar (pencere odaklıyken)
`Ctrl+Alt+M` ölç · `Ctrl+Alt+P` duraklat · `Ctrl+Alt+L` kilit.
Durum sayfası altbilgisine tek satır ipucu.

### C6 — Gece özeti
`#sleep-summary` → `"22:00–06:00 · 8 saat"` (sarma varsa doğru hesaplanır,
`sleepStart === sleepEnd` ise `"kapalı"`).

### C7 — Lisans bildirimi
`THIRD-PARTY.md`: npm (5) + cargo (~14) doğrudan bağımlılık, lisans adı ve
kaynak. README'den ve Hakkında kartından bağlantı.

## Birimler (dosya sahipliği kesin)

| Birim | Ajan | Dosyalar (SADECE) |
|---|---|---|
| **A — Rust** | general | `src-tauri/src/light.rs`, `src-tauri/src/diagnose.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json` |
| **B — Doküman** | general | `THIRD-PARTY.md` (yeni), `README.md` |
| **C — Frontend** | general | `index.html`, `src/panels.ts`, `src/main.ts`, `src/store.ts`, `src/catalog.ts`, `src/styles.css` |

**Çakışma yok:** A yalnız Rust, B yalnız Markdown, C yalnız frontend.
`qa/run.mjs` ve `qa/audit-diagnostics.mjs` **şefin** (birleştirmede stub + assert).

## Sıra

1. **Dalga 1 (paralel, tek yanıtta):** A, B, C — kontratlar yukarıda, birbirini
   beklemezler.
2. **Doğrula:** her birimde `git status` + dosyayı aç. `outcome: succeeded` kanıt değil.
3. **Birleştir:** QA stub'ları (`settings_export`, `settings_import`,
   `dialog:*`) + yeni senaryolar (kamera satırı, onboarding, kısayol, gece özeti,
   yedek turu) **şef** yazar.
4. **Kapı:** `npm test` · `cargo test` · clippy · fmt · `npm run verify` ·
   `qa/run.mjs` · 5 audit aracı · canlı kare.
5. **Sürüm:** 3.2.0 + CHANGELOG + HANDOFF + ROADMAP + release.

## Kabul ölçütleri

- Tanılamada 12 satır var, kamera satırı gerçek donanımı okuyor (bu makinede
  kamera varsa `ok`, yoksa `warn` — ikisi de doğru davranış).
- Yedek al → dosya oluşur → ayarları sıfırla → içe aktar → palet/profiller geri gelir.
- Tray tooltip duraklatınca `duraklatıldı` yazar.
- İlk açılışta onboarding çıkar, kapatınca bir daha çıkmaz.
- `Ctrl+Alt+P` duraklatmayı açar/kapatır.
- Gece özeti 23→06 için `"23:00–06:00 · 7 saat"` yazar.
- `THIRD-PARTY.md` tüm doğrudan bağımlılıkları listeler.

## Geri alma

Her madde bağımsız; sorun çıkarsa `git revert <commit>` ile tek tek alınır.
Veri şeması değişmiyor (yeni anahtar: `ss:onboarded`), eski sürüme dönüş güvenli.
