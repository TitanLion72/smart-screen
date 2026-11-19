// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/**
 * engine.ts testleri — `npm test` (= `node --test src/engine.test.ts`).
 * Kurallar PLAN-v3 §4.1'deki kabul maddelerinin regresyon karşılığıdır.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AUTO_PALETTE_DWELL_MS,
  EXTERNAL_DELTA,
  LEARN_DELTA_MAX,
  MEASURE_GAP_MS,
  RESPECT_MS,
  THEME_DWELL_MS,
  applyLearnDelta,
  autoPaletteDue,
  batteryPlan,
  extendRespect,
  finalTarget,
  isExternalChange,
  isIndependentTurn,
  isIntentTheme,
  idleDim,
  isMediaApp,
  paletteForHour,
  palettePhaseLabel,
  isNewMeasurement,
  learnAllowed,
  learnDelta,
  medianTone,
  rampSteps,
  readableTarget,
  skipReason,
  themeGate,
  wakeGap,
  warmthToKelvin,
} from "./engine.ts";

const NOW = 1_800_000_000_000;

test("önbellekten dönen aynı kare yeni ölçüm sayılmaz", () => {
  assert.equal(isNewMeasurement(null, NOW), true);
  assert.equal(isNewMeasurement(NOW, NOW), false);
  assert.equal(isNewMeasurement(NOW, NOW + MEASURE_GAP_MS - 1), false);
  assert.equal(isNewMeasurement(NOW, NOW + MEASURE_GAP_MS), true);
  // Zaman geri gelirse (saat düzeltmesi) yeni ölçüm uydurmayız.
  assert.equal(isNewMeasurement(NOW, NOW - 1000), false);
});

test("kilit ve ekran kapanışı yazmayı durdurur", () => {
  assert.equal(skipReason({ locked: true, current: 50, desired: 60 }), "kilitli");
  const off = skipReason({ locked: false, current: 0, desired: 45 });
  assert.ok(off && off.includes("ekran kapalı"), "0 okuma ekran kapalı sayılmalı");
  // Gece penceresinde hedef de 0 ise yazılabilir.
  assert.equal(skipReason({ locked: false, current: 0, desired: 0 }), null);
  assert.equal(skipReason({ locked: false, current: 40, desired: 45 }), null);
});

test("dış müdahale yalnız yazımdan hemen sonraki büyük sapmada algılanır", () => {
  const written = { value: 50, at: NOW };
  assert.equal(isExternalChange(null, written, NOW + 1000), false);
  assert.equal(isExternalChange(50, null, NOW + 1000), false);
  // WMI'nin ±1 oynaması müdahale değildir.
  assert.equal(isExternalChange(50 + EXTERNAL_DELTA, written, NOW + 1000), false);
  assert.equal(isExternalChange(50 + EXTERNAL_DELTA + 1, written, NOW + 1000), true);
  // 90 sn sonra bizim adımımız normal sayılır; ani saygı penceresi açılmaz.
  assert.equal(isExternalChange(20, written, NOW + 91_000), false);
});

test("saygı penceresi kısalmaz, yalnız uzar", () => {
  assert.equal(extendRespect(0, NOW), NOW + RESPECT_MS);
  const late = NOW + RESPECT_MS * 2;
  assert.equal(extendRespect(late, NOW), late);
});

test("öğrenme mutlak değil delta olarak saklanır ve ±20 ile sınırlanır", () => {
  assert.equal(learnDelta(60, 40), 20);
  assert.equal(learnDelta(20, 40), -20);
  assert.equal(learnDelta(45, 40), 5);
  // Aşırı uçlar kelepçelenir, hedef yine tabana göre okunur.
  assert.equal(learnDelta(100, 10), LEARN_DELTA_MAX);
  assert.equal(learnDelta(0, 90), -LEARN_DELTA_MAX);
  assert.equal(learnDelta(null, 40), null);
});

test("öğrenilmiş delta tabana eklenir, eski ±10 kelepçesi yok", () => {
  assert.equal(applyLearnDelta(40, 18), 58);
  assert.equal(applyLearnDelta(40, -18), 22);
  assert.equal(applyLearnDelta(40, null), 40);
  // Bozuk girdi tabanı bozmaz.
  assert.equal(applyLearnDelta(40, Number.NaN), 40);
});

test("öğrenme en az 3 gözlem ve 3 farklı gün ister", () => {
  assert.equal(learnAllowed(2, 9), false);
  assert.equal(learnAllowed(5, 2), false);
  assert.equal(learnAllowed(3, 3), true);
});

test("okunaksız kombinasyon kapısı", () => {
  assert.equal(readableTarget(40, "light"), 60);
  assert.equal(readableTarget(56, "light"), 56);
  assert.equal(readableTarget(85, "dark"), 80);
  assert.equal(readableTarget(70, "dark"), 70);
});

