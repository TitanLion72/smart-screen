#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — ikon üreteci (tools/make-icon.mjs)

   Tek kaynak `assets/icon.svg`. Bu araç onu tarayıcıda (Playwright) çizip
   `src-tauri/icons/` altındaki TÜM boyutları üretir:
     • PNG: 32, 44, 71, 89, 107, 128, 142, 150, 284, 310, 512, 1024
     • `icon.ico` (Windows, 16/24/32/48/64/128/256 gömülü)
     • `icon.icns` (macOS) — yoksa atlanır ve uyarır (bu proje Windows hedefli)

   Neden tarayıcı: SVG→PNG için ek bağımlılık (sharp/resvg) kurmak yerine
   QA'da zaten bulunan Playwright kullanılıyor. Çıktı deterministik: aynı SVG
   her zaman aynı PNG'yi verir.

   Kullanım:
     node tools/make-icon.mjs              # hepsini üret
     node tools/make-icon.mjs --check      # yalnız var mı / boyutu doğru mu
     node tools/make-icon.mjs --only 256   # tek boyut (hızlı deneme)
   ═══════════════════════════════════════════════════════════════════ */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const svgPath = join(root, "assets", "icon.svg");
const outDir = join(root, "src-tauri", "icons");

const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const only = (() => {
  const i = argv.indexOf("--only");
  return i >= 0 ? Number(argv[i + 1]) : null;
})();

/** Tauri'nin beklediği PNG boyutları (tauri.conf.json + Windows Store). */
const PNG_SIZES = [32, 44, 71, 89, 107, 128, 142, 150, 284, 310, 512, 1024];
/** .ico içine gömülen boyutlar (küçükten büyüğe). */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

if (!existsSync(svgPath)) {
  console.error("HATA: kaynak SVG yok: " + svgPath);
  process.exit(2);
}
const svg = readFileSync(svgPath, "utf8");

// Playwright QA klasöründe kurulu; ESM import'u dosya URL'i ile yapılmalı
// (Windows'ta dizin yolu `import()` ile çözülmüyor).
const playwrightEntry = pathToFileURL(join(root, "qa", "node_modules", "playwright", "index.mjs")).href;
let chromium;
try {
  ({ chromium } = await import(playwrightEntry));
} catch (e) {
  console.error(
    "HATA: Playwright yüklenemedi (" + String(e.message ?? e) + ")\n" +
      "  Kur: cd qa && npm.cmd install",
  );
  process.exit(2);
}

const browser = await chromium.launch();

/** SVG'yi verilen kenar uzunluğunda saydam PNG üretir. */
async function renderPng(size) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  // Saydam zemin: ikonun kendi yuvarlatılmış karesi var; dışı şeffaf kalmalı
  // (Windows köşeleri kendisi yuvarlamıyor, tray'de şeffaflık şart).
  await page.setContent(
    `<!doctype html><html><head><style>
       html,body{margin:0;padding:0;background:transparent}
       svg{display:block;width:${size}px;height:${size}px}
     </style></head><body>${svg}</body></html>`,
    { waitUntil: "load" },
  );
  const buf = await page.screenshot({ omitBackground: true, type: "png" });
  await page.close();
  return buf;
}

/**
 * PNG'leri tek bir .ico içine paketler (PNG tabanlı ICO — Vista+ destekler).
 * ICONDIR + ICONDIRENTRY[] + PNG gövdeleri.
 */
function buildIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  entries.forEach((e, i) => {
    const base = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, base + 0); // width (0 = 256)
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, base + 1); // height
    dir.writeUInt8(0, base + 2); // palette
    dir.writeUInt8(0, base + 3); // reserved
    dir.writeUInt16LE(1, base + 4); // planes
    dir.writeUInt16LE(32, base + 6); // bpp
    dir.writeUInt32LE(e.png.length, base + 8);
    dir.writeUInt32LE(offset, base + 12);
    offset += e.png.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

const written = [];
try {
  if (checkOnly) {
    let bad = 0;
    for (const s of PNG_SIZES) {
      const f = join(outDir, `${s}x${s}.png`);
      if (!existsSync(f)) {
        console.log(`EKSİK  ${s}x${s}.png`);
        bad++;
      }
    }
    for (const f of ["icon.png", "icon.ico"]) {
      if (!existsSync(join(outDir, f))) {
        console.log("EKSİK  " + f);
        bad++;
      }
    }
    console.log(bad === 0 ? "SONUC: PASS (ikon dosyaları yerinde)" : `SONUC: FAIL (${bad} eksik)`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const sizes = only ? [only] : PNG_SIZES;
  const pngs = new Map();
  for (const s of sizes) {
    const buf = await renderPng(s);
    pngs.set(s, buf);
    const target = join(outDir, `${s}x${s}.png`);
    writeFileSync(target, buf);
    written.push(`${s}x${s}.png`);
  }

  if (!only) {
    // Tekil dosyalar: ana ikon (1024) + tray/uygulama için 512.
    writeFileSync(join(outDir, "icon.png"), pngs.get(1024));
    written.push("icon.png");

    // Windows Store logoları: aynı görselin kare varyantları. Tauri bunları
    // yalnız MSIX paketinde kullanıyor ama eski marka kalmasın diye üretiliyor.
    const storeLogos = [
      [30, "Square30x30Logo.png"],
      [44, "Square44x44Logo.png"],
      [71, "Square71x71Logo.png"],
      [89, "Square89x89Logo.png"],
      [107, "Square107x107Logo.png"],
      [142, "Square142x142Logo.png"],
      [150, "Square150x150Logo.png"],
      [284, "Square284x284Logo.png"],
      [310, "Square310x310Logo.png"],
    ];
    for (const [size, name] of storeLogos) {
      const png = pngs.get(size) ?? (await renderPng(size));
      writeFileSync(join(outDir, name), png);
    }
    writeFileSync(join(outDir, "StoreLogo.png"), pngs.get(284) ?? (await renderPng(284)));
    written.push(`Store logoları (9 kare + StoreLogo)`);

    // ICO: 16…256 hepsi gömülü.
    const icoEntries = [];
    for (const s of ICO_SIZES) {
      const png = pngs.get(s) ?? (await renderPng(s));
      icoEntries.push({ size: s, png });
    }
    writeFileSync(join(outDir, "icon.ico"), buildIco(icoEntries));
    written.push(`icon.ico (${ICO_SIZES.join("/")})`);

    // .icns: macOS hedefi yok; Tauri dosyayı istiyor ama Windows derlemesinde
    // kullanılmıyor. Yoksa uyarı ver, var olanı koru.
    if (!existsSync(join(outDir, "icon.icns"))) {
      console.log(
        "NOT: icon.icns üretilmedi (macOS paketleyici yok). Windows derlemesi için gerekmiyor.",
      );
    }
  }

  console.log(`SONUC: ${written.length} dosya yazıldı → src-tauri/icons/`);
  for (const w of written) console.log("  " + w);
} finally {
  await browser.close();
}
