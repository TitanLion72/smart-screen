// Durum sayfasının dikey bütçesi: hangi bölüm ne kadar yer kaplıyor,
// toplam kaydırma ne kadar? (v2.4.2 karar ölçümü)
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "dist");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const p = (req.url || "/").split("?")[0];
  // Resolve against the fixed root and refuse anything that escapes it
  // (".." segments, absolute paths) to prevent path injection.
  const file = resolve(root, "." + (p === "/" ? "/index.html" : p));
  if (!file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const stub = () => {
  const monitors = [
    { id: "\\\\.\\DISPLAY1", name: "Dahili ekran 1", is_internal: true, api: "wmi" },
    { id: "\\\\.\\DISPLAY2", name: "Dell U2415", is_internal: false, api: "ddc" },
  ];
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd) => {
      switch (cmd) {
        case "brightness_get": return 42;
        case "is_fullscreen": return false;
        case "foreground_exe": return "firefox.exe";
        case "theme_get": return ["ss-dusk", "dark"];
        case "decide_target": return ["ss-dusk", "dark", 30];
        case "decide_brightness": return 30;
        case "brightness_floor": return 0;
        case "light_sample": return [20.5, 1.0, "dim", "neutral"];
        case "monitor_list": return monitors;
        case "brightness_get_monitor": return 42;
        case "license_status": return { pro: true, email: "qa@test.local", issued: "2026-10-20" };
        case "battery_status": return [85, true];
      case "nightlight_status": return null;
        case "hdr_status": return false;
        case "hdr_status_all": return [];
        case "monitor_color_temp_info": return [];
        case "stats_summary": return { buckets: [], ticksToday: 0, themeChangesToday: 0, avgAppliedToday: 0, frozenTicksToday: 0, frozenBreakdown: {} };
        case "log_tail": return ["22:10 | %42 | ss-dusk | otomatik", "22:09 | %42 | ss-dusk | otomatik", "22:08 | %41 | ss-dusk | otomatik", "22:07 | %41 | ss-dusk | otomatik", "22:06 | %40 | ss-dusk | otomatik", "22:05 | %40 | ss-dusk | otomatik"];
        default: return null;
      }
    },
  };
};

const browser = await chromium.launch();
for (const [w, h] of [[760, 600], [1040, 740], [1440, 900], [1920, 1040]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.addInitScript(stub);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => {
    const pg = document.querySelector("#page-panel");
    const q = (s) => document.querySelector(s);
    const H = (s) => { const e = q(s); return e ? Math.round(e.getBoundingClientRect().height) : null; };
    return {
      pageClient: pg.clientHeight,
      pageScroll: pg.scrollHeight,
      hero: H(".hero"),
      heroCurve: H("#hero-curve"),
      monitors: H("#monitor-box"),
      asym: H("#page-panel .asym"),
      log: H("#log"),
      stage: H(".stage"),
      dock: H(".dock"),
      topbar: H(".topbar"),
    };
  });
  console.log(`${w}x${h}:`, JSON.stringify(m));
  await page.close();
}
await browser.close();
server.close();
