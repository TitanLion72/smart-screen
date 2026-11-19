#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — Tauri updater imza doğrulayıcı (tools/updater-signature.mjs)

   Neden ayrı araç: `tools/verify-signature.mjs` **Authenticode** sorar
   ("Windows bu dosyayı tanıyor mu"). Updater ise bambaşka bir şeye bakar:
   `.sig`/`latest.json` içindeki **minisign (Ed25519)** imzası ve uygulamanın
   içine gömülü `pubkey`. Bugüne kadar bu zincirin yayında doğru olduğunu
   kanıtlayan bir araç yoktu; "tauri build imzaladı" demekle yetiniyorduk.
   Bu araç tam olarak updater'ın yaptığı işi yapar:

     1) Pubkey'i çöz (base64 → "untrusted comment" + anahtar satırı)
     2) İmza paketini çöz (2 bayt algoritma + 8 bayt key id + 64 bayt imza)
     3) Key id eşleşmesini doğrula
     4) Ed25519 imzayı BLAKE2b-512 ön-özet üzerinde doğrula

   Kullanım:
     node tools/updater-signature.mjs <dosya> <sig> [--pubkey <b64>]
     node tools/updater-signature.mjs --manifest latest.json [--file <dosya>]

   `--manifest` kipi: latest.json'daki imzayı VE url'i okur; `--file`
   verilirse indirilen dosyayı da doğrular. Ağ erişimi YOKTUR — indirmeyi
   sen yaparsın (curl), araç yalnız yerel baytları denetler.

   Çıkış kodu: 0 = imza geçerli, 1 = geçersiz, 2 = kullanım hatası.
   ═══════════════════════════════════════════════════════════════════ */

import { createHash, createPublicKey, verify as edVerify } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const USAGE = `kullanım:
  node tools/updater-signature.mjs <dosya> <sig-dosyasi> [--pubkey <base64>]
  node tools/updater-signature.mjs --manifest <latest.json> [--file <dosya>] [--pubkey <base64>]

  --pubkey verilmezse src-tauri/tauri.conf.json içindeki updater pubkey kullanılır.`;

/** tauri.conf.json'daki gömülü açık anahtar (varsayılan). */
function defaultPubkey() {
  const conf = resolve(import.meta.dirname, "..", "src-tauri", "tauri.conf.json");
  if (!existsSync(conf)) return null;
  try {
    const json = JSON.parse(readFileSync(conf, "utf8"));
    return json?.plugins?.updater?.pubkey ?? null;
  } catch {
    return null;
  }
}

/**
 * minisign paketini (base64 → metin → satırlar) çözer.
 * Pubkey: 2 bayt algoritma + 8 bayt key id + 32 bayt anahtar (42 bayt).
 * İmza:  2 bayt algoritma + 8 bayt key id + 64 bayt imza (74 bayt).
 */
function decodePacket(base64) {
  const text = Buffer.from(base64.trim(), "base64").toString("utf8");
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error("minisign paketi çözülemedi (satır yok)");
  // İlk satır "untrusted comment: ..." olur; veri satırı ondan sonraki ilk satır.
  const dataLine = lines.slice(1).find((l) => !/^trusted comment:/i.test(l));
  if (!dataLine) throw new Error("minisign paketinde veri satırı yok");
  return Buffer.from(dataLine, "base64");
}

function parseKey(base64) {
  const raw = decodePacket(base64);
  if (raw.length < 42) throw new Error(`açık anahtar kısa: ${raw.length} bayt (42 beklenir)`);
  return { alg: raw.subarray(0, 2).toString("ascii"), keyId: raw.subarray(2, 10), key: raw.subarray(10, 42) };
}

function parseSignature(base64) {
  const raw = decodePacket(base64);
  if (raw.length < 74) throw new Error(`imza kısa: ${raw.length} bayt (74 beklenir)`);
  return { alg: raw.subarray(0, 2).toString("ascii"), keyId: raw.subarray(2, 10), sig: raw.subarray(10, 74) };
}

/**
 * İmzayı denetler.
 *
 * Dürüstlük notu: minisign'in iki etiketi dolaşımda ve **ikisi de** BLAKE2b-512
 * ön-özeti kullanır (Tauri `tauri signer sign` çıktısı "ED" yazar). Ön-özeti
 * atlayan "saf Ed25519" denemesi bu yüzden başarısız olur; onu bir "seçenek"
 * gibi sunmak yanıltıcı olurdu. Yalnız ön-özetli yol denenir ve etiket
 * tanınmıyorsa açıkça hata verilir.
 */
