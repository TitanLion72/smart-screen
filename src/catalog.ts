// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/** Shared labels and theme catalog for the panel. */

import builtinColors from "./theme-colors.json";
import ssColors from "./ss-colors.json";

export type Mode = "auto" | "time" | "light" | "fixed";
export type Source = "auto" | "day" | "warm" | "cool" | "night";

export const MODE_LABEL: Record<Mode, string> = {
  auto: "Akıllı",
  time: "Zaman",
  light: "Işık",
  fixed: "Sabit",
};

export const SOURCE_LABEL: Record<Source, string> = {
  auto: "Otomatik",
  day: "Gün",
  warm: "Sarı",
  cool: "Beyaz",
  night: "Gece",
};

export const MODE_OPTIONS = (Object.keys(MODE_LABEL) as Mode[]).map((value) => ({
  value,
  label: MODE_LABEL[value],
}));

export const SOURCE_OPTIONS = (Object.keys(SOURCE_LABEL) as Source[]).map((value) => ({
  value,
  label: SOURCE_LABEL[value],
}));

export interface ThemeSwatch {
  bg: string;
  text: string;
  accent: string;
}

export interface ThemeEntry {
  name: string;
  mode: string;
  note: string;
  /** Tema seciminde gosterilen onizleme renkleri (temanin ana modu icin). */
  swatch?: ThemeSwatch;
}

/** JSON'daki ham kayit: cozulemeyen degerler null olarak durabilir. */
type RawSwatch = Partial<Record<"bg" | "text" | "accent", string | null>>;

const BUILTIN_COLORS: Record<string, Record<string, RawSwatch>> = builtinColors.themes;
const SS_COLORS: Record<string, Record<string, RawSwatch>> = ssColors.themes;

function toSwatch(raw: RawSwatch | undefined): ThemeSwatch | undefined {
  if (!raw || !raw.bg || !raw.text || !raw.accent) return undefined;
  return { bg: raw.bg, text: raw.text, accent: raw.accent };
}

/** Temanin onizleme renkleri; kayitta yoksa undefined doner, renk uydurulmaz. */
function swatchFor(name: string, mode: string): ThemeSwatch | undefined {
  const source = name.startsWith("ss-") ? SS_COLORS : BUILTIN_COLORS;
  const entry = source[name];
  if (!entry) return undefined;
  return toSwatch(entry[mode === "system" ? "dark" : mode]);
}

function themeEntry(name: string, mode: string, note: string): ThemeEntry {
  const swatch = swatchFor(name, mode);
  return swatch === undefined ? { name, mode, note } : { name, mode, note, swatch };
}

export const THEMES: ThemeEntry[] = [
  // Kendi goz konforu temalarimiz: kontrastlari olculmus (tools/themes.mjs).
  themeEntry("ss-paper", "light", "gündüz • sıcak"),
  themeEntry("ss-dusk", "dark", "loş oda • sıcak"),
  themeEntry("ss-night", "dark", "gece • en loş"),
  themeEntry("github", "light", "açık"),
  themeEntry("flexoki", "light", "açık"),
  themeEntry("solarized", "light", "açık"),
  themeEntry("everforest", "system", "geçiş"),
  themeEntry("catppuccin-macchiato", "dark", "sarı"),
  themeEntry("tokyonight", "dark", "beyaz"),
  themeEntry("nord", "dark", "loş"),
  themeEntry("vesper", "dark", "gece"),
  themeEntry("zenburn", "dark", "gece"),
];

export const RISKY = ["synthwave84", "matrix", "nightowl", "cobalt2", "dracula", "aura"];

export interface Accent {
  id: string;
  hex: string;
  label: string;
}

export const ACCENTS: Accent[] = [
  // v2.8.1: "palette" = paletin KENDİ vurgusu (varsayılan). Diğer dördü
  // yalnız seçildiği palette geçerli — paletler arası renk sızması yok.
  { id: "palette", hex: "", label: "Palet rengi" },
  // Hex'ler palette.css [data-accent] bloklarıyla aynı ailede tutulur (obsidyen+şampanya).
  { id: "blue", hex: "#8FB3C9", label: "Mavi" },
  { id: "green", hex: "#8FBF8F", label: "Yeşil" },
  { id: "violet", hex: "#D09A92", label: "Gül" },
  { id: "amber", hex: "#D8B98A", label: "Şampanya" },
];

