// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — tanıtım sitesi için gerçek ekran görüntüleri
   (tools/site-shots.mjs)

   Neden kendi stub'ı var (qa/run.mjs'inki paylaşılmıyor):
   - Site kareleri deterministik olmalı: gerçek makinedeki geçici durum
     (kamera meşgul, lisans Pro, DDC hatası) siteye sızmamalı.
   - QA fixture'ı 22 senaryoya bağlı; onu değiştirmek testleri riske atar.
   Ayrışma riski `SHOTS` seçicilerinin ZORUNLU olmasıyla sınırlanır: kart
   kimliği değişirse araç gürültülü biçimde durur, sessizce boş görsel
   yayınlamaz.

   Çerçeveleme: tam pencere değil, HEDEF ÖĞE + 32px dolgu. 1440×900'ü
   küçültmek okunmaz; "kontrast kartı" ise katlanma çizgisinin altında.

   Kullanım: node tools/site-shots.mjs
   Önkoşul : npm.cmd run build   (dist/ gerekli)
   ═══════════════════════════════════════════════════════════════════ */

import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const distRoot = join(root, "dist");
const outDir = join(root, "site", "assets", "shots");
const MAX_BYTES = 120 * 1024;

if (!existsSync(distRoot)) {
  console.error("HATA: dist/ yok — önce: npm.cmd run build");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const qaPkg = join(root, "qa", "package.json");
if (!existsSync(qaPkg)) {
  console.error("HATA: qa/package.json yok — playwright çözülemez");
  process.exit(2);
}
let chromium;
try {
  chromium = createRequire(qaPkg)("playwright").chromium;
} catch {
  console.error("HATA: playwright bulunamadı — önce: cd qa && npm install");
  process.exit(2);
}

// ── deterministik fixture ───────────────────────────────────────────
// DİKKAT: bu fonksiyon `addInitScript` ile TARAYICIYA string olarak gider.
// Dışarıdaki değişkenleri okuyamaz — `MONITORS` gibi bir sabiti referans
// vermek `ReferenceError` üretir ve invoke reddedilir; sonuç sessizce boş
// liste olur (night.webp tam bu yüzden boş çıkmıştı). Tüm veri içeride.
const fixture = () => {
  const monitors = [
    { id: "\\\\.\\DISPLAY1", name: "Generic PnP Monitor", is_internal: true, api: "wmi" },
    { id: "\\\\.\\DISPLAY2", name: "Dell U2415", is_internal: false, api: "ddc" },
    { id: "\\\\.\\DISPLAY3", name: "Ancak Ekran", is_internal: false, api: "ddc" },
  ];
  window.__invocations = [];
  window.__bright = 38;
  window.__warm = 55;
  window.__TAURI_INTERNALS__ = {
    // Tauri v2 pencere API'si bu nesneyi okur; yoksa boot yarıda kalır
    // ("Cannot read properties of undefined (reading 'currentWindow')").
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    invoke: async (cmd, args) => {
      window.__invocations.push([cmd, args]);
      switch (cmd) {
        case "brightness_get":
          return window.__bright;
        case "brightness_set":
          window.__bright = args && typeof args.value === "number" ? args.value : window.__bright;
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
        case "pref_list":
        case "pref_learn":
        case "pref_learn_bright":
        case "pref_get_bright":
        case "pref_clear":
          return null;
        case "monitor_list":
          return monitors;
        case "brightness_get_monitor":
          return 42;
        case "brightness_set_monitor":
          // Üçüncü monitör DDC/CI'yi reddediyor: karede gerçek hata satırı çıksın.
          if (args && String(args.id).includes("DISPLAY3")) {
            throw "DDC/CI bu monitorda calismiyor (OSD'den kapali olabilir)";
          }
          return null;
        case "license_status":
          // ÜCRETSİZ: site kareleri "ücretsiz sürüm" bağlamını göstersin.
          return { pro: false, email: null, issued: null };
        case "license_activate":
          return { pro: false, email: null, issued: null };
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
          return { ticksToday: 12, themeChangesToday: 2, avgAppliedToday: 44, frozenTicksToday: 1 };
        case "stats_buckets":
          return Array.from({ length: 12 }, (_, i) => ({ hoursAgo: i, appliedAvg: 30 + i * 2, desiredAvg: 40, samples: 3 }));
        case "log_read":
          return [
            "2026-11-20T18:04:00.000Z | source=auto/auto | level=dim | tone=warm | desired=55 | applied=38 | theme=ss-dusk|dark | note=izle",
            "2026-11-20T18:03:00.000Z | source=auto/auto | level=dim | tone=warm | desired=55 | applied=38 | theme=ss-dusk|dark | note=izle",
          ];
        case "log_clear":
        case "log_tick":
          return null;
        case "log_lines":
          return [];
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
        case "animations_set":
          return null;
        case "flyout_hide":
          return null;
        case "plugin:event|listen":
          return 1;
        case "plugin:event|unlisten":
          return null;
        case "plugin:event|emit":
          return null;
        case "plugin:app|version":
          return "3.6.1";
        case "plugin:window|show":
        case "plugin:window|set_focus":
          return null;
        default:
          // Sessizce yutma: eksik stub komutu kareyi yarıda kesiyordu ve
          // ekran görüntüsü "%0 / Ulaşılmak istenen −" diye boş çıkıyordu.
          // Burada gürültü çıkar, çağıran taraf konsolu toplayıp raporlar.
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

// ── statik sunucu ───────────────────────────────────────────────────
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
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

// ── kare tablosu ────────────────────────────────────────────────────
/** `prepare` verilirse kare öncesi çalışır (sekme aç, details aç...).
 *
 *  Tema id'leri UYGULAMANIN paletlerinden (`src/catalog.ts`). İlk taslakta
 *  `ss-paper`/`ss-dusk`/`ss-night` yazılmıştı — onlar OpenCode **tema**
 *  adları, uygulama paleti değil; uygulama onları tanımaz ve `obsidyen`e
 *  düşerdi. Kare "şafak = açık" iddiasını taşıdığı için bu hata görünür.
 */
const SHOTS = [
  {
    file: "morning.webp",
    theme: "fildisi",
    // `#hero-status` kartın TAMAMI; geniş pencerede metin solda, eğri sağda
    // kalıyor ve arada büyük boşluk çıkıyor. `.hero-body` gerçek içerik
    // kutusudur — kare onu göstersin.
    selector: ".hero-body",
    note: "Durum hero: parlaklık, mod, 24 saat eğrisi (açık tema)",
    prepare: async (page) => {
      // Hero'nun iç boşluğu kartın kendisinden; sıkı kırpma için ölçüyü daralt.
      await page.evaluate(() => {
        const h = document.getElementById("hero-status");
        if (h) h.style.padding = "0";
      });
      await page.waitForTimeout(150);
    },
  },
  {
    file: "noon.webp",
    theme: "kagit",
    // Kartın tamamı: başlık + açıklama + liste + düğmeler. Yalnız liste
    // seçilince 8.3:1'lik ince bir şerit çıkıyor ve sayfada okunmuyor.
    // `prepare` toast'ları kapatıyor (kartın üstüne biniyorlardı).
    selector: ".panel-box:has(#audit-list)",
    note: "Kontrast denetimi listesi (AA / FAIL rozetleri)",
    prepare: async (page) => {
      await page.locator('.tab[data-tab="settings"]').click();
      await page.waitForTimeout(250);
      await page.evaluate(() => {
        const d = document.getElementById("advanced");
        if (d) d.open = true;
      });
      await page.waitForTimeout(250);
      const refresh = page.locator("#audit-refresh");
      if (await refresh.count()) {
        await refresh.click();
        await page.waitForTimeout(600);
      }
      // Toast'lar kartın üstüne biniyor: kare için kapat.
      await page.evaluate(() => {
        for (const t of document.querySelectorAll(".toast, .toasts, .toast-wrap")) t.remove();
      });
      await page.waitForTimeout(150);
    },
  },
  {
    file: "evening.webp",
    theme: "gunbatimi",
    selector: '.panel-box:has(#warm-seg)',
    note: "Sıcak ton kartı: şiddet, tavan, Kelvin",
    prepare: async (page) => {
      // Sıcak ton kartı Ayarlar sekmesinde yaşıyor.
      await page.locator('.tab[data-tab="settings"]').click();
      await page.waitForTimeout(400);
    },
  },
  {
    file: "night.webp",
    theme: "gece",
    selector: "#monitor-box",
    note: "Monitör listesi: üç ekran, biri DDC hatası",
    prepare: async (page) => {
      // DDC hatasının satırda görünmesi için monitörleri bir kez tara.
      await page.evaluate(() => window.__emit && window.__emit("ss:action", { action: "measure" }));
      await page.waitForTimeout(900);
    },
  },
];

const PAD = 32;

/** WebP başlığından gerçek piksel boyutu (VP8 / VP8L / VP8X). */
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

const sizes = [];
const browser = await chromium.launch();
const problems = [];
let written = 0;

try {
  for (const shot of SHOTS) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: "dark",
    });
    const page = await ctx.newPage();
    await page.addInitScript(fixture);
    await page.addInitScript((cfg) => {
      try {
        localStorage.setItem("ss:onboarded", "1");
        localStorage.setItem("ss:designTheme", cfg.theme);
        localStorage.setItem("ss:template", "konsol");
        localStorage.setItem("ss:warmPercent", "70");
        localStorage.setItem("ss:warmMode", "auto");
        // "Günün rengi" kareyi ezmesin: kare, temanın kendisini göstermeli.
        localStorage.setItem("ss:autoPalette", "0");
      } catch {
        /* storage kapalı */
      }
    }, { theme: shot.theme });

    const consoleErrors = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));

    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);

    if (shot.prepare) await shot.prepare(page);

    if (consoleErrors.length) {
      problems.push(`${shot.file}: konsol hatası — ${consoleErrors.slice(0, 3).join(" | ").slice(0, 200)}`);
    }

    // Tema gerçekten uygulandı mı? Kare "şafak = açık tema" iddiasını taşıyor;
    // yanlış temayla alınmış kare, yanlış bilgidir.
    const applied = await page.evaluate(() => document.documentElement.dataset.theme || "");
    if (applied !== shot.theme) {
      problems.push(`${shot.file}: tema uygulanmadı (beklenen ${shot.theme}, gelen ${applied || "yok"})`);
    }

    // Parlaklık okuması gerçekten yazıldı mı? (%0 = boot yarıda kaldı)
    if (shot.file === "morning.webp") {
      const bright = await page.evaluate(
        () => document.getElementById("st-bright")?.textContent?.trim() || "",
      );
      if (!/%\d+/.test(bright) || bright === "%0") {
        problems.push(`${shot.file}: parlaklık okuması boş/sıfır ("${bright}")`);
      }
    }

    const loc = page.locator(shot.selector).first();
    if ((await loc.count()) === 0) {
      problems.push(`${shot.file}: seçici yok — ${shot.selector}`);
      await ctx.close();
      continue;
    }
    // KRİTİK: `page.screenshot({clip})` koordinatları GÖRÜNÜM ALANINA göredir.
    // Öğe katlanma çizgisinin altındaysa kırpma ekran dışını gösterir ve
    // bambaşka bir sebeple "boş kare" çıkar (night.webp böyle boş kalmıştı:
    // monitör kartı 900px'in altındaydı). Önce öğeyi görünür alana getir.
    await loc.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);

    const box = await loc.boundingBox();
    if (!box || box.width < 40 || box.height < 20) {
      problems.push(`${shot.file}: seçici görünmüyor/ölçülemiyor — ${shot.selector}`);
      await ctx.close();
      continue;
    }

    // Boş kare kapısı: hedef öğenin gerçekten metni olmalı. "Yazıldı" demek,
    // "doğru şeyi gösteriyor" demek değil — bu kontrol ikisini ayırır.
    const textLen = (await loc.evaluate((el) => (el.textContent || "").trim().length)) ?? 0;
    if (textLen < 12) {
      problems.push(`${shot.file}: hedef öğe boş (${textLen} karakter) — ${shot.selector}`);
      await ctx.close();
      continue;
    }

    const clip = {
      x: Math.max(0, Math.floor(box.x - PAD)),
      y: Math.max(0, Math.floor(box.y - PAD)),
      width: Math.ceil(box.width + PAD * 2),
      height: Math.ceil(box.height + PAD * 2),
    };

    // İsteğe bağlı üst sınır: seçici dar bir öğeyse kare gereksiz geniş
    // çıkıyordu (noon: ince listeyi saran dev kart). `clipTo` verilirse
    // kırpma, [seçici ∪ dolgu] ile [kart ∪ dolgu] alanlarının KESİŞİMİ olur:
    // en az seçiciyi gösterir, kartın taşan kısmını (sağdaki toast'lar,
    // altındaki diğer kartlar) kadraja almaz.
    if (shot.clipTo) {
      const cap = await page.locator(shot.clipTo).first().boundingBox();
      if (cap) {
        const left = Math.max(clip.x, Math.floor(cap.x - PAD));
        const top = Math.max(clip.y, Math.floor(cap.y - PAD));
        const right = Math.min(clip.x + clip.width, Math.ceil(cap.x + cap.width + PAD));
        const bottom = Math.min(clip.y + clip.height, Math.ceil(cap.y + cap.height + PAD));
        if (right - left > 120 && bottom - top > 60) {
          clip.x = left;
          clip.y = top;
          clip.width = right - left;
          clip.height = bottom - top;
        }
      }
    }

    const out = join(outDir, shot.file);
    await page.screenshot({ path: out, type: "webp", quality: 82, clip });
    const size = statSync(out).size;
    // Gerçek boyutu kaydet: HTML'de yanlış width/height vermek CLS ve
    // bozulma demek (hepsine 1280×720 yazmak ilk denemede tam bunu yaptı).
    const dims = webpSize(readFileSync(out));
    if (!dims) {
      problems.push(`${shot.file}: boyut okunamadı`);
    } else {
      sizes.push({ file: shot.file, ...dims });
    }
    if (size > MAX_BYTES) {
      problems.push(`${shot.file}: ${(size / 1024).toFixed(0)} KB > 120 KB`);
    } else {
      console.log(
        `yazıldı: site/assets/shots/${shot.file} (${(size / 1024).toFixed(0)} KB, ${dims ? dims.w + "×" + dims.h : "?"}) — ${shot.note}`,
      );
      written++;
    }
    await ctx.close();
  }

  // Ölçü manifestosu: `tools/site-build.mjs` bunu okuyup doğru width/height yazar.
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(sizes, null, 1) + "\n", "utf8");
  console.log(`yazıldı: site/assets/shots/manifest.json (${sizes.length} kare)`);

  // ── og.png (1200×630): sosyal kart, sayfaya yüklenmez ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      :root{--bg:#0a0908;--text:#f5f1ea;--muted:#b8afa2;--accent:#d8b98a}
      *{margin:0;box-sizing:border-box}
      body{width:1200px;height:630px;background:var(--bg);color:var(--text);
        font-family:"Segoe UI",system-ui,sans-serif;padding:72px 80px;
        display:flex;flex-direction:column;justify-content:space-between}
      .top{display:flex;justify-content:space-between;align-items:baseline;
        font-family:Consolas,monospace;font-size:15px;letter-spacing:.16em;
        text-transform:uppercase;color:var(--muted)}
      .dot{width:8px;height:8px;background:var(--accent);display:inline-block;margin-right:12px}
      h1{font-size:64px;font-weight:300;letter-spacing:-.035em;line-height:1.05;max-width:19ch}
      .num{font-family:Consolas,monospace;font-size:150px;font-weight:300;letter-spacing:-.04em;line-height:.9}
      .row{display:flex;align-items:flex-end;gap:48px}
      .meta{font-family:Consolas,monospace;font-size:16px;color:var(--muted);letter-spacing:.08em}
      svg{flex:1;height:120px}
    </style></head><body>
      <div class="top"><span><span class="dot"></span>smart-screen</span><span>Windows · tepsi uygulaması</span></div>
      <h1>Ekranınız odanın ışığını ölçer.</h1>
      <div class="row">
        <div><div class="num">%38</div><div class="meta">parlaklık · akıllı</div></div>
        <svg viewBox="0 0 600 120" preserveAspectRatio="none">
          <path d="M0 12 C 150 12, 180 118, 300 118 S 450 24, 600 12" fill="none" stroke="#d8b98a" stroke-width="3" stroke-linecap="round"/>
        </svg>
      </div>
    </body></html>`;
    writeFileSync(join(root, "site", ".og.html"), html, "utf8");
    await page.goto("file:///" + join(root, "site", ".og.html").replace(/\\/g, "/"), { waitUntil: "load" });
    await page.waitForTimeout(200);
    const ogOut = join(root, "site", "og.png");
    await page.screenshot({ path: ogOut, type: "png" });
    const ogSize = statSync(ogOut).size;
    console.log(`yazıldı: site/og.png (${(ogSize / 1024).toFixed(0)} KB)`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  for (const p of problems) console.error("HATA: " + p);
  console.error(`\nSONUÇ: FAIL (${problems.length} problem, ${written} kare yazıldı)`);
  process.exit(1);
}
console.log(`\nSONUÇ: PASS (${written} kare + og.png)`);
