// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — tanıtım sitesi denetleyicisi (tools/site-check.mjs)

   Neden: site "çalışıyor" demek yetmez. İki dilin ayrışmadığını,
   renklerin okunur olduğunu, bağlantıların kırık olmadığını ve
   bütçelerin aşılmadığını kanıtlayan bir kapı gerekiyor.

   Kullanım:
     node tools/site-check.mjs                      # hızlı kapı (tarayıcı yok)
     node tools/site-check.mjs --smoke              # + Playwright dumanı
     node tools/site-check.mjs --smoke --base <url> # canlı URL üzerinde

   Çıkış: 0 tümü geçti · 1 ihlal var · 2 kullanım/eksik araç.
   ═══════════════════════════════════════════════════════════════════ */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { PHASES, contrast, AA_TEXT } from "../site/phases.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = join(root, "site", "dist");

const argv = process.argv.slice(2);
const smoke = argv.includes("--smoke");
const baseIdx = argv.indexOf("--base");
const baseUrl = baseIdx >= 0 ? argv[baseIdx + 1] : null;

/** Bütçeler (spec §9 — ölçümle düzeltilmiş hâli). */
export const PAGE_BUDGETS = Object.freeze({
  initial: 120 * 1024,
  initialGzip: 40 * 1024,
  js: 20 * 1024,
  css: 20 * 1024,
  shot: 120 * 1024,
  dist: 900 * 1024,
});

const problems = [];
const notes = [];

function fail(rule, detail) {
  problems.push(`HATA: ${rule} — ${detail}`);
}

function ok(rule, detail = "") {
  notes.push(`TAMAM: ${rule}${detail ? " — " + detail : ""}`);
}

// ─────────────────────────── saf denetimler ───────────────────────────

const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;

/**
 * Tek bir HTML dosyasını denetler; ihlalleri dizi olarak döner.
 * Saf fonksiyon: selftest bunu bilerek bozuk örneklerle çağırır.
 */
export function inspectHtml(html, lang) {
  const out = [];

  if (!new RegExp(`<html lang="${lang}"`).test(html)) out.push(`dil: <html lang="${lang}"> yok`);

  // Mutlak varlık yolu yasak: Pages alt yolda barınıyor.
  const abs = html.match(/(?:src|href)="\/(?!\/)[^"]*"/g) || [];
  if (abs.length) out.push(`mutlak yol: ${abs.slice(0, 3).join(", ")}`);

  // Görsellerde alt + boyut (CLS).
  for (const img of html.match(/<img [^>]*>/g) || []) {
    if (!/\balt="[^"]+"/.test(img)) out.push(`alt: görselde alt yok — ${img.slice(0, 60)}`);
    if (!/\bwidth="\d+"/.test(img) || !/\bheight="\d+"/.test(img)) {
      out.push(`boyut: görselde width/height yok — ${img.slice(0, 60)}`);
    }
  }

  // http bağlantısı yasak.
  if (/(?:href|src)="http:\/\//.test(html)) out.push("https: http:// bağlantısı var");

  // Yasak desen.
  const forbidden = /TODO|lorem ipsum|XXX|placeholder|example\.com/i;
  if (forbidden.test(html)) out.push("yasak desen: TODO/lorem/XXX/placeholder/example.com");

  // hreflang üçlüsü.
  for (const l of ["tr", "en", "x-default"]) {
    if (!new RegExp(`hreflang="${l}"`).test(html)) out.push(`hreflang: ${l} yok`);
  }

  // canonical.
  if (!/rel="canonical"/.test(html)) out.push("canonical yok");

  // CSS/JS sözleşmesi (sınıf adları).
  for (const cls of ["shot", "feature", "plan", "bounds", "chapter", "reading", "topbar", "foot"]) {
    if (!new RegExp(`class="[^"]*\\b${cls}\\b`).test(html)) out.push(`sınıf: ${cls} yok`);
  }

  // İngilizce sayfada Türkçe karakter (çeviri kopyası sızıntısı).
  // NOT: dil değiştirme bağlantısı da taranır; bu yüzden EN metinlerinde
  // Türkçe karakter kullanılmaz (content.test.mjs de bunu zorlar).
  if (lang === "en" && TURKISH.test(html)) {
    out.push("dil: EN sayfasında Türkçe karakter var");
  }

  return out;
}

// ─────────────────────────── dosya denetimleri ───────────────────────

function sizeOf(rel) {
  const abs = join(dist, rel);
  return existsSync(abs) ? statSync(abs).size : 0;
}

function readDist(rel) {
  const abs = join(dist, rel);
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
}

function walkDist(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walkDist(abs, acc);
    else acc.push({ abs, size: st.size });
  }
  return acc;
}

