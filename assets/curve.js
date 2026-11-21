// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — site v2 için sıcak ton eğrisi (site/v2/curve.mjs)

   Tek kaynak `src-tauri/src/decide.rs::warmth_auto`; bu dosya onun
   birebir JS karşılığı. `site/v2/curve.test.mjs` referans tabloyu kilitler.

   Sayfadaki "şu an" okuması buradan gelir: uydurma sayı yok.
   ═══════════════════════════════════════════════════════════════════ */

export const WARMTH_ANCHORS = Object.freeze([
  [0, 88],
  [300, 88],
  [360, 56],
  [420, 22],
  [480, 0],
  [900, 0],
  [1020, 22],
  [1140, 56],
  [1260, 78],
  [1380, 88],
  [1440, 88],
]);

export const DEFAULT_CAP_PERCENT = 70;

export function smoothstep(r) {
  if (!Number.isFinite(r)) return 0;
  const x = Math.max(0, Math.min(1, r));
  return x * x * (3 - 2 * x);
}

function clampPercent(value, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}

export function warmthAt(minute) {
  const t = Number.isFinite(minute) ? Math.min(1440, Math.max(0, minute)) : 1440;
  for (let i = 0; i < WARMTH_ANCHORS.length - 1; i++) {
    const [m0, v0] = WARMTH_ANCHORS[i];
    const [m1, v1] = WARMTH_ANCHORS[i + 1];
    if (t >= m0 && t <= m1) {
      const ratio = m1 === m0 ? 0 : (t - m0) / (m1 - m0);
      return v0 + smoothstep(ratio) * (v1 - v0);
    }
  }
  return 88;
}

export function appliedWarmth(minute, capPercent = DEFAULT_CAP_PERCENT) {
  const cap = clampPercent(capPercent, DEFAULT_CAP_PERCENT);
  return Math.round((warmthAt(minute) * cap) / 100);
}

export function kelvinFromWarmth(percent) {
  const p = clampPercent(percent);
  return Math.round((6500 - (6500 - 3000) * (p / 100)) / 100) * 100;
}

export function nowReading(minute, capPercent = DEFAULT_CAP_PERCENT) {
  const applied = appliedWarmth(minute, capPercent);
  return { raw: warmthAt(minute), applied, kelvin: kelvinFromWarmth(applied) };
}

export function minuteOfDay(hour, minute) {
  const h = Number.isFinite(hour) ? ((Math.trunc(hour) % 24) + 24) % 24 : 0;
  const m = Number.isFinite(minute) ? ((Math.trunc(minute) % 60) + 60) % 60 : 0;
  return h * 60 + m;
}

/**
 * SVG yolu: gün eğrisi. `width`/`height` verilen kutuya sığar.
 * Örnek sayısı 96 (15 dk); eğri pürüzsüz, dosya küçük.
 */
export function curvePath(width = 1200, height = 160, capPercent = DEFAULT_CAP_PERCENT) {
  const x = (m) => (m / 1440) * width;
  const y = (v) => height - (clampPercent(v) / 100) * (height - 8);
  const pts = [];
  for (let m = 0; m <= 1440; m += 15) {
    pts.push({ x: x(m), y: y(appliedWarmth(m, capPercent)) });
  }
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const cx = (a.x + b.x) / 2;
    d += ` C ${cx.toFixed(1)} ${a.y.toFixed(1)}, ${cx.toFixed(1)} ${b.y.toFixed(1)}, ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  }
  return d;
}
