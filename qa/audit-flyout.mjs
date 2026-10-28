// Flyout matrisi: 4 şablon × 7 palet, 340×420, scroll YOK.
// Ölçer: dikey taşma, yatay kırpılma, düğme metni kesilmesi.
// Kareler: qa/audit/fx-<şablon>-<palet>.png · `node audit-flyout.mjs`
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

// Flyout'un ihtiyaç duyduğu minimum backend. Bilinmeyen komut null döner:
// bu araç GÖRÜNÜM ölçer, sözleşme denetimi qa/run.mjs'in işi.
const stub = () => {
  window.__calls = [];
  let n = 0;
  window.__TAURI_INTERNALS__ = {
    transformCallback: (cb) => {
      const id = ++n;
      window[`_${id}`] = cb;
      return id;
    },
    invoke: async (cmd, args) => {
      window.__calls.push(cmd);
      switch (cmd) {
        case "brightness_get":
          return 72;
        case "brightness_set":
          return args?.value ?? null;
        case "hdr_status":
          return false;
        case "flyout_hide":
          return null;
        case "plugin:event|listen":
          return 1;
        case "plugin:event|emit":
        case "plugin:event|unlisten":
          return null;
        case "plugin:app|version":
        case "app_version":
          return "2.7.0";
        default:
          return null;
      }
    },
  };
};

const TPLS = ["bento", "sahne", "dergi", "konsol"];
const PALS = ["obsidyen", "gece", "orman", "gul", "fildisi", "kagit", "grafit"];

const problems = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 340, height: 420 } });
await page.addInitScript(stub);
await page.goto(`http://localhost:${port}/flyout.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const measure = () =>
  page.evaluate(() => {
    const fx = document.querySelector(".fx");
    if (!fx) return null;
    const body = document.body.getBoundingClientRect();
    const fr = fx.getBoundingClientRect();
    const clipped = [];
    const ellipsis = [];
    for (const el of document.querySelectorAll(".fx *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > body.right + 1 || r.left < body.left - 1)) {
        clipped.push(el.id || el.tagName.toLowerCase());
      }
      if (
        el instanceof HTMLElement &&
        el.scrollWidth > el.clientWidth + 1 &&
        getComputedStyle(el).textOverflow === "ellipsis"
      ) {
        ellipsis.push(`${el.id || el.className}:${(el.textContent ?? "").trim().slice(0, 18)}`);
      }
    }
    return {
      over: Math.round(fx.scrollHeight - fx.clientHeight),
      docOver: Math.round(document.documentElement.scrollHeight - window.innerHeight),
      fxBottom: Math.round(fr.bottom),
      clipped: [...new Set(clipped)].slice(0, 4),
      ellipsis: [...new Set(ellipsis)].slice(0, 4),
    };
  });

for (const t of TPLS) {
  for (const p of PALS) {
    await page.evaluate(
      ([tpl, pal]) => {
        document.documentElement.dataset.template = tpl;
        document.documentElement.dataset.theme = pal;
      },
      [t, p],
    );
    await page.waitForTimeout(120);
    const m = await measure();
    await page.screenshot({ path: join(out, `fx-${t}-${p}.png`) });
    if (!m) {
      problems.push(`${t}/${p}: .fx bulunamadı`);
      continue;
    }
    if (m.over > 0) problems.push(`${t}/${p}: dikey taşma +${m.over}px`);
    if (m.docOver > 0) problems.push(`${t}/${p}: belge taşması +${m.docOver}px`);
    if (m.fxBottom > 421) problems.push(`${t}/${p}: .fx alt kenarı ${m.fxBottom}px`);
    if (m.clipped.length) problems.push(`${t}/${p}: yatay kırpılan ${m.clipped.join(",")}`);
    if (m.ellipsis.length) problems.push(`${t}/${p}: metin kesik ${m.ellipsis.join(",")}`);
    console.log(`${t}/${p}: +${m.over}px${m.ellipsis.length ? "  kesik:" + m.ellipsis.join(",") : ""}`);
  }
}

// localStorage kablosu: ana pencerede seçilen şablon/palet flyout'a geçiyor mu?
{
  await page.evaluate(() => {
    localStorage.setItem("ss:template", "dergi");
    localStorage.setItem("ss:designTheme", "kagit");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const got = await page.evaluate(() => ({
    t: document.documentElement.dataset.template,
    p: document.documentElement.dataset.theme,
  }));
  if (got.t !== "dergi" || got.p !== "kagit") {
    problems.push(`localStorage kablosu: beklenen dergi/kagit, gelen ${got.t}/${got.p}`);
  } else {
    console.log(`kablo: ${got.t}/${got.p} ✓`);
  }
  // Geçersiz değer → varsayılana düşmeli (bento/obsidyen)
  await page.evaluate(() => {
    localStorage.setItem("ss:template", "yok-boyle-bir-sey");
    localStorage.setItem("ss:designTheme", "neon");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const fb = await page.evaluate(() => ({
    t: document.documentElement.dataset.template,
    p: document.documentElement.dataset.theme,
  }));
  if (fb.t !== "bento" || fb.p !== "obsidyen") {
    problems.push(`geçersiz değer: beklenen bento/obsidyen, gelen ${fb.t}/${fb.p}`);
  } else {
    console.log(`geçersiz → ${fb.t}/${fb.p} ✓`);
  }
  await page.evaluate(() => {
    localStorage.removeItem("ss:template");
    localStorage.removeItem("ss:designTheme");
  });
}

await page.close();
await browser.close();
server.close();

if (problems.length) {
  for (const p of problems) console.log("PROBLEM " + p);
  console.log(`SONUC: FAIL (${problems.length})`);
  process.exit(1);
}
console.log("SONUC: PASS — 28 kare: qa/audit/");
