// 5 tasarım temasını aynı ekranda yakalar (görsel doğrulama).
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { join, extname, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "dist");
const out = join(here, "audit");
await mkdir(out, { recursive: true });

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
    { id: "\\\\.\\DISPLAY1", name: "Generic PnP Monitor", is_internal: true, api: "wmi" },
    { id: "\\\\.\\DISPLAY2", name: "Dell U2415", is_internal: false, api: "ddc" },
  ];
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd) => {
      const R = {
        brightness_get: 42, brightness_set: null, is_fullscreen: false, foreground_exe: "firefox.exe",
        theme_get: ["catppuccin-macchiato", "dark"], theme_set: null,
        decide_target: ["ss-dusk", "dark", 30], decide_brightness: 30, brightness_floor: 0,
        light_sample: [20.5, 1.0, "dim", "neutral"], autostart_get: true, autostart_set: null,
        pref_get: null, pref_list: null, pref_learn: null, pref_learn_bright: null, pref_get_bright: null, pref_clear: null,
        monitor_list: monitors, brightness_get_monitor: 42, brightness_set_monitor: null,
        license_status: { pro: true, email: "qa@test.local", issued: "2026-10-20" },
        license_activate: { pro: true, email: "qa@test.local", issued: "2026-10-20" },
        license_deactivate: { pro: false, email: null, issued: null },
        battery_status: [85, true], hdr_status: false,
        hdr_status_all: monitors.map((m) => ({ device: m.id, hdr: false })),
        monitor_color_temp_info: monitors.map((m) => ({ device: m.id, supported: !m.is_internal, increment: 50 })),
        monitor_set_color_temp: null, warmth_auto: 30, animations_set: null, flyout_hide: null,
        gamma_restore: null, gamma_set_warmth: null, log_tick: null, log_clear: null,
        log_lines: ["2026-10-26T12:00:00.000Z | source=auto/auto | level=bright | tone=neutral | desired=30 | applied=42 | theme=catppuccin-macchiato|dark | note=izle"],
        stats_summary: { buckets: Array.from({ length: 12 }, (_, i) => ({ hoursAgo: i, appliedAvg: 30 + i * 2, desiredAvg: 40, samples: 3 })), theme_changes_today: 2, avg_applied_today: 44, frozen_ticks_today: 1, ticks_today: 12 },
        contrast_audit: [{ name: "ss-night", mode: "dark", text_on_bg: 8.5, muted_on_bg: 4.9, syntax_min: 4.2, verdict: "AAA" }],
        "plugin:event|listen": 1, "plugin:event|unlisten": null,
        "plugin:app|version": "2.4.0",
        "plugin:window|show": null, "plugin:window|set_focus": null,
      };
      if (cmd in R) return R[cmd];
      throw new Error("stub: " + cmd);
    },
    transformCallback: (cb) => { const id = Math.random(); window["_" + id] = cb; return id; },
    unregisterCallback: () => {},
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
  };
};

const themes = ["obsidyen", "gece", "orman", "gul", "fildisi"];
const browser = await chromium.launch();
for (const t of themes) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.addInitScript(stub);
  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
  await page.evaluate((th) => { document.documentElement.dataset.theme = th; }, t);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(out, `theme-${t}.png`) });
  // Ayarlar'daki seçici görünümü
  await page.locator("#tab-settings").click();
  await page.waitForTimeout(350);
  await page.evaluate(() => { const d = document.getElementById("advanced"); if (d) d.open = true; });
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(out, `theme-${t}-settings.png`) });
  await page.close();
}
await browser.close();
server.close();
console.log("5 tema yakalandi");
