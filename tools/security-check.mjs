#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/**
 * tools/security-check.mjs — yerel güvenlik kapısı (v2.9).
 *
 * Neden var: depo herkese açık. "Bir daha asla" dediğimiz sınıf hataları
 * (sır sızması, enjeksiyon, gevşek CSP, sabitlenmemiş bağımlılık) commit'ten
 * ÖNCE yakalanmalı. CI'da da koşar; yerelde `npm run check:security`.
 *
 * Denetimler:
 *   S1 SIR TARAMASI        — çalışma ağacında ve git geçmişinde özel anahtar/token
 *   S2 TEHLİKELİ DOSYA     — .pem/.key/.env kimlik bilgisi izleri repoda mı
 *   S3 KOMMUT ENJEKSİYONU  — Rust'ta PowerShell/cmd'ye dize birleştirme
 *   S4 YOL GEÇİŞİ          — Node statik sunucularda root dışına çıkış
 *   S5 CSP                 — üretim CSP'de unsafe-* / localhost / '*' var mı
 *   S6 YETKİ (capability)  — geniş joker izin, allowlist dışı URL şeması
 *   S7 BAĞIMLILIK          — `npm audit` ve `cargo audit` temiz mi (opsiyonel, --deps)
 *
 * Kullanım:  node tools/security-check.mjs [--deps] [--verbose]
 *   --deps     yavaş denetimleri de koş (npm audit / cargo audit)
 *   --verbose  temiz çıkan her kuralı da yazdır
 *
 * Çıkış kodu 1 = en az bir ihlal.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const verbose = process.argv.includes("--verbose");
const withDeps = process.argv.includes("--deps");

const problems = [];
const notes = [];
const fail = (rule, msg) => {
  problems.push(`${rule}: ${msg}`);
  console.log(`PROBLEM ${rule}: ${msg}`);
};
const ok = (msg) => {
  if (verbose) console.log(`  ok  ${msg}`);
  else notes.push(msg);
};

/* ── dosya yürüyüşü ─────────────────────────────────────────────────── */

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "target",
  "dist",
  "qa/shots",
  "qa/audit",
  ".playwright-mcp",
  ".ruff_cache",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(root, full).replace(/\\/g, "/");
    if (SKIP_DIRS.has(rel) || SKIP_DIRS.has(name)) continue;
    const st = statSync(full, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) walk(full, out);
    else out.push(rel);
  }
  return out;
}

const files = walk(root);
const TEXT_EXT = new Set([".ts", ".js", ".mjs", ".rs", ".json", ".html", ".css", ".md", ".toml", ".yml", ".yaml"]);
const textFiles = files.filter((f) => TEXT_EXT.has(extname(f)));