test("nihai hedef: delta + ofset, alt sınır, 95 tavanı", () => {
  assert.equal(finalTarget({ base: 40, learnDelta: 8, offset: 5, mode: "dark" }), 53);
  assert.equal(finalTarget({ base: 10, offset: 0, floor: 25, mode: "dark" }), 25);
  assert.equal(finalTarget({ base: 99, offset: 10, mode: "light" }), 95);
  // 95 tavanından sonra koyu tema kapısı 80'e indirir.
  assert.equal(finalTarget({ base: 99, mode: "dark" }), 80);
});

test("açık tema hedefi 60'ın altına inmez, gece tavanı bunu aşar", () => {
  assert.equal(finalTarget({ base: 30, mode: "light" }), 60);
  // Uyku tavanı açık niyettir: okunaksız kapı devreye girmez.
  assert.equal(finalTarget({ base: 30, mode: "light", cap: 15 }), 15);
  // Okuma kipi de öyle.
  assert.equal(finalTarget({ base: 70, mode: "light", cap: 45 }), 45);
});

test("tema değişimi dwell + bağımsız tur ister", () => {
  assert.deepEqual(themeGate({ now: NOW, lastAt: NOW - 5 * 60_000, turns: 9 }).reason, "dwell");
  assert.deepEqual(themeGate({ now: NOW, lastAt: null, turns: 2 }).reason, "turns");
  assert.deepEqual(themeGate({ now: NOW, lastAt: NOW - THEME_DWELL_MS, turns: 3 }).ok, true);
  // Pil modunda istenen tur sayısı düşürülebilir.
  assert.equal(themeGate({ now: NOW, lastAt: null, turns: 2, required: 2 }).ok, true);
});

test("ton medyanı tek gürültülü kareyi yutar", () => {
  assert.equal(medianTone([]), "neutral");
  assert.equal(medianTone(["warm"]), "warm");
  assert.equal(medianTone(["warm", "cool"]), "cool");
  // Üç örnek: bir aykırı değer medyanı çevirmez.
  assert.equal(medianTone(["warm", "warm", "cool"]), "warm");
  assert.equal(medianTone(["cool", "neutral", "cool"]), "cool");
  // Tanınmayan adlar yok sayılır.
  assert.equal(medianTone(["flas", "warm", "warm"]), "warm");
});

test("kamera yokken her tur bağımsız sayılır (kapı asılı kalmaz)", () => {
  // v2.11.1 regresyonu: kamera okunamayınca sayaç 1/3'te kilitleniyordu ve
  // otomatik tema hiç değişmiyordu (canlı log'da 9 dk boyunca aynı not).
  assert.equal(isIndependentTurn({ camAt: null, lastCountedAt: null }), true);
  assert.equal(isIndependentTurn({ camAt: null, lastCountedAt: NOW }), true);
  // Kamera varsa önbellek kuralı geçerli: aynı kare tur saymaz.
  assert.equal(isIndependentTurn({ camAt: NOW, lastCountedAt: NOW }), false);
  assert.equal(isIndependentTurn({ camAt: NOW, lastCountedAt: NOW - MEASURE_GAP_MS }), true);
  assert.equal(isIndependentTurn({ camAt: NOW, lastCountedAt: null }), true);
});

test("ısınma şiddeti monitör Kelvin'ine doğrusal eşlenir", () => {
  assert.equal(warmthToKelvin(0), 6500);
  assert.equal(warmthToKelvin(100), 3000);
  assert.equal(warmthToKelvin(50), 4800);
  // Sınır dışı girdiler kelepçelenir; NaN nötre düşer.
  assert.equal(warmthToKelvin(-20), 6500);
  assert.equal(warmthToKelvin(180), 3000);
  assert.equal(warmthToKelvin(Number.NaN), 6500);
  // Her adım 100 K: monitörler 100 K adım bildiriyor.
  for (let w = 0; w <= 100; w++) assert.equal(warmthToKelvin(w) % 100, 0);
});

test("günün rengi: kapalı, dwell ve aynı palet korunur", () => {
  const base = { now: NOW, lastManualAt: NOW - AUTO_PALETTE_DWELL_MS, current: "kagit", want: "gece" };
  // Anahtar kapalı → hiç dokunulmaz (kullanıcı seçimi kutsal).
  assert.equal(autoPaletteDue({ ...base, auto: false }), false);
  // Elle seçimden 1 ms önce: dwell sürüyor.
  assert.equal(
    autoPaletteDue({ ...base, auto: true, lastManualAt: NOW - AUTO_PALETTE_DWELL_MS + 1 }),
    false,
  );
  // Tam sınırda uygulanır.
  assert.equal(autoPaletteDue({ ...base, auto: true }), true);
  // Palet zaten istenen renkse DOM'a boşuna yazılmaz.
  assert.equal(autoPaletteDue({ ...base, auto: true, want: "kagit" }), false);
  // Saat geri alındı (negatif fark): palet zıplamasın.
  assert.equal(autoPaletteDue({ ...base, auto: true, lastManualAt: NOW + 60_000 }), false);
  // Hiç elle seçim yapılmadıysa (0) hemen uygulanır.
  assert.equal(autoPaletteDue({ ...base, auto: true, lastManualAt: 0 }), true);
});

