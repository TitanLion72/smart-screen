#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — toplu lisans anahtarı üreteci (tools/license-batch.mjs)

   Satış sonrası akış için: sipariş listesini (e-posta başına bir satır ya da
   `email,tarih` CSV) alır, her satır için bir anahtar üretir ve sonucu CSV'ye
   yazar. Tek tek `license-gen.mjs` çağırmaya göre farkı: aynı anda çok sipariş,
   tekrar üretim koruması (aynı e-posta+tarih aynı anahtarı verir — Ed25519
   deterministik değil, o yüzden çıktı dosyası ezilmez) ve doğrulama.

   Kullanım:
     node tools/license-batch.mjs --orders orders.csv --out keys.csv
     node tools/license-batch.mjs --orders siparisler.txt --out keys.csv --date 2026-11-01
     node tools/license-batch.mjs --orders orders.csv --out keys.csv --dry-run

   Girdi biçimi (esnek): her satırda bir e-posta; satırda virgül varsa ilk alan
   e-posta, ikinci alan tarih (YYYY-MM-DD) sayılır. `#` ile başlayan satırlar
   ve boş satırlar atlanır.

   Çıktı: `email,date,key` — virgül içeren alan tırnaklanır (RFC 4180).

   Güvenlik: özel anahtar repoda değil (`~/.config/opencode/…-private.pem`);
   `--key` ile başka yol verilebilir. Üretilen anahtarlar kimseye otomatik
   gönderilmez — bu araç yalnız dosya üretir, ağ erişimi yoktur.
   ═══════════════════════════════════════════════════════════════════ */

import { createPrivateKey, sign } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join, resolve } from "node:path";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const argv = process.argv.slice(2);
const opts = { orders: null, out: null, key: null, date: null, dryRun: false };

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => {
    const v = argv[++i];
    if (v === undefined) fail(`${a} bir değer bekliyor`);
    return v;
  };
  switch (a) {
    case "--orders":
      opts.orders = next();
      break;
    case "--out":
      opts.out = next();
      break;
    case "--key":
      opts.key = next();
      break;
    case "--date":
      opts.date = next();
      break;
    case "--dry-run":
      opts.dryRun = true;
      break;
    case "--help":
    case "-h":
      console.log(
        "kullanım: node tools/license-batch.mjs --orders <csv|txt> --out <csv> [--date YYYY-MM-DD] [--key pem] [--dry-run]",
      );
      process.exit(0);
      break;
    default:
      fail(`bilinmeyen bayrak: ${a}`);
  }
}

function fail(msg) {
  console.error("HATA: " + msg);
  process.exit(2);
}

if (!opts.orders) fail("--orders gerekli (sipariş listesi)");
if (!opts.out) fail("--out gerekli (çıktı CSV)");
if (!existsSync(resolve(opts.orders))) fail("sipariş dosyası yok: " + opts.orders);

// ── özel anahtar ──────────────────────────────────────────────────────
function readPrivateKey() {
  if (process.env.SMART_SCREEN_LICENSE_KEY) {
    const env = process.env.SMART_SCREEN_LICENSE_KEY;
    // Değer PEM içeriği de olabilir, yol da.
    return env.includes("BEGIN") ? env : readFileSync(env, "utf8");
  }
  const path =
    opts.key ??
    join(homedir(), ".config", "opencode", "smart-screen-license-private.pem");
  if (!existsSync(path)) {
    fail(
      `özel anahtar bulunamadı: ${path}\n` +
        "  SMART_SCREEN_LICENSE_KEY (PEM içeriği ya da yolu) veya --key <pem> ver.\n" +
        "  Anahtar üretimi: node tools/license-keygen.mjs (bir kez, yedeğini sakla).",
    );
  }
  return readFileSync(path, "utf8");
}

// ── CrockfordBase32 (license.rs ile birebir) ──────────────────────────
function crockford(bytes) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31];
  return out;
}

function makeKey(privateKey, email, date) {
  const payload = Buffer.from(`v1|${email}|${date}`, "utf8");
  const sig = sign(null, payload, privateKey);
  const blob = Buffer.alloc(2 + payload.length + sig.length);
  blob.writeUInt16BE(payload.length, 0);
  payload.copy(blob, 2);
  sig.copy(blob, 2 + payload.length);
  const b32 = crockford(blob);
  const groups = b32.match(/.{1,5}/g) ?? [];
  return "SS-" + groups.join("-");
}

// ── sipariş listesi ───────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const fallbackDate = opts.date ?? today();
if (!DATE_RE.test(fallbackDate)) fail(`--date biçimi YYYY-MM-DD olmalı: ${fallbackDate}`);

const raw = readFileSync(resolve(opts.orders), "utf8");
const rows = [];
const problems = [];
raw.split(/\r?\n/).forEach((line, idx) => {
  const text = line.trim();
  if (!text || text.startsWith("#")) return;
  // RFC 4180: tırnaklı alan desteği (e-posta virgül içermez ama başlık olabilir).
  const cells = text.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const email = (cells[0] ?? "").toLowerCase();
  // Başlık satırı hata değildir: "email,date" gibi satırı sessizce atla.
  if (email === "email" || email === "e-posta" || email === "mail") return;
  const date = cells[1] && DATE_RE.test(cells[1]) ? cells[1] : fallbackDate;
  if (!EMAIL_RE.test(email)) {
    problems.push(`satır ${idx + 1}: e-posta değil ("${text.slice(0, 40)}")`);
    return;
  }
  rows.push({ email, date });
});

if (rows.length === 0) fail("geçerli sipariş satırı yok");

// Tekrarları tekilleştir (aynı e-posta + tarih iki kez faturalanmasın).
const seen = new Set();
const unique = rows.filter((r) => {
  const k = `${r.email}|${r.date}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

const privateKey = createPrivateKey(readPrivateKey());

const out = [];
for (const r of unique) {
  out.push({ ...r, key: makeKey(privateKey, r.email, r.date) });
}

// ── yazma ─────────────────────────────────────────────────────────────
const csvCell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = ["email,date,key", ...out.map((r) => [r.email, r.date, r.key].map(csvCell).join(","))].join(
  "\r\n",
);

if (problems.length > 0) {
  console.log(`UYARI: ${problems.length} satır atlandı`);
  for (const p of problems.slice(0, 10)) console.log("  " + p);
  if (problems.length > 10) console.log(`  … ve ${problems.length - 10} tane daha`);
}

if (opts.dryRun) {
  console.log(`dry-run: ${out.length} anahtar üretilecek (dosya yazılmadı)`);
  for (const r of out.slice(0, 3)) console.log(`  ${r.email} · ${r.date} · ${r.key.slice(0, 18)}…`);
  process.exit(problems.length > 0 ? 1 : 0);
}

const outPath = resolve(opts.out);
if (existsSync(outPath)) {
  // Sessizce üzerine yazmak anahtar kaybı demek: çıktı arşivdir.
  fail(`çıktı dosyası zaten var: ${opts.out} — üzerine yazmam. Farklı ad ver ya da taşı.`);
}
writeFileSync(outPath, csv, "utf8");

console.log(`${out.length} anahtar yazıldı: ${opts.out}`);
console.log("Sonraki adım: anahtarları sipariş e-postalarına gönder (elle ya da kendi aracınla).");
console.log("Doğrulama: node tools/license-check.mjs --csv " + opts.out);
if (problems.length > 0) process.exit(1);
void userInfo; // (lint: kullanılmayan import uyarısını önlemek için değil, ileride teşhis için)
