// Tüm sekmeleri + flyout'u birden fazla boyutta yakalar (kendi gözle inceleme için).
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "dist");
const out = join(here, "audit");
await mkdir(out, { recursive: true });

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
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

const stub = () => {
  const monitors = [
    { id: "\\\\.\\DISPLAY1", name: "Generic PnP Monitor", is_internal: true, api: "wmi" },
    { id: "\\\\.\\DISPLAY2", name: "Dell U2415", is_internal: false, api: "ddc" },
    { id: "\\\\.\\DISPLAY3", name: "Ancak Ekran", is_internal: false, api: "ddc" },
  ];
  window.__invocations = [];
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      window.__invocations.push([cmd, args]);
      switch (cmd) {
        case "brightness_get": return 42;
        case "brightness_set": return null;
        case "is_fullscreen": return false;
        case "foreground_exe": return "firefox.exe";
        case "theme_get": return ["catppuccin-macchiato", "dark"];
        case "theme_set": return null;
        case "decide_target": return ["ss-dusk", "dark", 30];
        case "decide_brightness": return 30;
        case "brightness_floor": return 0;
        case "light_sample": return [20.5, 1.0, "dim", "neutral"];
        case "autostart_get": return true;
        case "pref_get": case "pref_list": case "pref_learn": case "pref_learn_bright": case "pref_get_bright": case "pref_clear": return null;
        case "monitor_list": return monitors;
        case "brightness_get_monitor": return 42;
        case "brightness_set_monitor": return null;
        case "license_status": return { pro: true, email: "qa@test.local", issued: "2026-10-20" };
        case "license_activate": return { pro: true, email: "qa@test.local", issued: "2026-10-20" };
        case "battery_status": return [85, true];
        case "hdr_status": return false;
        case "hdr_status_all": return monitors.map((m) => ({ device: m.id, hdr: false }));
        case "monitor_color_temp_info": return monitors.map((m) => ({ device: m.id, supported: m.is_internal ? true : false, increment: 50 }));
        case "monitor_set_color_temp": return null;
        case "warmth_auto": return 30;
        case "contrast_audit": return [{ name: "ss-night", mode: "dark", text_on_bg: 8.5, muted_on_bg: 4.9, syntax_min: 4.2, verdict: "AAA" }];
        case "stats_summary": return { ticksToday: 12, themeChangesToday: 2, avgAppliedToday: 44, frozenTicksToday: 1 };
        case "stats_buckets": return Array.from({ length: 12 }, (_, i) => ({ hoursAgo: i, appliedAvg: 30 + i * 2, desiredAvg: 40, samples: 3 }));
        case "log_read": return [
          "2026-10-26T12:00:00.000Z | source=auto/auto | level=bright | tone=neutral | desired=30 | applied=42 | theme=catppuccin-macchiato|dark | note=izle",
          "2026-10-26T11:30:00.000Z | source=auto/auto | level=dim | tone=warm | desired=30 | applied=35 | theme=ss-dusk|dark | note=reddedildi",
        ];
        case "log_clear": return null;
        case "log_lines": return [];
        case "log_tick": return null;
        case "autostart_set": return null;
        case "flyout_hide": return null;
        case "gamma_restore": return null;
        case "gamma_set_warmth": return null;
        case "license_deactivate": return { pro: false, email: null, issued: null };
        case "plugin:event|listen": return 1;
        case "plugin:event|unlisten": return null;
        case "plugin:app|version": return "2.3.2";
        case "plugin:window|show": case "plugin:window|set_focus": return null;
        case "animations_set": return null;
        default: throw new Error("stub: bilinmeyen komut " + cmd);
      }
    },
    transformCallback: (cb) => { const id = Math.random(); window["_" + id] = cb; return id; },
    unregisterCallback: () => {},
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
  };
};

const sizes = [
  // v2.4.2: varsayılan pencere 1040x740 — ilk açılışta bu görünüyor.
  { w: 1040, h: 740, tag: "1040" },
  { w: 800, h: 600, tag: "800" },
  { w: 1000, h: 720, tag: "1000" },
  { w: 760, h: 600, tag: "760" },
  // v2.4.1: maksimize pencere — asıl kırılma burada oluyordu.
  { w: 1920, h: 1040, tag: "1920" },
  { w: 1440, h: 900, tag: "1440" },
];
const tabs = ["panel", "profiles", "history", "settings"];

const browser = await chromium.launch();
for (const s of sizes) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
  await page.addInitScript(stub);
  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  for (const t of tabs) {
    await page.locator(`#tab-${t}`).click();
    await page.waitForTimeout(450);
    // Gelişmiş'i de aç (Ayarlar'da)
    if (t === "settings") {
      await page.evaluate(() => {
        const d = document.getElementById("advanced");
        if (d) {
          d.open = true;
          d.scrollIntoView({ block: "start" });
        }
      });
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: join(out, `${s.tag}-${t}.png`), fullPage: false });
    // Gelişmiş açıksa tema seçicisini de yakala
    if (t === "settings") {
      await page.evaluate(() => {
        document.getElementById("design-picker")?.scrollIntoView({ block: "center" });
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(out, `${s.tag}-tema-secici.png`), fullPage: false });
    }
    // ölçüm
    const m = await page.evaluate(() => {
      const p = document.querySelector(".page:not([hidden])");
      const pr = p.getBoundingClientRect();
      const clipped = [];
      for (const n of p.querySelectorAll("*")) {
        const r = n.getBoundingClientRect();
        if (r.width > 0 && (r.right > pr.right + 1 || r.left < pr.left - 1)) {
          clipped.push((n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + (n.className && typeof n.className === "string" ? "." + n.className.split(" ")[0] : "")).slice(0, 40));
        }
      }
      return { sw: p.scrollWidth, cw: p.clientWidth, clip: [...new Set(clipped)].slice(0, 6) };
    });
    console.log(`${s.tag}-${t}: scrollW=${m.sw} clientW=${m.cw}${m.sw > m.cw ? "  TASMA" : ""}${m.clip.length ? "  kirpilan=" + m.clip.join(",") : ""}`);
  }
  await page.close();
}

// flyout
{
  const page = await browser.newPage({ viewport: { width: 340, height: 420 } });
  await page.addInitScript(stub);
  await page.goto(`http://localhost:${port}/flyout.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(out, "flyout.png") });
  await page.close();
}

await browser.close();
server.close();
console.log("bitti: qa/audit/");
