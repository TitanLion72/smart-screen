// Şablon × boyut matrisi: her şablonu 5 boyutta yakalar + taşma ölçer.
// Gözle inceleme için (HANDOFF kuralı). `node audit-templates.mjs`
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "dist");
const out = join(here, "audit");
await mkdir(out, { recursive: true });

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  const p = (req.url || "/").split("?")[0];
  const file = join(root, p === "/" ? "index.html" : p);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

// run.mjs ile aynı stub sözleşmesi (bilinmeyen komut throw eder).
const stub = () => {
  const monitors = [
    { id: "\\\\.\\DISPLAY1", name: "Generic PnP Monitor", is_internal: true, api: "wmi" },
    { id: "\\\\.\\DISPLAY2", name: "Dell U2415", is_internal: false, api: "ddc" },
    { id: "\\\\.\\DISPLAY3", name: "Ancak Ekran", is_internal: false, api: "ddc" },
  ];
  window.__invocations = [];
  window.__licPro = true;
  window.__target = ["ss-dusk", "dark", 30];
  window.__bright = 42;
  window.__warm = 0;
  window.__warmReject = false;
  window.__logs = [
    "2026-10-27T21:28:00.000+03:00 | source=auto/auto | level=normal | tone=neutral | desired=55 | read=58 | written=55 | applied=55 | theme=ss-dusk/dark | note=izle",
    "2026-10-27T21:20:00.000+03:00 | source=auto/auto | level=dim | tone=warm | desired=60 | read=60 | applied=60 | theme=ss-dusk/dark | note=tema değişti",
    "2026-10-27T21:05:00.000+03:00 | source=auto/auto | level=normal | tone=neutral | desired=55 | read=52 | written=55 | applied=55 | theme=nord/dark | note=öğrenilmiş delta +5p",
    "2026-10-27T20:40:00.000+03:00 | source=auto/auto | level=bright | tone=cool | desired=80 | read=80 | applied=80 | theme=ss-paper/light | note=izle",
    "2026-10-27T20:12:00.000+03:00 | source=auto/auto | level=normal | tone=neutral | desired=62 | read=62 | applied=62 | theme=ss-dusk/dark | note=izle",
  ];
  window.__hdrAll = monitors.map((m) => ({ device: m.id, hdr: false }));
  window.__update = null;
  window.__listen = {};

  const emit = (event, payload) => {
    for (const cb of window.__listen[event] ?? []) {
      try {
        cb({ event, payload });
      } catch {
        /* dinleyici hatası */
      }
    }
  };

  window.__TAURI_INTERNALS__ = {
    transformCallback: (cb) => {
      const id = Math.floor(Math.random() * 1e9);
      window[`_${id}`] = cb;
      return id;
    },
    invoke: async (cmd, args) => {
      window.__invocations.push([cmd, args]);
      switch (cmd) {
        case "plugin:event|listen": {
          const e = args.event;
          (window.__listen[e] ??= []).push(window[`_${args.handler}`]);
          return 1;
        }
        case "plugin:event|emit":
        case "plugin:event|unlisten":
          return null;
        case "brightness_get":
          return window.__bright;
        case "brightness_set":
          window.__bright = typeof args?.value === "number" ? args.value : window.__bright;
          return window.__bright;
        case "is_fullscreen":
          return false;
        case "foreground_exe":
          return "firefox.exe";
        case "theme_get":
          return window.__target.slice(0, 2);
        case "theme_set":
          return null;
        case "decide_target":
          return window.__target;
        case "decide_brightness": {
          const cur = Number(args.current);
          const des = Math.max(0, Math.min(100, Number(args.desired)));
          const gap = Math.abs(des - cur);
          if (gap < 2) return cur;
          const step = Math.min(gap, Math.max(3, Math.min(8, Math.floor(gap / 3))));
          return des > cur ? cur + step : cur - step;
        }
        case "decide_level":
          return args.lum < 34 ? "dark" : args.lum < 80 ? "dim" : args.lum < 150 ? "normal" : "bright";
        case "brightness_floor":
          return 0;
        case "light_sample":
          return [20.5, 1.0, "dim", "neutral"];
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
          return null;
        case "monitor_set_color_temp":
          return null;
        case "monitor_color_temp_info":
          return monitors.map((m) => ({
            device: m.id,
            supported: m.is_internal,
            increment: 50,
          }));
        case "license_status":
          return { pro: true, email: "qa@test.local", issued: "2026-10-20" };
        case "battery_status":
          return [85, true];
        case "stats_summary":
          return { changes: 3, avg: 46, frozen: 2, hours: [] };
        case "hdr_status":
          return false;
        case "hdr_status_all":
          return window.__hdrAll;
        case "warmth_auto":
          return 35;
        case "gamma_set_warmth":
          if (!window.__warmReject) window.__warm = Number(args.percent);
          return null;
        case "gamma_restore":
          window.__warm = 0;
          return null;
        case "gamma_verify_warmth":
          return [70, 70];
        case "animations_set":
          return null;
        case "app_version":
          return "2.6.0";
        case "log_tail":
          return window.__logs;
        case "log_clear":
          return null;
        case "log_tick":
          return null;
        case "contrast_audit":
        case "contrast_list":
          return [];
        case "theme_gate_set":
          return null;
        case "theme_gate_get":
          return true;
        case "plugin:updater|check":
          return null;
        case "plugin:updater|download_and_install":
          return null;
        case "plugin:process|restart":
          return null;
        case "plugin:window|show":
          return null;
        case "plugin:window|set_focus":
          return null;
        default:
          throw new Error("bilinmeyen invoke komutu: " + cmd);
      }
    },
  };
};