test("isIntentTheme: bağlı profil tema değişimini dwell'e takmaz", () => {
  // Otomatik tur: niyet yok, 10 dk + 3 tur kuralı işler.
  assert.equal(isIntentTheme({ reason: "tick", bound: false }), false);
  // "Şimdi uygula" ve açılış: niyet var.
  assert.equal(isIntentTheme({ reason: "manuel", bound: false }), true);
  assert.equal(isIntentTheme({ reason: "açılış", bound: false }), true);
  // Bağlı profil: uygulama ön plana geldiği turda devralır (AGENTS kuralı).
  // Bu olmadan bekleyen anahtar her alt-tab'da sıfırlanıp tema hiç uygulanmıyordu.
  assert.equal(isIntentTheme({ reason: "tick", bound: true }), true);
});

test("paletteForHour: her saat bir palet döner, gece açık palet yok", () => {
  const LIGHT = new Set(["fildisi", "kagit"]);
  for (let h = 0; h < 24; h += 1) {
    const p = paletteForHour(h);
    assert.equal(typeof p, "string");
    assert.ok(p.length > 0, `saat ${h} paletsiz`);
    // 20:00–07:00 arasında AÇIK palet seçilmemeli (gece göz yormasın).
    const night = h >= 20 || h < 7;
    if (night) assert.ok(!LIGHT.has(p), `saat ${h} gece açık palet seçti: ${p}`);
  }
  // Gündüz açık, akşam sıcak — sözleşme.
  assert.equal(paletteForHour(9), "fildisi");
  assert.equal(paletteForHour(13), "kagit");
  assert.equal(paletteForHour(18), "gunbatimi");
  assert.equal(paletteForHour(21), "obsidyen");
  assert.equal(paletteForHour(2), "gece");
});

test("palettePhaseLabel paletle çelişmez (aynı aralıklar)", () => {
  const expected: Record<string, string> = {
    fildisi: "sabah",
    kagit: "gündüz",
    gunbatimi: "akşam",
    obsidyen: "gece başı",
    gece: "gece",
  };
  for (let h = 0; h < 24; h += 1) {
    const p = paletteForHour(h);
    assert.equal(
      palettePhaseLabel(h),
      expected[p],
      `saat ${h}: palet ${p} ama etiket ${palettePhaseLabel(h)}`,
    );
  }
  // Sınırlar: 07:00 sabaha, 20:00 gece başına geçer.
  assert.equal(palettePhaseLabel(6), "gece");
  assert.equal(palettePhaseLabel(7), "sabah");
  assert.equal(palettePhaseLabel(19), "akşam");
  assert.equal(palettePhaseLabel(20), "gece başı");
  // Bozuk girdi çevrimsel kelepçelenir (23 → 23, 25 → 1, -1 → 23).
  assert.equal(palettePhaseLabel(-1), "gece");
  assert.equal(paletteForHour(25), paletteForHour(1));
});

// ---------- v3.5: akilli otomasyon ----------

test("idleDim kademeli esikler ve taban 20", () => {
  assert.equal(idleDim(80, 0), 80);
  assert.equal(idleDim(80, 599), 80);
  assert.equal(idleDim(80, 600), 65, "10 dk sonra -15");
  assert.equal(idleDim(80, 1799), 65);
  assert.equal(idleDim(80, 1800), 55, "30 dk sonra -25");
  assert.equal(idleDim(80, 99999), 55);
  // Taban: 20'nin altina inmez (okunabilirlik).
  assert.equal(idleDim(25, 3600), 20);
  assert.equal(idleDim(10, 3600), 20);
  // Bozuk girdi: base aynen doner (ekrani karartma riski yok).
  assert.equal(idleDim(80, Number.NaN), 80);
});