function verifyPacket(data, signatureBase64, pubkeyBase64) {
  const pk = parseKey(pubkeyBase64);
  const sg = parseSignature(signatureBase64);
  if (sg.alg !== "ED" && sg.alg !== "Ed") {
    throw new Error(`tanınmayan imza algoritması: "${sg.alg}"`);
  }
  const keyIdOk = Buffer.compare(pk.keyId, sg.keyId) === 0;
  const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), pk.key]);
  const keyObj = createPublicKey({ key: der, format: "der", type: "spki" });
  const prehashed = createHash("blake2b512").update(data).digest();
  const sigOk = edVerify(null, prehashed, keyObj, sg.sig);
  return { keyIdOk, sigOk, alg: sg.alg, bytes: data.length };
}

// ---------- argümanlar ----------

const argv = process.argv.slice(2);
const flagValue = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};

const manifestPath = flagValue("--manifest");
const fileArg = flagValue("--file");
const pubkey = flagValue("--pubkey") ?? defaultPubkey();

if (!pubkey) {
  console.error("açık anahtar bulunamadı: --pubkey ver ya da src-tauri/tauri.conf.json oku");
  process.exit(2);
}

function report(label, result, target) {
  console.log(`— ${label}`);
  console.log(`  dosya:      ${target}`);
  console.log(`  boyut:      ${result.bytes} bayt`);
  console.log(`  algoritma:  ${result.alg}`);
  console.log(`  key id:     ${result.keyIdOk ? "eşleşti" : "EŞLEŞMEDİ"}`);
  console.log(`  imza:       ${result.sigOk ? "geçerli" : "GEÇERSİZ"}`);
}

/**
 * Negatif kontrol: tek baytı bozulmuş kopya reddedilmeli.
 *
 * Neden: "imza geçerli" diyen bir araç, her şeye geçerli diyen bir araçtan ayırt
 * edilemez. Bu kontrol, imza doğrulamasının gerçekten dosyaya bağlı olduğunu
 * aynı koşuda kanıtlar. Bozuk kopya **diske yazılmaz** (bellekte kalır).
 */
function negativeCheck(bytes, sigB64) {
  if (bytes.length === 0) {
    console.error("negatif kontrol atlandı: dosya boş");
    return false;
  }
  const tampered = Buffer.from(bytes);
  tampered[Math.floor(tampered.length / 2)] ^= 0x01;
  const bad = verifyPacket(tampered, sigB64, pubkey);
  const rejected = !(bad.keyIdOk && bad.sigOk);
  console.log(`  negatif kontrol: bozuk kopya ${rejected ? "reddedildi ✓" : "KABUL EDİLDİ ✗"}`);
  return rejected;
}

let ok = false;

try {
  if (manifestPath) {
    // latest.json kipi: yayın manifestinin kendi imzasını denetler.
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const platform = manifest?.platforms?.["windows-x86_64"];
    if (!platform?.signature) {
      console.error("latest.json içinde platforms['windows-x86_64'].signature yok");
      process.exit(1);
    }
    const target = fileArg ?? flagValue("--file");
    if (!target) {
      console.log(`sürüm:  ${manifest.version ?? "?"}`);
      console.log(`url:    ${platform.url ?? "?"}`);
      console.error("\n--file verilmedi: manifest imzası okundu ama dosya denetlenmedi.");
      console.error("İndirip tekrar koş:  node tools/updater-signature.mjs --manifest latest.json --file <dosya>");
      process.exit(2);
    }
    console.log(`sürüm:  ${manifest.version ?? "?"}`);
    console.log(`url:    ${platform.url ?? "?"}`);
    const bytes = readFileSync(resolve(target));
    const result = verifyPacket(bytes, platform.signature, pubkey);
    report("latest.json imzası", result, resolve(target));
    ok = result.keyIdOk && result.sigOk;
    if (ok && argv.includes("--selftest")) ok = negativeCheck(bytes, platform.signature);
  } else {
    const filePath = argv[0];
    const sigPath = argv[1];
    if (!filePath || !sigPath) {
      console.error(USAGE);
      process.exit(2);
    }
    if (!existsSync(filePath)) {
      console.error(`dosya yok: ${filePath}`);
      process.exit(2);
    }
    if (!existsSync(sigPath)) {
      console.error(`imza dosyası yok: ${sigPath}`);
      process.exit(2);
    }
    const bytes = readFileSync(resolve(filePath));
    const sigB64 = readFileSync(sigPath, "utf8");
    const result = verifyPacket(bytes, sigB64, pubkey);
    report("ayrı .sig dosyası", result, resolve(filePath));
    ok = result.keyIdOk && result.sigOk;
    if (ok && argv.includes("--selftest")) ok = negativeCheck(bytes, sigB64);
  }
} catch (e) {
  console.error("doğrulama hatası: " + String(e?.message ?? e));
  process.exit(1);
}

console.log(ok ? "\nSONUÇ: imza GEÇERLİ (updater bu dosyayı kabul eder)" : "\nSONUÇ: imza GEÇERSİZ");
process.exit(ok ? 0 : 1);
