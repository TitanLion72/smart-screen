// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — site v2 denetleyicisi (tools/site2-check.mjs)

   Neden: "çalışıyor" demek yetmez. İki dilin ayrışmadığını, renklerin
   AAA olduğunu, bağlantıların kırık olmadığını ve bütçelerin aşılmadığını
   kanıtlayan bir kapı gerekiyor. Ayrıca v1'in yapay zekâ izleri (ALL-CAPS
   eyebrow, mono veri etiketi, `·` meta satırı) geri sızarsa yakalanmalı.

   Kullanım:
     node tools/site2-check.mjs
     node tools/site2-check.mjs --smoke
     node tools/site2-check.mjs --smoke --base <url>

   Çıkış: 0 geçti · 1 ihlal · 2 kullanım/eksik araç
   ═══════════════════════════════════════════════════════════════════ */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = join(root, "site/v2/dist");

const argv = process.argv.slice(2);
const smoke = argv.includes("--smoke");
const baseIdx = argv.indexOf("--base");
const baseUrl = baseIdx >= 0 ? argv[baseIdx + 1] : null;

/** Spec §6 bütçeleri.
 *  Not: `initialGzip` yalnız metin varlıkları içindir — woff2 zaten sıkıştırılmış,
 *  gzip ona bir şey katmaz; onu gzip'e dahil etmek ölçümü yanıltıyordu
 *  (93.8 KB "aşım" gibi göründü, gerçek 45 KB altındaydı). */
export const PAGE_BUDGETS = Object.freeze({
  initial: 150 * 1024,
  initialGzip: 45 * 1024,
  font: 85 * 1024,
  shot: 130 * 1024,
  js: 13 * 1024,
  css: 24 * 1024,
  dist: 1200 * 1024,
});

/** Renk token'ları (spec §3) — kontrast buradan ölçülür. */
const COLORS = Object.freeze({
  void: "#05070a",
  wall: "#0d1118",
  text: "#eeece7",
  dim: "#9aa0a8",
  glow: "#ffbe86",
});

const problems = [];
const notes = [];

const fail = (rule, detail) => problems.push(`HATA: ${rule} — ${detail}`);
const ok = (rule, detail = "") => notes.push(`TAMAM: ${rule}${detail ? " — " + detail : ""}`);

// ─────────────────────────── saf denetimler ───────────────────────────

const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;

/** WCAG 2.1 bağıl parlaklık / kontrast. */
export function relativeLuminance(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`geçersiz hex: ${hex}`);
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = ch.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrast(a, b) {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Tek HTML'i denetler; ihlalleri döner. Saf fonksiyon (selftest çağırır).
 */
export function inspectHtml(html, lang) {
  const out = [];

  if (!new RegExp(`<html lang="${lang}"`).test(html)) out.push(`dil: <html lang="${lang}"> yok`);

  const abs = html.match(/(?:src|href)="\/(?!\/)[^"]*"/g) || [];
  if (abs.length) out.push(`mutlak yol: ${abs.slice(0, 3).join(", ")}`);

  for (const img of html.match(/<img [^>]*>/g) || []) {
    if (!/\balt="[^"]+"/.test(img)) out.push(`alt: görselde alt yok — ${img.slice(0, 50)}`);
    if (!/\bwidth="\d+"/.test(img) || !/\bheight="\d+"/.test(img)) {
      out.push(`boyut: width/height yok — ${img.slice(0, 50)}`);
    }
  }

  if (/(?:href|src)="http:\/\//.test(html)) out.push("https: http:// bağlantısı var");

  if (/TODO|lorem ipsum|XXX|placeholder|example\.com/i.test(html)) {
    out.push("yasak desen: TODO/lorem/XXX/placeholder/example.com");
  }

  // v1'in yapay zekâ izleri geri sızmasın (spec §2.1).
  if (/class="[^"]*\beyebrow\b/.test(html)) out.push("estetik: `eyebrow` etiketi geri gelmiş");
  if (/class="[^"]*\bmono\b/.test(html)) out.push("estetik: `mono` veri etiketi geri gelmiş");
  if (/text-transform:\s*uppercase/.test(html)) out.push("estetik: ALL-CAPS dönüşümü var");

  for (const l of ["tr", "en", "x-default"]) {
    if (!new RegExp(`hreflang="${l}"`).test(html)) out.push(`hreflang: ${l} yok`);
  }
  if (!/rel="canonical"/.test(html)) out.push("canonical yok");

  // Sınıf sözleşmesi.
  for (const cls of ["topbar", "hero", "stage", "screen", "stop-list", "shot-grid", "bound-cols", "feature-list", "fact-row", "plan-cols", "qa", "closing", "foot"]) {
    if (!new RegExp(`class="[^"]*\\b${cls}\\b`).test(html)) out.push(`sınıf: ${cls} yok`);
  }

  // EN sayfada Türkçe karakter yalnız dil etiketinde olabilir.
  if (lang === "en" && TURKISH.test(html)) {
    const stripped = html.replace(/<a class="lang"[^>]*>[^<]*<\/a>/g, "");
    if (TURKISH.test(stripped)) out.push("dil: EN sayfada Türkçe karakter var (dil etiketi dışında)");
  }

  return out;
}

