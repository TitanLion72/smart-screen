// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — tanıtım sitesi v2 metinleri (site/v2/content.mjs)

   TEK KAYNAK, iki dil. `tools/site2-build.mjs` buradan iki HTML üretir.

   Kurallar:
   - Uydurma yok. Her sayı koddan: decide.rs (eğri/tavan), store.ts (3/6
     profil), monitor.rs (DDC), engine.ts (Kelvin), license.rs.
   - Pazarlama sıfatı yok; ölçülebilir ifade var.
   - Fiyat yok (Pro fiyatı belirlenmedi).
   - Cümle düzeninde mikro etiket; ALL-CAPS yok.
   - İngilizce çeviri değil, İngilizce yazılmış.
   ═══════════════════════════════════════════════════════════════════ */

const REPO = "https://github.com/TitanLion72/smart-screen";
const LATEST = `${REPO}/releases/latest`;
const RELEASES = `${REPO}/releases`;
const LICENSE = `${REPO}/blob/main/LICENSE`;
const CHANGELOG = `${REPO}/blob/main/CHANGELOG.md`;
const SIGNING = `${REPO}/blob/main/CODE-SIGNING.md`;

export const LANGS = Object.freeze(["tr", "en"]);

/** Galeri karelerinin sırası sabit; `gallery.items[].file` bununla birebir.
 *  `hero.webp` galeride YOK: hero bölümünde tam genişlik kullanılıyor, aynı
 *  kartı ikinci kez göstermek tekrar olurdu. `overview.webp` tüm Durum
 *  sayfasını gösterir (hero + monitörler). */
export const SHOT_FILES = Object.freeze([
  "overview.webp",
  "monitors.webp",
  "warmth.webp",
  "contrast.webp",
  "profiles.webp",
  "themes.webp",
  "history.webp",
  "diagnostics.webp",
]);

