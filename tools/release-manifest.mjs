#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ════════════════════════════════════════════════════════════════════
   smart-screen — release manifest üreteci (tools/release-manifest.mjs)

   NSIS kurulum dosyası + imzasından Tauri updater'ın beklediği
   latest.json'ı üretir; ayrıca NSIS ve MSI dosyaları için .sha256
   özetlerini yazar. Dış bağımlılık yok (yalnız node:_builtin).

   Kullanım:
     node tools/release-manifest.mjs --version 2.1.0 \
       --notes "HDR kapısı ve tray flyout eklendi" \
       --base-url https://github.com/TitanLion72/smart-screen/releases/download/v2.1.0

   Girdi (üretilmiş derleme çıktıları):
     src-tauri/target/release/bundle/nsis/smart-screen_<version>_x64-setup.exe
     src-tauri/target/release/bundle/nsis/smart-screen_<version>_x64-setup.exe.sig
     src-tauri/target/release/bundle/msi/smart-screen_<version>_x64_en-US.msi (varsa)

   Çıktı:
     latest.json  — updater endpoint'i olarak yayınlanır
     *.sha256     — elle doğrulama için özet dosyaları
   ════════════════════════════════════════════════════════════════════ */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";

const HELP = `smart-screen release manifest üreteci

Kullanım:
  node tools/release-manifest.mjs --version <sürüm> --base-url <url> [--notes "metin"]

Seçenekler:
  --version <sürüm>   Yayın sürümü (ör. 2.1.0) — zorunlu
  --base-url <url>    Yayın dosyalarının indirileceği temel URL — zorunlu
  --notes <metin>     Sürüm notları (latest.json içine yazılır)
  --help              Bu yardım metnini gösterir

Örnek:
  node tools/release-manifest.mjs --version 2.1.0 \\
    --notes "HDR kapısı, DDC renk sıcaklığı, tray flyout" \\
    --base-url https://github.com/TitanLion72/smart-screen/releases/download/v2.1.0`;

/** Komut satırını --anahtar değer sözlüğüne çevirir. */
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      args.help = true;
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        fail(`--${key} için değer eksik`);
      }
      args[key] = value;
      i++;
    } else {
      args._.push(a);
    }
  }
  return args;
}

function fail(message) {
  console.error(`HATA: ${message}`);
  console.error("Yardım için: node tools/release-manifest.mjs --help");
  process.exit(1);
}

/** Dizinde desene uyan tek dosyayı bulur; bulunamazsa fırlatır. */
function findOne(dir, pattern, what) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    throw new Error(`${what} için dizin okunamadı: ${dir}`);
  }
  const hits = entries.filter((name) => pattern.test(name));
  if (hits.length === 0) {
    throw new Error(`${what} bulunamadı: ${dir} içinde ${pattern} desenine uyan dosya yok`);
  }
  if (hits.length > 1) {
    throw new Error(`${what} için birden fazla aday var (${hits.join(", ")}); belirsiz`);
  }
  return join(dir, hits[0]);
}

/** findOne'u exit-1'e çeviren sarmalayıcı: zorunlu girdiler için. */
function mustFind(dir, pattern, what) {
  try {
    return findOne(dir, pattern, what);
  } catch (err) {
    fail(err.message);
  }
}

/** Dosyanın SHA-256 özetini hesaplar (akış yerine tek seferde; kurulum
 * dosyaları onlarca MB, bu yüzden Node'un bellek sınırına takılmayacak
 * kadar küçük kabul edilir). */
function sha256File(path) {
  const data = readFileSync(path);
  return createHash("sha256").update(data).digest("hex");
}

/** .sha256 yan dosyasını yazar: "<özet>  <dosya adı>" (sha256sum biçimi). */
function writeSha256(path) {
  const digest = sha256File(path);
  const sidecar = `${path}.sha256`;
  writeFileSync(sidecar, `${digest}  ${basename(path)}\n`);
  console.log(`yazıldı: ${sidecar}`);
  return digest;
}

/* ─── Ana akış ─── */

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(HELP);
  process.exit(0);
}

if (args._.length > 0) {
  fail(`bilinmeyen bağımsız değişken(ler): ${args._.join(" ")}`);
}

const version = args.version;
if (!version) {
  fail("--version zorunlu (ör. --version 2.1.0)");
}
if (!/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(version)) {
  fail(`sürüm biçimi geçersiz: ${version} (ör. 2.1.0)`);
}

const baseUrl = args["base-url"];
if (!baseUrl) {
  fail("--base-url zorunlu (ör. https://github.com/TitanLion72/smart-screen/releases/download/v2.1.0)");
}

const notes = args.notes ?? "";

// NSIS kurulum dosyası ve imzası (createUpdaterArtifacts çıktısı).
const nsisDir = join("src-tauri", "target", "release", "bundle", "nsis");
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const setupPath = mustFind(
  nsisDir,
  new RegExp(`^.*_${escaped}_x64-setup\\.exe$`),
  "NSIS kurulum dosyası",
);
const sigPath = `${setupPath}.sig`;

let signature;
try {
  signature = readFileSync(sigPath, "utf8");
} catch {
  fail(`imza dosyası okunamadı: ${sigPath} (önce \`tauri build\` çalıştırılmalı)`);
}
if (signature.trim().length === 0) {
  fail(`imza dosyası boş: ${sigPath}`);
}

// latest.json: Tauri updater sözleşmesi.
const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: signature.trim(),
      url: `${baseUrl.replace(/\/+$/, "")}/${basename(setupPath)}`,
    },
  },
};

writeFileSync("latest.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`yazıldı: latest.json (sürüm ${version})`);

// .sha256 özetleri: NSIS zorunlu, MSI varsa (üretimde "all" hedefi üretir).
writeSha256(setupPath);

const msiDir = join("src-tauri", "target", "release", "bundle", "msi");
try {
  const msiPath = findOne(
    msiDir,
    new RegExp(`^.*_${escaped}_x64_en-US\\.msi$`),
    "MSI kurulum dosyası",
  );
  writeSha256(msiPath);
} catch (err) {
  console.log(`uyarı: MSI için özet atlandı (${err.message})`);
}

console.log("bitti: latest.json yayın varlığı olarak yüklenmelidir");
