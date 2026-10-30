// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/**
 * store.ts saf kalan parçaları: tohum profilleri ve "geri getir" davranışı.
 *
 * `localStorage` yok — bu fonksiyonlar ona dokunmuyor, node'da doğrudan koşar.
 * Kritik iddia: geri getirme **var olan profili ezmez**, yalnız eksik olanı
 * ekler ve boş uygulama listesini doldurur.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { MAX_PROFILES, restoreSeedProfiles, seedProfiles, type Profile } from "./store.ts";

const make = (patch: Partial<Profile> = {}): Profile => ({
  id: "p1",
  name: "Özel",
  mode: "auto",
  source: "auto",
  theme: "ss-dusk",
  themeMode: "dark",
  offset: 0,
  autoLock: false,
  apps: [],
  ...patch,
});

test("tohum temaları kendi ailemizden (ss-*) ve bağlı uygulamalar dolu", () => {
  const seeds = seedProfiles();
  assert.equal(seeds.length, 2);
  for (const s of seeds) {
    assert.match(s.theme, /^ss-/, `tohum teması ss-* olmalı: ${s.theme}`);
  }
  const work = seeds.find((s) => s.name === "İş");
  assert.ok(work && work.apps.length >= 3, "İş profili bağlı uygulama taşımalı");
  assert.ok(work!.apps.includes("code.exe"), "code.exe bağlı olmalı");
});

test("boş listeye iki tohum profil eklenir", () => {
  const { profiles, added, appsRestored } = restoreSeedProfiles([]);
  assert.equal(added, 2);
  assert.equal(appsRestored, 0);
  assert.equal(profiles.length, 2);
});

test("var olan profil ezilmez, yalnız boş uygulama listesi doldurulur", () => {
  const custom = make({ name: "İş", theme: "zenburn", offset: 7, mode: "fixed" });
  const { profiles, added, appsRestored } = restoreSeedProfiles([custom]);
  assert.equal(added, 1, "yalnız Film eklenmeli");
  assert.equal(appsRestored, 1, "İş'in uygulama listesi geri gelmeli");
  const work = profiles.find((p) => p.name === "İş")!;
  assert.equal(work.theme, "zenburn", "kullanıcı teması korunmalı");
  assert.equal(work.offset, 7, "kullanıcı kaydırması korunmalı");
  assert.equal(work.mode, "fixed", "kullanıcı modu korunmalı");
  assert.ok(work.apps.includes("code.exe"));
  assert.equal(profiles.length, 2);
});

test("dolu uygulama listesine dokunulmaz", () => {
  const own = make({ name: "İş", apps: ["kendi.exe"] });
  const { profiles, appsRestored } = restoreSeedProfiles([own]);
  assert.equal(appsRestored, 0, "dolu liste değiştirilmemeli");
  assert.deepEqual(profiles.find((p) => p.name === "İş")!.apps, ["kendi.exe"]);
});

test("profil sınırı aşılmaz", () => {
  const full = Array.from({ length: MAX_PROFILES }, (_, i) => make({ id: `p${i}`, name: `P${i}` }));
  const { profiles, added, appsRestored } = restoreSeedProfiles(full);
  assert.equal(added, 0, "sınır doluyken ekleme yok");
  assert.equal(appsRestored, 0);
  assert.equal(profiles.length, MAX_PROFILES);
});

test("aynı girdi iki kez geri getirilirse ikinci kez değişiklik yok (idempotent)", () => {
  const first = restoreSeedProfiles([]);
  const second = restoreSeedProfiles(first.profiles);
  assert.equal(second.added, 0);
  assert.equal(second.appsRestored, 0);
  assert.deepEqual(
    second.profiles.map((p) => p.name),
    first.profiles.map((p) => p.name),
  );
});

test("girdi dizisi mutasyona uğramaz", () => {
  const input = [make({ name: "İş" })];
  const snapshot = JSON.stringify(input);
  restoreSeedProfiles(input);
  assert.equal(JSON.stringify(input), snapshot, "çağıranın dizisi değişmemeli");
});
