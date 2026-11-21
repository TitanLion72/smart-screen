// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
// site/v2/curve.test.mjs — eğri matematiği decide.rs ile birebir mi?
import { test } from "node:test";
import assert from "node:assert/strict";
import { warmthAt, appliedWarmth, kelvinFromWarmth, nowReading, curvePath } from "./curve.mjs";

test("şiddet referans tablosu (spec §3)", () => {
  const cases = [[360, 56], [720, 0], [1080, 27 / 0.7], [1264, 78], [1380, 88]];
  for (const [minute, expected] of cases) {
    assert.ok(Math.abs(warmthAt(minute) - expected) < 0.6, `${minute} -> ${warmthAt(minute)}`);
  }
});

test("gece tavanı: %70 ile 23:00 %62", () => {
  assert.equal(appliedWarmth(1380), 62);
  assert.equal(appliedWarmth(1380, 100), 88);
  assert.equal(appliedWarmth(720, 70), 0);
});

test("kelvin 6500 → 3000, 100'e yuvarlı", () => {
  assert.equal(kelvinFromWarmth(0), 6500);
  assert.equal(kelvinFromWarmth(62), 4300);
  assert.equal(kelvinFromWarmth(100), 3000);
});

test("sınır saatler ve bozuk girdi", () => {
  assert.equal(warmthAt(0), 88);
  assert.equal(warmthAt(1440), 88);
  assert.ok(Number.isFinite(warmthAt(Number.NaN)));
  assert.equal(warmthAt(-50), 88);
  assert.equal(warmthAt(9999), 88);
});

test("nowReading tutarlı", () => {
  const r = nowReading(1264);
  assert.equal(r.applied, Math.round((r.raw * 70) / 100));
  assert.equal(r.kelvin, kelvinFromWarmth(r.applied));
});

test("curvePath geçerli SVG yolu ve NaN içermez", () => {
  const d = curvePath(1200, 160);
  assert.ok(d.startsWith("M "));
  assert.equal(d.includes("NaN"), false);
  assert.ok((d.match(/C /g) || []).length >= 90);
});
