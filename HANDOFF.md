# HANDOFF — 2026-10-17 (smart-screen) — 0.8.0 nihai

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