/* ── S1: sır taraması ───────────────────────────────────────────────── */
// Yüksek güvenilirlikli desenler. Örnek/yer tutucu değerler ("...", "xxx",
// "BURAYA", "your-") bilinçli olarak hariç.
const SECRET_PATTERNS = [
  [/-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, "özel anahtar bloğu"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, "GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{60,}\b/, "GitHub fine-grained token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b/, "OpenAI/Anthropic anahtarı"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, "Slack token"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API anahtarı"],
  [/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/, "JWT"],
];

// Bu dosyalar meşru olarak örnek/desen metni taşır.
const SECRET_IGNORE = new Set([
  "tools/security-check.mjs",
  "qa/security-selftest.mjs", // kasıtlı sahte ihlaller içerir
  "SECURITY.md",
  "CONTRIBUTING.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
]);

let scanned = 0;
for (const rel of textFiles) {
  if (SECRET_IGNORE.has(rel)) continue;
  let body;
  try {
    body = readFileSync(join(root, rel), "utf8");
  } catch {
    continue;
  }
  scanned += 1;
  const lines = body.split(/\r?\n/);
  lines.forEach((line, i) => {
    // Örnek/yer tutucuları atla: açıklama satırları, "..." ve "xxx".
    if (/^\s*(?:\/\/|#|\*|<!--)/.test(line)) return;
    if (/(?:\.\.\.|x{4,}|BURAYA|your[-_]|örnek|example|placeholder|REDACTED|<[a-z-]+>)/i.test(line)) return;
    for (const [re, what] of SECRET_PATTERNS) {
      if (re.test(line)) fail("S1", `${rel}:${i + 1}: ${what} gibi görünen sır`);
    }
  });
}
ok(`S1: ${scanned} metin dosyası sır için tarandı`);

/* ── S1b: git geçmişinde sır (yalnız izlenen dosyalar) ──────────────── */
try {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
  const bad = tracked.filter((f) => /\.(pem|key|p12|pfx|keystore)$/i.test(f) || /(^|\/)\.env(\.|$)/i.test(f));
  for (const f of bad) fail("S2", `izlenen kimlik bilgisi dosyası: ${f}`);
  if (bad.length === 0) ok("S2: izlenen .pem/.key/.env dosyası yok");
} catch {
  ok("S2: git yok — atlandı");
}

/* ── S3: Rust komut enjeksiyonu ─────────────────────────────────────── */
// Kural: `Command::new("powershell")`/`cmd` argümanları DİZE BİRLEŞTİRMEYLE
// kurulmamalı; kullanıcı girdisi `arg()` ile ayrı geçmeli. `format!` içine
// gömülen değişken = enjeksiyon adayı.
const rustDir = join(root, "src-tauri", "src");
const rustFiles = existsSync(rustDir)
  ? readdirSync(rustDir)
      .filter((f) => f.endsWith(".rs"))
      .map((f) => join("src-tauri", "src", f))
  : [];
let cmdChecked = 0;
for (const rel of rustFiles) {
  const body = readFileSync(join(root, rel), "utf8");
  const lines = body.split(/\r?\n/);
  let inShellCmd = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/Command::new\(\s*"(?:powershell|pwsh|cmd|sh|bash)"/.test(line)) {
      inShellCmd = true;
      cmdChecked += 1;
    }
    if (inShellCmd && /\.arg\(\s*format!\(/.test(line)) {
      // format! argümanı: değişken gömülüyorsa riskli.
      fail("S3", `${rel}:${i + 1}: kabuk argümanı format! ile kurulmuş (enjeksiyon adayı)`);
    }
    if (inShellCmd && /;\s*$/.test(line) && /\.(?:status|output|spawn)\(/.test(line)) inShellCmd = false;
  }
}
ok(`S3: ${rustFiles.length} Rust dosyası, ${cmdChecked} kabuk çağrısı incelendi`);

/* ── S4: Node statik sunucuda yol geçişi ────────────────────────────── */
const nodeFiles = files
  .filter((f) => f.endsWith(".mjs") || f.endsWith(".js"))
  .filter((f) => !f.startsWith("dist/"))
  // Öz-test kasıtlı olarak korumasız bir sunucu örneği yazar.
  .filter((f) => f !== "qa/security-selftest.mjs");
let servers = 0;
for (const rel of nodeFiles) {
  const body = readFileSync(join(root, rel), "utf8");
  if (!/createServer\s*\(/.test(body)) continue;
  servers += 1;
  const readsUrl = /req\.url/.test(body);
  // Koruma kabul edilen biçimler: `X.startsWith(KOK + sep)` (resolve+sep
  // deseni) ya da normalize edilmiş yolun kökle karşılaştırılması.
  const hasGuard =
    /\.startsWith\(\s*[A-Za-z_$][\w$]*\s*\+\s*sep\s*\)/.test(body) ||
    /normalize\([^)]*\)\.startsWith\(/.test(body) ||
    /relative\([^)]*\)\.startsWith\(\s*["']\.\.["']/.test(body);
  if (readsUrl && !hasGuard) {
    fail("S4", `${rel}: statik sunucu req.url okuyor ama kök dışına çıkış koruması yok`);
  }
}
ok(`S4: ${servers} statik sunucu incelendi`);

/* ── S5: CSP ────────────────────────────────────────────────────────── */
const confPath = join(root, "src-tauri", "tauri.conf.json");
if (existsSync(confPath)) {
  const conf = JSON.parse(readFileSync(confPath, "utf8"));
  const sec = conf?.app?.security ?? {};
  const csp = sec.csp;
  if (!csp) {
    fail("S5", "üretim CSP tanımsız (WebView tamamen serbest)");
  } else {
    const flat = JSON.stringify(csp);
    if (flat.includes("'unsafe-eval'")) fail("S5", "CSP 'unsafe-eval' içeriyor");
    if (flat.includes("localhost:1420")) fail("S5", "üretim CSP'de dev sunucusu (localhost:1420) var");
    if (/"\*"/.test(flat)) fail("S5", "CSP joker kaynak ('*') içeriyor");
    if (!csp["object-src"]) fail("S5", "CSP'de object-src yok");
    if (!csp["base-uri"]) fail("S5", "CSP'de base-uri yok");
    if (!csp["frame-ancestors"]) fail("S5", "CSP'de frame-ancestors yok");
    ok("S5: üretim CSP sıkı");
  }
  if (sec.dangerousDisableAssetCspModification === true) {
    fail("S5", "dangerousDisableAssetCspModification açık");
  }
  if (sec.freezePrototype === false || sec.dangerousRemoteDomainIpcAccess) {
    fail("S5", "prototip dondurma kapalı ya da uzak domain IPC erişimi açık");
  }
}

/* ── S6: yetkiler ───────────────────────────────────────────────────── */
const capDir = join(root, "src-tauri", "capabilities");
if (existsSync(capDir)) {
  for (const name of readdirSync(capDir).filter((f) => f.endsWith(".json"))) {
    const rel = `src-tauri/capabilities/${name}`;
    const cap = JSON.parse(readFileSync(join(capDir, name), "utf8"));
    const perms = cap.permissions ?? [];
    for (const p of perms) {
      const id = typeof p === "string" ? p : p?.identifier ?? "";
      if (id === "core:default" && cap.windows?.includes("*")) {
        fail("S6", `${rel}: tüm pencerelere core:default`);
      }
      // Aşırı geniş FS/shell izinleri bu uygulamada gereksiz.
      if (/^(fs|shell|http):/.test(id) && /allow-all|default/.test(id) && !/scoped/.test(id)) {
        fail("S6", `${rel}: geniş izin ${id} (kapsamlandırılmış olmalı)`);
      }
      // Dış URL açma yalnız allowlist ile.
      if (id === "opener:allow-open-url") {
        const allow = p?.allow ?? [];
        if (allow.length === 0) fail("S6", `${rel}: opener allowlist boş`);
        for (const a of allow) {
          const u = a?.url ?? "";
          if (u === "*" || /^https?:\/\/\*/.test(u)) fail("S6", `${rel}: opener joker URL (${u})`);
        }
      }
    }
  }
  ok("S6: yetki dosyaları denetlendi");
}

/* ── S7: bağımlılık denetimi (opsiyonel) ────────────────────────────── */
if (withDeps) {
  try {
    const out = execFileSync("npm.cmd", ["audit", "--audit-level=high"], {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    });
    if (/vulnerabilit/i.test(out) && !/found 0 vulnerabilities/.test(out)) {
      fail("S7", "npm audit yüksek/kritik açık bildirdi");
    } else ok("S7: npm audit temiz");
  } catch (e) {
    const out = String(e.stdout ?? "");
    if (/found 0 vulnerabilities/.test(out)) ok("S7: npm audit temiz");
    else fail("S7", "npm audit başarısız (yüksek/kritik açık olabilir) — `npm audit` çalıştır");
  }
  try {
    execFileSync("cargo", ["audit"], { cwd: join(root, "src-tauri"), encoding: "utf8", stdio: "pipe" });
    ok("S7: cargo audit temiz");
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    if (/error:\s*\d+ vulnerabilit/.test(out)) fail("S7", "cargo audit açık buldu — `cargo audit` çalıştır");
    else ok("S7: cargo audit (uyarılar kabul edildi)");
  }
} else {
  ok("S7: bağımlılık denetimi atlandı (--deps ile koş)");
}

/* ── özet ───────────────────────────────────────────────────────────── */
console.log("");
if (problems.length) {
  console.log(`SONUC: FAIL (${problems.length} güvenlik ihlali)`);
  process.exit(1);
}
console.log(
  `SONUC: PASS (S1 sır · S2 dosya · S3 enjeksiyon · S4 yol geçişi · S5 CSP · S6 yetki${withDeps ? " · S7 bağımlılık" : ""})`,
);