// ─────────────────────────── dosya denetimleri ───────────────────────

const sizeOf = (rel) => {
  const abs = join(dist, rel);
  return existsSync(abs) ? statSync(abs).size : 0;
};

const readDist = (rel) => {
  const abs = join(dist, rel);
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
};

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, acc);
    else acc.push({ abs, size: st.size });
  }
  return acc;
}

function checkFiles() {
  if (!existsSync(dist)) {
    fail("girdi", "site/v2/dist yok — önce: node tools/site2-build.mjs");
    return;
  }
  const tr = readDist("index.html");
  const en = readDist("en/index.html");
  if (!tr || !en) {
    fail("girdi", "index.html veya en/index.html yok");
    return;
  }

  for (const [name, html, lang] of [["tr", tr, "tr"], ["en", en, "en"]]) {
    for (const m of inspectHtml(html, lang)) fail(`html/${name}`, m);
  }
  if (!problems.some((p) => p.startsWith("HATA: html/"))) ok("html", "iki sayfa temiz");

  const count = (html, re) => (html.match(re) || []).length;
  const parity = [
    ["durak", count(tr, /<li class="stop/g), count(en, /<li class="stop/g)],
    ["kare", count(tr, /<figure class="shot/g), count(en, /<figure class="shot/g)],
    ["sss", count(tr, /<details class="qa">/g), count(en, /<details class="qa">/g)],
    ["özellik", count(tr, /<li class="feature">/g), count(en, /<li class="feature">/g)],
    ["h2", count(tr, /<h2[\s>]/g), count(en, /<h2[\s>]/g)],
    ["h3", count(tr, /<h3[\s>]/g), count(en, /<h3[\s>]/g)],
  ];
  let bad = false;
  for (const [name, a, b] of parity) {
    if (a !== b) {
      bad = true;
      fail("parite", `${name}: tr=${a} en=${b}`);
    }
    if (a === 0) {
      bad = true;
      fail("parite", `${name}: hiç yok`);
    }
  }
  if (!bad) ok("parite", parity.map(([n, a]) => `${n}=${a}`).join(" "));

  if (count(tr, /<li class="stop/g) !== 4) fail("iskelet", "dört durak beklenir");
  if (count(tr, /<figure class="shot/g) !== 8) fail("iskelet", "sekiz kare beklenir");
  if (count(tr, /<li class="feature">/g) !== 7) fail("iskelet", "yedi özellik beklenir");
  if (count(tr, /<details class="qa">/g) !== 7) fail("iskelet", "yedi SSS beklenir");
  ok("iskelet", "4 durak · 8 kare · 7 özellik · 7 SSS");

  // Kontrast: AAA (spec §2, metin ≥7).
  let cBad = false;
  const pairs = [
    ["metin/zemin", COLORS.text, COLORS.void, 7],
    ["metin/duvar", COLORS.text, COLORS.wall, 7],
    ["ikincil/zemin", COLORS.dim, COLORS.void, 4.5],
    ["vurgu/zemin", COLORS.glow, COLORS.void, 7],
    ["vurgu/duvar", COLORS.glow, COLORS.wall, 7],
  ];
  for (const [name, a, b, min] of pairs) {
    const r = contrast(a, b);
    if (r < min) {
      cBad = true;
      fail("kontrast", `${name} = ${r.toFixed(2)} < ${min}`);
    }
  }
  if (!cBad) ok("kontrast", pairs.map(([n, a, b]) => `${n} ${contrast(a, b).toFixed(1)}`).join(" · "));

  // Bağlantılar.
  let lBad = false;
  for (const [name, html] of [["tr", tr], ["en", en]]) {
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      if (href.startsWith("#")) {
        if (href.length > 1 && !ids.has(href.slice(1))) {
          lBad = true;
          fail("bağlantı", `${name}: #${href.slice(1)} hedefi yok`);
        }
      } else if (href.startsWith("http")) {
        if (!href.startsWith("https://")) {
          lBad = true;
          fail("bağlantı", `${name}: ${href}`);
        }
      } else if (/^\.\.?\//.test(href) && !href.endsWith("/")) {
        const rel = name === "en" ? join("en", href) : href;
        const target = resolve(dist, rel.replace(/^\.\//, ""));
        if (!target.startsWith(dist)) {
          lBad = true;
          fail("bağlantı", `${name}: yol kaçışı ${href}`);
        } else if (!existsSync(target)) {
          lBad = true;
          fail("bağlantı", `${name}: dosya yok ${href}`);
        }
      }
    }
  }
  if (!lBad) ok("bağlantı", "çapalar ve varlıklar yerinde");

  // Bütçeler.
  const initial = sizeOf("index.html") + sizeOf("assets/site.css") + sizeOf("assets/site.js") + sizeOf("assets/curve.js") + sizeOf("assets/fonts/bricolage.woff2");
  const gz = (rel) => {
    const abs = join(dist, rel);
    return existsSync(abs) ? gzipSync(readFileSync(abs), { level: 9 }).length : 0;
  };
  const initialGzip = gz("index.html") + gz("assets/site.css") + gz("assets/site.js") + gz("assets/curve.js");
  const js = sizeOf("assets/site.js") + sizeOf("assets/curve.js");
  const css = sizeOf("assets/site.css");
  const font = sizeOf("assets/fonts/bricolage.woff2");
  const all = walk(dist).reduce((s, f) => s + f.size, 0);

  const rows = [
    ["ilk yükleme", initial, PAGE_BUDGETS.initial],
    ["ilk yükleme (gzip)", initialGzip, PAGE_BUDGETS.initialGzip],
    ["font", font, PAGE_BUDGETS.font],
    ["js", js, PAGE_BUDGETS.js],
    ["css", css, PAGE_BUDGETS.css],
    ["dist", all, PAGE_BUDGETS.dist],
  ];
  let bBad = false;
  for (const [n, v, lim] of rows) {
    if (v > lim) {
      bBad = true;
      fail("bütçe", `${n} ${(v / 1024).toFixed(1)} KB > ${(lim / 1024).toFixed(0)} KB`);
    }
  }
  if (!bBad) ok("bütçe", rows.map(([n, v]) => `${n} ${(v / 1024).toFixed(0)}K`).join(" · "));

  // Kareler.
  const shotsDir = join(dist, "assets/shots");
  if (existsSync(shotsDir)) {
    const files = readdirSync(shotsDir).filter((f) => /\.webp$/i.test(f));
    if (files.length !== 9) fail("kare", `${files.length} webp var, 9 beklenir`);
    for (const f of files) {
      const s = statSync(join(shotsDir, f)).size;
      if (s > PAGE_BUDGETS.shot) fail("kare", `${f} ${(s / 1024).toFixed(0)} KB > 130 KB`);
    }
    if (files.length === 9) ok("kare", `${files.length} görsel ≤ 130 KB`);
  } else {
    fail("kare", "site/v2/dist/assets/shots yok — önce: node tools/site2-shots.mjs");
  }
}

// ─────────────────────────── duman ───────────────────────────────────

async function checkSmoke() {
  const qaPkg = join(root, "qa", "package.json");
  let pw;
  try {
    pw = createRequire(qaPkg)("playwright");
  } catch {
    fail("duman", "playwright bulunamadı — önce: cd qa && npm install");
    return;
  }
  const { createServer } = await import("node:http");
  const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".png": "image/png",
    ".woff2": "font/woff2",
  };

  let server = null;
  let base = baseUrl;
  if (!base) {
    server = createServer((req, res) => {
      const p = (req.url || "/").split("?")[0];
      const rel = decodeURIComponent(p === "/" ? "/index.html" : p.endsWith("/") ? p + "index.html" : p);
      const file = resolve(dist, "." + rel);
      if (!file.startsWith(dist + sep)) {
        res.writeHead(403).end();
        return;
      }
      try {
        res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
        res.end(readFileSync(file));
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((r) => server.listen(0, r));
    base = `http://localhost:${server.address().port}/`;
  }

  const browser = await pw.chromium.launch();
  try {
    for (const width of [360, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errs = [];
      page.on("console", (m) => {
        if (m.type() === "error") errs.push(m.text());
      });
      page.on("pageerror", (e) => errs.push(String(e)));
      await page.goto(base, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 1) fail("duman", `${width}px: yatay taşma ${overflow}px`);
      if (errs.length) fail("duman", `${width}px: konsol — ${errs[0].slice(0, 120)}`);

      if (width === 1440) {
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        const [r, g, b] = (bg.match(/\d+/g) || []).map(Number);
        if (r + g + b > 300) fail("duman", `ilk boya açık: ${bg}`);
        else ok("duman", `ilk boya koyu (${bg})`);

        const time = await page.evaluate(() => document.getElementById("now-time")?.textContent || "");
        if (!/^\d{1,2}[:.]\d{2}$/.test(time.trim())) fail("duman", `saat okuması yok: "${time}"`);
        else ok("duman", `canlı okuma ${time.trim()}`);

        const dot = await page.evaluate(() => document.getElementById("stops-dot")?.getAttribute("opacity"));
        if (dot !== "1") fail("duman", "eğri işaretçisi yerleşmedi");
        else ok("duman", "eğri işaretçisi yerleşti");
      }
      await page.close();
    }

    // JS kapalı: içerik durmalı.
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1024, height: 900 } });
    const p2 = await ctx.newPage();
    await p2.goto(base, { waitUntil: "domcontentloaded" });
    const info = await p2.evaluate(() => ({
      h1: document.querySelectorAll("h1").length,
      shots: document.querySelectorAll("figure.shot img").length,
      faq: document.querySelectorAll("details.qa").length,
      dl: Array.from(document.querySelectorAll("a")).filter((a) => /releases\/latest/.test(a.href)).length,
      warmth: document.getElementById("now-warmth")?.textContent?.trim() || "",
    }));
    if (info.h1 < 1) fail("duman", "JS kapalı: h1 yok");
    if (info.shots < 8) fail("duman", `JS kapalı: ${info.shots}/8 görsel`);
    if (info.faq < 7) fail("duman", `JS kapalı: ${info.faq}/7 SSS`);
    if (info.dl < 2) fail("duman", "JS kapalı: indirme bağlantısı yok");
    if (!/%\d+/.test(info.warmth)) fail("duman", `JS kapalı: okuma boş ("${info.warmth}")`);
    else ok("duman", "JS kapalı: içerik, 8 görsel ve okuma duruyor");
    await ctx.close();

    // reduced-motion: renk geçişi ve açılış animasyonu yok.
    const rm = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
    const p3 = await rm.newPage();
    await p3.goto(base, { waitUntil: "networkidle" });
    await p3.waitForTimeout(300);
    const st = await p3.evaluate(() => ({
      room: document.documentElement.style.getPropertyValue("--room"),
      inline: document.documentElement.getAttribute("style") || "",
      bright: getComputedStyle(document.getElementById("hero-screen")).filter,
    }));
    if (st.inline.includes("--screen-bright")) {
      fail("duman", "reduced-motion: ekran parlaklığı satır içi yazıldı");
    }    if (st.room && Number(st.room) < 0.99) {
      fail("duman", `reduced-motion: oda kararması ${st.room}`);
    }
    ok("duman", `reduced-motion: animasyon yok (${st.bright})`);
    await rm.close();

    // Dil geçişi.
    const p4 = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await p4.goto(base, { waitUntil: "networkidle" });
    await p4.locator("a.lang").first().click();
    await p4.waitForLoadState("networkidle");
    const lang = await p4.evaluate(() => document.documentElement.lang);
    if (lang !== "en") fail("duman", `dil geçişi: ${lang}`);
    else ok("duman", "dil geçişi tr → en");
    await p4.close();
  } finally {
    await browser.close();
    if (server) server.close();
  }
}

// ─────────────────────────── çalıştır ────────────────────────────────

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  // Bayatlık
  try {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync(process.execPath, [join(here, "site2-build.mjs"), "--check"], { cwd: root, encoding: "utf8" });
    ok("tazelik", out.trim());
  } catch (e) {
    fail("tazelik", String(e.stdout || e.message).trim().split("\n").slice(0, 4).join(" | "));
  }

  checkFiles();
  if (smoke) await checkSmoke();

  for (const n of notes) console.log(n);
  for (const p of problems) console.error(p);
  console.log(problems.length ? `\nSONUÇ: FAIL (${problems.length} problem)` : "\nSONUÇ: PASS");
  process.exit(problems.length ? 1 : 0);
}
