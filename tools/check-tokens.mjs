#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/**
 * tools/check-tokens.mjs — renk sözleşmesi denetçisi (tarayıcısız).
 *
 * İki iş yapar, ikisi de "tasarım sistemi" iddiasının kanıtı:
 *
 *  1. KATMAN KURALI: `src/templates.css` ve `src/flyout-templates.css`
 *     bileşen katmanıdır — renk hex'i içeremez. Tüm renkler `var(--…)`
 *     ya da `color-mix()` ile paletten gelmelidir. İstisna işaretlenebilir
 *     (`physical:` yorumu) ama şablon katmanında hiç istisna yok.
 *
 *  2. KONTRAST: `src/palette.css`teki her paletin metin/zemin oranı WCAG 2.1
 *     ile ölçülür. text-1/bg-0 ≥ 7 (AAA), text-2/bg-0 ≥ 4.5, accent/bg-0 ≥ 3,
 *     on-accent/accent ≥ 4.5. Düşen palet varsa çıkış kodu 1.
 *
 * Kullanım:  node tools/check-tokens.mjs [--verbose]
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const verbose = process.argv.includes("--verbose");

const problems = [];
const fail = (msg) => {
  problems.push(msg);
  console.log(`PROBLEM ${msg}`);
};

// ── renk yardımcıları ────────────────────────────────────────────────

/** `#rgb` / `#rrggbb` → [r,g,b] (0-255). Geçersizse null. */
function parseHex(s) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** WCAG bağıl parlaklık. */
function luminance([r, g, b]) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// ── 1. katman kuralı ─────────────────────────────────────────────────

const LAYER_FILES = ["src/templates.css", "src/flyout-templates.css"];

for (const rel of LAYER_FILES) {
  const src = readFileSync(join(root, rel), "utf8");
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    // Yorum satırları ve `physical:` işaretli satırlar denetim dışı.
    const code = line.replace(/\/\*.*?\*\//g, "").trim();
    if (!code || code.startsWith("//") || code.startsWith("*")) return;
    if (line.includes("physical:")) return;
    const hits = code.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
    for (const h of hits) {
      // `#id` seçicileri hex sayılmasın: yalnız geçerli hex uzunlukları.
      if (!/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(h)) continue;
      fail(`${rel}:${i + 1}: bileşen katmanında ham renk ${h} — var(--…) kullan`);
    }
  });
  if (verbose) console.log(`katman: ${rel} denetlendi`);
}

// ── 2. palet kontrastı ───────────────────────────────────────────────

// Renk TEK KAYNAK: src/palette.css (styles.css ve flyout.css buradan alır).
const css = readFileSync(join(root, "src/palette.css"), "utf8");

/** `:root` + `[data-theme="x"]` bloklarını kaba ama yeterli ayrıştırır. */
function paletteTokens(startPattern) {
  const idx = css.search(startPattern);
  if (idx < 0) return null;
  const open = css.indexOf("{", idx);
  const close = css.indexOf("}", open);
  const body = css.slice(open + 1, close);
  const out = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/gi)) {
    out[m[1].trim()] = m[2].trim();
  }
  return out;
}

const palettes = [
  ["obsidyen", /^:root\s*\{/m],
  ["gece", /\[data-theme="gece"\]\s*\{/],
  ["orman", /\[data-theme="orman"\]\s*\{/],
  ["gul", /\[data-theme="gul"\]\s*\{/],
  ["fildisi", /\[data-theme="fildisi"\]\s*\{/],
  ["kagit", /\[data-theme="kagit"\]\s*\{/],
  ["grafit", /\[data-theme="grafit"\]\s*\{/],
];

const base = paletteTokens(/^:root\s*\{/m);
const RULES = [
  ["text-1", "bg-0", 7, "AAA gövde metni"],
  ["text-2", "bg-0", 4.5, "ikincil metin"],
  ["accent", "bg-0", 3, "vurgu (ikon/sınır)"],
  ["on-accent", "accent", 4.5, "vurgu üstü metin"],
];

let checked = 0;
for (const [id, pat] of palettes) {
  const own = id === "obsidyen" ? base : paletteTokens(pat);
  if (!own) {
    fail(`palet bulunamadı: ${id}`);
    continue;
  }
  const t = { ...base, ...own };
  for (const [fgKey, bgKey, min, note] of RULES) {
    const fg = parseHex(t[fgKey] ?? "");
    const bg = parseHex(t[bgKey] ?? "");
    if (!fg || !bg) {
      fail(`${id}: ${fgKey}/${bgKey} hex olarak çözülemedi (${t[fgKey]} / ${t[bgKey]})`);
      continue;
    }
    const r = contrast(fg, bg);
    checked += 1;
    if (r < min) {
      fail(`${id}: ${fgKey}/${bgKey} = ${r.toFixed(2)} < ${min} (${note})`);
    } else if (verbose) {
      console.log(`  ${id} ${fgKey}/${bgKey} = ${r.toFixed(2)} ≥ ${min}`);
    }
  }
}

// ── 3. şablon token'ları ─────────────────────────────────────────────

const tpl = readFileSync(join(root, "src/templates.css"), "utf8");
const REQUIRED_TPL = ["sahne", "dergi", "konsol", "bento"];
for (const id of REQUIRED_TPL) {
  if (!new RegExp(`\\[data-template="${id}"\\]`).test(tpl)) {
    fail(`templates.css: [data-template="${id}"] bloğu yok`);
  }
}

// Şablon bloğu yalnız token yazmalı: içinde `background:` gibi doğrudan
// bileşen kuralı varsa katman karışmış demektir (bakım borcu).
for (const id of REQUIRED_TPL) {
  const start = tpl.search(new RegExp(`\\[data-template="${id}"\\]\\s*\\{`));
  if (start < 0) continue;
  const open = tpl.indexOf("{", start);
  const close = tpl.indexOf("}", open);
  const body = tpl.slice(open + 1, close);
  if (/(^|\s)(background|color|border-color)\s*:/.test(body)) {
    fail(`templates.css: [data-template="${id}"] bloğu renk kuralı içeriyor`);
  }
}

console.log(
  problems.length
    ? `SONUC: FAIL (${problems.length} problem, ${checked} kontrast ölçümü)`
    : `SONUC: PASS (${palettes.length} palet, ${checked} kontrast ölçümü, ${REQUIRED_TPL.length} şablon)`,
);
process.exit(problems.length ? 1 : 0);
