// OpenCode tema aracinin paketindeki yerlesik tema renklerini cikarir ve
// src/theme-colors.json icine yazar. AMAC: tema seciminde GERCEK onizleme
// cizmek. Tahmin yok, hicbir renk uydurulmuyor.
//
// Kaynak: https://opencode.ai/theme/assets/  (tema araci; V1 tema tanimlari)
// Bu betik yalnizca veri uretir; uygulama calisirken INTERNET ISTEMEZ.
//
// Kullanim: node tools/extract-theme-colors.mjs [--check]
//   --check  yazmaz, mevcut dosyayla ayni mi diye bakar (CI/icin).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BUNDLE_HINT_URL = "https://opencode.ai/theme/";
const WANT = [
  "github",
  "flexoki",
  "solarized",
  "everforest",
  "catppuccin-macchiato",
  "tokyonight",
  "nord",
  "vesper",
  "zenburn",
];

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, "..", "src", "theme-colors.json");

/** `ab={` ifadesindeki dengeli suslu blogu dondurur. */
function balancedSlice(text, startIndex) {
  let depth = 0;
  let i = startIndex;
  while (i < text.length) {
    const c = text[i];
    if (c === "{" || c === "}") {
      depth += c === "{" ? 1 : -1;
      if (depth === 0) return text.slice(startIndex, i + 1);
      i++;
      continue;
    }
    if (c === "`" || c === '"' || c === "'") {
      const quote = c;
      i++;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === "\\") i++;
        i++;
      }
    }
    i++;
  }
  return null;
}

/** V1 tanimindan tek modun rengini cozer; referanssa ("red") defs'e bakar. */
function resolve(lookup, mode, key, depth = 0) {
  if (depth > 6) return null;
  const entry = lookup[key];
  if (entry === undefined) return null;
  const value = typeof entry === "object" ? entry[mode] : entry;
  if (typeof value !== "string") return null;
  if (value.startsWith("#")) return value;
  return resolve(lookup, mode, value, depth + 1);
}

async function main() {
  const pageRes = await fetch(BUNDLE_HINT_URL);
  const page = await pageRes.text();
  const jsPath = /src="(\/theme\/assets\/[^"]+\.js)"/.exec(page)?.[1];
  if (!jsPath) throw new Error("paket yolu bulunamadi");
  const res = await fetch(`https://opencode.ai${jsPath}`);
  const text = await res.text();

  const mapMatch = /iue=\{([\s\S]*?)\},aue=/.exec(text);
  if (!mapMatch) throw new Error("tema haritasi bulunamadi");

  const wanted = new Map();
  for (const kv of mapMatch[1].split(",")) {
    const pair = /^\s*([\w"-]+):(\$?\w+)\s*$/.exec(kv);
    if (!pair) continue;
    const id = pair[1].replace(/"/g, "");
    if (WANT.includes(id)) wanted.set(id, pair[2]);
  }

  const out = {};
  for (const [id, varName] of wanted) {
    const needle = `${varName}={`;
    const at = text.indexOf(needle);
    if (at < 0) {
      console.error(`UYARI: ${id} (${varName}) tanimi bulunamadi`);
      continue;
    }
    const literal = balancedSlice(text, at + varName.length + 1);
    if (!literal) {
      console.error(`UYARI: ${id} (${varName}) blok kapanmadi`);
      continue;
    }
    // eslint-disable-next-line no-eval
    let parsed;
    try {
      parsed = eval(`(${literal})`);
    } catch (e) {
      console.error(`UYARI: ${id} (${varName}) degerlendirilemedi: ${e.message}`);
      console.error(`  literal basi: ${JSON.stringify(literal.slice(0, 160))}`);
      continue;
    }
    if (process.argv.includes("--dump") || process.env.THEME_DUMP) {
      // Yapi degisikligini anlamak icin: top-level anahtarlar + ham bas.
      console.log(`--- ${id} (${varName}) ---`);
      console.log(`  top-level: ${Object.keys(parsed).join(", ")}`);
      console.log(`  raw: ${literal.slice(0, 400)}`);
      continue;
    }
    // Bazi tanimlar `theme` + `defs` olarak ayriliyor; referanslar defs'e bakar.
    const lookup = { ...(parsed.theme ?? parsed), ...(parsed.defs ?? {}) };
    const modes = {};
    for (const mode of ["dark", "light"]) {
      const bg = resolve(lookup, mode, "background");
      if (!bg) continue;
      modes[mode] = {
        bg,
        text: resolve(lookup, mode, "text"),
        muted: resolve(lookup, mode, "textMuted"),
        accent: resolve(lookup, mode, "syntaxKeyword"),
        accent2: resolve(lookup, mode, "syntaxFunction"),
      };
    }
    out[id] = modes;
  }

  const payload = {
    _note:
      "URETILMIS VERI — node tools/extract-theme-colors.mjs ile olusturulur. " +
      "Kaynak: OpenCode tema aracinin paketindeki yerlesik V1 tema tanimlari. " +
      "Yalniz tema secim onizlemesi icin kullanilir.",
    _source: "https://opencode.ai/theme/",
    themes: out,
  };
  const body = `${JSON.stringify(payload, null, 2)}\n`;

  if (Object.keys(out).length < WANT.length) {
    console.error(`CIKARMA EKSIK: ${Object.keys(out).length}/${WANT.length} tema — dosya yazilmadi`);
    process.exit(1);
  }

  if (process.argv.includes("--check")) {
    const current = readFileSync(outFile, "utf8");
    console.log(current === body ? "AYNI" : "FARKLI");
  } else {
    writeFileSync(outFile, body, "utf8");
    console.log(`yazildi: ${outFile} (${Object.keys(out).length} tema)`);
  }
  for (const [id, modes] of Object.entries(out)) {
    console.log(`  ${id.padEnd(22)} dark ${modes.dark?.bg ?? "?"} -> ${modes.light?.bg ?? "?"}`);
  }
}

main().catch((e) => {
  console.error("CIKARMA BASARISIZ", e);
  process.exit(1);
});