// Tek seferlik bakım aracı: kaynak dosyalara SPDX lisans başlığı ekler.
// Zaten başlık varsa dokunmaz. Kullanım: node tools/add-spdx.mjs [--check]
import { readFile, writeFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const DIRS = ["src", "src-tauri/src", "tools", "qa"];
const LINE = "SPDX-License-Identifier: GPL-3.0-or-later";
const COPY = "Copyright (C) 2026 TitanLion72";
const checkOnly = process.argv.includes("--check");

const commentFor = (ext) => (ext === ".rs" || ext === ".ts" || ext === ".mjs" || ext === ".js" ? "//" : null);

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    // node_modules / dist / shots gibi üretilen veya üçüncü taraf ağaçlara girme.
    if (e.isDirectory() && (e.name === "node_modules" || e.name === "dist" || e.name === "shots")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const files = [];
for (const d of DIRS) files.push(...(await walk(join(ROOT, d))));

let added = 0;
let skipped = 0;
const missing = [];

for (const f of files) {
  const ext = extname(f);
  const c = commentFor(ext);
  if (!c) continue;
  const src = await readFile(f, "utf8");
  if (src.includes("SPDX-License-Identifier:")) {
    skipped++;
    continue;
  }
  missing.push(f.replace(ROOT, ""));
  if (checkOnly) continue;
  // Shebang varsa ondan sonra ekle (yoksa başa).
  const lines = src.split("\n");
  const header = [`${c} ${LINE}`, `${c} ${COPY}`];
  let body;
  if (lines[0]?.startsWith("#!")) {
    body = [lines[0], ...header, ...lines.slice(1)].join("\n");
  } else {
    body = [...header, ...lines].join("\n");
  }
  await writeFile(f, body, "utf8");
  added++;
}

if (checkOnly) {
  if (missing.length) {
    console.error(`SPDX eksik: ${missing.length} dosya`);
    for (const m of missing) console.error("  " + m);
    process.exit(1);
  }
  console.log("SPDX: tüm kaynak dosyalarda var");
} else {
  console.log(`SPDX eklendi: ${added}, zaten vardı: ${skipped}`);
}
