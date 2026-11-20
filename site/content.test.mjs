// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
// site/content.test.mjs — iki dilin yapısal olarak ayrışmadığını kanıtlar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT, LANGS } from "./content.mjs";

const keys = (o) => Object.keys(o).sort();

test("iki dil var", () => assert.deepEqual(LANGS, ["tr", "en"]));

test("iki dil aynı üst anahtarları taşır", () => {
  assert.deepEqual(keys(CONTENT.tr), keys(CONTENT.en));
});

test("bölümler dört, aynı id/sıra/shot", () => {
  for (const lang of LANGS) {
    const c = CONTENT[lang].chapters;
    assert.equal(c.length, 4);
    assert.deepEqual(c.map((x) => x.id), ["morning", "noon", "evening", "night"]);
    assert.deepEqual(c.map((x) => x.hour), ["06:00", "12:00", "18:00", "23:00"]);
    assert.deepEqual(
      c.map((x) => x.shot.file),
      ["morning.webp", "noon.webp", "evening.webp", "night.webp"],
    );
    assert.equal(c[0].shot.alt.length > 10, true, `${lang} alt metni eksik`);
  }
});

test("özellik 7, SSS 7, gerçek 6, sınır dokunmaz 5", () => {
  for (const lang of LANGS) {
    const c = CONTENT[lang];
    assert.equal(c.features.items.length, 7);
    assert.equal(c.faq.items.length, 7);
    assert.equal(c.facts.rows.length, 6);
    assert.equal(c.boundaries.untouch.length, 5);
    assert.equal(c.hero.facts.length, 4);
  }
});

test("boş metin yok, bağlantılar https ya da #", () => {
  const walk = (v, path) => {
    if (typeof v === "string") {
      assert.ok(v.trim().length > 0, `boş: ${path}`);
      if (/^https?:/.test(v)) assert.ok(v.startsWith("https://"), `http: ${path}`);
      return;
    }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (v && typeof v === "object")
      return Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`));
  };
  for (const lang of LANGS) walk(CONTENT[lang], lang);
});

test("EN metin Türkçe karakter taşımaz (çeviri kopyası değil)", () => {
  const flat = JSON.stringify(CONTENT.en);
  assert.equal(/[çğıöşüÇĞİÖŞÜ]/.test(flat), false);
});

test("fiyat uydurulmaz: plans.note ücret/fiyat rakamı içermez", () => {
  for (const lang of LANGS) {
    assert.equal(
      /[$₺€]\s?\d|\d+\s?(USD|EUR|TRY|TL)/i.test(CONTENT[lang].plans.note),
      false,
      `${lang} plans.note fiyat içeriyor`,
    );
  }
});

test("gece tavanı her iki dilde %62 / 62% olarak geçer", () => {
  assert.ok(JSON.stringify(CONTENT.tr).includes("62"));
  assert.ok(JSON.stringify(CONTENT.en).includes("62"));
});
