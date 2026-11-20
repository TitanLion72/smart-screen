// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — tanıtım sitesi metinleri (site/content.mjs)

   TEK KAYNAK. İki dil yan yana durur; `tools/site-build.mjs` buradan
   iki HTML üretir. Ayrı HTML dosyalarına metin yazmak yasak: bu depoda
   iki yerde duran bir cümle daha önce ayrıştı (README ↔ AGENTS.md).

   İÇERİK KURALLARI (test bunların bir kısmını zorlar):
   - Uydurma yok. Her sayı koddan: decide.rs (eğri/tavan), store.ts
     (3/6 profil), monitor.rs (DDC), engine.ts (Kelvin), license.rs.
   - Pazarlama sıfatı yok ("devrim", "mükemmel", "en iyi"). Ölçülebilir
     ifade var.
   - Fiyat yok: Pro fiyatı belirlenmedi, uydurma fiyat yazılmaz.
   - İngilizce çeviri değil, İngilizce yazılmış.
   ═══════════════════════════════════════════════════════════════════ */

const REPO = "https://github.com/TitanLion72/smart-screen";
const RELEASES = `${REPO}/releases`;
const LATEST = `${REPO}/releases/latest`;
const LICENSE = `${REPO}/blob/main/LICENSE`;
const CHANGELOG = `${REPO}/blob/main/CHANGELOG.md`;
const SIGNING = `${REPO}/blob/main/CODE-SIGNING.md`;

export const LANGS = Object.freeze(["tr", "en"]);

