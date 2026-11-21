// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
// site/v2/content.test.mjs — iki dilin yapısal olarak ayrışmadığını kanıtlar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT, LANGS, SHOT_FILES } from "./content.mjs";

const keys = (o) => Object.keys(o).sort();

test("iki dil var", () => assert.deepEqual(LANGS, ["tr", "en"]));

test("iki dil aynı üst anahtarları taşır", () => {
  assert.deepEqual(keys(CONTENT.tr), keys(CONTENT.en));
});

test("galeri sekiz kare, sıra sabit", () => {
  for (const lang of LANGS) {
    const items = CONTENT[lang].gallery.items;
    assert.equal(items.length, 8);
    assert.deepEqual(items.map((i) => i.file), SHOT_FILES);
    for (const it of items) {
      assert.ok(it.caption.length > 10, `${lang} ${it.file}: caption kısa`);
      assert.ok(it.alt.length > 20, `${lang} ${it.file}: alt kısa`);
    }
  }
});

test("dört durak, saatler sabit", () => {
  for (const lang of LANGS) {
    const s = CONTENT[lang].stops.items;
    assert.equal(s.length, 4);
    assert.deepEqual(s.map((x) => x.hour), ["06:00", "12:00", "18:00", "23:00"]);
  }
});

test("özellik 7, SSS 7, gerçek 6, dokunmaz 5", () => {
  for (const lang of LANGS) {
    const c = CONTENT[lang];
    assert.equal(c.features.items.length, 7);
    assert.equal(c.faq.items.length, 7);
    assert.equal(c.facts.rows.length, 6);
    assert.equal(c.bounds.untouch.length, 5);
    assert.equal(c.bounds.touch.length, 3);
    assert.equal(c.hero.trust.length, 4);
  }
});

test("boş metin yok, bağlantılar https", () => {
  const walk = (v, path) => {
    if (typeof v === "string") {
      assert.ok(v.trim().length > 0, `boş: ${path}`);
      if (/^https?:/.test(v)) assert.ok(v.startsWith("https://"), `http: ${path}`);
      return;
    }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (v && typeof v === "object") {
      return Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`));
    }
  };
  for (const lang of LANGS) walk(CONTENT[lang], lang);
});

test("EN metin Türkçe karakter taşımaz (tek istisna: dil etiketi)", () => {
  // `nav.langSwitch` bilerek "Türkçe": dil değiştirme etiketi hedef dilin
  // kendi adıyla yazılır. Diğer her yerde Türkçe karakter sızması yasak.
  const copy = structuredClone(CONTENT.en);
  copy.nav.langSwitch = "";
  assert.equal(/[çğıöşüÇĞİÖŞÜ]/.test(JSON.stringify(copy)), false);
  assert.equal(CONTENT.en.nav.langSwitch, "Türkçe");
});

test("fiyat uydurulmaz", () => {
  for (const lang of LANGS) {
    assert.equal(/[$₺€]\s?\d|\d+\s?(USD|EUR|TRY|TL)/i.test(CONTENT[lang].plans.note), false);
  }
});

test("gece tavanı iki dilde de 62", () => {
  assert.ok(JSON.stringify(CONTENT.tr).includes("62"));
  assert.ok(JSON.stringify(CONTENT.en).includes("62"));
});

test("pazarlama sıfatı yok", () => {
  const banned = ["devrim", "mükemmel", "kusursuz", "en iyi", "sezgisel", "revolutionary", "seamless", "best-in-class"];
  for (const lang of LANGS) {
    const flat = JSON.stringify(CONTENT[lang]).toLowerCase();
    for (const w of banned) assert.equal(flat.includes(w), false, `${lang}: "${w}"`);
  }
});
