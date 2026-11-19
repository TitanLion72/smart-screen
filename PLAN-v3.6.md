# PLAN v3.6 — kanayan yaralar + winget

Kaynak: [`REKABET-v3.6.md`](REKABET-v3.6.md) §7 öncelik tablosu.

**Hedef:** Kullanıcının "ortaya kusur bulunmayacak uygulama" hedefi için
rakiplerin çözemediği üç yarayı (uyanma sonrası kalıcılık, HDR'da parlaklık,
DDC kırılganlığı) kapatmak + bedava dağıtım kanalına (winget) çıkmak.

---

## Kapsam dışı (bilinçli, kanıtlı)

| İş | Neden yapılmıyor |
|---|---|
| **Tepside fare tekerleği** | **Tauri v2 `TrayIconEvent` içinde `Scroll` varyantı YOK** (kaynak: `tauri-2.x/src/tray/mod.rs`, teyit edildi). Yerine global kısayol (T4) |
| **Boşta dönüşünü yumuşatma** | Gereksiz: `decide.rs::step_toward` zaten 3–8 puanlık adımlarla gidiyor, ani sıçrama yok |
| Store (MSIX) | Kullanıcı kararı: "stora daha sonra" |
| Pro fiyatı | Kullanıcı kararı: "en son" |
| Site yenileme | Kullanıcı kararı: "sonra planlarız" → `ROADMAP.md`'ye madde olarak girer |
| Night Light blob yazma | Sürüm kırılgan, tersine mühendislik — risk/ödül oranı kötü |

---

## T1 — Uyanma kurtarma (P0)