function checkFiles() {
  if (!existsSync(dist)) {
    fail("girdi", "site/dist yok — önce: node tools/site-build.mjs");
    return;
  }

  const tr = readDist("index.html");
  const en = readDist("en/index.html");
  if (!tr) fail("girdi", "site/dist/index.html yok");
  if (!en) fail("girdi", "site/dist/en/index.html yok");
  if (!tr || !en) return;

  for (const [name, html, lang] of [
    ["tr", tr, "tr"],
    ["en", en, "en"],
  ]) {
    for (const msg of inspectHtml(html, lang)) fail(`html/${name}`, msg);
  }
  if (!problems.some((p) => p.includes("html/"))) ok("html", "iki sayfa temiz");

  // ── TR/EN parity ──
  const count = (html, re) => (html.match(re) || []).length;
  const parity = [
    ["bölüm", count(tr, /<section class="chapter"/g), count(en, /<section class="chapter"/g)],
    ["sss", count(tr, /<details class="qa">/g), count(en, /<details class="qa">/g)],
    ["özellik", count(tr, /<li class="feature">/g), count(en, /<li class="feature">/g)],
    ["h2", count(tr, /<h2[\s>]/g), count(en, /<h2[\s>]/g)],
    ["görsel", count(tr, /<img /g), count(en, /<img /g)],
  ];
  let parityBad = false;
  for (const [name, a, b] of parity) {
    if (a !== b) {
      parityBad = true;
      fail("parite", `${name}: tr=${a} en=${b}`);
    }
    if (a === 0) {
      parityBad = true;
      fail("parite", `${name}: hiç yok (iskelet bozuk)`);
    }
  }
  if (!parityBad) ok("parite", parity.map(([n, a]) => `${n}=${a}`).join(" "));

  // ── sözleşme sayıları ──
  if (count(tr, /<section class="chapter"/g) !== 4) fail("iskelet", "dört bölüm beklenir");
  if (count(tr, /<li class="feature">/g) !== 7) fail("iskelet", "yedi özellik beklenir");
  if (count(tr, /<details class="qa">/g) !== 7) fail("iskelet", "yedi SSS beklenir");
  ok("iskelet", "4 bölüm · 7 özellik · 7 SSS");

  // ── dört faz CSS'te var mı ──
  for (const p of PHASES) {
    if (!tr.includes(`:root[data-phase="${p.id}"]`)) fail("faz", `${p.id} CSS'i enjekte edilmemiş`);
    if (!tr.includes(`data-phase="${p.id}"`)) fail("faz", `${p.id} bölüm işareti yok`);
  }
  ok("faz", PHASES.map((p) => p.id).join(" "));

  // ── kontrast: dört fazın hepsi AA ──
  let contrastBad = false;
  for (const p of PHASES) {
    const rows = {
      metin: contrast(p.text, p.bg),
      ikincil: contrast(p.muted, p.bg),
      vurgu: contrast(p.accent, p.bg),
      düğme: contrast(p.onAccent, p.accent),
    };
    for (const [name, ratio] of Object.entries(rows)) {
      if (ratio < AA_TEXT) {
        contrastBad = true;
        fail("kontrast", `${p.id}/${name} = ${ratio.toFixed(2)} < ${AA_TEXT}`);
      }
    }
  }
  if (!contrastBad) ok("kontrast", "dört faz × dört çift ≥ 4.5");

  // ── bağlantılar: iç çapa hedefi var, dış https, varlık mevcut ──
  let linkBad = false;
  for (const [name, html] of [["tr", tr], ["en", en]]) {
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      if (href.startsWith("#")) {
        if (href.length > 1 && !ids.has(href.slice(1))) {
          linkBad = true;
          fail("bağlantı", `${name}: #${href.slice(1)} hedefi yok`);
        }
      } else if (href.startsWith("http")) {
        if (!href.startsWith("https://")) {
          linkBad = true;
          fail("bağlantı", `${name}: ${href}`);
        }
      } else if (/^\.\.?\//.test(href) && !href.endsWith("/")) {
        const rel = name === "en" ? join("en", href) : href;
        const target = resolve(dist, rel.replace(/^\.\//, ""));
        if (!target.startsWith(dist)) {
          linkBad = true;
          fail("bağlantı", `${name}: yol kaçışı ${href}`);
        } else if (!existsSync(target)) {
          linkBad = true;
          fail("bağlantı", `${name}: dosya yok ${href}`);
        }
      }
    }
  }
  if (!linkBad) ok("bağlantı", "çapalar ve varlıklar yerinde");

  // ── bütçeler ──
  const initial = sizeOf("index.html") + sizeOf("assets/site.css") + sizeOf("assets/site.js") + sizeOf("assets/curve.js") + sizeOf("assets/phase-math.js");
  const gzb = (rel) => {
    const abs = join(dist, rel);
    return existsSync(abs) ? gzipSync(readFileSync(abs), { level: 9 }).length : 0;
  };
  const initialGzip = gzb("index.html") + gzb("assets/site.css") + gzb("assets/site.js") + gzb("assets/curve.js") + gzb("assets/phase-math.js");
  const js = sizeOf("assets/site.js") + sizeOf("assets/curve.js") + sizeOf("assets/phase-math.js");
  const css = sizeOf("assets/site.css");
  const all = walkDist(dist).reduce((s, f) => s + f.size, 0);

  const budgetRows = [
    ["ilk yükleme", initial, PAGE_BUDGETS.initial],
    ["ilk yükleme (gzip)", initialGzip, PAGE_BUDGETS.initialGzip],
    ["js", js, PAGE_BUDGETS.js],
    ["css", css, PAGE_BUDGETS.css],
    ["dist", all, PAGE_BUDGETS.dist],
  ];
  let budgetBad = false;
  for (const [name, value, limit] of budgetRows) {
    if (value > limit) {
      budgetBad = true;
      fail("bütçe", `${name} ${(value / 1024).toFixed(1)} KB > ${(limit / 1024).toFixed(0)} KB`);
    }
  }
  if (!budgetBad) ok("bütçe", budgetRows.map(([n, v]) => `${n} ${(v / 1024).toFixed(0)}K`).join(" · "));

  // ── kare boyutları ──
  const shotsDir = join(dist, "assets", "shots");
  if (existsSync(shotsDir)) {
    for (const f of readdirSync(shotsDir)) {
      const st = statSync(join(shotsDir, f));
      if (st.size > PAGE_BUDGETS.shot) {
        fail("kare", `${f} ${(st.size / 1024).toFixed(0)} KB > 120 KB`);
      }
    }
    ok("kare", `${readdirSync(shotsDir).length} görsel ≤ 120 KB`);
  } else {
    fail("kare", "site/dist/assets/shots yok — önce: npm run site:shots");
  }
}

// ─────────────────────────── bayatlık ────────────────────────────────

async function checkFresh() {
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync(process.execPath, [join(here, "site-build.mjs"), "--check"], {
      cwd: root,
      encoding: "utf8",
    });
    ok("tazelik", out.trim());
  } catch (e) {
    fail("tazelik", String(e.stdout || e.message).trim().split("\n").slice(0, 4).join(" | "));
  }
}

