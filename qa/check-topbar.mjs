// Üst şerit taşma ölçümü: her boyutta topbar içindeki öğelerin sağ kenarı
// pencere içinde kalıyor mu? (v2.4.2 kontrolü)
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
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd) => {
      switch (cmd) {
        case "brightness_get": return 42;
        case "is_fullscreen": return false;
        case "foreground_exe": return "firefox.exe";
        case "theme_get": return ["catppuccin-macchiato", "dark"];
        case "decide_target": return ["ss-dusk", "dark", 30];
        case "decide_brightness": return 30;
        case "brightness_floor": return 0;
        case "light_sample": return [20.5, 1.0, "dim", "neutral"];
        case "autostart_get": return true;
        case "monitor_list": return [{ id: "\\\\.\\DISPLAY1", name: "Generic PnP Monitor", is_internal: true, api: "wmi" }];
        case "brightness_get_monitor": return 42;
        case "license_status": return { pro: true, email: "qa@test.local", issued: "2026-10-20" };
        case "battery_status": return [85, true];
      case "nightlight_status": return null;
        case "hdr_status": return false;
        case "hdr_status_all": return [];
        case "monitor_color_temp_info": return [];
        case "stats_summary": return { buckets: [], ticksToday: 0, themeChangesToday: 0, avgAppliedToday: 0, frozenTicksToday: 0, frozenBreakdown: {} };
        case "log_tail": return [];
        default: return null;
      }
    },
  };
};

const browser = await chromium.launch();
for (const [w, h] of [[760, 600], [800, 600], [1040, 740], [1440, 900], [1920, 1040]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.addInitScript(stub);
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForTimeout(700);
  const info = await page.evaluate(() => {
    const bar = document.querySelector(".topbar");
    const kids = [...bar.children].map((c) => {
      const r = c.getBoundingClientRect();
      return { cls: c.className, right: Math.round(r.right), left: Math.round(r.left), txt: (c.textContent || "").trim().slice(0, 18) };
    });
    return { barW: Math.round(bar.getBoundingClientRect().width), scrollW: bar.scrollWidth, clientW: bar.clientWidth, kids };
  });
  const bad = info.kids.filter((k) => k.right > w - 1 || k.left < 0);
  console.log(`${w}x${h}: bar=${info.barW} scroll=${info.scrollW} client=${info.clientW} tasan=[${bad.map((b) => b.cls + "(" + b.txt + ")@" + b.right).join(", ")}]`);
  if (bad.length) console.log("   ", JSON.stringify(info.kids));
  await page.close();
}
await browser.close();
server.close();
