// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
// Smart-screen goz konforu temalarini uretir ve iki yere yazar:
//   src-tauri/themes/            -> derlemeye gomulen kopya (kurulum kaynagi)
//   ~/.config/opencode/themes/   -> OpenCode'un okudugu yer Token agaci elle yazilmaz: base butun semantik tokenlari
// verir, her mod dokuz adimlik hue skalalarini kendisi tanimlar (OpenCode
// tema formati: https://opencode.ai/v2/docs/cli/theme).
//
// Kullanim: node tools/themes.mjs            -> temalari yaz
//          node tools/themes.mjs --print     -> yazmadan olcumleri goster

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const BASE_HUES = { red: 22, orange: 42, yellow: 88, green: 145, cyan: 190, blue: 218, purple: 278 };

function hsl(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (v) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

/** Koyu temada 100 en acik -> 900 en koyu; acik temada tersi. */
function ramp(angle, mode, sat) {
  const out = {};
  STEPS.forEach((step, i) => {
    const t = i / (STEPS.length - 1);
    // hsl() yuzde bekler; asagida 0..1 kesir uretiyoruz, 100 ile carp.
    const l = (mode === "dark" ? 0.92 - t * 0.74 : 0.2 + t * 0.72) * 100;
    const s = sat * (mode === "dark" ? 1 - t * 0.5 : 0.55 + t * 0.3);
    out[step] = hsl(angle, s, l);
  });
  return out;
}

// Notr (gray) olcekler elle veriliyor: kontrast bu iki raman uzerinden
// olculup dogrulanir, uretece birakmaz.
const THEMES = [
  {
    file: "ss-paper",
    accent: "orange",
    note: "gunduz: sicak kagit, dusuk mavi",
    gray: {
      light: {
        100: "#1C1A16", 200: "#33302A", 300: "#555046", 400: "#6B655A", 500: "#9E978A",
        600: "#BDB5A7", 700: "#D6CEBE", 800: "#EDE5D6", 900: "#F7F1E6",
      },
      dark: {
        100: "#F7F1E6", 200: "#EDE5D6", 300: "#D6CEBE", 400: "#BDB5A7", 500: "#9E978A",
        600: "#7C766A", 700: "#555046", 800: "#33302A", 900: "#1C1A16",
      },
    },
  },
  {
    file: "ss-dusk",
    accent: "orange",
    note: "alos oda: sicak, gun batimi tonu",
    gray: {
      light: {
        100: "#1E1B18", 200: "#2E2B25", 300: "#454138", 400: "#5C574C", 500: "#787265",
        600: "#979084", 700: "#B9B1A4", 800: "#E8E2D6", 900: "#F2EDE3",
      },
      dark: {
        100: "#E8E2D6", 200: "#D6CFC4", 300: "#B9B1A4", 400: "#9C968A", 500: "#787265",
        600: "#5C574C", 700: "#454138", 800: "#2E2B25", 900: "#1E1B18",
      },
    },
  },
  {
    file: "ss-night",
    accent: "yellow",
    note: "gece: en dusuk aydinlik, en sicak",
    gray: {
      light: {
        100: "#14120F", 200: "#2A2620", 300: "#3E3932", 400: "#554F46", 500: "#6E675C",
        600: "#8B8376", 700: "#ABA396", 800: "#E0D9CB", 900: "#EDE8DE",
      },
      dark: {
        100: "#E0D9CB", 200: "#C9C2B6", 300: "#ABA396", 400: "#A8A294", 500: "#6E675C",
        600: "#554F46", 700: "#3E3932", 800: "#2A2620", 900: "#14120F",
      },
    },
  },
];

function baseTokens() {
  const state = (base, hover) => ({ base, $hovered: hover, $focused: hover, $pressed: hover });
  return {
    text: {
      base: "$hue.neutral.200",
      muted: "$hue.neutral.400",
      action: {
        primary: state("$text.base", "$hue.neutral.100"),
        secondary: state("$text.muted", "$text.base"),
        destructive: state("$hue.red.400", "$hue.red.300"),
      },
      formfield: state("$text.base", "$hue.neutral.300"),
      feedback: {
        error: { base: "$hue.red.400" },
        warning: { base: "$hue.orange.400" },
        success: { base: "$hue.green.400" },
        info: { base: "$hue.cyan.400" },
      },
    },
    background: {
      base: "$hue.neutral.800",
      raised: { base: "$hue.neutral.700", high: "$hue.neutral.600", max: "$hue.neutral.500" },
      action: {
        primary: state("transparent", "$hue.neutral.700"),
        secondary: { base: "transparent" },
        destructive: { base: "$hue.red.800" },
      },
      formfield: { base: "$background.base" },
      feedback: {
        error: { base: "$background.base" },
        warning: { base: "$background.base" },
        success: { base: "$background.base" },
        info: { base: "$background.base" },
      },
    },
    border: { base: "$hue.neutral.600" },
    scrollbar: { base: "$hue.neutral.600" },
    diff: {
      text: {
        added: "$hue.green.400",
        removed: "$hue.red.400",
        context: "$text.muted",
        hunkHeader: "$hue.blue.400",
      },
      background: {
        added: "$hue.green.900",
        removed: "$hue.red.900",
        context: "$background.base",
      },
      highlight: { added: "$hue.green.800", removed: "$hue.red.800" },
      lineNumber: { text: "$hue.neutral.500", background: { added: "$hue.green.900", removed: "$hue.red.900" } },
    },
    syntax: {
      comment: "$hue.neutral.500",
      keyword: "$hue.purple.400",
      function: "$hue.blue.400",
      variable: "$text.base",
      string: "$hue.green.400",
      number: "$hue.orange.400",
      type: "$hue.cyan.400",
      operator: "$hue.neutral.400",
      punctuation: "$text.muted",
    },
    markdown: {
      text: "$text.base",
      heading: "$hue.accent.400",
      link: "$hue.blue.400",
      linkText: "$hue.blue.300",
      code: "$hue.orange.400",
      blockQuote: "$text.muted",
      emphasis: "$text.base",
      strong: "$hue.accent.300",
      horizontalRule: "$hue.neutral.600",
      listItem: "$hue.accent.400",
      listEnumeration: "$hue.accent.400",
      image: "$text.base",
      imageText: "$text.muted",
      codeBlock: "$hue.cyan.400",
    },
  };
}

function modeSection(theme, mode) {
  const hue = { gray: theme.gray[mode] };
  for (const [name, angle] of Object.entries(BASE_HUES)) {
    hue[name] = ramp(angle, mode, 42);
  }
  hue.accent = `$hue.${theme.accent}`;
  hue.interactive = `$hue.${theme.accent}`;
  hue.neutral = "$hue.gray";
  return { hue };
}

/**
 * Renk kodu tokenlarini (sözdizimi + geri bildirim + markdown) verilen adima
 * ceker. Acik modda KARANLIK adim lazim (beyaz ustunde pastel okunmaz),
 * koyu modda acik adim. 400 koyu modda 4.3:1 civari kaldigi icin 300.
 */
function essentialFor(step) {
  const at = (hue) => `$hue.${hue}.${step}`;
  return {
    text: {
      feedback: {
        error: { base: at("red") },
        warning: { base: at("orange") },
        success: { base: at("green") },
        info: { base: at("cyan") },
      },
    },
    syntax: {
      keyword: at("purple"),
      string: at("green"),
      number: at("orange"),
      type: at("cyan"),
      function: at("blue"),
    },
    markdown: {
      heading: at("accent"),
      link: at("blue"),
      code: at("orange"),
    },
  };
}

function build(theme) {
  const section = { hue: {} };
  section.categorical = [theme.accent, "blue", "green", "yellow", "purple", "cyan", "orange", "red"];
  section["@dialog"] = {
    background: { base: "$background.raised.base", action: { primary: { $hovered: "$background.raised.high" } } },
  };
  return {
    $schema: "https://opencode.ai/theme.json",
    base: { ...baseTokens(), ...section },
    light: { hue: modeSection(theme, "light").hue, ...essentialFor(200) },
    dark: { hue: modeSection(theme, "dark").hue, ...essentialFor(300) },
  };
}

// ---- WCAG olcum (denetim icin; Rust tarafi da ayni formulu kullanir) ----
// Not: Dogrudan grey olcegine bakmak yetmez; temadaki renkler referansla
// veriliyor ($syntax.keyword gibi). Referanslar cozulmeden yapilan olcum
// gorunmez sozdizimi renklerini "AAA" diye gecirir.
const ESSENTIAL = [
  "syntax.keyword",
  "syntax.string",
  "syntax.number",
  "syntax.type",
  "syntax.function",
  "text.feedback.error",
  "text.feedback.warning",
  "text.feedback.success",
  "markdown.heading",
  "markdown.link",
  "markdown.code",
];

function mergeDeep(base, overlay) {
  const out = { ...base };
  for (const [key, value] of Object.entries(overlay ?? {})) {
    const bothObjects =
      value && typeof value === "object" && !Array.isArray(value) &&
      out[key] && typeof out[key] === "object" && !Array.isArray(out[key]);
    out[key] = bothObjects ? mergeDeep(out[key], value) : value;
  }
  return out;
}

/** `$hue.ad.adim` ve `$token.yol` referanslarini hex'e cozer (Rust ile ayni). */
function color(root, value, depth = 0) {
  if (depth > 8 || typeof value !== "string") return undefined;
  if (value.startsWith("#")) return value;
  if (!value.startsWith("$")) return undefined;
  const parts = value.slice(1).split(".");
  if (parts[0] === "hue") {
    let name = parts[1];
    let step = parts.length === 3 ? parts[2] : undefined;
    for (let hop = 0; hop < 8 && name; hop++) {
      const node = root.hue ? root.hue[name] : undefined;
      if (node === undefined) return undefined;
      if (typeof node === "string") {
        if (!node.startsWith("$")) return undefined;
        const aliased = node.slice(1).split(".");
        name = aliased[1];
        if (aliased.length === 3) step = aliased[2];
        continue;
      }
      return step ? color(root, node[step], depth + 1) : undefined;
    }
    return undefined;
  }
  let node = root;
  for (let i = 0; i < parts.length; i++) {
    const value2 = node && typeof node === "object" ? node[parts[i]] : undefined;
    if (value2 === undefined) return undefined;
    if (typeof value2 === "string") {
      return i === parts.length - 1 ? color(root, value2, depth + 1) : undefined;
    }
    node = value2;
  }
  return undefined;
}

function luminance(hexColor) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hexColor.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.4 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function verdict(r) {
  return r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA-large" : "FAIL";
}

function measure(doc, mode) {
  const root = mergeDeep(doc.base, doc[mode]);
  const pick = (p) => color(root, `$${p}`);
  const bg = pick("background.base");
  const text = pick("text.base");
  const muted = pick("text.muted");
  if (!bg || !text) return null;
  const textRatio = ratio(text, bg);
  const mutedRatio = muted ? ratio(muted, bg) : 0;
  const colors = ESSENTIAL.map(pick).filter(Boolean).map((c) => ratio(c, bg));
  const synMin = colors.length ? Math.min(...colors) : Infinity;
  return {
    textRatio,
    mutedRatio,
    synMin: Number.isFinite(synMin) ? synMin : 0,
    effective: Math.min(textRatio, Number.isFinite(synMin) ? synMin : Infinity),
  };
}

const printOnly = process.argv.includes("--print");
const here = dirname(fileURLToPath(import.meta.url));
const bundledDir = join(here, "..", "src-tauri", "themes");
// Rust tarafindaki themes_dir() ile ayni kural: XDG varsa o.
const configHome = process.env.XDG_CONFIG_HOME ? process.env.XDG_CONFIG_HOME : join(homedir(), ".config");
const homeDir = join(configHome, "opencode", "themes");
const targets = [bundledDir, homeDir];
if (!printOnly) for (const t of targets) mkdirSync(t, { recursive: true });

/** Tema secim onizlemesi icin mod basina zemin/metin/vurgu renkleri. */
const preview = {};

let failed = false;
for (const theme of THEMES) {
  const doc = build(theme);
  preview[theme.file] = {};
  for (const mode of ["light", "dark"]) {
    const m = measure(doc, mode);
    if (!m) {
      failed = true;
      console.log(`${theme.file} ${mode}: TOKEN COZULEMEDI`);
      continue;
    }
    // Karar: metin ve renk kodunun en kotusu + ikincil metin.
    const v = verdict(m.effective);
    if (v === "FAIL" || verdict(m.mutedRatio) === "FAIL") failed = true;
    console.log(
      `${theme.file.padEnd(10)} ${mode.padEnd(5)} text ${m.textRatio.toFixed(2)}` +
        `  muted ${m.mutedRatio.toFixed(2)}` +
        `  renk ${m.synMin.toFixed(2)}` +
        `  -> karar ${v}`,
    );
    // Onizleme renkleri: measure() ile ayni kokten (base + mod) cozulur;
    // cozulemeyen deger UYDURULMAZ, null yazilir (kaynak hata verir).
    const root = mergeDeep(doc.base, doc[mode]);
    const pick = (p) => color(root, `$${p}`) ?? null;
    const swatch = {
      bg: pick("background.base"),
      text: pick("text.base"),
      accent: pick("syntax.keyword"),
    };
    if (Object.values(swatch).some((c) => c === null)) {
      failed = true;
      console.log(`${theme.file} ${mode}: ONIZleme RENGI COZULEMEDI`);
    }
    preview[theme.file][mode] = swatch;
  }
  if (!printOnly) {
    const body = `${JSON.stringify(doc, null, 2)}\n`;
    for (const target of targets) {
      const path = join(target, `${theme.file}.json`);
      writeFileSync(path, body, "utf8");
      console.log(`yazildi: ${path}`);
    }
  }
}

if (!printOnly) {
  const previewBody = `${JSON.stringify(
    {
      _note: "URETILMIS VERI — tools/themes.mjs yazar. tema secim onizlemesi icin.",
      themes: preview,
    },
    null,
    2,
  )}\n`;
  const previewPath = join(here, "..", "src", "ss-colors.json");
  writeFileSync(previewPath, previewBody, "utf8");
  console.log(`yazildi: ${previewPath}`);
}

const written = printOnly || targets.every((t) => existsSync(join(t, "ss-night.json")));
console.log(
  !written
    ? "SONUC: FAIL — temalar yazilamadi"
    : failed
      ? "SONUC: FAIL — bir oran esik altinda"
      : "SONUC: PASS — metin, ikincil metin ve renk kodu esik ustu",
);
process.exit(failed || !written ? 1 : 0);