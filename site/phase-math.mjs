// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — faz geçiş matematiği (site/phase-math.mjs)

   Amaç: kaydırdıkça sayfanın tonu komşu bölümler arasında yumuşakça
   geçsin. Süs değil: ürünün "gün boyunca ton değişir" iddiasını sayfa
   kendi davranışıyla taşısın.

   Saf fonksiyonlar; tarayıcıda `assets/phase-math.js` kopyası çalışır.
   NaN/Infinity girdide çökmek yok — güvenli varsayılan (son faz).
   ═══════════════════════════════════════════════════════════════════ */

/**
 * `#rrggbb` → {r,g,b} (0–255 int).
 * Geçersiz hex sessizce 0 dönmez: bu bir programlama hatasıdır, patlasın.
 */
export function parseHex(hex) {
  if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`geçersiz hex: ${String(hex)}`);
  }
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/** {r,g,b} → `#rrggbb` (yuvarlanır, 0–255 kelepçelenir). */
export function toHex(rgb) {
  const c = (v) => {
    const n = Number.isFinite(v) ? Math.round(v) : 0;
    return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  };
  return `#${c(rgb.r)}${c(rgb.g)}${c(rgb.b)}`;
}

/** İki renk arasında doğrusal karışım; t 0–1 dışına taşarsa kelepçelenir.
 *  Sonuç tam sayıya yuvarlanır: `#rrggbb` üretimi ile aynı hassasiyet,
 *  yarım baytlar birikmesin. */
export function blend(a, b, t) {
  const k = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  };
}

/**
 * Bölüm ağırlıkları: görünüm merkezi hangi bölümdeyse ağırlık orada;
 * iki bölüm arasındaki sınırı geçerken komşuya yumuşak devir.
 *
 * İlk sürüm ağırlığı bölümün ÜSTÜNDEN bir sonrakinin üstüne doğrusal
 * dağıtıyordu; sonuç: her bölümün ortasında %50 komşuya kayıyor ve hiçbir
 * bölüm kendi faz renginde durmuyordu (şafak `#0e1014` yerine gri
 * `rgb(86,86,85)` çıkıyordu). Doğrusu: renk bölüm boyunca SABİT kalır,
 * yalnız sınıra yakın `z` kadar alanda devreder.
 *
 * @param scrollY     pencere kaydırması
 * @param sectionTops bölümlerin belge üst konumları (artan)
 * @param vh          görünüm yüksekliği
 * @returns her bölüm için ağırlık; toplam 1
 */
export function phaseWeights(scrollY, sectionTops, vh) {
  const n = Array.isArray(sectionTops) ? sectionTops.length : 0;
  if (n === 0) return [];
  if (n === 1) return [1];

  const zero = new Array(n).fill(0);
  const safeVh = Number.isFinite(vh) && vh > 0 ? vh : 1;
  const top = (i) => (Number.isFinite(sectionTops[i]) ? sectionTops[i] : 0);
  const y = Number.isFinite(scrollY) ? scrollY : Number.NaN;

  // Bozuk girdi: güvenli varsayılan (gece/son faz).
  if (!Number.isFinite(y)) {
    const w = [...zero];
    w[n - 1] = 1;
    return w;
  }

  const cy = y + safeVh / 2;
  if (cy <= top(0)) {
    const w = [...zero];
    w[0] = 1;
    return w;
  }

  // Hangi bölümün içindeyiz?
  let i = 0;
  for (let k = 1; k < n; k++) if (cy >= top(k)) i = k;

  // Geçiş yarı-genişliği: görünümün %35'i, ama bölümün yarısını aşamaz
  // (kısa bölümlerde geçiş bölgeleri üst üste binmesin).
  const spanBelow = i > 0 ? top(i) - top(i - 1) : Number.POSITIVE_INFINITY;
  const spanAbove = i < n - 1 ? top(i + 1) - top(i) : Number.POSITIVE_INFINITY;
  const z = Math.max(1, Math.min(safeVh * 0.35, spanBelow * 0.5, spanAbove * 0.5));

  const w = [...zero];
  const toNext = i < n - 1 ? top(i + 1) - cy : Number.POSITIVE_INFINITY;
  const fromPrev = i > 0 ? cy - top(i) : Number.POSITIVE_INFINITY;

  if (toNext < z) {
    // Sınıra yaklaşıyoruz: bir sonraki faza devret.
    const t = (z - toNext) / (2 * z);
    w[i] = 1 - t;
    w[i + 1] = t;
  } else if (fromPrev < z) {
    // Sınırı yeni geçtik: önceki fazdan devralıyoruz.
    const t = (z - fromPrev) / (2 * z);
    w[i] = 1 - t;
    w[i - 1] = t;
  } else {
    w[i] = 1;
  }
  return w;
}

/** En büyük ağırlığın indeksi (eşitlikte ilki). Boşta -1. */
export function nearestPhase(weights) {
  if (!Array.isArray(weights) || weights.length === 0) return -1;
  let best = 0;
  for (let i = 1; i < weights.length; i++) {
    if ((weights[i] ?? 0) > (weights[best] ?? 0)) best = i;
  }
  return best;
}

/**
 * Ağırlıklı ortalama renk: `entries = [[rgb, weight], ...]`.
 * Toplam ağırlık 0 ise ilk renk döner (boş dizi → siyah değil, hata değil).
 */
export function mixWeighted(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("mixWeighted: boş girdi");
  }
  let total = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [rgb, w] of entries) {
    const k = Number.isFinite(w) && w > 0 ? w : 0;
    total += k;
    r += rgb.r * k;
    g += rgb.g * k;
    b += rgb.b * k;
  }
  if (total <= 0) return { ...entries[0][0] };
  return { r: r / total, g: g / total, b: b / total };
}
