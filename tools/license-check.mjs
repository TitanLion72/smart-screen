#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — lisans doğrulayıcı (tools/license-check.mjs)

   Destek aracı: kullanıcıdan gelen anahtarın GERÇEKTEN bizim imzamızı taşıyıp
   taşımadığını söyler. Uygulamaya girmeden, satıcının makinesinde çalışır.

   Kullanım:
     node tools/license-check.mjs SS-XXXXX-XXXXX-…
     node tools/license-check.mjs --csv keys.csv
     node tools/license-check.mjs --pubkey <pem> SS-…

   Çıktı: GEÇERLİ/GEÇERSİZ + e-posta + tarih. Geçersizse neden (imza, biçim,
   sürüm). Çıkış kodu: 0 hepsi geçerli, 1 en az bir geçersiz, 2 kullanım hatası.

   Not: Bu araç ÖZEL anahtar kullanmaz; yalnız gömülü AÇIK anahtarla doğrular.
   Yani satıcının gizli anahtarı olmadan da çalışır (destek/QA için idealdir).
   ═══════════════════════════════════════════════════════════════════ */

import { createPublicKey, verify } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Uygulamaya gömülü AÇIK anahtar — `src-tauri/src/license.rs` içindeki
 * `PROD_PUBLIC_KEY` ile BİREBİR aynı (hex ile kilitli test var).
 * `--pubkey <pem>` verilirse o kullanılır.
 */
const PROD_PUBKEY_HEX =
  "c2b3483b3f4e1e71af18dffeedb491c6b28530e2e3880c79050a1632f52c5033";

const argv = process.argv.slice(2);
const keys = [];
let csvPath = null;
let pubkeyPath = null;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--csv") {
    csvPath = argv[++i];
    if (!csvPath) fail("--csv bir dosya bekliyor");
  } else if (a === "--pubkey") {
    pubkeyPath = argv[++i];
    if (!pubkeyPath) fail("--pubkey bir dosya bekliyor");
  } else if (a === "--help" || a === "-h") {
    console.log(
      "kullanım: node tools/license-check.mjs <anahtar>… | --csv <dosya> [--pubkey <pem>]",
    );
    process.exit(0);
  } else if (a.startsWith("--")) {
    fail(`bilinmeyen bayrak: ${a}`);
  } else {
    keys.push(a);
  }
}

function fail(msg) {
  console.error("HATA: " + msg);
  process.exit(2);
}

if (csvPath) {
  if (!existsSync(resolve(csvPath))) fail("dosya yok: " + csvPath);
  const text = readFileSync(resolve(csvPath), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.toLowerCase().startsWith("email")) continue;
    // email,date,key → son alan anahtar
    const cells = t.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const key = cells[cells.length - 1];
    if (key && key.startsWith("SS-")) keys.push(key);
  }
}

if (keys.length === 0) fail("doğrulanacak anahtar yok");

const pubPem = pubkeyPath
  ? readFileSync(resolve(pubkeyPath), "utf8")
  : // Ed25519 SPKI başlığı (RFC 8410): 302a300506032b6570032100 + 32 bayt.
    "-----BEGIN PUBLIC KEY-----\n" +
    Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(PROD_PUBKEY_HEX, "hex"),
    ])
      .toString("base64")
      .replace(/(.{64})/g, "$1\n") +
    "\n-----END PUBLIC KEY-----\n";
let publicKey;
try {
  publicKey = createPublicKey(pubPem);
} catch (e) {
  fail("açık anahtar okunamadı: " + String(e));
}

/** CrockfordBase32 → bayt. Tireler ve boşluklar yok sayılır; I/L→1, O→0. */
function decode(text) {
  let cleaned = text
    .replace(/^SS-/i, "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/I|L/g, "1")
    .replace(/O/g, "0");
  const out = [];
  let bits = 0;
  let value = 0;
  for (const ch of cleaned) {
    const idx = CROCKFORD.indexOf(ch);
    if (idx < 0) throw new Error(`geçersiz karakter: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function check(one) {
  const key = one.trim();
  if (!/^SS-/i.test(key)) return { ok: false, reason: "anahtar SS- ile başlamıyor" };
  let blob;
  try {
    blob = decode(key);
  } catch (e) {
    return { ok: false, reason: String(e.message ?? e) };
  }
  if (blob.length < 2) return { ok: false, reason: "anahtar çok kısa" };
  const len = blob.readUInt16BE(0);
  if (len < 5 || 2 + len + 64 !== blob.length) {
    return { ok: false, reason: `uzunluk tutmuyor (payload ${len}, toplam ${blob.length})` };
  }
  const payload = blob.subarray(2, 2 + len);
  const sig = blob.subarray(2 + len);
  let ok = false;
  try {
    ok = verify(null, payload, publicKey, sig);
  } catch {
    ok = false;
  }
  if (!ok) return { ok: false, reason: "imza doğrulanamadı (başka anahtarla üretilmiş ya da bozulmuş)" };

  const text = payload.toString("utf8");
  const parts = text.split("|");
  if (parts[0] !== "v1") return { ok: false, reason: `bilinmeyen sürüm: ${parts[0]}` };
  return { ok: true, email: parts[1] ?? "?", date: parts[2] ?? "?" };
}

let bad = 0;
for (const k of keys) {
  const r = check(k);
  if (r.ok) {
    console.log(`GEÇERLİ    ${r.email} · ${r.date} · ${k.slice(0, 16)}…`);
  } else {
    bad++;
    console.log(`GEÇERSİZ   ${k.slice(0, 24)}… — ${r.reason}`);
  }
}

console.log(`SONUÇ: ${keys.length - bad}/${keys.length} geçerli`);
process.exit(bad === 0 ? 0 : 1);
