// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — site v2 üreteci (tools/site2-build.mjs)

   Kaynak `site/v2/`, çıktı `site/v2/dist/` (commit edilir).
   İki dil tek kaynaktan: metin `content.mjs`, şablon `template.mjs`.

   Kullanım:
     node tools/site2-build.mjs            # üret
     node tools/site2-build.mjs --check    # bayat mı? (yazmaz, farkta 1)
   ═══════════════════════════════════════════════════════════════════ */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderPage } from "../site/v2/template.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const srcDir = join(root, "site/v2");
const distDir = join(srcDir, "dist");
const checkOnly = process.argv.includes("--check");

const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

function readShotSizes() {
  const abs = join(srcDir, "assets/shots/manifest.json");
  if (!existsSync(abs)) return {};
  try {
    const list = JSON.parse(readFileSync(abs, "utf8"));
    const map = {};
    for (const s of list) if (s && s.file && s.w && s.h) map[s.file] = { w: s.w, h: s.h };
    return map;
  } catch {
    return {};
  }
}

const shotSizes = readShotSizes();
const outputs = new Map();
outputs.set("index.html", renderPage("tr", { version, shotSizes }));
outputs.set("en/index.html", renderPage("en", { version, shotSizes }));

/** Kopyalanacaklar: kaynak → hedef (dist'e göreli). */
const copies = [
  ["assets/site.css", "assets/site.css"],
  ["assets/site.js", "assets/site.js"],
  ["assets/icon.svg", "assets/icon.svg"],
  ["assets/fonts/bricolage.woff2", "assets/fonts/bricolage.woff2"],
  // Eğri matematiği tarayıcıda da çalışır: tek kaynak kopyalanır.
  ["curve.mjs", "assets/curve.js"],
];

const shotsDir = join(srcDir, "assets/shots");
if (existsSync(shotsDir)) {
  for (const name of readdirSync(shotsDir)) {
    if (/\.webp$/i.test(name)) copies.push([`assets/shots/${name}`, `assets/shots/${name}`]);
  }
}
if (existsSync(join(srcDir, "og.png"))) copies.push(["og.png", "og.png"]);

let changed = [];
let written = 0;

function emit(rel, buf) {
  const abs = join(distDir, rel);
  const prev = existsSync(abs) ? readFileSync(abs) : null;
  if (prev && Buffer.compare(prev, buf) === 0) return;
  changed.push(rel);
  if (checkOnly) return;
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, buf);
  written++;
}

for (const [rel, html] of outputs) emit(rel, Buffer.from(html, "utf8"));
for (const [src, rel] of copies) {
  const abs = join(srcDir, src);
  if (!existsSync(abs)) {
    if (!checkOnly) console.warn(`uyarı: kaynak yok, atlandı — site/v2/${src}`);
    continue;
  }
  emit(rel, readFileSync(abs));
}

if (!existsSync(distDir) && checkOnly) {
  console.error("HATA: site/v2/dist yok — önce: node tools/site2-build.mjs");
  process.exit(1);
}

if (checkOnly) {
  if (changed.length) {
    console.error("HATA: site/v2/dist bayat. Eksik/eski:");
    for (const f of changed) console.error("  - " + f);
    console.error("Düzelt: node tools/site2-build.mjs");
    process.exit(1);
  }
  console.log("güncel: site/v2/dist kaynakla aynı");
  process.exit(0);
}

const size = (rel) => {
  try {
    return statSync(join(distDir, rel)).size;
  } catch {
    return 0;
  }
};
const initial =
  size("index.html") +
  size("assets/site.css") +
  size("assets/site.js") +
  size("assets/curve.js") +
  size("assets/fonts/bricolage.woff2");

console.log(`yazıldı: ${written} dosya (sürüm ${version})`);
if (changed.length) console.log("değişen: " + [...new Set(changed)].slice(0, 6).join(", "));
console.log(`ilk yükleme (html+css+js+font): ${(initial / 1024).toFixed(1)} KB`);
