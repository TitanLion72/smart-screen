import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const root = "C:/Users/titan/Projeler/smart-screen/dist";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.addInitScript(() => {
  window.__TAURI_INTERNALS__ = { invoke: async (cmd) => {
    if (cmd === "plugin:event|listen") return 1;
    if (cmd === "theme_get") return ["ss-dusk", "dark"];
    if (cmd === "monitor_list") return [{ id: "\\\\.\\DISPLAY1", name: "Generic PnP Monitor", is_internal: true, api: "wmi" }];
    if (cmd === "brightness_get") return 42;
    if (cmd === "license_status") return { pro: false, email: null, issued: null };
    if (cmd === "decide_target") return ["ss-dusk", "dark", 30];
    if (cmd === "decide_brightness") return 30;
    if (cmd === "light_sample") return [20, 1, "dim", "neutral"];
    if (cmd === "pref_get" || cmd === "pref_list") return null;
    if (cmd === "battery_status") return [85, true];
    if (cmd === "log_read" || cmd === "stats_summary") return [];
    return null;
  }};
});
await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const info = await page.evaluate(() => {
  const p = document.querySelector(".page:not([hidden])");
  const pr = p.getBoundingClientRect();
  const out = [];
  for (const n of p.querySelectorAll("*")) {
    const r = n.getBoundingClientRect();
    if (r.right > pr.right + 1) {
      out.push({
        tag: n.tagName.toLowerCase(),
        cls: n.className && n.className.baseVal !== undefined ? n.className.baseVal : n.className,
        id: n.id,
        right: Math.round(r.right),
        width: Math.round(r.width),
      });
    }
  }
  return { pageRight: Math.round(pr.right), scrollW: p.scrollWidth, clientW: p.clientWidth, over: out.slice(0, 8) };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
server.close();
