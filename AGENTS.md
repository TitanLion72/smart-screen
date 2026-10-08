# smart-screen

- Ozet: laptop ortam isigina gore OpenCode temasini + laptop ekran parlakligini ayarlayan tray uygulamasi; oyun/video/kilitte degisiklik yapma.
- Stack: Tauri v2 + Rust backend + web UI (vanilla-ts, npm).
- Yapi: 4 sekme (Panel/Profiller/Ayarlar/Geçmiş). Backend `src-tauri/src/` (`brightness`, `activity`, `theme`, `decide`, `light`, `autostart`, `ps`, `logger`, `prefs`, `battery`, `stats`, `gamma`). Frontend `src/main.ts` orkestrasyon + `catalog.ts`, `store.ts`, `widgets.ts`.
- Ekran tonu gamma rampasiyla yapilir (`gamma.rs`): `SetDeviceGammaRamp` sessiz reddettigi icin rampa once monotonluk ve identity+-32768 kontrolunden gecer. DDC/CI bu laptopta calismiyor (hata 31); monitore ozel yol SONRA gelecek.
- Görsel+işlevsel test: `cd qa && node run.mjs` (once `npm.cmd run build`); kareler `qa/shots/` altına düşer, taşma/sızıntı/ölü düğme assert'leri içerir.
- Kur: `npm.cmd install` (proje koku). Not: `npm.ps1` policy engelli, `npm.cmd` kullan.
- Dev: `npm.cmd run tauri dev`. Test: `cargo test` (`src-tauri/` icinde). Build: `npm.cmd run build`.
- `C:\Users\titan\.config\opencode\cli.json` icinde yalniz `theme` alanini degistir, diger anahtarlari koru.
- Parlaklik adimi uyarlanabilir: en az 8, en fazla farkin yarisi; 00:00-01:30 disinda %0 yazma.
- Video/oyun/PDF uygulamasi ondeyse dondur; tam ekranda exe is listesindeyse devam et, degilse dondur. Kilit acikken ve ayni kararda 2 ust uste olcum olmadan degisiklik yapma.
- ALS yok (dogrulandi) — isik hatti kamera + zaman; kamera mesgulse zaman moduna dus.
- Kare diske yazma; PowerShell pipe'inda stderr gurultusu olur, gercek kodu `EXIT:$LASTEXITCODE` ile dogrula.
- Gece isigi: registry blob'u bu makinede bos, programatik kontrol desteklenmiyor; panel footer'indaki dugme Windows ayar sayfasini acar.
- Done: dakikada bir ucuz tur + en fazla 5 dk kamera ile olc-karar-uygula loglanir, tray + pencere acilir, oyun sirasinda degisim olmaz.
- `smart-screen.log` (kullanicinin .config/opencode altinda) her turdan tek satir tutar, 500 satirda doner; grafik ve kalibrasyon verisi buradan okunur.
- Elle secilen tema `smart-screen-prefs.json` icine saat+isik anahtariyla ogrenilir; ayni kosulda once ogrenilmis tercih uygulanir.
- 20-20-20 tek seferliktir: uyarı `waiting -> alerting` geçişiyle bir kez çıkar, "Baktım"/"Ertele" onayı gelene kadar tekrar etmez. Dakikalık döngüde saniyelik koruma tuzağı kullanma.
- `el()` eksik id'de throw eder ve çağıranın `catch`i yutar: yeni id eklerken hem `index.html` hem QA assert'lerini güncelle.
