// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/**
 * engine.ts — saf karar yardımcıları (DOM yok, invoke yok, `Date.now()` yok).
 *
 * Neden ayrı dosya: `orchestr.ts` her turda donanıma ve dosyaya dokunuyor;
 * "durduk yere kısıldı/parladı" şikâyetinin kuralları bu yüzden test
 * edilemiyordu. Buradaki fonksiyonlar yalnız sayı/nesne alır, sonuç döner —
 * `src/engine.test.ts` içinde `node --test` ile doğrulanır.
 *
 * Sayısal eğriler (seviye histerezi, sürekli parlaklık tabanı, adım kuralı,
 * sıcak ton eğrisi) Rust tarafındadır (`decide.rs`); burada onların
 * TÜKETİM kuralları var: ne zaman yazılır, ne zaman saygı gösterilir,
 * öğrenme nasıl uygulanır.
 */

/** Kamera ölçümünün seviyesi (Rust `decide::Level` ile aynı adlar). */
export type LightLevel = "dark" | "dim" | "normal" | "bright";
/** Ölçümün tonu. */
export type Tone = "cool" | "neutral" | "warm";

/** Bizim yazdığımız değer ve zamanı (dış müdahaleyi ayırt etmek için). */
export interface WriteRecord {
  value: number;
  at: number;
}

/** Plan §4.1/2: iki bağımsız ölçüm arası en az bu kadar süre olmalı. */
export const MEASURE_GAP_MS = 45_000;
/** Plan §4.1/5: dış müdahaleden sonra yazmama penceresi. */
export const RESPECT_MS = 15 * 60_000;
/** Okuma, bizim yazdığımızdan bu kadar saparsa "başkası yazdı" sayılır. */
export const EXTERNAL_DELTA = 6;
/** Bu süreden sonraki sapma normal adımla düzeltilir (ani sıçrama yok). */
export const EXTERNAL_WINDOW_MS = 90_000;
/** Plan §4.1/8: tema değişimi için en az bekleme. */
export const THEME_DWELL_MS = 10 * 60_000;
/** Plan §4.1/8: aynı karar için bağımsız tur sayısı. */
export const THEME_TURNS = 3;
/** Plan §4.1/7: öğrenilen delta sınırı (mutlak parlaklık değil). */
export const LEARN_DELTA_MAX = 20;
/** Plan §4.1/7: öğrenmenin uygulanması için en az farklı gün. */
export const LEARN_MIN_DAYS = 3;
/** Plan §4.1/7: en az gözlem. */
export const LEARN_MIN_OBS = 3;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Ölçüm gerçekten yeni mi? Kamera önbelleği (5/15 dk) aynı kareyi döndürür;
 * aynı kare "ikinci ölçüm" sayılırsa histerez boşa gider (PLAN-v3 §2/A2).
 */
export function isNewMeasurement(prevAt: number | null, at: number): boolean {
  if (prevAt === null) return true;
  if (!Number.isFinite(at) || !Number.isFinite(prevAt)) return false;
  return at > prevAt && at - prevAt >= MEASURE_GAP_MS;
}

/**
 * Turu tamamen atlatan durumlar. `current === 0` normalde kilit/ekran
 * kapanmasıdır (PLAN-v3 §2/A6); gece penceresinde 0 meşru olduğu için
 * yalnız hedef de sıfırsa yazmaya izin verilir.
 */
export function skipReason(p: {
  locked: boolean;
  current: number | null;
  desired: number;
}): string | null {
  if (p.locked) return "kilitli";
  if (p.current === 0 && p.desired > 0) return "ekran kapalı (okuma 0)";
  return null;
}

/**
 * Dış müdahale: son yazımızdan bu yana çok kısa süre geçmişken okuma
 * yazdığımızdan `EXTERNAL_DELTA`'dan fazla sapmışsa kullanıcı ya da başka
 * bir yazılım müdahale etmiştir. O zaman 15 dk yazmayız (PLAN-v3 §4.1/5).
 */
export function isExternalChange(
  current: number | null,
  lastWritten: WriteRecord | null,
  now: number,
): boolean {
  if (current === null || lastWritten === null) return false;
  if (now - lastWritten.at > EXTERNAL_WINDOW_MS) return false;
  return Math.abs(current - lastWritten.value) > EXTERNAL_DELTA;
}

/** Saygı penceresini uzatır (var olanın altına inmez). */
export function extendRespect(until: number, now: number): number {
  return Math.max(until, now + RESPECT_MS);
}

/** Öğrenilecek değer: kullanıcının seçtiği parlaklık eksi o anki taban. */
export function learnDelta(current: number | null, base: number): number | null {
  if (current === null || !Number.isFinite(current)) return null;
  return clamp(Math.round(current - base), -LEARN_DELTA_MAX, LEARN_DELTA_MAX);
}

/** Öğrenilmiş delta tabana eklenir (eski ±10 kelepçesi kaldırıldı). */
export function applyLearnDelta(base: number, delta: number | null): number {
  if (delta === null || !Number.isFinite(delta)) return base;
  return base + clamp(delta, -LEARN_DELTA_MAX, LEARN_DELTA_MAX);
}

