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
  // Hex'ler styles.css [data-accent] bloklarıyla aynı ailede tutulur (obsidyen+şampanya).
  { id: "blue", hex: "#8FB3C9", label: "Mavi" },
  { id: "green", hex: "#8FBF8F", label: "Yeşil" },
  { id: "violet", hex: "#D09A92", label: "Gül" },
  { id: "amber", hex: "#D8B98A", label: "Şampanya" },
];