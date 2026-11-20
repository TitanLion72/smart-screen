// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
// tools/site-check.selftest.mjs — denetleyicinin "her şeye geçti" demediğini kanıtlar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectHtml, PAGE_BUDGETS } from "./site-check.mjs";

const good = `<html lang="tr"><head><link rel="alternate" hreflang="tr" href="./">
<link rel="alternate" hreflang="en" href="./en/"><link rel="alternate" hreflang="x-default" href="./">
<link rel="canonical" href="https://example.invalid/"></head>
<body class="topbar foot"><h1>x</h1><h2>a</h2>
<div class="chapter"><div class="reading"></div><figure class="shot"></figure></div>
<div class="bounds"></div><ul><li class="feature"></li></ul><div class="plan"></div>
<details class="qa"></details>
<a href="https://example.invalid">d</a><img alt="bir monitör" src="./assets/x.webp" width="10" height="10"></body></html>`;

test("temiz taban geçer", () => {
  assert.deepEqual(inspectHtml(good, "tr"), []);
});

test("mutlak yol yakalanır", () => {
  const bad = good.replace("./assets/x.webp", "/assets/x.webp");
  assert.ok(inspectHtml(bad, "tr").some((m) => m.includes("mutlak yol")));
});

test("alt'sız görsel yakalanır", () => {
  const bad = good.replace(' alt="bir monitör"', "");
  assert.ok(inspectHtml(bad, "tr").some((m) => m.includes("alt")));
});

test("boyutsuz görsel yakalanır (CLS)", () => {
  const bad = good.replace(' width="10"', "");
  assert.ok(inspectHtml(bad, "tr").some((m) => m.includes("boyut")));
});

test("yasak desen ve http bağlantısı yakalanır", () => {
  const bad = good.replace("example.invalid", "example.com").replace("https://", "http://");
  const msgs = inspectHtml(bad, "tr");
  assert.ok(msgs.some((m) => m.includes("yasak desen")));
  assert.ok(msgs.some((m) => m.includes("https")));
});

test("eksik hreflang ve canonical yakalanır", () => {
  const bad = good.replace(' hreflang="en"', "").replace('rel="canonical"', 'rel="nope"');
  const msgs = inspectHtml(bad, "tr");
  assert.ok(msgs.some((m) => m.includes("hreflang: en")));
  assert.ok(msgs.some((m) => m.includes("canonical")));
});

test("eksik sınıf sözleşmesi yakalanır", () => {
  const bad = good.replace('class="bounds"', 'class="basqa"');
  assert.ok(inspectHtml(bad, "tr").some((m) => m.includes("sınıf: bounds")));
});

test("EN sayfada Türkçe karakter yakalanır", () => {
  const bad = good.replace(">d<", ">düğme<");
  assert.ok(inspectHtml(bad, "en").some((m) => m.includes("Türkçe karakter")));
});

test("bütçe sabitleri spec ile aynı", () => {
  assert.deepEqual(PAGE_BUDGETS, {
    initial: 120 * 1024,
    initialGzip: 40 * 1024,
    js: 20 * 1024,
    css: 20 * 1024,
    shot: 120 * 1024,
    dist: 900 * 1024,
  });
});
