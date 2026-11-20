// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — tanıtım sitesi için sıcak ton eğrisi (site/curve.mjs)

   Neden burada: sitedeki eğri ve "şu an" okuması ürünün gerçek
   davranışını göstermek zorunda. Yaklaşık değer, sitenin düzelttiği
   sorunun (yanlış bilgi) ta kendisi olurdu.

   Tek kaynak `src-tauri/src/decide.rs::warmth_auto`; bu dosya onun
   birebir JS karşılığıdır. `site/curve.test.mjs` referans tabloyu
   kilitler: eğri değişirse site sessizce yalan söyleyemez.

   Saf fonksiyonlar, sıfır bağımlılık, tarayıcıda da çalışır.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Çapa noktaları: (dakika, şiddet). `decide.rs` ANCHORS ile birebir aynı.
 * 00:00 ve 24:00 aynı değerde (88) olduğu için gece yarısı çevriminde
 * eğride kesinti olmaz.
 */
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

/** Varsayılan şiddet tavanı (Ayarlar'daki `warmPercent` varsayılanı). */
export const DEFAULT_CAP_PERCENT = 70;

/** `smoothstep(r) = r²(3−2r)` — Rust tarafındaki ile aynı. */
export function smoothstep(r) {
  if (!Number.isFinite(r)) return 0;
  const x = Math.max(0, Math.min(1, r));
  return x * x * (3 - 2 * x);
}

/** 0–100 aralığına kelepçeler; sayı değilse `fallback` döner. */
function clampPercent(value, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}

/**
 * Günün dakikasına göre HAM şiddet (0–100, float).
 * Bozuk girdi 24:00'e kelepçelenir — Rust `min(1440)` ile aynı davranış.
 */
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

/**
 * Kullanıcı tavanının uygulandığı gerçek şiddet (int).
 * `decide.rs`/`panels.ts`: uygulanan = round(ham × warmPercent/100).
 */
export function appliedWarmth(minute, capPercent = DEFAULT_CAP_PERCENT) {
  const cap = clampPercent(capPercent, DEFAULT_CAP_PERCENT);
  return Math.round((warmthAt(minute) * cap) / 100);
}

/**
 * Şiddet → Kelvin. `src/engine.ts::warmthToKelvin` ile birebir:
 * 0 → 6500 K, 100 → 3000 K, 100'e yuvarlanır.
 */
export function kelvinFromWarmth(percent) {
  const p = clampPercent(percent);
  const k = 6500 - ((6500 - 3000) * p) / 100;
  return Math.round(k / 100) * 100;
}

/**
 * SVG için örnek noktaları. `stepMinutes` kadar adımlarla günü tarar.
 * İlk nokta `stepMinutes` (00:00 eksen başlangıcı ayrı çizilir), son nokta 1440.
 */
export function curvePoints(stepMinutes = 15) {
  const step = Number.isFinite(stepMinutes) && stepMinutes > 0 ? stepMinutes : 15;
  const out = [];
  for (let m = step; m <= 1440; m += step) {
    out.push({ minute: m, warmth: warmthAt(m) });
  }
  return out;
}

/** "Şu an" okuması: ham, uygulanan ve Kelvin birlikte. */
export function nowReading(minute, capPercent = DEFAULT_CAP_PERCENT) {
  const raw = warmthAt(minute);
  const applied = appliedWarmth(minute, capPercent);
  return { raw, applied, kelvin: kelvinFromWarmth(applied) };
}

/** Saat + dakikadan gün dakikası (0–1440). */
export function minuteOfDay(hour, minute) {
  const h = Number.isFinite(hour) ? ((Math.trunc(hour) % 24) + 24) % 24 : 0;
  const m = Number.isFinite(minute) ? ((Math.trunc(minute) % 60) + 60) % 60 : 0;
  return h * 60 + m;
}
