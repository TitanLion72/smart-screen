// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ════════════════════════════════════════════════════════════════════
   qa/audit-accent.mjs — vurgu rengi izolasyonu + kontrast butonu (v2.8.1)

   Kullanıcı şikâyeti: "ne renk paleti seçersem seçeyim ilk temadaki sarı
   her yerde var." Kök neden: `[data-accent]` blokları `--accent`ı global
   ezip kalıcıydı; bir kez Şampanya seçilince tüm paletler altın görünüyordu.
   Ayrıca "Yeniden ölç" butonu sessizdi (veri aynıysa render cache listeyi
   yeniden çizmiyordu) — kullanıcı "çalışmıyor" sanıyordu.

   Bu araç üç şeyi kalıcı olarak denetler:
     1. Her paletin KENDİ vurgusu görünür (--accent == --accent-base).
     2. Bir palette elle seçilen vurgu BAŞKA palette sızmaz; geri dönünce
        hatırlanır (palet başına hafıza).
     3. "Yeniden ölç" gerçekten ölçer ve görünür geri bildirim verir.

   Kullanım:  node audit-accent.mjs        (önce `npm run build`)
   ════════════════════════════════════════════════════════════════════ */

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, resolve, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "dist");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  const p = (req.url || "/").split("?")[0];
  // Path injection koruması (PR #3 ile aynı sözleşme).
  const file = resolve(root, "." + (p === "/" ? "/index.html" : p));
  if (!file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
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

const problems = [];
const fail = (msg) => {
  problems.push(msg);
  console.log("PROBLEM " + msg);
};

// Paletler ve şablonlar kaynak dosyadan KEŞFEDİLİR (elle liste tutulmaz).
const PAL_CSS = await readFile(join(here, "..", "src", "palette.css"), "utf8");
const PALS = ["obsidyen", ...[...PAL_CSS.matchAll(/\[data-theme="([a-z0-9-]+)"\]/g)].map((m) => m[1])];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1040, height: 740 } });
await page.addInitScript(() => {
  window.__TAURI_INTERNALS__ = {
    transformCallback: () => 1,
    invoke: async (cmd) => {
      if (cmd === "brightness_get") return 70;
      if (cmd === "app_version") return "test";
      if (cmd === "log_tail") return [];
      if (cmd === "contrast_audit")
        return [
          { name: "ss-paper", mode: "light", text_on_bg: 14.2, muted_on_bg: 6.1, syntax_min: 5.4, verdict: "AAA" },
          { name: "matrix", mode: "dark", text_on_bg: 2.1, muted_on_bg: 1.8, syntax_min: 1.5, verdict: "FAIL" },
        ];
      return null;
    },
  };
});
await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const accentState = () =>
  page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      accent: cs.getPropertyValue("--accent").trim().toLowerCase(),
      base: cs.getPropertyValue("--accent-base").trim().toLowerCase(),
      attr: document.documentElement.dataset.accent ?? null,
      theme: document.documentElement.dataset.theme ?? null,
    };
  });

// ── 1) Her palet kendi vurgusunu gösterir ────────────────────────────
console.log("1) palet başına vurgu");
for (const p of PALS) {
  await page.evaluate((x) => {
    document.documentElement.dataset.theme = x;
    delete document.documentElement.dataset.accent;
  }, p);
  await page.waitForTimeout(90);
  const s = await accentState();
  if (!s.base) fail(`${p}: --accent-base tanımsız (palet kendi vurgusunu bilmiyor)`);
  else if (s.accent !== s.base) fail(`${p}: vurgu ${s.accent} ≠ palet rengi ${s.base} (yabancı renk sızıyor)`);
  else console.log(`   ${p}: ${s.accent} ✓`);
}

// ── 2) Elle seçim palette izole, geri dönünce hatırlanır ─────────────
console.log("2) vurgu izolasyonu ve palet başına hafıza");
await page.evaluate(() => document.getElementById("tab-settings")?.click());
await page.waitForTimeout(250);
await page.locator('#design-picker [data-design="okyanus"]').click();
await page.waitForTimeout(200);
await page.locator('#accent-picker [data-accent="amber"]').click();
await page.waitForTimeout(200);
const picked = await accentState();
if (picked.attr !== "amber") fail(`okyanus'ta amber seçilemedi (attr=${picked.attr})`);