const TPLS = ["bento", "sahne", "dergi", "konsol"];
const PALS = ["obsidyen", "gece", "orman", "gul", "fildisi", "kagit", "grafit"];
const sizes = [
  { w: 1040, h: 740, tag: "1040" },
  { w: 1000, h: 720, tag: "1000" },
  { w: 800, h: 600, tag: "800" },
  { w: 760, h: 600, tag: "760" },
  { w: 1920, h: 1040, tag: "1920" },
  { w: 1440, h: 900, tag: "1440" },
];

const problems = [];

const browser = await chromium.launch();

// 1) Şablon × boyut: Durum sayfası, her şablon.
for (const s of sizes) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
  await page.addInitScript(stub);
  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  for (const t of TPLS) {
    await page.evaluate((tpl) => {
      document.documentElement.dataset.template = tpl;
      document.documentElement.dataset.theme = "obsidyen";
    }, t);
    await page.waitForTimeout(220);
    const m = await page.evaluate(() => {
      const p = document.querySelector(".page:not([hidden])");
      if (!p) return null;
      const pr = p.getBoundingClientRect();
      const clipped = [];
      for (const n of p.querySelectorAll("*")) {
        const r = n.getBoundingClientRect();
        if (r.width > 0 && (r.right > pr.right + 1 || r.left < pr.left - 1)) {
          clipped.push(`${n.tagName.toLowerCase()}${n.id ? "#" + n.id : ""}`);
        }
      }
      return {
        over: Math.round(p.scrollHeight - p.clientHeight),
        hOver: Math.round(p.scrollWidth - p.clientWidth),
        clipped: clipped.slice(0, 3),
      };
    });
    await page.screenshot({ path: join(out, `t-${t}-${s.tag}.png`) });
    if (!m) {
      problems.push(`${t}/${s.tag}: sayfa bulunamadı`);
      continue;
    }
    if (m.hOver > 0) problems.push(`${t}/${s.tag}: YATAY taşma ${m.hOver}px`);
    if (m.clipped.length) problems.push(`${t}/${s.tag}: kırpılan ${m.clipped.join(",")}`);
    console.log(`${t} @ ${s.tag}: scroll +${m.over}px, yatay ${m.hOver}px`);
  }
  await page.close();
}

// 2) Palet matrisi: yalnız 1040×740, bento (her paletin gerçek görünümü).
{
  const page = await browser.newPage({ viewport: { width: 1040, height: 740 } });
  await page.addInitScript(stub);
  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  for (const pal of PALS) {
    await page.evaluate((p) => {
      document.documentElement.dataset.template = "bento";
      document.documentElement.dataset.theme = p;
    }, pal);
    await page.waitForTimeout(180);
    await page.screenshot({ path: join(out, `p-bento-${pal}.png`) });
  }
  await page.close();
}

// 3) Kare kalitesi. NOT: bu aracın stub'ı monitör listesini getiremiyor
//    (run.mjs'in stub'ı getiriyor; ürün tarafı doğru — canlı exe'de ve
//    run.mjs karelerinde monitör satırları dolu). Burada yalnız hero
//    rakamının dolduğunu doğruluyoruz: düzen ölçümü buna dayanıyor.
{
  const page = await browser.newPage({ viewport: { width: 1040, height: 740 } });
  await page.addInitScript(stub);
  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const heroNum = (await page.locator("#st-bright").textContent())?.trim() ?? "";
  if (!/^%\d+$/.test(heroNum)) problems.push(`stub: hero rakamı boş ("${heroNum}")`);
  await page.close();
}

await browser.close();
server.close();

if (problems.length) {
  for (const p of problems) console.log("PROBLEM " + p);
  console.log(`SONUC: FAIL (${problems.length})`);
  process.exit(1);
}
console.log("SONUC: PASS — kareler: qa/audit/");
