// Dört ışık fazı paleti — renkler TASARIM KARARIDIR (spec §6.1, plan Task 2).
// Değerler ölçüldü: en düşük kontrast 6.55 — elle düzenleme, "daha güzel" renk seçme.
// WCAG 2.1 göreli parlaklık + kontrast oranı; geçersiz hex sessizce 0 dönmez, throw.

const HEX = /^#[0-9a-f]{6}$/i;

/** #rrggbb -> 0-255 kanal üçlüsü; geçersiz hex'te throw. */
function parseHex(hex) {
  if (typeof hex !== "string" || !HEX.test(hex)) {
    throw new Error(`geçersiz hex: ${JSON.stringify(hex)} (#rrggbb beklenir)`);
  }
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** WCAG 2.1 göreli parlaklık (0–1). */
export function relativeLuminance(hex) {
  const [r8, g8, b8] = parseHex(hex);
  const lin = (c8) => {
    const c = c8 / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r8) + 0.7152 * lin(g8) + 0.0722 * lin(b8);
}

/** WCAG kontrast oranı (1–21), simetrik. */
export function contrast(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA normal metin eşiği. */
export const AA_TEXT = 4.5;

export const PHASES = Object.freeze([
  Object.freeze({ id: "dawn", hour: 6, bg: "#0e1014", text: "#ded9d0", muted: "#a8a49c", accent: "#b9c4cf", onAccent: "#0e1014" }),
  Object.freeze({ id: "noon", hour: 12, bg: "#f6f1e6", text: "#211d18", muted: "#5c5449", accent: "#7a4a2f", onAccent: "#f6f1e6" }),
  Object.freeze({ id: "dusk", hour: 18, bg: "#241c16", text: "#e7dccd", muted: "#a99c8a", accent: "#d8b98a", onAccent: "#241c16" }),
  Object.freeze({ id: "night", hour: 23, bg: "#0a0908", text: "#f5f1ea", muted: "#b8afa2", accent: "#d8b98a", onAccent: "#0a0908" }),
]);

/** Fazı CSS değişken sözlüğüne çevirir (Task 4 üreteci enjekte eder). */
export function PHASE_VARS(p) {
  return {
    "--bg": p.bg,
    "--text": p.text,
    "--muted": p.muted,
    "--accent": p.accent,
    "--on-accent": p.onAccent,
  };
}