test("batteryPlan esikleri", () => {
  assert.deepEqual(batteryPlan(80, false), { camEverySec: 300, stepLimit: 8 });
  assert.deepEqual(batteryPlan(30, false), { camEverySec: 300, stepLimit: 8 });
  assert.deepEqual(batteryPlan(29, false), { camEverySec: 600, stepLimit: 6 });
  assert.deepEqual(batteryPlan(20, false), { camEverySec: 600, stepLimit: 6 });
  assert.deepEqual(batteryPlan(19, false), { camEverySec: 1200, stepLimit: 4 });
  assert.deepEqual(batteryPlan(10, false), { camEverySec: 1200, stepLimit: 4 });
  assert.deepEqual(batteryPlan(9, false), { camEverySec: 1800, stepLimit: 3 });
  // Sarjdayken pil tasarrufu yok:
  assert.deepEqual(batteryPlan(5, true), { camEverySec: 300, stepLimit: 8 });
});

test("isMediaApp oynaticilari taniyor", () => {
  assert.equal(isMediaApp("vlc.exe"), true);
  assert.equal(isMediaApp("VLX".replace("X", "C") + ".EXE"), true, "buyuk harf kabul");
  assert.equal(isMediaApp("C:\\Program Files\\VideoLAN\\VLC\\vlc.exe"), true, "tam yol");
  assert.equal(isMediaApp("mpv.net"), false, "uzanti farkli - .exe aranir");
  assert.equal(isMediaApp("mpv.exe"), true);
  assert.equal(isMediaApp("chrome.exe"), false);
  assert.equal(isMediaApp(""), false);
  assert.equal(isMediaApp("   "), false);
});

// ---------- v3.6: uyanma tespiti ----------

test("wakeGap normal turda tetiklemez", () => {
  assert.equal(wakeGap(1000, 1000 + 60_000, 60_000), false, "tek tur normal");
  // Yavaş tur (kamera + DDC) uyku sayılmamalı: pay 60 sn.
  assert.equal(
    wakeGap(1000, 1000 + 119_000, 60_000),
    false,
    "119 sn hâlâ normal",
  );
});

test("wakeGap uzun boşlukta tetikler", () => {
  assert.equal(wakeGap(1000, 1000 + 121_000, 60_000), true, "121 sn = uyku");
  // Sekiz saatlik gece uykusu (başlangıç 0 değil: 0 = "açılış" işareti).
  assert.equal(wakeGap(1000, 8 * 3600 * 1000, 60_000), true);
});

test("wakeGap saat geri giderse susar", () => {
  assert.equal(wakeGap(10_000, 5_000, 60_000), false, "NTP/manuel saat geri alma");
  assert.equal(wakeGap(10_000, 10_000, 60_000), false, "eşit zaman");
});

test("wakeGap açılışta (lastAct=0) susar", () => {
  // İlk turda `lastAct` 0: uyku değil. Yoksa her açılışta gereksiz kurtarma.
  assert.equal(wakeGap(0, Date.now(), 60_000), false);
  assert.equal(wakeGap(-1, 999_999, 60_000), false);
});

test("wakeGap bozuk girdide false", () => {
  assert.equal(wakeGap(Number.NaN, 999_999, 60_000), false);
  assert.equal(wakeGap(0, Number.NaN, 60_000), false);
  assert.equal(wakeGap(0, 999_999, Number.NaN), false);
});

// ---------- v3.6.1: boşta dönüş rampası ----------

test("rampSteps hedefe ulaşır ve monoton ilerler", () => {
  const up = rampSteps(58, 83);
  assert.equal(up.length, 5, "en fazla 5 adım");
  assert.equal(up.at(-1), 83, "son adım hedefin kendisi");
  assert.ok(up[0] > 58, "ilk adım yukarı");
  for (let i = 1; i < up.length; i++) assert.ok(up[i] > up[i - 1], "monoton artan");

  const down = rampSteps(80, 60);
  assert.equal(down.at(-1), 60);
  for (let i = 1; i < down.length; i++) assert.ok(down[i] < down[i - 1], "monoton azalan");
});

test("rampSteps küçük farkta tek adım", () => {
  // 2 puanlık fark için 5 ara değer üretmek anlamsız gürültü olurdu.
  assert.deepEqual(rampSteps(58, 60), [60]);
  assert.deepEqual(rampSteps(58, 59), [59]);
  assert.deepEqual(rampSteps(58, 58), [], "fark yoksa yazma yok");
});

test("rampSteps üst sınırı aşmaz ve 0-100 aralığında kalır", () => {
  const wide = rampSteps(0, 100);
  assert.equal(wide.length, 5);
  assert.equal(wide.at(-1), 100);
  assert.ok(wide.every((v) => v >= 0 && v <= 100));
  assert.deepEqual(rampSteps(10, 90, 1), [90], "maxSteps=1 tek adım");
});

test("rampSteps bozuk girdide boş dizi", () => {
  assert.deepEqual(rampSteps(Number.NaN, 60), []);
  assert.deepEqual(rampSteps(50, Number.POSITIVE_INFINITY), []);
});
