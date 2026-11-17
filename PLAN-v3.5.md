# PLAN v3.5 — açılış hatası, daha çok uygulama, profesyonel cila, akıllı otomasyon

## BULGU 1 (kritik, kullanıcı bildirdi): açılışta cmd penceresi + bozuk açılış

**Kanıt:** `HKCU\...\Run` içinde:
```
smart-screen = C:\Users\titan\Projeler\smart-screen\src-tauri\target\debug\smart-screen.exe
```

İki kök neden:

1. **Debug exe kayıtlı.** `main.rs:4` `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`
   → **debug** derlemesinde konsol alt sistemi açık. Bu yüzden cmd penceresi çıkıyor.
2. **Debug exe `devUrl`e bağlı.** `tauri.conf.json` `devUrl: http://localhost:1420`;
   debug build vite sunucusunu bekler. Açılışta vite yok → boş/bozuk pencere.

**Çözüm (`autostart.rs`):**
- `set_autostart(true)` **kurulu exe** yolunu yazsın. Kurulu exe tespiti:
  `%LOCALAPPDATA%\smart-screen\smart-screen.exe` varsa onu kullan; yoksa `current_exe()`.
- Yeni `repair_autostart()`: Run değeri varsa ama (a) mevcut exe'den farklıysa ya da
  (b) yolu `\target\debug\` veya `\target\release\` içeriyorsa → kurulu exe ile **düzelt**.
  Açılışta `lib.rs` içinde bir kez çağrılır. Sessiz, hata yutulur (açılışı engellemez).
- Değer **tırnaklı** yazılsın: `"C:\path\smart-screen.exe"`. Tırnaksız yolda boşluk
  olursa Windows yolu böler (klasik hata).
- `#[ignore]` canlı test: yaz → oku → düzelt → doğrula.

**Kabul:** `Run` değeri kurulu exe'yi gösterir, tırnaklı; dev yolu asla yazılmaz.

---

## BULGU 2: uygulama desteği dar (6 adaptör)

`adapters/` altında: windows_terminal, vscode, jetbrains, sublime, zed, obsidian.

**Eklenecek (hepsi dosya tabanlı, kanıtlı yöntem):**