const tr = {
  meta: {
    title: "smart-screen — ekranınız odanın ışığına uyar",
    description:
      "Windows için tepsi uygulaması: ortam ışığını ölçer, ekran parlaklığını ve sıcak tonu ayarlar. Oyun, video ve kilitli ekranda dokunmaz. Hesap yok, telemetri yok.",
    ogAlt: "smart-screen: %38 parlaklık ve gün boyunca değişen sıcak ton eğrisi",
  },

  nav: {
    how: "Nasıl çalışır",
    features: "Özellikler",
    faq: "Sık sorulanlar",
    download: "İndir",
    langSwitch: "English",
  },

  hero: {
    eyebrow: "Windows · tepsi uygulaması",
    title: "Ekranınız odanın ışığını ölçer.",
    lead: "Kamera birkaç kare okur, ortalama parlaklığı ve tonu çıkarır. Parlaklık, sıcak ton ve OpenCode teması bu ölçüme göre ayarlanır. Oyun, video, PDF ve kilit ekranında hiçbir şeye dokunmaz.",
    reading: {
      nowPrefix: "Şu an",
      warmthLabel: "sıcak ton",
      kelvinLabel: "renk sıcaklığı",
      note: "Varsayılan ayarlarla hesaplanır: şiddet tavanı %70, gece en fazla %62.",
    },
    ctaDownload: "İndir",
    ctaSource: "Kaynak kodu",
    facts: [
      "Kamera görüntüsü diske yazılmaz",
      "Hesap açılmaz",
      "Telemetri yok",
      "GPL-3.0",
    ],
  },

  chapters: [
    {
      id: "morning",
      hour: "06:00",
      kicker: "Şafak",
      title: "Perde aralanırken ekran parlar.",
      body: "Ortam ışığı düşükken parlaklık düşük kalır. Işık arttıkça tur başına en fazla 8 puan yükselir; ekran bir anda patlamaz.",
      points: [
        "Parlaklık hedefi ışık ölçümüne göre kayar: karanlıkta 6 puan aşağı, aydınlıkta 4 puan yukarı.",
        "Karanlıkta sıcak ton da artar; şafakta eğri %39 şiddet verir.",
        "Tur dakikada bir koşar, kamera en fazla 5 dakikada bir açılır.",
      ],
      shot: {
        file: "morning.webp",
        alt: "Durum sayfası: %38 parlaklık, mod rozeti ve gün boyunca değişen sıcak ton eğrisi",
        caption: "Durum sayfası, ss-paper açık temasıyla.",
      },
    },
    {
      id: "noon",
      hour: "12:00",
      kicker: "Öğlen",
      title: "Gündüz en net hâlinde.",
      body: "Öğlen eğrisi sıfıra iner: sıcak ton kapanır, renkler 6500 K'de kalır. Parlaklık gündüz tavanına yaklaşır.",
      points: [
        "Otomatik seçimde ölçülüp FAIL çıkan tema uygulanmaz; elle seçmek serbest.",
        "Kontrast oranı WCAG 2.1 ile hesaplanır: 7 üstü çok iyi, 4.5 iyi, 3 sınır.",
        "Eşik Ayarlar'dan kapatılabilir; varsayılan açık.",
      ],
      shot: {
        file: "noon.webp",
        alt: "Kontrast denetimi listesi: tema satırları, oranlar ve AA/FAIL rozetleri",
        caption: "Kontrast denetimi: her tema ölçülür, FAIL olan otomatik seçilmez.",
      },
    },
    {
      id: "evening",
      hour: "18:00",
      kicker: "Akşam",
      title: "Ton ısınmaya başlar.",
      body: "Akşam eğrisi tırmanır: 18:00'de %27, 21:00'de %55 şiddet. Ekran kararmadan renkler sıcak tonlara kayar.",
      points: [
        "Şiddet tavanı %70; gece en fazla %62 uygulanır.",
        "Kelvin 6500'den 3000'e kadar iner, 100'lük adımlarla.",
        "Sıcak ton kapatılınca öğrenilen renk dengesi geri gelir.",
      ],
      shot: {
        file: "evening.webp",
        alt: "Sıcak ton kartı: şiddet kaydırıcısı, gece tavanı satırı ve Kelvin seçimi",
        caption: "Sıcak ton: şiddet, tavan ve Kelvin tek kartta.",
      },
    },
    {
      id: "night",
      hour: "23:00",
      kicker: "Gece",
      title: "Gece tavanı devreye girer.",
      body: "23:00'te eğri %88'e çıkar, tavanla %62 uygulanır. Ekran karanlık ama okunur kalır.",
      points: [
        "Boşta 10 dakikada hedef 15 puan, 30 dakikada 25 puan düşer; geri dönüş ~3,5 saniyelik rampayla olur.",
        "20-20-20 uyarısı tek seferliktir: \"Baktım\" ya da \"Ertele\" ile kapanır, kendini tekrarlamaz.",
        "Harici monitörün parlaklığı DDC/CI ile ayrı ayrı okunur ve yazılır.",
      ],
      shot: {
        file: "night.webp",
        alt: "Monitör listesi: dahili panel ve iki harici ekran, birinde DDC/CI hatası",
        caption: "Monitör listesi: üç ekran, biri DDC/CI'yi reddediyor.",
      },
    },
  ],

  boundaries: {
    title: "Neye dokunmaz",
    lead: "Kurallar her durumda önde gelir; bağlı profil bile bunları ezemez.",
    touch: [
      "Duraklatma yoksa ve ekran açıksa parlaklığı ayarlar.",
      "Sarılık kapalıysa renk dengesine dokunmaz.",
      "Bir monitör DDC/CI'yi reddederse o monitörü atlar, diğerlerini sürer.",
    ],
    untouch: [
      "Oyun öndeyse tur dondurulur.",
      "Video oynatıcı öndeyse tur dondurulur.",
      "Tam ekran bir uygulama listedeyse devam eder, değilse durur.",
      "PDF okuyucu öndeyse dondurulur.",
      "Ekran kilitliyken hiçbir şey yazılmaz.",
    ],
  },

  features: {
    title: "Yedi şey yapar",
    lead: "Hepsi aynı turda, dakikada bir. Ayrı bir servis, ayrı bir süreç yok.",
    items: [
      {
        name: "Kamera ile ortam ışığı",
        body: "Kare başına yalnız ortalama parlaklık ve ton çıkarılır; görüntü diske yazılmaz. Kamera meşgulse saat moduna düşer.",
      },
      {
        name: "Saat eğrisi ve gece tavanı",
        body: "Şiddet 11 çapa noktasıyla hesaplanır; 23:00'te tepe %88, tavanla %62 uygulanır.",
      },
      {
        name: "Sıcak ton",
        body: "6500 K'den 3000 K'ye kadar, 100 K adımlarla. Ekranı karartmadan renkleri kaydırır.",
      },
      {
        name: "Kontrast kapısı",
        body: "Tema dosyaları WCAG 2.1 ile ölçülür; FAIL çıkan tema otomatik seçimde uygulanmaz.",
      },
      {
        name: "Profiller",
        body: "Ücretsizde 3, Pro'da 6 profil. Bir profili exe adına bağlayabilirsin; o uygulama öne gelince ayarlar profilden okunur.",
      },
      {
        name: "Harici monitörler",
        body: "Dahili panel WMI, harici ekran DDC/CI ile okunur. Yazma yalnız Pro lisansla açılır.",
      },
      {
        name: "20-20-20 ve boşta dönüşü",
        body: "Her 20 dakikada bir uyarı; onaylanana kadar tekrarlamaz. Boşta parlaklık düşer, dönüşte 3,5 saniyede geri gelir.",
      },
    ],
  },

  facts: {
    title: "Kurulum gerçekleri",
    rows: [
      { k: "Kurulum", v: "NSIS setup, x64, kullanıcı kapsamı. Yönetici izni istemez." },
      { k: "İmza", v: "Authenticode imzası yok. SmartScreen \"bilinmeyen yayıncı\" uyarabilir; \"Ek bilgi → Yine de çalıştır\" gerekir." },
      { k: "Bütünlük", v: "Her sürümde .sha256 var: Get-FileHash ile doğrula." },
      { k: "Güncelleme", v: "Uygulama içi; paket minisign ile imzalı ve indirmede doğrulanır." },
      { k: "Gizlilik", v: "Kamera görüntüsü yazılmaz, ağa gitmez. Telemetri ve hesap yok." },
      { k: "Lisans", v: "Ücretsiz sürüm tam çalışır. Pro çevrimdışı Ed25519 anahtarıyla açılır." },
    ],
  },

  plans: {
    title: "Ücretsiz ve Pro",
    lead: "Ücretsiz sürüm kısıtlı süre değil, tam bir uygulama. Pro ekran sayısını ve profil sayısını açar.",
    free: [
      "Işığa ve saate göre parlaklık",
      "Otomatik sıcak ton ve gece tavanı",
      "OpenCode teması ve Windows sistem teması",
      "3 profil",
      "Kontrast kapısı",
      "20-20-20 hatırlatması",
    ],
    pro: [
      "6 profil",
      "Harici monitör parlaklığı (DDC/CI)",
      "Harici monitöre sıcak ton",
      "Uygulamaya bağlı profil ve uygulama başına tema",
    ],
    note: "Pro fiyatı henüz belirlenmedi. Uygulamadaki \"Pro'yu al\" düğmesi şimdilik proje sayfasına gider.",
  },

  faq: {
    title: "Sık sorulanlar",
    items: [
      {
        q: "Kamera ne görüyor, nereye gidiyor?",
        a: "Her ölçümde birkaç kare okunur ve yalnız ortalama parlaklık ile ton çıkarılır. Görüntü diske yazılmaz, ağa gönderilmez. Kare kaydı yoktur.",
      },
      {
        q: "Pili ne kadar tüketiyor?",
        a: "Tur dakikada bir koşar ama kamera en fazla 5 dakikada bir açılır. Pil düştükçe aralık uzar: %30 altında 5 dakika, %20 altında 10, %10 altında 20, altında 30 dakika.",
      },
      {
        q: "HDR açıkken parlaklık neden çalışmıyor?",
        a: "Bazı monitörler HDR açıkken DDC/CI parlaklığını reddeder. Uygulama bunu hata metninde söyler; HDR'ı kapatmak genelde çözer.",
      },
      {
        q: "Harici monitörüm listede ama ayar dönmüyor?",
        a: "DDC/CI monitörün OSD menüsünden kapalı olabilir ya da kabloda taşınmıyor olabilir. Ücretsiz sürümde yazma kapalıdır; okuma ve listeleme açıktır.",
      },
      {
        q: "Oyun oynarken ekranı değiştirir mi?",
        a: "Hayır. Oyun, video ve PDF öndeyken tur dondurulur. Tam ekran bir uygulama listede değilse de dondurulur.",
      },
      {
        q: "Nasıl kaldırırım, geri alır mı?",
        a: "Windows ayarlarından kaldırılır. Kaldırmadan önce renk dengesi geri yüklenir; sıcak ton kapalıyken de kalibrasyon geri gelir.",
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
    cta: "İndir",
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
    title: "smart-screen — your screen follows the light in the room",
    description:
      "A Windows tray app: it measures ambient light and adjusts screen brightness and warmth. It leaves games, video and the lock screen alone. No account, no telemetry.",
    ogAlt: "smart-screen: 38% brightness and the warmth curve across the day",
  },

  nav: {
    how: "How it works",
    features: "Features",
    faq: "FAQ",
    download: "Download",
    langSwitch: "Turkish",
  },

  hero: {
    eyebrow: "Windows · tray app",
    title: "Your screen measures the light in the room.",
    lead: "The camera reads a few frames and extracts average brightness and tone. Brightness, warmth and the OpenCode theme follow that reading. Games, video, PDFs and the lock screen are left untouched.",
    reading: {
      nowPrefix: "Now",
      warmthLabel: "warmth",
      kelvinLabel: "color temperature",
      note: "Computed with default settings: strength cap 70%, night peak 62%.",
    },
    ctaDownload: "Download",
    ctaSource: "Source code",
    facts: [
      "Camera frames are never written to disk",
      "No account",
      "No telemetry",
      "GPL-3.0",
    ],
  },

  chapters: [
    {
      id: "morning",
      hour: "06:00",
      kicker: "Dawn",
      title: "The screen wakes as the curtain opens.",
      body: "In low light the brightness stays low. As light rises it climbs at most 8 points per tick, so the screen never jumps.",
      points: [
        "The brightness target shifts with the light reading: 6 points down in the dark, 4 points up in bright light.",
        "Warmth rises in the dark too; at dawn the curve sits at 39% strength.",
        "A tick runs every minute, and the camera opens at most every 5 minutes.",
      ],
      shot: {
        file: "morning.webp",
        alt: "Status page: 38% brightness, mode badge and the warmth curve across the day",
        caption: "The status page in the light ss-paper theme.",
      },
    },
    {
      id: "noon",
      hour: "12:00",
      kicker: "Noon",
      title: "Daylight at its clearest.",
      body: "At noon the curve drops to zero: warmth is off and colors stay at 6500 K. Brightness approaches the daytime ceiling.",
      points: [
        "In automatic selection, a theme that measures FAIL is not applied; picking it by hand is allowed.",
        "Contrast is computed with WCAG 2.1: above 7 is excellent, 4.5 is good, 3 is the limit.",
        "The gate can be switched off in Settings; it is on by default.",
      ],
      shot: {
        file: "noon.webp",
        alt: "Contrast audit list: theme rows, ratios and AA/FAIL badges",
        caption: "Contrast audit: every theme is measured, FAIL themes are not auto-applied.",
      },
    },
    {
      id: "evening",
      hour: "18:00",
      kicker: "Evening",
      title: "The tone starts to warm.",
      body: "The evening curve climbs: 27% strength at 18:00 and 55% at 21:00. Colors shift warm without dimming the screen.",
      points: [
        "The strength cap is 70%; at night at most 62% is applied.",
        "Kelvin falls from 6500 to 3000 in steps of 100.",
        "Turning warmth off restores the learned color balance.",
      ],
      shot: {
        file: "evening.webp",
        alt: "Warmth card: strength slider, night ceiling line and Kelvin picker",
        caption: "Warmth: strength, ceiling and Kelvin on one card.",
      },
    },
    {
      id: "night",
      hour: "23:00",
      kicker: "Night",
      title: "The night ceiling takes over.",
      body: "At 23:00 the curve reaches 88% and the cap applies 62%. The screen stays dark but readable.",
      points: [
        "After 10 idle minutes the target drops 15 points, after 30 it drops 25; the return is a ramp of about 3.5 seconds.",
        "The 20-20-20 reminder fires once: it closes on \"Looked\" or \"Snooze\" and does not repeat on its own.",
        "External monitor brightness is read and written per display over DDC/CI.",
      ],
      shot: {
        file: "night.webp",
        alt: "Monitor list: internal panel and two external displays, one with a DDC/CI error",
        caption: "Monitor list: three displays, one refusing DDC/CI.",
      },
    },
  ],

  boundaries: {
    title: "What it leaves alone",
    lead: "The rules always win; not even a bound profile can override them.",
    touch: [
      "With no pause and the screen on, it adjusts brightness.",
      "With warmth off, it does not touch color balance.",
      "If one monitor refuses DDC/CI, that monitor is skipped and the others are driven.",
    ],
    untouch: [
      "A game in the foreground freezes the tick.",
      "A video player in the foreground freezes the tick.",
      "A fullscreen app on the keep-list continues; any other fullscreen app stops it.",
      "A PDF reader in the foreground freezes the tick.",
      "While the screen is locked, nothing is written.",
    ],
  },

  features: {
    title: "Seven things it does",
    lead: "All in one tick, once a minute. No extra service, no extra process.",
    items: [
      {
        name: "Ambient light from the camera",
        body: "Each frame yields only average brightness and tone; nothing is written to disk. If the camera is busy it falls back to the clock.",
      },
      {
        name: "Day curve and night ceiling",
        body: "Strength is computed from 11 anchor points; the peak is 88% at 23:00 and the cap applies 62%.",
      },
      {
        name: "Warmth",
        body: "From 6500 K down to 3000 K in steps of 100 K. It shifts colors without dimming the screen.",
      },
      {
        name: "Contrast gate",
        body: "Theme files are measured with WCAG 2.1; a theme that measures FAIL is not applied automatically.",
      },
      {
        name: "Profiles",
        body: "Three in the free build, six with Pro. A profile can be bound to an executable name; when that app comes forward, settings follow the profile.",
      },
      {
        name: "External monitors",
        body: "The internal panel is read over WMI, external displays over DDC/CI. Writing is unlocked by a Pro license.",
      },
      {
        name: "20-20-20 and idle return",
        body: "A reminder every 20 minutes that does not repeat until acknowledged. Idle dims the screen; the return takes about 3.5 seconds.",
      },
    ],
  },

  facts: {
    title: "Install facts",
    rows: [
      { k: "Installer", v: "NSIS setup, x64, per-user scope. No admin prompt." },
      { k: "Signature", v: "No Authenticode signature. SmartScreen may warn about an unknown publisher; use \"More info → Run anyway\"." },
      { k: "Integrity", v: "Every release ships a .sha256 file: verify with Get-FileHash." },
      { k: "Updates", v: "In-app; the package is signed with minisign and verified on download." },
      { k: "Privacy", v: "Camera frames are not written and not uploaded. No telemetry and no account." },
      { k: "License", v: "The free build is fully working. Pro unlocks with an offline Ed25519 key." },
    ],
  },

  plans: {
    title: "Free and Pro",
    lead: "The free build is a complete app, not a trial. Pro raises the profile count and opens external displays.",
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
    title: "Frequently asked",
    items: [
      {
        q: "What does the camera see, and where does it go?",
        a: "Each measurement reads a few frames and extracts only average brightness and tone. Nothing is written to disk or sent over the network. No frames are stored.",
      },
      {
        q: "How much battery does it use?",
        a: "A tick runs every minute, but the camera opens at most every 5 minutes. The interval grows as the battery drops: below 30% it is 5 minutes, below 20% ten, below 10% twenty, and below that thirty.",
      },
      {
        q: "Why does brightness not work with HDR on?",
        a: "Some monitors refuse DDC/CI brightness while HDR is on. The app says so in the error message; turning HDR off usually fixes it.",
      },
      {
        q: "My external monitor is listed but does not change?",
        a: "DDC/CI may be disabled in the monitor OSD, or the cable may not carry it. In the free build writing is locked; reading and listing still work.",
      },
      {
        q: "Does it change the screen while I play?",
        a: "No. Games, video and PDFs in the foreground freeze the tick. A fullscreen app that is not on the keep-list also stops it.",
      },
      {
        q: "How do I uninstall, and does it revert?",
        a: "Uninstall it from Windows settings. Color balance is restored first; turning warmth off also brings the calibration back.",
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
    cta: "Download",
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

/** İndirme bağlantısı (iki dilde aynı). */
export const DOWNLOAD_URL = LATEST;
export const REPO_URL = REPO;
export const RELEASES_URL = RELEASES;
