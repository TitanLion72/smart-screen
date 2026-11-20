// site/curve.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { warmthAt, appliedWarmth, kelvinFromWarmth, curvePoints, nowReading } from "./curve.mjs";

test("şiddet referans tablosu (spec §6.4)", () => {
  const cases = [[360, 56], [720, 0], [1080, 39], [1264, 78], [1380, 88]];
  for (const [minute, expected] of cases) {
    assert.ok(Math.abs(warmthAt(minute) - expected) < 0.05, `${minute} -> ${warmthAt(minute)}`);
  }
});

test("gece tavanı: varsayılan %70 ile 23:00 %62", () => {
  assert.equal(appliedWarmth(1380), 62);
  assert.equal(appliedWarmth(1380, 100), 88);
  assert.equal(appliedWarmth(720, 70), 0);
});

test("kelvin 3000-6500 aralığında ve 100'e yuvarlı", () => {
  assert.equal(kelvinFromWarmth(0), 6500);
  assert.equal(kelvinFromWarmth(62), 4300);
  assert.equal(kelvinFromWarmth(100), 3000);
  assert.equal(kelvinFromWarmth(55), 4600);
});

test("sınır saatler: 00:00 = 05:00 = 88, gece yarısı kesintisiz", () => {
  assert.equal(warmthAt(0), 88);
  assert.equal(warmthAt(300), 88);
  assert.equal(warmthAt(1440), 88);
  assert.ok(Math.abs(warmthAt(1439) - warmthAt(0)) < 0.2);
});

test("bozuk girdi kelepçelenir, NaN üretmez", () => {
  assert.equal(warmthAt(-30), 88);
  assert.equal(warmthAt(5000), 88);
  assert.ok(Number.isFinite(warmthAt(Number.NaN)));
  assert.equal(appliedWarmth(720, -50), 0);
  assert.equal(appliedWarmth(720, 500), 0);
});

test("curvePoints 15 dk adımla 96 nokta, artan dakika", () => {
  const pts = curvePoints(15);
  assert.equal(pts.length, 96);
  assert.equal(pts[0].minute, 15);
  assert.equal(pts.at(-1).minute, 1440);
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].minute > pts[i - 1].minute);
});

test("nowReading tutarlı: applied = round(raw*cap/100)", () => {
  const r = nowReading(1264);
  assert.ok(Math.abs(r.raw - 78) < 0.05);
  assert.equal(r.applied, Math.round((r.raw * 70) / 100));
  assert.equal(r.kelvin, kelvinFromWarmth(r.applied));
});