await page.locator('#design-picker [data-design="lavanta"]').click();
await page.waitForTimeout(250);
const other = await accentState();
if (other.accent !== other.base) {
  fail(`lavanta'ya okyanus'un amber'i sızdı (${other.accent} ≠ ${other.base})`);
} else console.log(`   lavanta: ${other.accent} (temiz) ✓`);

await page.locator('#design-picker [data-design="okyanus"]').click();
await page.waitForTimeout(250);
const back = await accentState();
if (back.attr !== "amber") fail(`okyanus'a dönünce amber hatırlanmadı (attr=${back.attr})`);
else console.log("   okyanus'a dönüş: amber hatırlandı ✓");

// ── 3) "Yeniden ölç" çalışır ve görünür geri bildirim verir ──────────
console.log("3) kontrast 'Yeniden ölç'");
await page.evaluate(() => {
  const adv = document.getElementById("advanced");
  if (adv) adv.open = true;
});
await page.waitForTimeout(250);
await page.locator("#audit-refresh").scrollIntoViewIfNeeded();
const before = await page.locator("#audit-list .audit-row").count();
await page.locator("#audit-refresh").click();
await page.waitForTimeout(800);
const after = await page.locator("#audit-list .audit-row").count();
if (after !== 2) fail(`yeniden ölç sonrası satır ${after} (beklenen 2)`);
const toastText = await page.evaluate(
  () => [...document.querySelectorAll("#toast-host .toast")].map((n) => n.textContent).join(" | "),
);
if (!/ölçüldü/.test(toastText)) fail(`"Yeniden ölç" geri bildirim vermedi (toast="${toastText}")`);
else console.log(`   satır ${before}→${after}, toast: "${toastText.replace(/\s+/g, " ").trim()}" ✓`);

// ── 4) "Günün rengi" (v2.9) ──────────────────────────────────────────
console.log("4) günün rengi — saate göre palet");
await page.evaluate(() => {
  // Uygulamanın kendi seçim yolunu izle: palet gerçekten değişiyor mu?
  const before = document.documentElement.dataset.theme;
  const expected = window.__expectPaletteFor?.(new Date().getHours()) ?? null;
  window.__autoBefore = before;
  window.__autoExpected = expected;
});
// Dilim eşlemesini kaynaktan oku (tek kaynak: orchestr.paletteForHour).
const ORCH = await readFile(join(here, "..", "src", "orchestr.ts"), "utf8");
const hourMap = [...ORCH.matchAll(/if \(hour >= (\d+) && hour < (\d+)\) return "([a-z0-9-]+)"/g)].map((m) => ({
  from: Number(m[1]),
  to: Number(m[2]),
  id: m[3],
}));
if (hourMap.length < 4) fail(`paletteForHour dilimleri okunamadı (${hourMap.length})`);
for (const seg of hourMap) {
  if (!PALS.includes(seg.id)) fail(`paletteForHour tanımsız palet döndürüyor: ${seg.id}`);
}
console.log(`   ${hourMap.length} saat dilimi → hepsi tanımlı palet ✓`);

// Anahtar açılınca palet uygulanır ve kalıcı olur.
await page.evaluate(() => document.getElementById("tab-settings")?.click());
await page.waitForTimeout(250);
await page.locator("#auto-palette").scrollIntoViewIfNeeded();
await page.locator("#auto-palette").click();
await page.waitForTimeout(600);
const autoState = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  stored: localStorage.getItem("ss:autoPalette"),
}));
if (autoState.stored !== "1") fail(`günün rengi açılmadı (ss:autoPalette=${autoState.stored})`);
const hourNow = new Date().getHours();
const wantNow = hourMap.find((s) => hourNow >= s.from && hourNow < s.to)?.id;
if (wantNow && autoState.theme !== wantNow) {
  fail(`günün rengi açılınca palet ${autoState.theme} (saat ${hourNow} için beklenen ${wantNow})`);
} else {
  console.log(`   açıldı → palet ${autoState.theme} (saat ${hourNow}) ✓`);
}
// Kapat: kullanıcı seçimi korunur.
await page.locator("#auto-palette").click();
await page.waitForTimeout(400);
const offState = await page.evaluate(() => localStorage.getItem("ss:autoPalette"));
if (offState !== "0") fail(`günün rengi kapanmadı (ss:autoPalette=${offState})`);
else console.log("   kapandı → seçim sabit ✓");

await browser.close();
server.close();

if (problems.length) {
  console.log(`SONUC: FAIL (${problems.length} problem)`);
  process.exit(1);
}
console.log(`SONUC: PASS (${PALS.length} palet · vurgu izolasyonu · kontrast butonu)`);
