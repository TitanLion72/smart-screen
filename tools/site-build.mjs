// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — tanıtım sitesi üreteci (tools/site-build.mjs)

   Kaynak `site/`, çıktı `site/dist/` (commit edilir). İki dil tek
   kaynaktan üretilir: metin `site/content.mjs`, faz `site/phases.mjs`,
   şablon `site/template.mjs`.

   Kullanım:
     node tools/site-build.mjs            # üret
     node tools/site-build.mjs --check    # bayat mı? (yazmaz, farkta 1)

   `--check` neden var: yayına giden HTML'in elle düzenlenmesini ve
   kaynakla ayrışmasını engeller. Ayrışma varsa CI/geliştirici görür.
   ═══════════════════════════════════════════════════════════════════ */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderPage, phasesCss } from "../site/template.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const siteDir = join(root, "site");
const distDir = join(siteDir, "dist");

const checkOnly = process.argv.includes("--check");

const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

/** Üretilecek dosyalar: göreli yol → içerik (string) veya null (kopyalanacak). */
const outputs = new Map();

/**
 * Kare ölçüleri: `tools/site-shots.mjs` gerçek WebP boyutlarını yazar.
 * Manifesto yoksa (henüz kare üretilmemiş) varsayılana düşülür ama
 * `site-check` bunu eksik kare olarak yakalar.
 */
function readShotSizes() {
  const abs = join(root, "site/assets/shots/manifest.json");
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
const css = phasesCss();
outputs.set("index.html", renderPage("tr", { version, phases: css, shotSizes }));
outputs.set("en/index.html", renderPage("en", { version, phases: css, shotSizes }));

/** Kopyalanacak dosyalar: kaynak → hedef. */
const copies = [
  ["site/assets/site.css", "assets/site.css"],
  ["site/assets/site.js", "assets/site.js"],
  ["site/assets/icon.svg", "assets/icon.svg"],
  // Eğri matematiği ve faz hesabı tarayıcıda da çalışır: tek kaynak kopyalanır.
  ["site/curve.mjs", "assets/curve.js"],
  ["site/phase-math.mjs", "assets/phase-math.js"],
];

for (const shotDir of ["site/assets/shots", "site/assets"]) {
  const abs = join(root, shotDir);
  if (!existsSync(abs)) continue;
  for (const name of readdirSync(abs)) {
    if (!/\.(webp|png|svg|jpg)$/i.test(name)) continue;
    if (shotDir.endsWith("shots")) copies.push([`site/assets/shots/${name}`, `assets/shots/${name}`]);
  }
}
if (existsSync(join(root, "site/og.png"))) copies.push(["site/og.png", "og.png"]);

const read = (rel) => {
  const abs = join(root, rel);
  return existsSync(abs) ? readFileSync(abs) : null;
};

let stale = [];
let written = 0;

function emit(rel, content) {
  const abs = join(distDir, rel);
  const prev = existsSync(abs) ? readFileSync(abs) : null;
  if (prev && Buffer.compare(prev, content) === 0) return;
  stale.push(rel);
  if (checkOnly) return;
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  written++;
}

for (const [rel, content] of outputs) emit(rel, Buffer.from(content, "utf8"));
for (const [src, rel] of copies) {
  const body = read(src);
  if (!body) {
    if (!checkOnly) console.warn(`uyarı: kaynak yok, atlandı — ${src}`);
    continue;
  }
  emit(rel, body);
}

// `--check` ayrıca fazla dosyayı da yakalar (silinmiş bir görsel dist'te kalmasın).
if (!existsSync(distDir) && checkOnly) {
  console.error("HATA: site/dist yok — önce: node tools/site-build.mjs");
  process.exit(1);
}

if (checkOnly) {
  if (stale.length) {
    console.error("HATA: site/dist bayat. Eksik/eski dosyalar:");
    for (const f of stale) console.error("  - " + f);
    console.error("Düzelt: node tools/site-build.mjs");
    process.exit(1);
  }
  console.log("güncel: site/dist kaynakla aynı");
  process.exit(0);
}

console.log(`yazıldı: ${written} dosya (sürüm ${version})`);
if (stale.length) console.log("değişen: " + [...new Set(stale.map((s) => s.split("/")[0]))].join(", "));

// Boyut raporu — bütçeleri `tools/site-check.mjs` denetler, burada bilgi var.
const sizeOf = (rel) => {
  const abs = join(distDir, rel);
  try {
    return statSync(abs).size;
  } catch {
    return 0;
  }
};
const html = sizeOf("index.html") + sizeOf("en/index.html");
const code = html + sizeOf("assets/site.css") + sizeOf("assets/site.js") + sizeOf("assets/curve.js") + sizeOf("assets/phase-math.js");
console.log(`ilk yükleme (html+css+js): ${(code / 1024).toFixed(1)} KB`);
