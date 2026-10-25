#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ════════════════════════════════════════════════════════════════════
   smart-screen — sürüm notu üreteci (tools/release-notes.mjs)

   CHANGELOG.md içindeki bir sürümün maddelerini okur ve kullanıcıya
   dönük "sürüm notu" biçimine çevirir. Changelog teknik olabilir; sürüm
   notu değildir: chore/refactor/test/ci/docs maddeleri atlanır, her madde
   tek cümleye indirilir ve sonuna nokta konur.

   Dış bağımlılık yok (yalnız node:_builtin).

   Kullanım:
     node tools/release-notes.mjs --version 2.1.0
     node tools/release-notes.mjs --version 2.1.0 --out release-notes.md

   Çıktı: stdout'a markdown (ya da --out verilen dosyaya).
   ════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHANGELOG = join(ROOT, "CHANGELOG.md");

const HELP = `smart-screen sürüm notu üreteci

Kullanım:
  node tools/release-notes.mjs --version <sürüm> [--out <dosya>]

Seçenekler:
  --version <sürüm>   CHANGELOG.md'deki sürüm başlığı (ör. 2.1.0 ya da Unreleased)
  --out <dosya>       Çıktıyı stdout yerine bu dosyaya yaz
  --help              Bu yardım metnini gösterir

Notlar:
  - Bölüm başlıkları kullanıcı diline çevrilir:
    Added → Yeni · Changed → Değişen · Fixed → Düzeltilen ·
    Removed → Kaldırılan · Security → Güvenlik
  - chore/refactor/test/ci/docs ile başlayan maddeler sürüm notuna girmez.
  - Sonuna her zaman "Kurulum doğrulaması" bloğu eklenir.

Örnek:
  node tools/release-notes.mjs --version 2.1.0 --out release-notes.md`;

const CATEGORY_TR = new Map([
  ["added", "Yeni"],
  ["changed", "Değişen"],
  ["fixed", "Düzeltilen"],
  ["removed", "Kaldırılan"],
  ["security", "Güvenlik"],
]);

// Sürüm notuna girmeyen maddeler (teknik bakım işleri).
const SKIP_PREFIX = /^(chore|refactor|test|ci|docs|style|build)\b/i;

const INSTALL_BLOCK = `## Kurulum doğrulaması
Kurulum dosyası Authenticode ile imzalı değildir (bölgesel/mali kısıtlar), bu yüzden
SmartScreen "bilinmeyen yayıncı" uyarabilir → **Ek bilgi → Yine de çalıştır**.
Dosya bütünlüğünü release sayfasındaki \`.sha256\` ile doğrula:

    Get-FileHash .\\smart-screen_<surum>_x64-setup.exe -Algorithm SHA256`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { version: null, out: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--version") {
      opts.version = argv[i + 1] ?? null;
      i += 1;
    } else if (arg.startsWith("--version=")) {
      opts.version = arg.slice("--version=".length);
    } else if (arg === "--out") {
      opts.out = argv[i + 1] ?? null;
      i += 1;
    } else if (arg.startsWith("--out=")) {
      opts.out = arg.slice("--out=".length);
    } else {
      fail(`Bilinmeyen seçenek: ${arg}\nYardım için: node tools/release-notes.mjs --help`);
    }
  }
  return opts;
}

/** CHANGELOG.md metninden istenen sürümün bölümünü çıkarır. */
function extractSection(text, version) {
  const lines = text.split(/\r?\n/);
  const wanted = version.trim().replace(/^v/i, "").toLowerCase();
  const startIndex = lines.findIndex((line) => {
    const match = /^##\s+\[([^\]]+)\]/.exec(line.trim());
    return match !== null && match[1].trim().toLowerCase() === wanted;
  });
  if (startIndex === -1) return null;

  const heading = lines[startIndex].trim();
  const dateMatch = /^##\s+\[[^\]]+\]\s*-\s*(\d{4}-\d{2}-\d{2})/.exec(heading);
  const body = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (/^##\s+\[/.test(lines[i].trim())) break;
    body.push(lines[i]);
  }
  return { date: dateMatch ? dateMatch[1] : null, body };
}

/** Bölüm gövdesini kategori → madde listesine ayırır. */
function collectCategories(body) {
  const categories = [];
  let current = null;
  for (const raw of body) {
    const line = raw.trimEnd();
    const categoryMatch = /^###\s+(.+?)\s*$/.exec(line);
    if (categoryMatch) {
      current = { title: categoryMatch[1].trim(), items: [] };
      categories.push(current);
      continue;
    }
    if (current === null) continue;

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      current.items.push(bullet[1].trim());
    } else if (line.trim() !== "" && current.items.length > 0) {
      // Devam satırı (CHANGELOG'da maddeler sarılmış olabilir).
      current.items[current.items.length - 1] += ` ${line.trim()}`;
    }
  }
  return categories;
}

/** İlk cümleyi alır ve sonuna nokta koyar. */
function toSentence(text) {
  let value = text.replace(/\s+/g, " ").trim();
  value = value.replace(/^\[[^\]]*\]\s*/, ""); // baştaki bağlantı/referans
  const boundary = value.search(/[.!?]\s+(?=[A-ZÇĞİÖŞÜ0-9“"(])/);
  if (boundary !== -1) value = value.slice(0, boundary + 1);
  value = value.replace(/[.;,:]+$/, "");
  if (!/[.!?]$/.test(value)) value += ".";
  return value;
}

function render(version, section) {
  const out = [];
  const isUnreleased = version.toLowerCase() === "unreleased";
  let title;
  if (isUnreleased) {
    title = "## smart-screen — yayınlanmamış değişiklikler";
  } else {
    title = section.date ? `## smart-screen v${version} — ${section.date}` : `## smart-screen v${version}`;
  }
  out.push(title, "");

  let written = 0;
  for (const category of collectCategories(section.body)) {
    const heading = CATEGORY_TR.get(category.title.toLowerCase()) ?? category.title;
    const items = category.items
      .filter((item) => item.length > 0)
      .map((item) => item.replace(/^`[^`]+`\s*[:—-]\s*/, "").trim())
      .filter((item) => !SKIP_PREFIX.test(item))
      .map(toSentence);

    if (items.length === 0) continue;
    out.push(`### ${heading}`, "");
    for (const item of items) out.push(`- ${item}`);
    out.push("");
    written += items.length;
  }

  if (written === 0) {
    out.push("_Bu sürümde kullanıcıya yansıyan bir değişiklik yok (yalnız bakım işleri)._", "");
  }

  out.push(INSTALL_BLOCK, "");
  return out.join("\n");
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (!opts.version) {
    fail("Sürüm belirtilmedi.\nKullanım: node tools/release-notes.mjs --version 2.1.0");
  }

  let changelog;
  try {
    changelog = readFileSync(CHANGELOG, "utf8");
  } catch {
    fail(`CHANGELOG.md okunamadı: ${CHANGELOG}`);
  }

  const version = opts.version.trim().replace(/^v/i, "");
  const section = extractSection(changelog, version);
  if (section === null) {
    fail(`Sürüm bulunamadı: ${version}\nCHANGELOG.md içinde "## [${version}]" başlığı yok.`);
  }

  const notes = render(version, section);
  if (opts.out) {
    writeFileSync(resolve(process.cwd(), opts.out), notes, "utf8");
    process.stdout.write(`Sürüm notu yazıldı: ${opts.out}\n`);
  } else {
    process.stdout.write(notes);
  }
}

main();