/** Öğrenme uygulanabilir mi? En az 3 gözlem + 3 farklı gün (PLAN-v3 §4.1/7). */
export function learnAllowed(count: number, days: number): boolean {
  return count >= LEARN_MIN_OBS && days >= LEARN_MIN_DAYS;
}

/**
 * Okunaksız kombinasyon kapısı (PLAN-v3 §4.1/6): açık temada çok kısık
 * parlaklık okunmaz, koyu temada çok parlak parlaklık göz yorar.
 */
export function readableTarget(target: number, mode: string): number {
  const t = clamp(target, 0, 100);
  if (mode === "light" && t < 55) return 60;
  if (mode === "dark" && t > 80) return 80;
  return t;
}

/**
 * Nihai hedef: taban + öğrenme deltası + kullanıcı ofseti, alt sınır, tavan
 * (gece/okuma), 95 tavanı ve okunaksız kapı.
 *
 * `cap` açıkça verilmişse (gece tavanı, okuma kipi) okunaksız kapı uygulanmaz:
 * kullanıcı bilerek kısmıştır, motor onu geri açmaz.
 */
export function finalTarget(p: {
  base: number;
  learnDelta?: number | null;
  offset?: number;
  floor?: number;
  cap?: number | null;
  mode: string;
}): number {
  let t = applyLearnDelta(p.base, p.learnDelta ?? null) + (p.offset ?? 0);
  if (p.cap !== null && p.cap !== undefined) t = Math.min(t, p.cap);
  t = Math.max(t, p.floor ?? 0);
  t = Math.min(t, 95);
  if (p.cap === null || p.cap === undefined) t = readableTarget(t, p.mode);
  return Math.round(clamp(t, 0, 100));
}

/**
 * Tema değişim kapısı: son değişimden `THEME_DWELL_MS` geçmeli ve aynı karar
 * en az `required` bağımsız turda görülmeli (PLAN-v3 §4.1/8). Elle seçim
 * bu kapıyı kullanmaz — kullanıcı niyeti her zaman öndedir.
 */
export function themeGate(p: {
  now: number;
  lastAt: number | null;
  turns: number;
  required?: number;
}): { ok: boolean; reason: "ok" | "dwell" | "turns" } {
  if (p.lastAt !== null && p.now - p.lastAt < THEME_DWELL_MS) {
    return { ok: false, reason: "dwell" };
  }
  if (p.turns < (p.required ?? THEME_TURNS)) return { ok: false, reason: "turns" };
  return { ok: true, reason: "ok" };
}

const TONE_ORDER: Tone[] = ["cool", "neutral", "warm"];

/**
 * Ton için son üç örneğin medyanı (PLAN-v3 §4.1/1). Üçten az örnek varsa son
 * örnek kullanılır; tanınmayan ton `neutral` sayılır. Tek bir gürültülü kare
 * tonu oynatamaz.
 */
export function medianTone(tones: string[]): Tone {
  const known = tones
    .filter((t): t is Tone => (TONE_ORDER as string[]).includes(t))
    .slice(-3);
  if (known.length === 0) return "neutral";
  if (known.length < 3) return known[known.length - 1];
  return [...known].sort((a, b) => TONE_ORDER.indexOf(a) - TONE_ORDER.indexOf(b))[1];
}

/** Seviye için pref anahtarı: `dim/warm`. */
export function lightKey(level: string, tone: string): string {
  return `${level}/${tone}`;
}

/**
 * Yazılan değer hedeften bu kadar uzaksa tur "tutmadı" sayılır ve tekrar
 * denenir; yakınsa yazım başarılı kabul edilir (WMI ±1 oynayabilir).
 */
export const WRITE_TOLERANCE = 3;

/**
 * "Günün rengi" palet kapısı — saate göre otomatik paletin bu turda
 * uygulanıp uygulanmayacağı (v2.11).
 *
 * Neden saf fonksiyon: `orchestr.applyAutoPalette` içinde karar gömülüydü ve
 * "kullanıcı seçtikten sonra geri çevrilmiyor" davranışı yalnız gözle
 * doğrulanabiliyordu. Dwell penceresi sessizce bozulsa hiçbir test görmezdi.
 *
 * Kurallar:
 * - Anahtar kapalıysa hiçbir şey yapılmaz (kullanıcı seçimi kutsal).
 * - Elle seçimden `AUTO_PALETTE_DWELL_MS` geçmeden değiştirilmez.
 * - Palet zaten istenen renkse yazılmaz (DOM'a boşuna dokunma).
 * - Saat geri alınmışsa (`now < lastManualAt`) fark negatif çıkar; bu da
 *   "henüz dwell dolmadı" sayılır — geri saat paleti zıplatmasın.
 */
export const AUTO_PALETTE_DWELL_MS = 10 * 60_000;

export function autoPaletteDue(p: {
  auto: boolean;
  now: number;
  lastManualAt: number;
  current: string;
  want: string;
}): boolean {
  if (!p.auto) return false;
  const elapsed = p.now - p.lastManualAt;
  if (elapsed < 0) return false; // saat geri alındı: dwell sıfırlanmış say
  if (elapsed < AUTO_PALETTE_DWELL_MS) return false;
  return p.want !== p.current;
}
