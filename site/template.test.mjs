// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
// site/template.test.mjs — iskelet sözleşmesi: dil, yollar, fazlar, hreflang.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPage } from "./template.mjs";

const tr = renderPage("tr", { version: "9.9.9", phases: '[data-phase="dawn"]{--bg:#000}' });

test("tr: dil, göreli css, canonical, hreflang üçlüsü", () => {
  assert.match(tr, /<html lang="tr">/);
  assert.match(tr, /href="\.\/assets\/site\.css"/);
  assert.match(tr, /rel="canonical" href="https:\/\/titanlion72\.github\.io\/smart-screen\/"/);
  for (const l of ["tr", "en", "x-default"]) {
    assert.match(tr, new RegExp(`hreflang="${l}"`));
  }
});

test("dört faz bölümü ve faz css enjekte edilir", () => {
  for (const p of ["dawn", "noon", "dusk", "night"]) {
    assert.match(tr, new RegExp(`data-phase="${p}"`));
  }
  assert.match(tr, /\[data-phase="dawn"\]\{--bg:#000\}/);
});

test("sürüm düğmede görünür", () => assert.match(tr, /9\.9\.9/));

test("mutlak varlık yolu yok", () => {
  assert.doesNotMatch(tr, /(src|href)="\/(?!\/)/);
});

test("en: üst dizine göreli yollar", () => {
  const en = renderPage("en", { version: "9.9.9", phases: "" });
  assert.match(en, /<html lang="en">/);
  assert.match(en, /href="\.\.\/assets\/site\.css"/);
  assert.match(en, /rel="canonical" href="https:\/\/titanlion72\.github\.io\/smart-screen\/en\/"/);
});

test("semantik iskelet: header/main/footer, her bölümde h2", () => {
  assert.match(tr, /<header[\s>]/);
  assert.match(tr, /<main[\s>]/);
  assert.match(tr, /<footer[\s>]/);
  assert.equal((tr.match(/<h2[\s>]/g) || []).length >= 7, true);
});

test("CSS ve denetleyici sözleşmesi: sınıf adları var", () => {
  for (const cls of ["shot", "feature", "plan", "bounds", "chapter", "reading"]) {
    assert.match(tr, new RegExp(`class="[^"]*\\b${cls}\\b`), `eksik sınıf: ${cls}`);
  }
});

test("SSS ve indirme hedefleri sayısı iki dilde eşit", () => {
  const en = renderPage("en", { version: "9.9.9", phases: "" });
  const count = (html, re) => (html.match(re) || []).length;
  assert.equal(count(tr, /<details class="qa">/g), count(en, /<details class="qa">/g));
  assert.equal(count(tr, /<section class="chapter"/g), count(en, /<section class="chapter"/g));
  assert.equal(count(tr, /<li class="feature">/g), 7);
  assert.equal(count(en, /<li class="feature">/g), 7);
});

test("görsellerde alt ve boyut var (CLS)", () => {
  const imgs = tr.match(/<img [^>]*>/g) || [];
  assert.ok(imgs.length >= 4);
  for (const img of imgs) {
    assert.match(img, /alt="[^"]+"/);
    assert.match(img, /width="\d+"/);
    assert.match(img, /height="\d+"/);
  }
});