/** Tasarım teması (görünüm paleti). CSS `[data-theme]` bloklarıyla eşleşir. */
export interface DesignTheme {
  id: string;
  label: string;
  note: string;
  /** Önizleme şeridi: zemin / yüzey / vurgu */
  swatch: { bg: string; surface: string; accent: string };
}

export const DESIGN_THEMES: DesignTheme[] = [
  // Koyu aile
  {
    id: "obsidyen",
    label: "Obsidyen",
    note: "Sıcak kömür + şampanya",
    swatch: { bg: "#0a0908", surface: "#1a1714", accent: "#d8b98a" },
  },
  {
    id: "gece",
    label: "Gece",
    note: "Derin lacivert + buz gümüşü",
    swatch: { bg: "#07090d", surface: "#121821", accent: "#a9c6e0" },
  },
  {
    id: "orman",
    label: "Orman",
    note: "Koyu yeşil + adaçayı",
    swatch: { bg: "#070a08", surface: "#121a14", accent: "#a8c8a4" },
  },
  {
    id: "gul",
    label: "Gül",
    note: "Erik zemin + gül kurusu",
    swatch: { bg: "#0b0709", surface: "#1b1319", accent: "#e0b0c4" },
  },
  // v2.8: beş yeni aile — kontrastları check-tokens ile ölçülür.
  {
    id: "okyanus",
    label: "Okyanus",
    note: "Derin petrol + deniz camı",
    swatch: { bg: "#060b0e", surface: "#101a20", accent: "#7fc9c4" },
  },
  {
    id: "lavanta",
    label: "Lavanta",
    note: "Koyu mor + lavanta",
    swatch: { bg: "#0a0810", surface: "#171325", accent: "#c0b0e8" },
  },
  {
    id: "gunbatimi",
    label: "Gün batımı",
    note: "Bordo zemin + amber",
    swatch: { bg: "#0d0705", surface: "#1d1310", accent: "#e8a26a" },
  },
  {
    id: "grafit",
    label: "Grafit",
    note: "Nötr soğuk koyu + gök mavisi",
    swatch: { bg: "#14161a", surface: "#1d2026", accent: "#6ea8d8" },
  },
  // Açık aile
  {
    id: "fildisi",
    label: "Fildişi",
    note: "Aydınlık kâğıt + bronz",
    swatch: { bg: "#f6f2ea", surface: "#ffffff", accent: "#94632d" },
  },
  {
    id: "kagit",
    label: "Kâğıt",
    note: "Nötr sıcak açık + kiremit",
    swatch: { bg: "#faf8f4", surface: "#ffffff", accent: "#b4553a" },
  },
  {
    id: "kum",
    label: "Kum",
    note: "Sıcak bej + zeytin",
    swatch: { bg: "#f6f2e7", surface: "#fffdf7", accent: "#5f6b32" },
  },
  {
    id: "buz",
    label: "Buz",
    note: "Soğuk gri-mavi + lacivert",
    swatch: { bg: "#f2f5f8", surface: "#ffffff", accent: "#2c5d8a" },
  },
];

export const DEFAULT_DESIGN_THEME = "obsidyen";

/**
 * ŞABLON — ikinci bağımsız eksen (v2.6). `data-theme` rengi, `data-template`
 * geometri/tipografi/gezinmeyi belirler; ikisi çarpılabilir (4 × 7 = 28).
 * CSS karşılığı `src/templates.css`, seçim `setTemplate` ile `<html>`'e yazılır.
 */
export interface Template {
  id: string;
  label: string;
  note: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "bento",
    label: "Bento",
    note: "Mozaik kutular, en net hiyerarşi",
  },
  {
    id: "sahne",
    label: "Sahne",
    note: "Cam yüzey + 3B derinlik",
  },
  {
    id: "dergi",
    label: "Dergi",
    note: "Editoryal, serif, kâğıt hissi",
  },
  {
    id: "konsol",
    label: "Konsol",
    note: "Enstrüman paneli, mono sayılar",
  },
];

export const DEFAULT_TEMPLATE = "bento";