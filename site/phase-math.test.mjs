// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
// site/phase-math.test.mjs — geçiş matematiği; bozuk girdide çökmemeli.
import { test } from "node:test";
import assert from "node:assert/strict";
import { blend, parseHex, toHex, phaseWeights, nearestPhase, mixWeighted } from "./phase-math.mjs";

test("parseHex/toHex gidiş-dönüş", () => {
  assert.deepEqual(parseHex("#0e1014"), { r: 14, g: 16, b: 20 });
  assert.equal(toHex({ r: 14, g: 16, b: 20 }), "#0e1014");
});

test("blend uçlarda tam, ortada ara", () => {
  const a = { r: 0, g: 0, b: 0 };
  const b = { r: 255, g: 255, b: 255 };
  assert.deepEqual(blend(a, b, 0), a);
  assert.deepEqual(blend(a, b, 1), b);
  assert.equal(blend(a, b, 0.5).r, 128);
  assert.deepEqual(blend(a, b, 5), b, "t kelepçelenir");
});

test("ağırlıklar toplam 1, en yakın bölüm baskın", () => {
  const tops = [0, 1000, 2000, 3000];
  const w = phaseWeights(2050, tops, 800);
  assert.ok(Math.abs(w.reduce((s, x) => s + x, 0) - 1) < 1e-9);
  assert.equal(nearestPhase(w), 2);
});

test("ilk bölümden önce: hep ilk faz", () => {
  const w = phaseWeights(-500, [0, 1000, 2000, 3000], 800);
  assert.equal(nearestPhase(w), 0);
});

test("son bölümden sonra: hep son faz", () => {
  const w = phaseWeights(99999, [0, 1000, 2000, 3000], 800);
  assert.equal(nearestPhase(w), 3);
});

test("bozuk girdi çökmemeli, geçerli ağırlık dönmeli", () => {
  for (const y of [Number.NaN, Number.POSITIVE_INFINITY]) {
    const w = phaseWeights(y, [0, 1000, 2000, 3000], 800);
    assert.equal(w.length, 4);
    assert.ok(w.every((x) => Number.isFinite(x) && x >= 0));
    assert.ok(Math.abs(w.reduce((s, x) => s + x, 0) - 1) < 1e-9);
  }
});

test("tek bölüm ve boş liste", () => {
  assert.deepEqual(phaseWeights(500, [0], 800), [1]);
  assert.deepEqual(phaseWeights(500, [], 800), []);
});

test("bölüm ortasında faz SABİT (komşuya kaymaz)", () => {
  // Regresyon: ilk sürüm ortada %50 komşuya kayıyordu, şafak gri çıkıyordu.
  const tops = [0, 2000, 4000, 6000];
  for (const [i, center] of [
    [0, 1000],
    [1, 3000],
    [2, 5000],
  ]) {
    const w = phaseWeights(center - 400, tops, 800);
    assert.equal(w[i], 1, `bölüm ${i} ortasında tek başına olmalı: ${JSON.stringify(w)}`);
    assert.equal(w.reduce((s, x) => s + x, 0), 1);
  }
});

test("sınırda iki faz yarı yarıya", () => {
  const tops = [0, 2000, 4000, 6000];
  // Sınır cy=2000 → scrollY = 2000 - vh/2 = 1600
  const w = phaseWeights(1600, tops, 800);
  assert.ok(Math.abs(w[0] - 0.5) < 1e-9, `w=${JSON.stringify(w)}`);
  assert.ok(Math.abs(w[1] - 0.5) < 1e-9, `w=${JSON.stringify(w)}`);
});

test("mixWeighted: eşit ağırlık ortayı verir, sıfır toplam ilk rengi", () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  const mid = mixWeighted([[black, 1], [white, 1]]);
  assert.equal(Math.round(mid.r), 128);
  assert.deepEqual(mixWeighted([[black, 0], [white, 0]]), black);
});
