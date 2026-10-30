#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — Authenticode doğrulayıcı (tools/verify-signature.mjs)

   Yayına çıkmadan önce "gerçekten imzalı mı" sorusunu sorar. İmza yoksa
   veya zincir güvenilmezse sıfırdan farklı çıkış kodu döner; böylece
   "imzaladım" sanılan ama imzalanmamış bir kurulum dosyası release'e
   gitmez.

   Kullanım:
     node tools/verify-signature.mjs <dosya>...                     # hepsi Valid olmalı
     node tools/verify-signature.mjs --expect TitanLion72 <dosya>...  # imzalayan adı eşleşmeli
     node tools/verify-signature.mjs --allow-untrusted <dosya>...     # kendinden imzalı test
     node tools/verify-signature.mjs --json <dosya>                   # makine okunur çıktı

   Neden PowerShell: Authenticode durumu CryptoAPI'de; `Get-AuthenticodeSignature`
   hem imzayı hem zinciri hem zaman damgasını aynı yerden okur. Sıfır bağımlılık.

   Not: bu araç Tauri updater'ının **minisign** imzasını (.sig) denetlemez —
   o ayrı bir mekanizma ve `latest.json` ile birlikte doğrulanır.
   ═══════════════════════════════════════════════════════════════════ */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const allowUntrusted = argv.includes("--allow-untrusted");
let expect = null;
const files = [];

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--json" || a === "--allow-untrusted") continue;
  if (a === "--expect") {
    expect = argv[++i];
    if (!expect) fail("--expect bir değer bekliyor (ör. TitanLion72)");
    continue;
  }
  if (a.startsWith("--")) fail(`bilinmeyen bayrak: ${a}`);
  files.push(a);
}

function fail(msg) {
  console.error("HATA: " + msg);
  process.exit(2);
}

if (files.length === 0) {
  fail(
    "en az bir dosya gerekli.\n" +
      "  örnek: node tools/verify-signature.mjs src-tauri/target/release/bundle/nsis/*.exe",
  );
}

/** Tek dosyanın Authenticode durumunu PowerShell'den okur. */
function signatureOf(file) {
  const script = `
    $ErrorActionPreference = 'Stop'
    # PowerShell çıktısı varsayılan olarak konsol kod sayfasında gelir; Türkçe
    # durum mesajları mojibake olup regex'i kaçırıyordu. UTF-8'e sabitliyoruz.
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $s = Get-AuthenticodeSignature -LiteralPath '${file.replace(/'/g, "''")}'
    $out = [ordered]@{
      status      = [string]$s.Status
      message     = [string]$s.StatusMessage
      signer      = if ($s.SignerCertificate) { [string]$s.SignerCertificate.Subject } else { $null }
      thumbprint  = if ($s.SignerCertificate) { [string]$s.SignerCertificate.Thumbprint } else { $null }
      timestamped = ($null -ne $s.TimeStamperCertificate)
      timeStamper = if ($s.TimeStamperCertificate) { [string]$s.TimeStamperCertificate.Subject } else { $null }
    }
    $out | ConvertTo-Json -Compress
  `;
  const raw = execFileSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8" },
  ).trim();
  return JSON.parse(raw);
}

/** Kendinden imzalı sertifikada Windows "UnknownError" + zincir mesajı verir. */
const untrustedChain = (s) =>
  (s.status === "UnknownError" || s.status === "NotTrustedRoot") &&
  /root certificate|zincir|chain|kök sertifika/i.test(s.message ?? "");

const results = [];
let bad = 0;

for (const f of files) {
  const abs = resolve(f);
  if (!existsSync(abs)) {
    results.push({ file: f, ok: false, reason: "dosya yok" });
    bad++;
    continue;
  }
  let s;
  try {
    s = signatureOf(abs);
  } catch (err) {
    results.push({ file: f, ok: false, reason: "okunamadı: " + String(err.message || err) });
    bad++;
    continue;
  }

  // `problems` sıfırdan farklı çıkışı tetikler; `notes` yalnız bilgilendirir.
  const problems = [];
  const notes = [];
  if (s.status !== "Valid") {
    if (allowUntrusted && untrustedChain(s)) {
      notes.push("zincir güvenilmez — --allow-untrusted verildiği için kabul edildi");
    } else {
      problems.push('durum "' + s.status + '"');
    }
  }
  if (!s.signer) problems.push("imzalayan sertifika yok");
  if (expect && s.signer && !s.signer.includes(expect)) {
    problems.push('imzalayan "' + s.signer + '" içinde "' + expect + '" yok');
  }
  if (!s.timestamped && s.signer) {
    // Zaman damgası eksikliği "imzasız" demek değildir: release'te istenmez ama
    // imza geçerlidir. Uyarı olarak taşınır.
    notes.push("zaman damgası yok (sertifika süresi dolunca imza geçersizleşir)");
  }

  const ok = problems.length === 0;
  if (!ok) bad++;
  results.push({
    file: f,
    ok,
    status: s.status,
    message: s.message,
    signer: s.signer,
    thumbprint: s.thumbprint,
    timestamped: s.timestamped,
    problems,
    notes,
  });
}

if (json) {
  console.log(JSON.stringify({ ok: bad === 0, results }, null, 2));
  process.exit(bad === 0 ? 0 : 1);
}

for (const r of results) {
  if (r.ok) {
    const signer = r.signer ? r.signer.replace(/^CN=([^,]+).*/, "$1") : "(bilinmiyor)";
    console.log(`OK    ${r.file}`);
    console.log(`      imzalayan: ${signer}${r.timestamped ? " · zaman damgalı" : " · damgasız"}`);
    for (const w of r.notes ?? []) console.log("      uyarı: " + w);
  } else {
    console.log(`HATA  ${r.file}`);
    const detail = r.problems ?? [r.reason ?? "bilinmeyen hata"];
    for (const p of detail) console.log("      " + p);
    if (r.message && r.status !== "NotSigned") console.log("      Windows: " + r.message);
    for (const w of r.notes ?? []) console.log("      uyarı: " + w);
  }
}

if (bad > 0) {
  console.log(`SONUC: FAIL (${bad} dosya imzalı değil / doğrulanamadı)`);
  process.exit(1);
}
console.log(`SONUC: PASS (${results.length} dosya Authenticode ile imzalı)`);
