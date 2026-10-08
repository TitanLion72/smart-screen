/** Shared labels and theme catalog for the panel. */

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

export interface ThemeEntry {
  name: string;
  mode: string;
  note: string;
}

export const THEMES: ThemeEntry[] = [
  // Kendi goz konforu temalarimiz: kontrastlari olculmus (tools/themes.mjs).
  { name: "ss-paper", mode: "light", note: "gündüz • sıcak" },
  { name: "ss-dusk", mode: "dark", note: "loş oda • sıcak" },
  { name: "ss-night", mode: "dark", note: "gece • en loş" },
  { name: "github", mode: "light", note: "açık" },
  { name: "flexoki", mode: "light", note: "açık" },
  { name: "solarized", mode: "light", note: "açık" },
  { name: "everforest", mode: "system", note: "geçiş" },
  { name: "catppuccin-macchiato", mode: "dark", note: "sarı" },
  { name: "tokyonight", mode: "dark", note: "beyaz" },
  { name: "nord", mode: "dark", note: "loş" },
  { name: "vesper", mode: "dark", note: "gece" },
  { name: "zenburn", mode: "dark", note: "gece" },
];

export const RISKY = ["synthwave84", "matrix", "nightowl", "cobalt2", "dracula", "aura"];

export interface Accent {
  id: string;
  hex: string;
  label: string;
}

export const ACCENTS: Accent[] = [
  { id: "blue", hex: "#6E9BFF", label: "Mavi" },
  { id: "green", hex: "#34D399", label: "Yeşil" },
  { id: "violet", hex: "#A78BFA", label: "Mor" },
  { id: "amber", hex: "#FBBF24", label: "Amber" },
];