#!/usr/bin/env node
//! smart-screen lisans anahtari ureteci (offline Ed25519).
//!
//! Kullanim:
//!   node tools/license-gen.mjs --email x@y.com [--key <private.pem>]
//!
//! --key verilmezse once SMART_SCREEN_LICENSE_KEY ortam degiskeni (PEM icerigi
//! ya da yolu), o da yoksa varsayilan
//! %USERPROFILE%\.config\opencode\smart-screen-license-private.pem okunur.
//!
//! Anahtar bicimi (src-tauri/src/license.rs ile birebir ayni):
//!   1. payload = "v1|<email>|<YYYY-MM-DD>" (UTF-8)
//!   2. imza    = Ed25519(payload baytlari), 64 bayt
//!   3. blob    = u16 BIG-ENDIAN payload_uzunlugu + payload + imza
//!   4. key     = "SS-" + CrockfordBase32(blob), 5'lik gruplar arasinda '-'
//!
//! Crockford alfabesi: 0123456789ABCDEFGHJKMNPQRSTVWXYZ (I, L, O, U yok).
//!
//! Bu arac hicbir gizli anahtar icermez; anahtar dosyasi sizin sisteminizde
//! durur ve repoya commit edilmemelidir.

import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function usage(message) {
  if (message) {
    console.error(`HATA: ${message}`);
  }
  console.error(
    "Kullanım: node tools/license-gen.mjs --email x@y.com [--key <private.pem>]",
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = { email: null, key: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--email" || arg === "--key") {
      const value = argv[i + 1];
      if (value === undefined) {
        usage(`${arg} için değer gerekli`);
      }
      args[arg === "--email" ? "email" : "key"] = value;
      i += 1;
    } else {
      usage(`bilinmeyen argüman: ${arg}`);
    }
  }
  return args;
}

/// Crockford Base32: 5 bitlik semboller, son grup sifir bit ile doldurulur.
function crockfordEncode(bytes) {
  let out = "";
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = ((acc << 8) | b) >>> 0;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CROCKFORD[(acc >>> bits) & 31];
    }
  }
  if (bits > 0) {
    out += CROCKFORD[(acc << (5 - bits)) & 31];
  }
  return out;
}

function loadPrivateKey(explicit) {
  const env = process.env.SMART_SCREEN_LICENSE_KEY;
  const fallback = join(
    process.env.USERPROFILE ?? homedir(),
    ".config",
    "opencode",
    "smart-screen-license-private.pem",
  );
  // Oncelik: --key > ortam degiskeni (PEM icerigi ya da yolu) > varsayilan yol.
  let pem;
  if (explicit) {
    pem = readPemFile(explicit);
  } else if (env && env.includes("BEGIN")) {
    pem = env;
  } else {
    pem = readPemFile(env || fallback);
  }
  try {
    return createPrivateKey(pem);
  } catch (e) {
    usage(`özel anahtar geçersiz PEM: ${e.message}`);
    return null; // usage() cikis yapar; turleri sakinlestirmek icin
  }
}

function readPemFile(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (e) {
    usage(
      `özel anahtar okunamadı (${path}): ${e.message}\n` +
        "  --key <private.pem> ile yol verin ya da SMART_SCREEN_LICENSE_KEY tanımlayın",
    );
    return null; // usage() cikis yapar
  }
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email) {
    usage("--email zorunlu");
  }
  const email = args.email.trim();
  if (email.length === 0 || /[|\s]/.test(email)) {
    usage("--email boş olamaz ve '|' ya da boşluk içeremez");
  }

  const privateKey = loadPrivateKey(args.key);
  const issued = today();
  const payload = `v1|${email}|${issued}`;
  const payloadBytes = Buffer.from(payload, "utf8");
  if (payloadBytes.length > 0xffff) {
    usage("payload 65535 baytı aşıyor");
  }

  const signature = sign(null, payloadBytes, privateKey);
  const prefix = Buffer.alloc(2);
  prefix.writeUInt16BE(payloadBytes.length, 0);
  const blob = Buffer.concat([prefix, payloadBytes, signature]);

  const bodyGroups = crockfordEncode(blob).match(/.{1,5}/g) ?? [];
  const singleLine = `SS-${bodyGroups.join("-")}`;
  const readableLines = [];
  for (let i = 0; i < bodyGroups.length; i += 4) {
    readableLines.push(bodyGroups.slice(i, i + 4).join("-"));
  }
  readableLines[0] = `SS-${readableLines[0]}`;

  console.log("smart-screen lisans anahtarı");
  console.log("-----------------------------");
  console.log(`payload : ${payload}`);
  console.log(`email   : ${email}`);
  console.log(`tarih   : ${issued}`);
  console.log(`blob    : ${blob.length} bayt (2 + ${payloadBytes.length} + 64)`);
  console.log("");
  console.log("Okunur biçim:");
  console.log(readableLines.join("\n"));
  console.log("");
  console.log("Tek satır (kopyala-yapıştır):");
  console.log(singleLine);
}

main();