const tr = {
  meta: {
    title: "smart-screen — oda karanlıkken ekran da karanlık olur",
    description:
      "Windows için tepsi uygulaması. Ortam ışığını kamerayla ölçer, ekran parlaklığını ve sıcak tonu buna göre ayarlar. Oyun, video ve kilitli ekranda dokunmaz.",
    ogAlt: "Karanlık bir odada tek ışık: smart-screen'in durum ekranı",
  },

  nav: {
    how: "Gün boyunca",
    features: "Neler yapar",
    faq: "Sorular",
    download: "İndir",
    langSwitch: "English",
  },

  hero: {
    title: "Oda karanlıkken ekran da karanlık olmalı.",
    lead: "Kamera ortam ışığını ölçer. Parlaklık ve sıcak ton bu ölçüme göre ayarlanır; gece yarısı beyaz bir sayfa gözünü yakmaz.",
    ctaDownload: "Windows için indir",
    ctaSource: "Kaynak kodu",
    trust: [
      "Kamera görüntüsü diske yazılmaz",
      "Hesap açılmaz",
      "Telemetri yok",
      "GPL-3.0",
    ],
    screenNote:
      "Durum ekranı. Üstte gün boyunca değişen sıcak ton eğrisi, solda o anki parlaklık.",
    screenAlt:
      "Durum ekranı: %38 parlaklık, mod rozeti ve gün boyunca değişen sıcak ton eğrisi",
    readoutNow: "şu an",
    readoutWarmth: "sıcak ton",
    readoutKelvin: "renk sıcaklığı",
  },

  stops: {
    title: "Gün boyunca ne değişir",
    lead: "Aynı gün, dört farklı saat. Değerler varsayılan ayarlarla hesaplanır.",
    statCapLabel: "gece tavanı",
    statKelvinLabel: "gece rengi",
    statReturnLabel: "boşta dönüşü",
    items: [
      {
        hour: "06:00",
        title: "Perde aralanırken",
        body: "Işık azken parlaklık düşük kalır. Ton şiddeti %39'a çıkar; ekran yumuşak başlar.",
      },
      {
        hour: "12:00",
        title: "Gündüz",
        body: "Eğri sıfıra iner, sıcak ton kapanır. Renkler 6500 K'de kalır, parlaklık gündüz tavanına yaklaşır.",
      },
      {
        hour: "18:00",
        title: "Ton ısınır",
        body: "Şiddet %27'ye tırmanır. Ekran kararmadan renkler sıcak tonlara kayar.",
      },
      {
        hour: "23:00",
        title: "Gece tavanı",
        body: "Eğri %88'e çıkar, tavanla %62 uygulanır. Ekran karanlık ama okunur kalır.",
      },
    ],
  },

  gallery: {
    title: "Ekranın kendisi",
    lead: "Aşağıdakiler tanıtım görseli değil, uygulamanın kendi ekranları.",
    items: [
      {
        file: "overview.webp",
        caption: "Durum sayfası: o anki parlaklık, mod ve altında monitörler.",
        alt: "Durum sayfasının tamamı: parlaklık kartı, gün eğrisi ve monitör listesi",
        wide: true,
      },
      {
        file: "monitors.webp",
        caption: "Monitörler: dahili panel ve iki harici ekran.",
        alt: "Monitör listesi: dahili panel ve iki harici ekran, birinde DDC/CI hatası",
      },
      {
        file: "warmth.webp",
        caption: "Sıcak ton: şiddet, gece tavanı ve Kelvin seçimi.",
        alt: "Sıcak ton kartı: şiddet kaydırıcısı, gece tavanı satırı ve Kelvin seçimi",
      },
      {
        file: "contrast.webp",
        caption: "Kontrast denetimi: her tema ölçülür, okunaksız olan işaretlenir.",
        alt: "Kontrast denetimi listesi: tema satırları, oranlar ve AA/FAIL rozetleri",
      },
      {
        file: "profiles.webp",
        caption: "Profiller: uygulamalara bağlanabilir, ücretsizde üç tane.",
        alt: "Profil kartları: her profilde mod, kaynak ve parlaklık ofseti",
      },
      {
        file: "themes.webp",
        caption: "Temalar: on iki palet, her biri zemin metin vurgu şeridiyle.",
        alt: "Tema seçici: renk şeritli palet çipleri",
      },
      {
        file: "history.webp",
        caption: "Geçmiş: her turun ne yaptığı, saat saat.",
        alt: "Geçmiş ekranı: ölçüm kayıtları zaman çizelgesinde",
      },
      {
        file: "diagnostics.webp",
        caption: "Tanılama: kamera, HDR, DDC/CI ve izinler tek listede.",
        alt: "Tanılama kartı: kontrol satırları ve durum rozetleri",
      },
    ],
  },

  bounds: {
    title: "Neye dokunmaz",
    lead: "Kurallar her durumda önde gelir; bağlı bir profil bile bunları ezemez.",
    touchTitle: "Dokunur",
    untouchTitle: "Dokunmaz",
    touch: [
      "Duraklatma yoksa ve ekran açıksa parlaklığı ayarlar.",
      "Sarılık kapalıysa renk dengesine dokunmaz.",
      "Bir monitör DDC/CI'yi reddederse onu atlar, diğerlerini sürer.",
    ],
    untouch: [
      "Oyun öndeyken tur dondurulur.",
      "Video oynatıcı öndeyken dondurulur.",
      "Tam ekran bir uygulama listede değilse durur.",
      "PDF okuyucu öndeyken dondurulur.",
      "Ekran kilitliyken hiçbir şey yazılmaz.",
    ],
  },

  features: {
    title: "Yedi şey yapar",
    lead: "Hepsi aynı turda, dakikada bir. Ayrı servis yok, ayrı süreç yok.",
    items: [
      {
        name: "Işığı kamerayla okur",
        body: "Kare başına yalnız ortalama parlaklık ve ton çıkarılır. Kamera meşgulse saat moduna düşer.",
      },
      {
        name: "Gün eğrisi ve gece tavanı",
        body: "Şiddet 11 çapa noktasından hesaplanır. 23:00'te tepe %88, uygulanan %62.",
      },
      {
        name: "Sıcak ton",
        body: "6500 K'den 3000 K'ye, 100 K adımlarla. Ekranı karartmadan renkleri kaydırır.",
      },
      {
        name: "Kontrast kapısı",
        body: "Tema dosyaları WCAG 2.1 ile ölçülür; okunaksız çıkan tema otomatik seçimde uygulanmaz.",
      },
      {
        name: "Profiller",
        body: "Ücretsizde üç, Pro'da altı. Bir profili exe adına bağlayabilirsin.",
      },
      {
        name: "Harici monitörler",
        body: "Dahili panel WMI, harici ekran DDC/CI ile okunur. Yazma Pro lisansla açılır.",
      },
      {
        name: "20-20-20 ve boşta dönüşü",
        body: "Uyarı bir kez çıkar, onaylanana kadar tekrarlamaz. Boşta parlaklık düşer, dönüşte 3,5 saniyede geri gelir.",
      },
    ],
  },

  facts: {
    title: "Kurulumda ne olur",
    rows: [
      { k: "Kurulum", v: "NSIS setup, x64, kullanıcı kapsamı. Yönetici izni istemez." },
      {
        k: "İmza",
        v: "Authenticode imzası yok. SmartScreen \"bilinmeyen yayıncı\" diyebilir; \"Ek bilgi → Yine de çalıştır\" gerekir.",
      },
      { k: "Bütünlük", v: "Her sürümde .sha256 var; Get-FileHash ile doğrulanır." },
      { k: "Güncelleme", v: "Uygulama içi. Paket minisign ile imzalı ve indirmede doğrulanır." },
      { k: "Gizlilik", v: "Kamera görüntüsü yazılmaz, ağa gitmez. Telemetri ve hesap yok." },
      { k: "Kaldırınca", v: "Renk dengesi geri yüklenir; sıcak ton kapalıyken de kalibrasyon geri gelir." },
    ],
  },

  plans: {
    title: "Ücretsiz ve Pro",
    lead: "Ücretsiz sürüm süreli deneme değil, çalışan bir uygulama. Pro profil sayısını ve harici ekranları açar.",
    freeTitle: "Ücretsiz",
    proTitle: "Pro",
    free: [
      "Işığa ve saate göre parlaklık",
      "Otomatik sıcak ton ve gece tavanı",
      "OpenCode teması ve Windows sistem teması",
      "Üç profil",
      "Kontrast kapısı",
      "20-20-20 hatırlatması",
    ],
    pro: [
      "Altı profil",
      "Harici monitör parlaklığı (DDC/CI)",
      "Harici monitöre sıcak ton",
      "Uygulamaya bağlı profil ve uygulama başına tema",
    ],
    note: "Pro fiyatı henüz belirlenmedi. Uygulamadaki \"Pro'yu al\" düğmesi şimdilik proje sayfasına gider.",
  },

  faq: {
    title: "Sorular",
    items: [
      {
        q: "Kamera ne görüyor, nereye gidiyor?",
        a: "Her ölçümde birkaç kare okunur ve yalnız ortalama parlaklık ile ton çıkarılır. Görüntü diske yazılmaz, ağa gönderilmez. Kare kaydı yoktur.",
      },
      {
        q: "Pili ne kadar tüketiyor?",
        a: "Tur dakikada bir koşar, kamera en fazla beş dakikada bir açılır. Pil düştükçe aralık uzar: %30 altında 5 dakika, %20 altında 10, %10 altında 20, altında 30.",
      },
      {
        q: "HDR açıkken parlaklık neden çalışmıyor?",
        a: "Bazı monitörler HDR açıkken DDC/CI parlaklığını reddeder. Uygulama bunu hata metninde söyler; HDR'ı kapatmak genelde çözer.",
      },
      {
        q: "Harici monitörüm listede ama ayar dönmüyor.",
        a: "DDC/CI monitörün kendi menüsünden kapalı olabilir ya da kabloda taşınmıyor olabilir. Ücretsiz sürümde yazma kapalıdır; okuma ve listeleme açıktır.",
      },
      {
        q: "Oyun oynarken ekranı değiştirir mi?",
        a: "Hayır. Oyun, video ve PDF öndeyken tur dondurulur. Tam ekran bir uygulama listede değilse de dondurulur.",
      },
      {
        q: "Nasıl kaldırırım?",
        a: "Windows ayarlarından kaldırılır. Kaldırmadan önce renk dengesi geri yüklenir.",
      },
      {
        q: "Uygulama İngilizce mi?",
        a: "Şu an yalnız Türkçe. Bu site iki dilli; uygulama arayüzü Türkçe.",
      },
    ],
  },

  closing: {
    title: "Kur, unut.",
    lead: "İlk tur açılışta koşar. Sonrasında dakikada bir ölçer, karar verir, uygular.",
    cta: "Windows için indir",
    secondary: "Tüm sürümler",
  },

  footer: {
    tagline: "Ortam ışığına göre ekran parlaklığı ve sıcak ton.",
    license: "GPL-3.0-or-later · © 2026 TitanLion72",
    links: [
      { label: "GitHub", href: REPO },
      { label: "Sürümler", href: RELEASES },
      { label: "Değişiklik günlüğü", href: CHANGELOG },
      { label: "Lisans", href: LICENSE },
      { label: "Kod imzalama", href: SIGNING },
    ],
  },
};

