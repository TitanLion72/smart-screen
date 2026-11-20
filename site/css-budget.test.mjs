// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
// site/css-budget.test.mjs — stil dosyası bütçesi ve yasak görsel dil.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const url = new URL("./assets/site.css", import.meta.url);
const css = readFileSync(url, "utf8");

test("CSS <= 20 KB", () => {
  assert.ok(statSync(url).size <= 20 * 1024, `${(statSync(url).size / 1024).toFixed(1)} KB`);
});

test("yasak görsel dil yok", () => {
  for (const bad of ["backdrop-filter", "radial-gradient", "@font-face", "#7c8cff", "#6366f1"]) {
    assert.equal(css.includes(bad), false, `yasak: ${bad}`);
  }
});

test("reduced-motion bloğu var", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("hex renk yok (faz değişkenleri tek kaynak)", () => {
  const hex = css.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(hex, [], `gömülü hex: ${hex.join(", ")}`);
});

test("uzun sözcük kırılır", () => assert.match(css, /overflow-wrap:\s*anywhere/));

test("aşırı yuvarlak köşe yok", () => {
  const radii = [...css.matchAll(/border-radius:\s*([\d.]+)(px|rem)/g)].map((m) => m[1]);
  for (const r of radii) assert.ok(Number(r) <= 6, `çok yuvarlak: ${r}`);
});
