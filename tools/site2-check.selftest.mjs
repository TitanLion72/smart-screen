// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
// tools/site2-check.selftest.mjs — denetleyicinin "her şeye geçti" demediğini kanıtlar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectHtml, contrast, relativeLuminance, PAGE_BUDGETS } from "./site2-check.mjs";

const good = `<html lang="tr"><head>
<link rel="alternate" hreflang="tr" href="./"><link rel="alternate" hreflang="en" href="./en/">
<link rel="alternate" hreflang="x-default" href="./"><link rel="canonical" href="https://x.invalid/">
</head><body>
<header class="topbar"></header>
<section class="hero"><div class="stage"><div class="screen"></div></div></section>
<ol class="stop-list"></ol><div class="shot-grid"><figure class="shot"></figure></div>
<div class="bound-cols"></div><ul class="feature-list"></ul><div class="fact-row"></div>
<div class="plan-cols"></div><details class="qa"></details><section class="closing"></section>
<footer class="foot"></footer>
<img alt="bir monitör" src="./assets/x.webp" width="10" height="10">
</body></html>`;

test("temiz taban geçer", () => assert.deepEqual(inspectHtml(good, "tr"), []));

test("mutlak yol yakalanır", () => {
  const bad = good.replace("./assets/x.webp", "/assets/x.webp");
  assert.ok(inspectHtml(bad, "tr").some((m) => m.includes("mutlak yol")));
});

test("alt ve boyutsuz görsel yakalanır", () => {
  assert.ok(inspectHtml(good.replace(' alt="bir monitör"', ""), "tr").some((m) => m.includes("alt")));
  assert.ok(inspectHtml(good.replace(' width="10"', ""), "tr").some((m) => m.includes("boyut")));
});

test("v1 estetik izleri geri sızarsa yakalanır", () => {
  assert.ok(inspectHtml(good.replace('class="topbar"', 'class="topbar eyebrow"'), "tr").some((m) => m.includes("eyebrow")));
  assert.ok(inspectHtml(good.replace('class="foot"', 'class="foot mono"'), "tr").some((m) => m.includes("mono")));
  assert.ok(
    inspectHtml(good.replace("</head>", "<style>b{text-transform:uppercase}</style></head>"), "tr").some((m) => m.includes("ALL-CAPS")),
  );
});

test("yasak desen ve http bağlantısı yakalanır", () => {
  const bad = good.replace("x.invalid", "example.com").replace("https://", "http://");
  const msgs = inspectHtml(bad, "tr");
  assert.ok(msgs.some((m) => m.includes("yasak desen")));
  assert.ok(msgs.some((m) => m.includes("https")));
});

test("eksik hreflang/canonical ve sınıf yakalanır", () => {
  const bad = good.replace(' hreflang="en"', "").replace('rel="canonical"', 'rel="no"').replace('class="plan-cols"', 'class="q"');
  const msgs = inspectHtml(bad, "tr");
  assert.ok(msgs.some((m) => m.includes("hreflang: en")));
  assert.ok(msgs.some((m) => m.includes("canonical")));
  assert.ok(msgs.some((m) => m.includes("sınıf: plan-cols")));
});

test("EN sayfada Türkçe karakter yakalanır (dil etiketi hariç)", () => {
  const bad = `<html lang="en"><body>düğme</body></html>`;
  assert.ok(inspectHtml(bad, "en").some((m) => m.includes("Türkçe karakter")));
  const onlyLabel = `<html lang="en"><body><a class="lang" href="../">Türkçe</a>ok</body></html>`;
  assert.equal(inspectHtml(onlyLabel, "en").some((m) => m.includes("Türkçe karakter")), false);
});

test("kontrast WCAG formülü doğru", () => {
  assert.equal(contrast("#ffffff", "#000000"), 21);
  assert.ok(Math.abs(relativeLuminance("#ffffff") - 1) < 1e-9);
  assert.throws(() => contrast("red", "#000"));
});

test("bütçe sabitleri spec ile aynı", () => {
  assert.deepEqual(PAGE_BUDGETS, {
    initial: 150 * 1024,
    initialGzip: 45 * 1024,
    font: 85 * 1024,
    shot: 130 * 1024,
    js: 13 * 1024,
    css: 24 * 1024,
    dist: 1200 * 1024,
  });
});