const en = {
  meta: {
    title: "smart-screen — when the room goes dark, the screen follows",
    description:
      "A Windows tray app. It measures ambient light with the camera and adjusts screen brightness and warmth. It leaves games, video and the lock screen alone.",
    ogAlt: "A single light in a dark room: the smart-screen status display",
  },

  nav: {
    how: "Across the day",
    features: "What it does",
    faq: "Questions",
    download: "Download",
    langSwitch: "Türkçe",
  },

  hero: {
    title: "When the room goes dark, the screen should too.",
    lead: "The camera measures ambient light. Brightness and warmth follow that reading, so a white page at midnight does not stab your eyes.",
    ctaDownload: "Download for Windows",
    ctaSource: "Source code",
    trust: [
      "Camera frames are never written to disk",
      "No account",
      "No telemetry",
      "GPL-3.0",
    ],
    screenNote:
      "The status screen. The warmth curve runs across the day; brightness sits on the left.",
    screenAlt:
      "Status screen: 38% brightness, mode badge and the warmth curve across the day",
    readoutNow: "now",
    readoutWarmth: "warmth",
    readoutKelvin: "color temperature",
  },

  stops: {
    title: "What changes across the day",
    lead: "The same day at four hours. Values are computed with default settings.",
    statCapLabel: "night ceiling",
    statKelvinLabel: "night color",
    statReturnLabel: "idle return",
    items: [
      {
        hour: "06:00",
        title: "As the curtain opens",
        body: "Low light keeps brightness low. Warmth strength reaches 39%; the screen starts soft.",
      },
      {
        hour: "12:00",
        title: "Daylight",
        body: "The curve drops to zero and warmth switches off. Colors stay at 6500 K while brightness nears its daytime ceiling.",
      },
      {
        hour: "18:00",
        title: "The tone warms",
        body: "Strength climbs to 27%. Colors shift warm without dimming the screen.",
      },
      {
        hour: "23:00",
        title: "The night ceiling",
        body: "The curve reaches 88% and the cap applies 62%. The screen stays dark but readable.",
      },
    ],
  },

  gallery: {
    title: "The screens themselves",
    lead: "These are not marketing renders. They are the app's own screens.",
    items: [
      {
        file: "overview.webp",
        caption: "The status page: current brightness, mode and the monitors below.",
        alt: "The whole status page: brightness card, day curve and monitor list",
        wide: true,
      },
      {
        file: "monitors.webp",
        caption: "Monitors: the internal panel and two external displays.",
        alt: "Monitor list: internal panel and two external displays, one with a DDC/CI error",
      },
      {
        file: "warmth.webp",
        caption: "Warmth: strength, night ceiling and the Kelvin picker.",
        alt: "Warmth card: strength slider, night ceiling line and Kelvin picker",
      },
      {
        file: "contrast.webp",
        caption: "Contrast audit: every theme is measured, unreadable ones are flagged.",
        alt: "Contrast audit list: theme rows, ratios and AA/FAIL badges",
      },
      {
        file: "profiles.webp",
        caption: "Profiles: they can bind to apps. Three in the free build.",
        alt: "Profile cards: each profile shows mode, source and brightness offset",
      },
      {
        file: "themes.webp",
        caption: "Themes: twelve palettes, each shown with a background, text and accent strip.",
        alt: "Theme picker: palette chips with color strips",
      },
      {
        file: "history.webp",
        caption: "History: what each tick did, hour by hour.",
        alt: "History screen: measurement records on a timeline",
      },
      {
        file: "diagnostics.webp",
        caption: "Diagnostics: camera, HDR, DDC/CI and permissions on one list.",
        alt: "Diagnostics card: check rows with status badges",
      },
    ],
  },

  bounds: {
    title: "What it leaves alone",
    lead: "The rules always win; not even a bound profile can override them.",
    touchTitle: "Touches",
    untouchTitle: "Leaves alone",
    touch: [
      "With no pause and the screen on, it adjusts brightness.",
      "With warmth off, it does not touch color balance.",
      "If one monitor refuses DDC/CI, it skips that one and drives the others.",
    ],
    untouch: [
      "A game in the foreground freezes the tick.",
      "A video player in the foreground freezes the tick.",
      "Any other fullscreen app stops it.",
      "A PDF reader in the foreground freezes the tick.",
      "While the screen is locked, nothing is written.",
    ],
  },

  features: {
    title: "Seven things it does",
    lead: "All in one tick, once a minute. No extra service, no extra process.",
    items: [
      {
        name: "Reads the light with the camera",
        body: "Each frame yields only average brightness and tone. If the camera is busy it falls back to the clock.",
      },
      {
        name: "Day curve and night ceiling",
        body: "Strength is computed from 11 anchor points. The peak is 88% at 23:00; the cap applies 62%.",
      },
      {
        name: "Warmth",
        body: "From 6500 K down to 3000 K in steps of 100 K. It shifts colors without dimming the screen.",
      },
      {
        name: "Contrast gate",
        body: "Theme files are measured with WCAG 2.1; a theme that measures unreadable is never applied automatically.",
      },
      {
        name: "Profiles",
        body: "Three in the free build, six with Pro. A profile can bind to an executable name.",
      },
      {
        name: "External monitors",
        body: "The internal panel is read over WMI, external displays over DDC/CI. Writing unlocks with a Pro license.",
      },
      {
        name: "20-20-20 and idle return",
        body: "One reminder, never repeated until you acknowledge it. Idle dims the screen; the return takes about 3.5 seconds.",
      },
    ],
  },

  facts: {
    title: "What happens on install",
    rows: [
      { k: "Installer", v: "NSIS setup, x64, per-user scope. No admin prompt." },
      {
        k: "Signature",
        v: "No Authenticode signature. SmartScreen may warn about an unknown publisher; use \"More info → Run anyway\".",
      },
      { k: "Integrity", v: "Every release ships a .sha256 file; verify with Get-FileHash." },
      { k: "Updates", v: "In-app. The package is signed with minisign and verified on download." },
      { k: "Privacy", v: "Camera frames are not written and not uploaded. No telemetry, no account." },
      { k: "Uninstall", v: "Color balance is restored first; turning warmth off also brings the calibration back." },
    ],
  },

  plans: {
    title: "Free and Pro",
    lead: "The free build is a working app, not a trial. Pro raises the profile count and opens external displays.",
    freeTitle: "Free",
    proTitle: "Pro",
    free: [
      "Brightness from light and time",
      "Automatic warmth and night ceiling",
      "OpenCode theme and Windows system theme",
      "Three profiles",
      "Contrast gate",
      "20-20-20 reminder",
    ],
    pro: [
      "Six profiles",
      "External monitor brightness over DDC/CI",
      "Warmth on external monitors",
      "Apps bound to profiles and per-app themes",
    ],
    note: "Pro pricing is not set yet. The \"Get Pro\" button currently opens the project page.",
  },

  faq: {
    title: "Questions",
    items: [
      {
        q: "What does the camera see, and where does it go?",
        a: "Each measurement reads a few frames and extracts only average brightness and tone. Nothing is written to disk or sent over the network. No frames are stored.",
      },
      {
        q: "How much battery does it use?",
        a: "A tick runs every minute and the camera opens at most every five minutes. The interval grows as the battery drops: below 30% it is 5 minutes, below 20% ten, below 10% twenty, below that thirty.",
      },
      {
        q: "Why does brightness not work with HDR on?",
        a: "Some monitors refuse DDC/CI brightness while HDR is on. The app says so in the error message; turning HDR off usually fixes it.",
      },
      {
        q: "My external monitor is listed but does not change.",
        a: "DDC/CI may be off in the monitor's own menu, or the cable may not carry it. In the free build writing is locked; reading and listing still work.",
      },
      {
        q: "Does it change the screen while I play?",
        a: "No. Games, video and PDFs in the foreground freeze the tick. A fullscreen app that is not on the keep-list also stops it.",
      },
      {
        q: "How do I uninstall it?",
        a: "Uninstall it from Windows settings. Color balance is restored before removal.",
      },
      {
        q: "Is the app in English?",
        a: "The app interface is currently Turkish only. This site is bilingual.",
      },
    ],
  },

  closing: {
    title: "Install it, forget it.",
    lead: "The first tick runs at launch. After that it measures, decides and applies once a minute.",
    cta: "Download for Windows",
    secondary: "All releases",
  },

  footer: {
    tagline: "Screen brightness and warmth that follow the light in the room.",
    license: "GPL-3.0-or-later · © 2026 TitanLion72",
    links: [
      { label: "GitHub", href: REPO },
      { label: "Releases", href: RELEASES },
      { label: "Changelog", href: CHANGELOG },
      { label: "License", href: LICENSE },
      { label: "Code signing", href: SIGNING },
    ],
  },
};

export const CONTENT = Object.freeze({ tr, en });
export const DOWNLOAD_URL = LATEST;
export const REPO_URL = REPO;