// ─────────────────────────── duman (Playwright) ──────────────────────

async function loadPlaywright() {
  const qaPkg = join(root, "qa", "package.json");
  if (!existsSync(qaPkg)) return null;
  try {
    const req = createRequire(qaPkg);
    return req("playwright");
  } catch {
    return null;
  }
}

async function checkSmoke() {
  const pw = await loadPlaywright();
  if (!pw) {
    fail("duman", "playwright bulunamadı — önce: cd qa && npm install");
    return;
  }
  const { chromium } = pw;
  const { createServer } = await import("node:http");
  const { extname } = await import("node:path");

  const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".png": "image/png",
  };

  let server = null;
  let base = baseUrl;
  if (!base) {
    server = createServer((req, res) => {
      const p = (req.url || "/").split("?")[0];
      const rel = decodeURIComponent(p === "/" ? "/index.html" : p.endsWith("/") ? p + "index.html" : p);
      const file = resolve(dist, "." + rel);
      if (!file.startsWith(dist)) {
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
    base = `http://localhost:${server.address().port}/`;
  }

  const browser = await chromium.launch();
  const errors = [];
  try {
    for (const width of [360, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const consoleErrors = [];
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text());
      });
      page.on("pageerror", (e) => consoleErrors.push(String(e)));
      await page.goto(base, { waitUntil: "networkidle" });
      await page.waitForTimeout(350);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 1) fail("duman", `${width}px: yatay taşma ${overflow}px`);
      if (consoleErrors.length) fail("duman", `${width}px: konsol hatası — ${consoleErrors[0].slice(0, 120)}`);

      if (width === 1440) {
        // İlk boya gece: koyu zemin (beyaz patlama yok).
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        const m = bg.match(/\d+/g) || [];
        const [r, g, b] = m.map(Number);
        if (r + g + b > 300) fail("duman", `ilk boya açık zemin: ${bg}`);
        else ok("duman", `ilk boya koyu (${bg})`);

        // Saat okuması gerçekten yazıldı mı?
        const time = await page.evaluate(() => document.getElementById("now-time")?.textContent || "");
        if (!/^\d{1,2}[:.]\d{2}$/.test(time.trim())) fail("duman", `saat okuması yok: "${time}"`);
        else ok("duman", `canlı okuma ${time.trim()}`);

        // Eğri çizildi mi?
        const d = await page.evaluate(() => document.getElementById("curve-path")?.getAttribute("d") || "");
        if (d.length < 50) fail("duman", "eğri yolu boş");
        else ok("duman", "eğri çizildi");
      }
      await page.close();
    }

    // JS kapalı: içerik durmalı.
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1024, height: 900 } });
    const p2 = await noJs.newPage();
    await p2.goto(base, { waitUntil: "domcontentloaded" });
    const noJsInfo = await p2.evaluate(() => ({
      h1: document.querySelectorAll("h1").length,
      faq: document.querySelectorAll("details.qa").length,
      dl: Array.from(document.querySelectorAll("a")).filter((a) => /github\.com\/TitanLion72/.test(a.href)).length,
    }));
    if (noJsInfo.h1 < 1) fail("duman", "JS kapalı: h1 yok");
    if (noJsInfo.faq < 7) fail("duman", `JS kapalı: SSS ${noJsInfo.faq}/7`);
    if (noJsInfo.dl < 2) fail("duman", "JS kapalı: indirme bağlantısı yok");
    else ok("duman", "JS kapalı: içerik ve indirme duruyor");
    await noJs.close();

    // reduced-motion: renk geçişi yapılmamalı.
    const rm = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
    const p3 = await rm.newPage();
    await p3.goto(base, { waitUntil: "networkidle" });
    await p3.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await p3.waitForTimeout(400);
    const inline = await p3.evaluate(() => document.documentElement.getAttribute("style") || "");
    if (inline.includes("--bg")) fail("duman", `reduced-motion: renk satır içi yazıldı (${inline.slice(0, 60)})`);
    else ok("duman", "reduced-motion: geçiş yok");
    await rm.close();

    // Dil geçişi gidiş-dönüş.
    const p4 = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await p4.goto(base, { waitUntil: "networkidle" });
    await p4.locator("a.lang").first().click();
    await p4.waitForLoadState("networkidle");
    const lang2 = await p4.evaluate(() => document.documentElement.lang);
    if (lang2 !== "en") fail("duman", `dil geçişi: ${lang2}`);
    else ok("duman", "dil geçişi tr → en");
    await p4.close();
  } finally {
    await browser.close();
    if (server) server.close();
  }
}

// ─────────────────────────── çalıştır ────────────────────────────────

// Yalnız doğrudan çağrıldığında koşar: selftest bu modülü import edip
// `inspectHtml`/`PAGE_BUDGETS` kullanıyor; import edilince CLI çalışsaydı
// test dosyası kendi kendini denetler ve her zaman "PASS" sanırdı.
const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  await checkFresh();
  checkFiles();
  if (smoke) await checkSmoke();

  for (const n of notes) console.log(n);
  for (const p of problems) console.error(p);
  console.log(problems.length ? `\nSONUÇ: FAIL (${problems.length} problem)` : "\nSONUÇ: PASS");
  process.exit(problems.length ? 1 : 0);
}
