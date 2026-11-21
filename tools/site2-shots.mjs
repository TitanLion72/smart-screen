// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — site v2 için 8 gerçek ekran görüntüsü
   (tools/site2-shots.mjs)

   Neden kendi stub'ı: site kareleri deterministik olmalı; gerçek makinedeki
   geçici durum (kamera meşgul, Pro lisans, rastgele DDC hatası) siteye
   sızmamalı. QA fixture'ı 22 senaryoya bağlı, onu değiştirmek testleri riske
   atar.

   ÜÇ KAPI (v1'de "yazıldı" demek yetmişti ve boş kare yayınlanmıştı):
     1) seçici var mı
     2) öğe gerçekten görünür alanda mı (clip koordinatı görünüm alanına göre)
     3) öğenin metni var mı

   Kullanım: node tools/site2-shots.mjs   (önce: npm.cmd run build)
   ═══════════════════════════════════════════════════════════════════ */

import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const distRoot = join(root, "dist");
const outDir = join(root, "site/v2/assets/shots");
const MAX = 120 * 1024;

if (!existsSync(distRoot)) {
  console.error("HATA: dist/ yok — önce: npm.cmd run build");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const qaPkg = join(root, "qa", "package.json");
let chromium;
try {
  chromium = createRequire(qaPkg)("playwright").chromium;
} catch {
  console.error("HATA: playwright bulunamadı — önce: cd qa && npm install");
  process.exit(2);
}

/* DİKKAT: bu fonksiyon tarayıcıya STRING olarak gider; dışarıdaki hiçbir
   değişkeni okuyamaz (v1'de MONITORS sabitine referans vermiştim ve liste
   sessizce boş dönmüştü). Tüm veri içeride. */
const fixture = () => {
  const monitors = [
    { id: "\\\\.\\DISPLAY1", name: "Generic PnP Monitor", is_internal: true, api: "wmi" },
    { id: "\\\\.\\DISPLAY2", name: "Dell U2415", is_internal: false, api: "ddc" },
    { id: "\\\\.\\DISPLAY3", name: "Ancak Ekran", is_internal: false, api: "ddc" },
  ];
  const profiles = [
    { id: "p1", name: "Okuma", mode: "auto", source: "auto", offset: 0, apps: [], theme: null, themeMode: null, autoLock: false },
    { id: "p2", name: "Gece", mode: "auto", source: "time", offset: -10, apps: [], theme: null, themeMode: null, autoLock: false },
    { id: "p3", name: "Sunum", mode: "fixed", source: "auto", offset: 8, apps: [], theme: null, themeMode: null, autoLock: false },
  ];
  window.__bright = 38;
  window.__warm = 55;
  window.__invocations = [];
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    invoke: async (cmd, args) => {
      window.__invocations.push([cmd, args]);
      switch (cmd) {
        case "brightness_get":
          return window.__bright;
        case "brightness_set":
          if (args && typeof args.value === "number") window.__bright = args.value;
          return window.__bright;
        case "is_fullscreen":
          return false;
        case "foreground_exe":
          return "zen.exe";
        case "theme_get":
          return ["catppuccin-macchiato", "dark"];
        case "theme_set":
          return null;
        case "decide_target":
          return ["ss-dusk", "dark", 38];
        case "decide_brightness":
          return 38;
        case "brightness_floor":
          return 0;
        case "light_sample":
          return [20.5, 1.0, "dim", "neutral"];
        case "decide_level":
          return args && args.lum < 34 ? "dark" : "dim";
        case "autostart_get":
          return true;
        case "autostart_set":
          return null;
        case "pref_get":
        case "pref_learn":
        case "pref_learn_bright":
        case "pref_get_bright":
        case "pref_clear":
          return null;
        case "pref_list":
          return [];
        case "monitor_list":
          return monitors;
        case "brightness_get_monitor":
          return 42;
        case "brightness_set_monitor":
          if (args && String(args.id).includes("DISPLAY3")) {
            throw "DDC/CI bu monitorda calismiyor (OSD'den kapali olabilir)";
          }
          return null;
        case "license_status":
          return { pro: false, email: null, issued: null };
        case "license_activate":
          return { pro: false, email: null, issued: null };
        case "profiles_list":
          return profiles;
        case "profiles_save":
          return null;
        case "idle_seconds":
          return 0;
        case "battery_status":
          return [85, true];
        case "nightlight_status":
          return null;
        case "appearance_apps":
          return [
            { id: "windows-terminal", name: "Windows Terminal", group: "terminal", installed: true, live: true, path: "C:/qa/wt.json", current: "dark", error: null },
            { id: "vscode", name: "VS Code", group: "editor", installed: true, live: true, path: "C:/qa/code.json", current: "light", error: null },
          ];
        case "appearance_apply":
          return ((args && args.targets) || []).map((id) => ({ id, ok: true, changed: true, error: null }));
        case "appearance_restore":
          return [];
        case "hdr_status":
          return false;
        case "hdr_status_all":
          return monitors.map((m) => ({ device: m.id, hdr: false }));
        case "monitor_color_temp_info":
          return monitors.map((m) => ({ device: m.id, supported: m.is_internal, increment: 50 }));
        case "monitor_set_color_temp":
          return null;
        case "warmth_curve":
          return [62, 62, 39, 15, 0, 0, 0, 15, 39, 55, 62];
        case "warmth_auto":
          return 55;
        case "contrast_audit":
          return [
            { name: "ss-paper", mode: "light", text_on_bg: 11.4, muted_on_bg: 6.2, syntax_min: 5.1, verdict: "AAA" },
            { name: "ss-dusk", mode: "dark", text_on_bg: 8.9, muted_on_bg: 5.4, syntax_min: 4.6, verdict: "AA" },
            { name: "soluk-tema", mode: "dark", text_on_bg: 2.3, muted_on_bg: 1.2, syntax_min: 1.1, verdict: "FAIL" },
          ];
        case "stats_summary":
          // `buckets` bu nesnenin İÇİNDE gelir; ayrı komut yok. Eksik bırakınca
          // geçmiş ekranı "reading 'length'" ile düşüyordu.
          return {
            ticksToday: 12,
            themeChangesToday: 2,
            avgAppliedToday: 44,
            frozenTicksToday: 1,
            buckets: Array.from({ length: 12 }, (_, i) => ({ hoursAgo: i, appliedAvg: 30 + i * 2, desiredAvg: 40, samples: 3 })),
          };
        case "stats_buckets":
          return Array.from({ length: 12 }, (_, i) => ({ hoursAgo: i, appliedAvg: 30 + i * 2, desiredAvg: 40, samples: 3 }));
        case "log_read":
          return [
            "2026-11-21T18:04:00.000Z | source=auto/auto | level=dim | tone=warm | desired=55 | applied=38 | theme=ss-dusk|dark | note=izle",
            "2026-11-21T18:03:00.000Z | source=auto/auto | level=dim | tone=warm | desired=55 | applied=38 | theme=ss-dusk|dark | note=izle",
            "2026-11-21T17:02:00.000Z | source=auto/auto | level=normal | tone=neutral | desired=60 | applied=52 | theme=ss-paper|light | note=tema değişti",
            "2026-11-21T16:01:00.000Z | source=auto/auto | level=bright | tone=neutral | desired=70 | applied=64 | theme=catppuccin-macchiato|dark | note=donduruldu tam ekran (zen.exe)",
          ];
        case "log_clear":
        case "log_tick":
          return null;
        case "log_lines":
          // Geçmiş ekranı `log_lines` okur (log_read DEĞİL); boş dizi kareyi
          // "Henüz kayıt yok" hâline düşürüyordu.
          return [
            "2026-11-21T18:04:00.000Z | source=auto/auto | level=dim | tone=warm | desired=55 | applied=38 | theme=ss-dusk|dark | note=izle",
            "2026-11-21T18:03:00.000Z | source=auto/auto | level=dim | tone=warm | desired=55 | applied=38 | theme=ss-dusk|dark | note=izle",
            "2026-11-21T17:02:00.000Z | source=auto/auto | level=normal | tone=neutral | desired=60 | applied=52 | theme=ss-paper|light | note=tema degisti",
            "2026-11-21T16:01:00.000Z | source=auto/auto | level=bright | tone=neutral | desired=70 | applied=64 | theme=catppuccin-macchiato|dark | note=donduruldu tam ekran (zen.exe)",
            "2026-11-21T15:00:00.000Z | source=auto/auto | level=bright | tone=neutral | desired=72 | applied=66 | theme=catppuccin-macchiato|dark | note=izle",
          ];
        case "gamma_set_warmth":
          if (args && typeof args.percent === "number") window.__warm = args.percent;
          return null;
        case "gamma_restore":
          window.__warm = 0;
          return null;
        case "gamma_verify_warmth": {
          const blue = (p) => Math.round(100 - Number(p) * 0.24);
          return [blue(args.percent), blue(window.__warm || 0)];
        }
        case "diagnose":
          return {
            version: "3.6.2",
            checks: [
              { name: "Kamera", status: "warn", detail: "kamera acilamadi: Could not open device 0" },
              { name: "Parlaklık", status: "ok", detail: "WMI yazma calisiyor" },
              { name: "HDR", status: "ok", detail: "DISPLAY1: hdr=false" },
              { name: "Harici monitors", status: "warn", detail: "DISPLAY3: DDC/CI kapali" },
              { name: "Tema dosyaları", status: "ok", detail: "3 tema bulundu" },
              { name: "Lisans", status: "ok", detail: "ucretsiz surum" },
            ],
          };
        case "animations_set":
          return null;
        case "flyout_hide":
          return null;
        case "plugin:event|listen":
          return 1;
        case "plugin:event|unlisten":
        case "plugin:event|emit":
          return null;
        case "plugin:app|version":
          return "3.6.2";
        case "plugin:window|show":
        case "plugin:window|set_focus":
          return null;
        default:
          // Sessizce yutma: eksik stub komutu kareyi yarıda keser.
          console.error("stub eksik komut: " + cmd);
          return null;
      }
    },
    transformCallback: (cb) => {
      const id = Math.random();
      window["_" + id] = cb;
      return id;
    },
    unregisterCallback: () => {},
  };
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const server = createServer((req, res) => {
  const p = (req.url || "/").split("?")[0];
  const file = resolve(distRoot, "." + (p === "/" ? "/index.html" : p));
  if (!file.startsWith(distRoot + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = readFileSync(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

/** WebP başlığından gerçek piksel boyutu. */
function webpSize(buf) {
  if (buf.length < 30) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const fmt = buf.toString("ascii", 12, 16);
  if (fmt === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (fmt === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (fmt === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  return null;
}

const goTo = async (page, tab) => {
  await page.locator(`.tab[data-tab="${tab}"]`).click();
  await page.waitForTimeout(350);
};

const SHOTS = [
  {
    file: "overview.webp",
    theme: "fildisi",
    // Galerinin açılış karesi: hero karesiyle aynı kartı TEKRAR göstermek
    // yerine tüm Durum sayfası (hero + monitörler birlikte).
    selector: "#page-panel",
    note: "Durum sayfası: hero + monitörler",
    prepare: async (page) => {
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        for (const t of document.querySelectorAll(".toast, .toasts, .toast-wrap")) t.remove();
      });
      await page.waitForTimeout(100);
    },
  },
  {
    file: "hero.webp",
    theme: "fildisi",
    selector: ".hero-body",
    note: "Durum: parlaklık, mod, gün eğrisi (açık tema)",
    prepare: async (page) => {
      await page.evaluate(() => {
        const h = document.getElementById("hero-status");
        if (h) h.style.padding = "0";
      });
      await page.waitForTimeout(120);
    },
    // Hero karesi galeride de kullanılıyor ama hero bölümünde tam genişlik;
    // oran zorlaması ekranın üstünü kesiyordu.
    keepRatio: true,
  },
  {
    file: "monitors.webp",
    theme: "gece",
    selector: "#monitor-box",
    note: "Monitörler: üç ekran, biri DDC hatası",
    prepare: async (page) => {
      await page.evaluate(() => window.__emit && window.__emit("ss:action", { action: "measure" }));
      await page.waitForTimeout(900);
    },
  },
  {
    file: "warmth.webp",
    theme: "gunbatimi",
    selector: ".panel-box:has(#warm-seg)",
    note: "Sıcak ton: şiddet, tavan, Kelvin",
    prepare: async (page) => goTo(page, "settings"),
  },
  {
    file: "contrast.webp",
    theme: "kagit",
    selector: ".panel-box:has(#audit-list)",
    note: "Kontrast denetimi: AA / FAIL rozetleri",
    prepare: async (page) => {
      await goTo(page, "settings");
      await page.evaluate(() => {
        const d = document.getElementById("advanced");
        if (d) d.open = true;
      });
      await page.waitForTimeout(220);
      const b = page.locator("#audit-refresh");
      if (await b.count()) {
        await b.click();
        await page.waitForTimeout(650);
      }
      await page.evaluate(() => {
        for (const t of document.querySelectorAll(".toast, .toasts, .toast-wrap")) t.remove();
      });
      await page.waitForTimeout(120);
    },
  },
  {
    file: "profiles.webp",
    theme: "gece",
    selector: "#profile-cards",
    note: "Profiller: üç kart",
    prepare: async (page) => goTo(page, "profiles"),
  },
  {
    file: "themes.webp",
    theme: "fildisi",
    // `:has(#theme-picker)` kartın TAMAMINI (yedekleme, lisans, hakkında) alıyordu.
    // Yalnız çip satırı.
    selector: "#theme-picker",
    note: "Temalar: renk şeritli çipler",

    prepare: async (page) => {
      await goTo(page, "settings");
      await page.evaluate(() => {
        const d = document.getElementById("advanced");
        if (d) d.open = true;
      });
      await page.waitForTimeout(260);
      await page.evaluate(() => {
        for (const t of document.querySelectorAll(".toast, .toasts, .toast-wrap")) t.remove();
      });
      await page.waitForTimeout(120);
    },
  },
  {
    file: "history.webp",
    theme: "gunbatimi",
    selector: "#hist-panel",
    note: "Geçmiş: ölçüm kayıtları",
    prepare: async (page) => {
      await goTo(page, "history");
      await page.waitForTimeout(600);
    },
  },
  {
    file: "diagnostics.webp",
    theme: "gece",
    selector: "#diag-box",
    note: "Tanılama: kontrol satırları",
    prepare: async (page) => {
      await goTo(page, "settings");
      const b = page.locator("#diag-run");
      if (await b.count()) {
        await b.click();
        await page.waitForTimeout(800);
      }
      await page.evaluate(() => {
        for (const t of document.querySelectorAll(".toast, .toasts, .toast-wrap")) t.remove();
      });
      await page.waitForTimeout(120);
    },
  },
];

const PAD = 28;
const sizes = [];
const problems = [];
let written = 0;

const browser = await chromium.launch();
try {
  for (const shot of SHOTS) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: "dark",
    });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));

    await page.addInitScript(fixture);
    await page.addInitScript((cfg) => {
      try {
        localStorage.setItem("ss:onboarded", "1");
        localStorage.setItem("ss:designTheme", cfg.theme);
        localStorage.setItem("ss:template", "konsol");
        localStorage.setItem("ss:warmPercent", "70");
        localStorage.setItem("ss:warmMode", "auto");
        localStorage.setItem("ss:autoPalette", "0");
        // Profiller stub'dan değil localStorage'dan okunur; üç kart için tohumla.
        localStorage.setItem(
          "ss:profiles",
          JSON.stringify([
            { id: "p1", name: "İş", mode: "auto", source: "auto", theme: "ss-dusk", themeMode: "dark", offset: 0, apps: ["code.exe", "windowsterminal.exe", "zen.exe"], autoLock: false },
            { id: "p2", name: "Film", mode: "fixed", source: "auto", theme: "ss-night", themeMode: "dark", offset: -10, apps: ["vlc.exe", "mpv.exe"], autoLock: true },
            { id: "p3", name: "Okuma", mode: "auto", source: "light", theme: "ss-paper", themeMode: "light", offset: 6, apps: ["sumatrapdf.exe"], autoLock: false },
          ]),
        );
        localStorage.setItem("ss:activeProfile", "p1");
      } catch {
        /* storage kapalı */
      }
    }, { theme: shot.theme });

    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);

    if (shot.prepare) await shot.prepare(page);

    if (consoleErrors.length) {
      problems.push(`${shot.file}: konsol hatası — ${consoleErrors.slice(0, 2).join(" | ").slice(0, 160)}`);
    }

    const applied = await page.evaluate(() => document.documentElement.dataset.theme || "");
    if (applied !== shot.theme) {
      problems.push(`${shot.file}: tema uygulanmadı (beklenen ${shot.theme}, gelen ${applied || "yok"})`);
    }

    const loc = page.locator(shot.selector).first();
    if ((await loc.count()) === 0) {
      problems.push(`${shot.file}: seçici yok — ${shot.selector}`);
      await ctx.close();
      continue;
    }

    // KAPI 2: clip koordinatı görünüm alanına göre. Öğe katlanma çizgisinin
    // altındaysa önce görünür alana getir.
    await loc.scrollIntoViewIfNeeded();
    await page.waitForTimeout(180);
    // Sayfa kaydıkça oda kararır; kare için sabit ışık istiyoruz.
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--room", "0");
    });

    const box = await loc.boundingBox();
    if (!box || box.width < 40 || box.height < 20) {
      problems.push(`${shot.file}: seçici görünmüyor/ölçülemiyor`);
      await ctx.close();
      continue;
    }

    // KAPI 3: boş kare = yanlış kare.
    const textLen = (await loc.evaluate((el) => (el.textContent || "").trim().length)) ?? 0;
    if (textLen < 12) {
      problems.push(`${shot.file}: hedef öğe boş (${textLen} karakter)`);
      await ctx.close();
      continue;
    }

    // İçeriğin GERÇEK alt sınırı: kapsayıcı kutunun yüksekliği grid/flex
    // yüzünden içerikten büyük olabiliyor (profiller karesinde 1516px'lik
    // kare çıkmıştı, altı bomboş). Son görünür çocuğun altına kadar kırp.
    const contentBottom = await loc.evaluate((el) => {
      // Ölçüt: ÇOCUKLARIN alt sınırı. Kapsayıcının kendi bottom'ı grid/flex
      // yüzünden içerikten büyük olabiliyor (profiller: 1460px kare, altta
      // 800px boşluk). Çocuk yoksa kapsayıcıya düş.
      let bottom = 0;
      for (const child of el.children) {
        const r = child.getBoundingClientRect();
        if (r.height > 0 && r.width > 0) bottom = Math.max(bottom, r.bottom);
      }
      return bottom > 0 ? bottom : el.getBoundingClientRect().bottom;
    });
    // Hedef öğenin kutusu + dolgu.
    let clip = {
      x: Math.max(0, Math.floor(box.x - PAD)),
      y: Math.max(0, Math.floor(box.y - PAD)),
      width: Math.ceil(box.width + PAD * 2),
      height: Math.max(60, Math.ceil(contentBottom - box.y + PAD)),
    };

    // Çok ince hedef (ör. tek satır tema çipi) 20:1 şerit üretiyor ve sayfada
    // okunmuyor. Kırpmayı öğenin KENDİ merkezi etrafında simetrik büyüt:
    // kardeş öğelere varsayım yapmadan, ölçülebilir biçimde.
    const MIN_H = 260;
    if (clip.height < MIN_H) {
      const grow = Math.min(MIN_H - clip.height, 300);
      clip.y = Math.max(0, clip.y - Math.floor(grow / 2));
      clip.height += grow;
    }

    // Galeri düzeni için hedef oranı 16:9'a yaklaştır. Oranlar 1.4 ile 8.3
    // arasında değişiyor ve iki sütunda dağınık görünüyor; kırpmayı EN-BOY
    // oranına göre simetrik büyüt (içerik kaybolmaz, çevresi genişler).
    // HERO İSTİSNASI: hero karesi hero bölümünde tam genişlik kullanılıyor;
    // oranı zorlamak ekranın üstünü kesiyordu. Onu olduğu gibi bırak.
    const targetRatio = 16 / 9;
    const ratio = clip.width / clip.height;
    if (!shot.keepRatio) {
      if (ratio > targetRatio * 1.15) {
        const want = Math.ceil(clip.width / targetRatio);
        const grow = want - clip.height;
        clip.y = Math.max(0, clip.y - Math.floor(grow / 2));
        clip.height = want;
      } else if (ratio < targetRatio / 1.15) {
        const want = Math.ceil(clip.height * targetRatio);
        const grow = want - clip.width;
        clip.x = Math.max(0, clip.x - Math.floor(grow / 2));
        clip.width = want;
      }
    }

    const out = join(outDir, shot.file);
    await page.screenshot({ path: out, type: "webp", quality: 82, clip });

    const size = statSync(out).size;
    const dims = webpSize(readFileSync(out));
    if (dims) sizes.push({ file: shot.file, w: dims.w, h: dims.h });
    else problems.push(`${shot.file}: boyut okunamadı`);

    if (size > MAX) {
      problems.push(`${shot.file}: ${(size / 1024).toFixed(0)} KB > 120 KB`);
    } else {
      console.log(
        `yazıldı: ${shot.file} (${(size / 1024).toFixed(0)} KB, ${dims ? dims.w + "×" + dims.h : "?"}) — ${shot.note}`,
      );
      written++;
    }
    await ctx.close();
  }

  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(sizes, null, 1) + "\n", "utf8");

  // og.png: 1200×630, sayfaya yüklenmez.
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const tmp = join(root, "site/v2/.og.html");
    writeFileSync(
      tmp,
      `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"Bricolage";src:url("./assets/fonts/bricolage.woff2") format("woff2-variations");font-weight:200 800;font-stretch:75% 100%}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#05070a;color:#eeece7;font-family:"Bricolage",system-ui,sans-serif;
padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
body::before{content:"";position:absolute;left:50%;top:-10%;transform:translateX(-50%);width:900px;height:620px;
background:radial-gradient(ellipse at 50% 42%,rgba(255,190,134,.17),rgba(255,190,134,.05) 40%,transparent 68%);filter:blur(8px)}
.b{position:relative;display:flex;align-items:center;gap:10px;font-size:19px;font-weight:600}
h1{position:relative;font-size:56px;font-weight:250;letter-spacing:-.038em;line-height:1.05;max-width:18ch}
.sub{position:relative;font-size:21px;color:#9aa0a8;font-weight:360;max-width:34ch;margin-top:16px}
</style></head><body>
<div class="b"><svg viewBox="0 0 24 24" width="22" height="22" fill="none"><rect x="2.5" y="5.5" width="19" height="12.5" rx="2" stroke="#ffbe86" stroke-width="1.6"/><path d="M1 21h22" stroke="#ffbe86" stroke-width="1.6" opacity=".5"/><path d="M7.5 11.75h9" stroke="#ffbe86" stroke-width="2.2" stroke-linecap="round"/></svg>smart-screen</div>
<div><h1>Oda karanlıkken ekran da karanlık olmalı.</h1><p class="sub">Ortam ışığını ölçer; parlaklığı ve sıcak tonu buna göre ayarlar.</p></div>
</body></html>`,
      "utf8",
    );
    await page.goto("file:///" + tmp.replace(/\\/g, "/"), { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(root, "site/v2/og.png"), type: "png" });
    console.log(`yazıldı: og.png (${(statSync(join(root, "site/v2/og.png")).size / 1024).toFixed(0)} KB)`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  for (const p of problems) console.error("HATA: " + p);
  console.error(`\nSONUÇ: FAIL (${problems.length} problem, ${written} kare)`);
  process.exit(1);
}
console.log(`\nSONUÇ: PASS (${written} kare + og.png)`);