**Sorun:** Sistem uykudan dönünce sürücü gamma rampasını ve monitör parlaklığını
sıfırlayabilir. `gamma::recover()` yalnız açılışta çağrılıyor (`lib.rs:809`).
Rakiplerin 1 numaralı şikâyeti (Monitorian#115, LightBulb#102 — ikisi de açık).

**Dosyalar:**
- Modify: `src/engine.ts` — saf `wakeGap(prevMs, nowMs, watchMs): boolean`
- Modify: `src/engine.test.ts` — 4 test
- Modify: `src/orchestr.ts` — `tick()` başında tespit, kurtarma bayrağı `S.wakeRecover`
- Modify: `src/main.ts` — uyanma sonrası anında tick

**Sözleşme:**
```ts
/** İki tur arası normalden uzun boşluk = sistem uyudu. */
export function wakeGap(prevMs: number, nowMs: number, watchMs: number): boolean
```
Kural: `nowMs - prevMs > watchMs + 60_000` → `true`. Bozuk girdi (`nowMs < prevMs`,
NaN) → `false` (yanlış kurtarma yapma).

**Kurtarma sırası (tick içinde, karardan ÖNCE):**
1. `refreshMonitorList()` — monitörler uyku sonrası yeniden numaralanabilir
2. `gamma` yeniden uygula (mevcut `applyWarmth(force)` yolu)
3. Hedef parlaklık yeniden yaz (mevcut tur zaten yazıyor — ekstra iş yok)
4. Tek satır log: `uyanma sonrası geri yükleme: N monitör, sarılık %X`

**Kabul:** `wakeGap` 4 test; `npm test` yeşil; canlıda uyku/uyanma sonrası log satırı.

---

## T2 — HDR'da parlaklık dürüstlüğü (P0)

**Sorun:** `brightness_set_monitor` HDR durumunu bilmiyor. HDR açıkken bazı
monitörler DDC yazmayı reddeder; kullanıcı "parlaklık çalışmıyor" der, sebebini
bilmez (twinkle-tray#97, 90 yorum, 2020'den beri açık).

**Dosyalar:**
- Modify: `src-tauri/src/lib.rs` — `brightness_set_monitor` hata zenginleştirme
- Modify: `src-tauri/src/diagnose.rs` — HDR + DDC satırı
- Modify: `src/orchestr.ts` — tek seferlik uyarı (`S.hdrWarned`)
- Test: `src-tauri/src/diagnose.rs` içinde

**Sözleşme:** HDR açıkken yazma başarısız olursa dönen hata metni
`"... HDR açıkken bu monitör DDC/CI parlaklığını reddedebilir"` içerir.
HDR kapalıyken metin **değişmez** (regression yok).

**Kabul:** HDR kapalı yolun testi aynı metni bekliyor; HDR açık yol yeni metni.

---

## T3 — DDC geri kazanma (P1)

**Sorun:** Monitör bir turda cevap vermezse (sürücü meşgul, uyku, HDR geçişi)
o tur kaybediliyor; kalıcı olarak düşüyor mu belirsiz (twinkle-tray#1187).

**Dosyalar:**
- Modify: `src-tauri/src/monitor.rs` — `write_value` içinde tek yeniden deneme
- Test: `src-tauri/src/monitor.rs` — `should_retry(&str) -> bool` saf fonksiyonu

**Sözleşme:**
```rust
/// Hangi DDC hatalari yeniden denenmeye deger? (gecici: mesgul/zaman asimi)
fn should_retry(err: &str) -> bool
```
Yeniden deneme **tek** kez, 120 ms bekleme; kalıcı hatalar (`"desteklenmiyor"`,
`"Pro lisans"`) denenmez.

**Kabul:** 6 test (geçici 3 / kalıcı 3); toplam tur süresi artmıyor (tek retry).

---

## T4 — Global parlaklık kısayolu (P1)

**Gerekçe:** Tepsi tekerleği Tauri'de yok; en yakın ihtiyaç "monitör parlaklığını
hızlı değiştir". Mevcut `Ctrl+Alt+M/P/L` **yalnız pencere odaktayken** çalışıyor
(`main.ts:256` keydown) — AGENTS.md "global" ima ediyor ama değil. Bu tur
gerçek global kısayol ekliyor.

**Dosyalar:**
- Modify: `src-tauri/Cargo.toml` — `tauri-plugin-global-shortcut = "2"`
- Modify: `src-tauri/src/lib.rs` — plugin + `Ctrl+Alt+Up/Down` → `ss:action`
- Modify: `src/main.ts` — `bright-step` aksiyonu (±5)
- Modify: `index.html` — `#shortcut-hint` metni
- Modify: `src/orchestr.ts` — `brightStep(delta)` (elle ofset yolu, öğrenmeyi kirletmez)

**Sözleşme:** `ss:action` `{ action: "bright-step", delta: 5 }`. Hedef `clamp(0,100)`,
`S.offset` üzerinden yazılır (öğrenilen tercih **değişmez** — kullanıcı istemedi).

**Kabul:** QA'da `bright-step` aksiyonu hedefi ±5 değiştiriyor; kısayol metni görünür.

---

## T5 — winget yayını (P2)

**Dosyalar:**
- Create: `winget/manifests/t/TitanLion72/smart-screen/3.6.0/*.yaml` (3 dosya)
- Create: `WINGET.md` — yayın akışı + güncelleme adımları

Manifest alanları: `PackageIdentifier: TitanLion72.smart-screen`,
`InstallerType: nsis`, `Scope: user`, `InstallModes: interactive|silent`,
`UpgradeBehavior: install`, `ReleaseDate`, `InstallerSha256` (yayın çıktısından).

**Akış:** `winget validate` → `wingetcreate submit` (fork + PR otomatik).
PR insan incelemesinden geçer; **birleşme bizim kontrolümüzde değil** — bu
dürüstçe `WINGET.md`'ye yazılır.

**Kabul:** `winget validate` PASS; manifest SHA256 gerçek kurulumla eşleşiyor.

---

## T6 — Sürüm, doküman, release (v3.6.0)

- `package.json` / `tauri.conf.json` / `Cargo.toml` → 3.6.0
- `CHANGELOG.md`, `HANDOFF.md`, `ROADMAP.md` (**site yenileme maddesi eklenir**)
- `README.md`: kısayol tablosu güncel
- Kapılar: `cargo test` + `clippy -D warnings` + `fmt --check` + `npm test` +
  `qa/run.mjs` + 6 audit + `npm run verify`
- Release akışı: build → manifest → tag → `gh release create` (7 varlık) →
  `/S` kurulum → CDP canlı doğrulama

---

## Dosya sahipliği

| Birim | Sahip | Dosyalar |
|---|---|---|
| T1 | şef | `src/engine.ts`, `src/engine.test.ts`, `src/orchestr.ts`, `src/main.ts` |
| T2 | şef | `src-tauri/src/lib.rs`, `src-tauri/src/diagnose.rs`, `src/orchestr.ts` |
| T3 | şef | `src-tauri/src/monitor.rs` |
| T4 | şef | `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src/main.ts`, `index.html` |
| T5 | şef | `winget/**`, `WINGET.md` |
| T6 | şef | sürüm dosyaları, `*.md` |

**Neden hepsi şef:** T2 ve T4 aynı `lib.rs`'e, T1 ve T2 aynı `orchestr.ts`'e
dokunuyor. Dosya sahipliği çakışıyor → paralel değil, sıralı (orkestrasyon
skill'inin "aynı satıra dokunuyorsa birleştir" kuralı). Ayrıca geçen turda alt
ajanlar iki kez sunucu yeniden başlaması yüzünden kesildi.

## Geri alma

`git revert <commit>`. Yeni ayar anahtarı yok; yeni bağımlılık yalnız
`tauri-plugin-global-shortcut`.