| Adaptör | Dosya / anahtar | Not |
|---|---|---|
| **Neovim / LazyVim** | `%LOCALAPPDATA%\nvim\lua\*.lua` — **yazmayız** | Lua kodu; yazmak tehlikeli. Bunun yerine `background` değişkenini `init.lua`'ya eklemek kullanıcı kodunu bozar → **desteklenmez** listesine |
| **Windows Terminal zaten var** | — | — |
| **Notepad++** | `%APPDATA%\Notepad++\config.xml`? → **yazmayız** (XML'i program yönetir, çalışırken ezer) | desteklenmez |
| **Emacs** | `%APPDATA%\.emacs.d\init.el` → **yazmayız** (Lua/Lisp kodu) | desteklenmez |
| **Alacritty** | `%APPDATA%\alacritty\alacritty.toml` → `[colors]` tam palet gerekir | **kısmi**: yalnız `import` ile tema dosyası yazarız — riskli, atla |
| **WezTerm** | `%USERPROFILE%\.wezterm.lua` → **yazmayız** (Lua) | desteklenmez |
| **Konsole/external yok** | — | — |
| **GitHub Desktop** | `%APPDATA%\GitHub Desktop\settings.json` → `"theme": "dark"/"light"` | ✓ **ekle** |
| **Obsidian zaten var** | — | — |
| **Typora** | `%APPDATA%\Typora\conf\conf.user.json` → `"theme"` | ✓ **ekle** |
| **Windows Terminal Preview** | zaten var | — |
| **Cursor/Windsurf** | zaten var (vscode ailesi) | — |
| **IntelliJ** | zaten var | — |
| **Slack** | `%APPDATA%\Slack\storage\` — kırılgan leveldb | **yazmayız** |
| **Discord** | `%APPDATA%\discord\settings.json` → `"theme": "dark"/"light"` | ✓ **ekle** (dosya var olmalı, yoksa yaratma) |
| **Spotify** | önbellek/prefs dosyası özel | **yazmayız** |
| **SumatraPDF** | `%LOCALAPPDATA%\SumatraPDF\SumatraPDF-settings.txt` → `UiLanguage`/tema yok | atla |
| **Everything (voidtools)** | `Everything.ini` → yok | atla |

**Gerçekten eklenecek 3 adaptör:** `github-desktop`, `discord`, `typora`.
Hepsi aynı desen: strict JSON, `theme` alanı, dosya yoksa **yaratma**.
Discord'da `theme` değerleri `"dark"|"light"`; dosya `settings.json` içinde düz JSON.

**Not:** Discord/Slack/Typora dosyaları uygulama **açıkken** ezilebilir. Kartta
`live = false` ve "yeniden başlat" rozeti → dürüst.

---

## BULGU 3: profesyonel ürün hissi eksikleri

| Eksik | Çözüm |
|---|---|
| Ayar değişikliğinin **etkisi görünmüyor** | "Önizleme" düğmesi: 3 sn seçili modu uygula, sonra eski hâle dön (`appearance_preview`) |
| Uygulama başına **hata geçmişi yok** | Kartta son hata + "Yeniden dene" düğmesi (tek hedef) |
| **Klavye ile gezinme** yok (Ayarlar) | Kartlar `tabindex`, `j/k` ile satır gezinme |
| Durum sayfasında **özet yok** | "Bugün" şeridi: kaç kez tema değişti, kaç ölçüm, ortalama parlaklık (`stats_summary` zaten var → göster) |
| **Hata durumunda yönlendirme** yok | Tanılama kartına "Sorun giderme" bağlantısı → ilgili ayara atlar |
| Profil kartlarında **önizleme** yok | Palet şeridi + mod rozeti (zaten var mı bak) |
| **Sürüm notları** uygulama içinde yok | Hakkında → "Yenilikler" (son sürüm notu, `latest.json`ten değil gömülü) |

Bu turda **3 tanesini** yap: (1) önizleme düğmesi, (2) uygulama satırında "Yeniden dene",
(3) Durum sayfasında bugün özeti.

---

## BULGU 4: otomasyon "zeki" değil

Mevcut: saat eğrisi + kamera seviyesi + ton + öğrenilen tercih.

**Eksikler:**
1. **Hareket/aktivite sinyali yok.** Kullanıcı 20 dakikadır klavye/fare kullanmıyorsa
   ekran parlaklığını düşürmek (mola) veya tam tersi: yoğun yazı yazarken sabit tutmak.
2. **Pil eşiği kaba** (`%20` tek eşik). Kademeli: 30/20/10.
3. **Uygulama bazlı ince ayar yok.** Bağlı profil var (mod/kaynak/tema), ama
   "video oynatırken sarılığı azalt" gibi medya tespiti yok.
4. **Öğrenme tek örnekte kutuplaşıyor.** `learn_pref` aynı saat+ışık için tek kayıt.
5. **Isınma/soğuma (hysteresis) yok.** Karar aynı ama ölçüm oynak → gereksiz yazma.

**Bu turda yapılacak (ölçülebilir, riski düşük):**
- **A1 — Boşta algılama:** `GetLastInputInfo` ile son girdiden geçen süre.
  10 dk boşta → parlaklık hedefini %15 azalt (yalnız `auto`, kilitli değilse).
  Kullanıcı dönünce **hemen** eski hedefe dön (yumuşak ama hızlı).
  Yeni komut: `idle_seconds() -> u64`.
- **A2 — Kademeli pil:** eşikler `[30, 20, 10]` → kamera turu `5/10/20` dk,
  adım kısıtı `1/2/3`.
- **A3 — Yazma disiplini:** aynı hedef 3 tur üst üste aynıysa ve fark < 2 ise
  hiç yazma (mevcut eşik 2 → korunur, ama **log da yazılmasın**: log gürültüsü azalır).
- **A4 — Medya tespiti:** `foreground_exe` zaten var; tam ekran + bilinen medya exe
  listesi (mpv, vlc, mpc-hc, potplayer, wmplayer) → sarılığı **%7 düşür**
  (video izlerken renk sadakati). Film modu profiline dokunmaz.

**Yapılmayacak:** öğrenme modelini değiştirmek (veri az, riskli), yüz/duygu tespiti,
hava durumu API'si (ağ bağımlılığı).

---

## Birimler

| Birim | Ajan | Dosyalar | Dalga |
|---|---|---|---|
| **U1 autostart fix** | **ben (şef)** | `src-tauri/src/autostart.rs`, `src-tauri/src/lib.rs` (tek satır çağrı) | 1 |
| **U2 yeni adaptörler** | general | `src-tauri/src/appearance/adapters/{github_desktop,discord,typora}.rs`, `adapters/mod.rs` | 1 |
| **U3 akıllı otomasyon** | general | `src-tauri/src/activity.rs` (`idle_seconds`), `src-tauri/src/lib.rs` (komut), `src/orchestr.ts` (boşta/pil/medya), `src/engine.ts` (saf fonksiyonlar) | 2 (lib.rs çakışması) |
| **U4 profesyonel UI** | general | `index.html`, `src/panels.ts`, `src/main.ts`, `src/styles.css` | 1 |

U1 ve U3 `lib.rs`e dokunur → U1 önce.
Şef: `qa/run.mjs` stub'ları, sürüm, release.

## Kabul ölçütleri

- `Run` değeri kurulu exe, tırnaklı; debug yolu asla.
- 3 yeni adaptör canlıda `kurulu=true/false` doğru; dosya yaratmıyor.
- Boşta 10 dk → parlaklık düşer; girdi gelince döner.
- Pil %10'da kamera turu 20 dk.
- Medya exe öndeyken sarılık %7 düşük.
- `npm run verify`, `cargo test/clippy/fmt`, `qa/run.mjs`, audit'ler PASS.

## Geri alma

`git revert`. Yeni ayar anahtarı: `ss:idleDim` (varsayılan "1"), `ss:mediaWarmth` ("1").
