#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — Authenticode imzalayıcı (tools/sign-artifacts.mjs)

   Derleme çıktısındaki kurulum dosyalarını (ve istersen uygulama exe'sini)
   Windows Authenticode ile imzalar, sonra `verify-signature.mjs` ile
   doğrular. Sertifika yoksa **hiçbir şey yapmaz ve açıkça söyler** — sessizce
   imzasız release'e izin vermez.

   İki kullanım biçimi (sertifika nerede duruyorsa):

     # 1) PFX dosyası (Certum SimplySign'dan indirilen .pfx gibi)
     node tools/sign-artifacts.mjs --pfx C:\yol\sertifika.pfx --password "..."

     # 2) Sertifika Windows deposunda (HSM / donanım token / Azure Artifact Signing)
     node tools/sign-artifacts.mjs --thumbprint 3F1C...

   Ortak bayraklar:
     --files <yol>...       yalnız bu dosyaları imzala (varsayılan: derleme çıktıları)
     --timestamp <url>      RFC3161 sunucusu (varsayılan: http://timestamp.digicert.com)
     --no-timestamp         zaman damgasız imzala (yalnız deneme için; release'te kullanma)
     --signtool <yol>       signtool.exe yolu (varsayılan: Windows Kits'ten bulunur)
     --dry-run              ne yapılacağını yaz, imzalama

   Zaman damgası neden şart: imza sertifikanın geçerlilik süresiyle bağlıdır.
   Damga olmadan sertifika bitince eski kurulumlar "imza süresi geçmiş" olur;
   damga, imzalandığı anı kanıtlar ve imza geçerli kalır.

   Doğrulama: imzadan sonra dosyalar `tools/verify-signature.mjs` ile yeniden
   okunur; orada "Valid" görülmezse bu araç da sıfırdan farklı çıkar.
   ═══════════════════════════════════════════════════════════════════ */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const opts = {
  pfx: null,
  password: null,
  thumbprint: null,
  files: [],
  timestamp: "http://timestamp.digicert.com",
  noTimestamp: false,
  signtool: null,
  dryRun: false,
  machineStore: false,
};

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => {
    const v = argv[++i];
    if (v === undefined) fail(`${a} bir değer bekliyor`);
    return v;
  };
  switch (a) {
    case "--pfx":
      opts.pfx = next();
      break;
    case "--password":
      opts.password = next();
      break;
    case "--thumbprint":
      opts.thumbprint = next();
      break;
    case "--files":
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) opts.files.push(argv[++i]);
      break;
    case "--timestamp":
      opts.timestamp = next();
      break;
    case "--no-timestamp":
      opts.noTimestamp = true;
      break;
    case "--signtool":
      opts.signtool = next();
      break;
    case "--dry-run":
      opts.dryRun = true;
      break;
    case "--machine-store":
      opts.machineStore = true;
      break;
    default:
      if (a.startsWith("--")) fail(`bilinmeyen bayrak: ${a}`);
      opts.files.push(a);
  }
}

function fail(msg) {
  console.error("HATA: " + msg);
  process.exit(2);
}

if (!opts.pfx && !opts.thumbprint) {
  fail(
    "sertifika belirtilmedi. İki yol var:\n" +
      "  --pfx <sertifika.pfx> --password <şifre>   (dosyadan)\n" +
      "  --thumbprint <SHA1>                        (Windows sertifika deposundan)\n" +
      "Sertifika yoksa imzalama yapılmaz; release imzasız çıkar (README > Kod imzalama).",
  );
}
if (opts.pfx && !existsSync(resolve(opts.pfx))) fail("PFX bulunamadı: " + opts.pfx);
if (opts.pfx && !opts.password) fail("--pfx ile birlikte --password gerekli");

/** Windows Kits altındaki en yeni signtool.exe. */
function findSigntool() {
  if (opts.signtool) {
    if (!existsSync(opts.signtool)) fail("signtool bulunamadı: " + opts.signtool);
    return opts.signtool;
  }
  const roots = [
    "C:\\Program Files (x86)\\Windows Kits\\10\\bin",
    "C:\\Program Files\\Windows Kits\\10\\bin",
  ];
  const found = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const ver of readdirSync(root)) {
      const p = join(root, ver, "x64", "signtool.exe");
      if (existsSync(p)) found.push(p);
    }
  }
  if (found.length === 0) {
    fail(
      "signtool.exe bulunamadı. Windows SDK'yı kur ya da --signtool <yol> ver.\n" +
        "İndirme: https://developer.microsoft.com/windows/downloads/windows-sdk/",
    );
  }
  // Sürüm adları sözlüksel sıralanır (10.0.26100.0 > 10.0.22621.0).
  found.sort();
  return found[found.length - 1];
}

/** Varsayılan hedefler: NSIS kurulum, MSI ve uygulama exe'si. */
function defaultFiles() {
  const release = resolve("src-tauri", "target", "release");
  const out = [];
  const push = (dir, filter) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isFile() && filter(name)) out.push(p);
    }
  };
  push(join(release, "bundle", "nsis"), (n) => n.endsWith("-setup.exe"));
  push(join(release, "bundle", "msi"), (n) => n.endsWith(".msi"));
  push(release, (n) => n === "smart-screen.exe");
  return out;
}

const files = opts.files.length > 0 ? opts.files.map((f) => resolve(f)) : defaultFiles();
if (files.length === 0) {
  fail("imzalanacak dosya yok — önce `npm.cmd run tauri build` çalıştır ya da --files ver.");
}
for (const f of files) if (!existsSync(f)) fail("dosya yok: " + f);

const signtool = findSigntool();
console.log("signtool: " + signtool);
console.log("hedef   : " + files.length + " dosya");
for (const f of files) console.log("  - " + f);

function signArgs(file) {
  const args = ["sign", "/fd", "sha256", "/td", "sha256"];
  if (opts.pfx) {
    args.push("/f", resolve(opts.pfx), "/p", opts.password);
  } else {
    // Sertifika varsayılan olarak **kullanıcı** deposunda aranır (token/HSM ve
    // SimplySign buraya yazar). Makine deposu için `--machine-store` şart.
    args.push("/sha1", opts.thumbprint.replace(/\s+/g, ""));
    if (opts.machineStore) args.push("/sm");
  }
  if (!opts.noTimestamp) args.push("/tr", opts.timestamp, "/v");
  else args.push("/v");
  args.push(file);
  return args;
}

let signed = 0;
for (const f of files) {
  const args = signArgs(f);
  if (opts.dryRun) {
    console.log(`[dry-run] "${signtool}" ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);
    continue;
  }
  try {
    execFileSync(signtool, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    signed++;
    console.log(`imzalandı: ${f}`);
  } catch (err) {
    const detail = (err.stdout || "") + (err.stderr || "");
    if (/timestamp/i.test(detail) && !opts.noTimestamp) {
      console.error(
        `\nHATA: ${f} zaman damgası alınamadı (ağ/sunucu). İmza atılmış olsa da release'e\n` +
          `koymayın: sertifika dolunca doğrulama düşer. Farklı sunucu deneyin:\n` +
          `  --timestamp http://timestamp.sectigo.com\n`,
      );
    }
    console.error(detail.trim() || String(err));
    process.exit(1);
  }
}

if (opts.dryRun) {
  console.log("dry-run bitti — hiçbir dosya değişmedi.");
  process.exit(0);
}

console.log(`\n${signed} dosya imzalandı, doğrulanıyor…`);
const verify = resolve("tools", "verify-signature.mjs");
try {
  execFileSync(process.execPath, [verify, ...files], { stdio: "inherit" });
} catch {
  process.exit(1);
}
