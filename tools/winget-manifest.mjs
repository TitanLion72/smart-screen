#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ------------------------------------------------------------------
   smart-screen - winget manifest üreteci (tools/winget-manifest.mjs)

   winget-pkgs deposuna gönderilecek üç YAML'ı üretir. Girdi: yayınlanmış
   NSIS kurulum dosyası (SHA256 ondan hesaplanır). Dış bağımlılık yok
   (yalnız node:_builtin).

   Neden üreteç: SHA256 elle kopyalanınca yanlış sürüm/yanlış dosya
   riski var; manifest sürümü ile tauri.conf.json sürümü ayrışabiliyor.
   Bu araç ikisini karşılaştırır ve uyuşmazsa yazmaz.

   Kullanım:
     node tools/winget-manifest.mjs --version 3.6.0
     node tools/winget-manifest.mjs --version 3.6.0 \
       --installer path/to/smart-screen_3.6.0_x64-setup.exe

   Çıktı:
     winget/manifests/t/TitanLion72/smart-screen/<sürüm>/
       TitanLion72.smart-screen.yaml
       TitanLion72.smart-screen.installer.yaml
       TitanLion72.smart-screen.locale.en-US.yaml
   ------------------------------------------------------------------ */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ID = "TitanLion72.smart-screen";
const REPO = "https://github.com/TitanLion72/smart-screen";

const HELP = `smart-screen winget manifest üreteci

Kullanım:
  node tools/winget-manifest.mjs --version <sürüm> [seçenekler]

Seçenekler:
  --version <sürüm>    Yayın sürümü (ör. 3.6.0) - zorunlu
  --installer <dosya>  Kurulum dosyası (varsayılan: derleme çıktısı)
  --url <adres>        InstallerUrl (varsayılan: GitHub release adresi)
  --out <dizin>        Manifest kök dizini (varsayılan: winget)
  --help               Bu yardım metnini gösterir

Not: --version, tauri.conf.json sürümüyle aynı olmalı; değilse araç yazmaz.`;

function fail(msg) {
  console.error(`hata: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  const known = new Set(["version", "installer", "url", "out", "help"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      args.help = true;
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      if (!known.has(key)) fail(`bilinmeyen seçenek: --${key}`);
      const value = argv[++i];
      if (!value || value.startsWith("--")) fail(`--${key} bir değer ister`);
      args[key] = value;
    } else {
      fail(`beklenmeyen argüman: ${a}`);
    }
  }
  return args;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex").toUpperCase();
}

function yaml(value) {
  // winget alanları tek satır; tırnak/kaçış gerektiren karakter yok.
  return String(value);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  const version = args.version;
  if (!version) fail("--version zorunlu");
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`geçersiz sürüm: ${version}`);

  // Sürüm kaynağı tek: tauri.conf.json. Manifest ile ürün ayrışmasın.
  const conf = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf8"));
  if (conf.version !== version) {
    fail(`tauri.conf.json sürümü ${conf.version}, istenen ${version} — önce sürümü hizala`);
  }

  const installer =
    args.installer ??
    join(
      ROOT,
      "src-tauri",
      "target",
      "release",
      "bundle",
      "nsis",
      `smart-screen_${version}_x64-setup.exe`,
    );
  const url =
    args.url ?? `${REPO}/releases/download/v${version}/smart-screen_${version}_x64-setup.exe`;

  let hash;
  try {
    hash = sha256(installer);
  } catch (e) {
    fail(`kurulum dosyası okunamadı (${installer}): ${e.message}`);
  }

  const outRoot = resolve(args.out ?? join(ROOT, "winget"));
  const dir = join(outRoot, "manifests", "t", "TitanLion72", "smart-screen", version);
  mkdirSync(dir, { recursive: true });

  const versionYml = `# yaml-language-server: $schema=https://aka.ms/winget-manifest.version.1.6.0.schema.json
PackageIdentifier: ${ID}
PackageVersion: ${version}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.6.0
`;

  const installerYml = `# yaml-language-server: $schema=https://aka.ms/winget-manifest.installer.1.6.0.schema.json
PackageIdentifier: ${ID}
PackageVersion: ${version}
MinimumOSVersion: 10.0.0.0
InstallerType: nullsoft
Scope: user
InstallModes:
  - interactive
  - silent
  - silentWithProgress
UpgradeBehavior: install
AppsAndFeaturesEntries:
  - DisplayName: smart-screen
    Publisher: TitanLion72
Installers:
  - Architecture: x64
    InstallerUrl: ${yaml(url)}
    InstallerSha256: ${hash}
    InstallerSwitches:
      Silent: /S
      SilentWithProgress: /S
ManifestType: installer
ManifestVersion: 1.6.0
`;

  const localeYml = `# yaml-language-server: $schema=https://aka.ms/winget-manifest.defaultLocale.1.6.0.schema.json
PackageIdentifier: ${ID}
PackageVersion: ${version}
PackageLocale: en-US
Publisher: TitanLion72
PublisherUrl: ${REPO}
PublisherSupportUrl: ${REPO}/issues
PackageName: smart-screen
PackageUrl: ${REPO}
License: GPL-3.0-or-later
LicenseUrl: ${REPO}/blob/main/LICENSE
Copyright: Copyright (C) 2026 TitanLion72
ShortDescription: Ambient-light aware theme and brightness for OpenCode on Windows
Description: Adjusts the OpenCode theme, screen brightness, warm tone and monitor brightness from measured ambient light and the clock. Respects games, video players, fullscreen apps and the lock screen. Offline; no account, no telemetry.
Moniker: smart-screen
Tags:
  - brightness
  - night-light
  - color-temperature
  - theme
  - tray
  - monitor
ReleaseNotesUrl: ${REPO}/releases/tag/v${version}
ManifestType: defaultLocale
ManifestVersion: 1.6.0
`;

  const files = [
    [join(dir, `${ID}.yaml`), versionYml],
    [join(dir, `${ID}.installer.yaml`), installerYml],
    [join(dir, `${ID}.locale.en-US.yaml`), localeYml],
  ];
  for (const [path, content] of files) writeFileSync(path, content, "utf8");

  console.log(`sürüm: ${version}`);
  console.log(`sha256: ${hash}`);
  console.log(`url: ${url}`);
  for (const [path] of files) console.log(`yazıldı: ${path}`);
  console.log("");
  console.log("Sonraki adım: winget validate --manifest <dizin> && wingetcreate submit <dizin>");
}

main();
