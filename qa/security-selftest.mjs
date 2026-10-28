// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/**
 * qa/security-selftest.mjs — güvenlik kapısının KENDİ testi.
 *
 * Bir denetleyici "PASS" diyorsa, gerçekten bir şey yakalayabildiğini
 * kanıtlamak gerekir. Bu betik geçici bir kopya üzerinde kasıtlı ihlaller
 * yaratır ve `tools/security-check.mjs`in her birini yakaladığını doğrular.
 *
 * Kullanım: node qa/security-selftest.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, cpSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const problems = [];
const fail = (m) => {
  problems.push(m);
  console.log("PROBLEM " + m);
};

/** Geçici kopya: denetleyicinin ihtiyaç duyduğu minimum ağaç. */
function makeSandbox() {
  const dir = mkdtempSync(join(tmpdir(), "ss-sec-"));
  mkdirSync(join(dir, "tools"), { recursive: true });
  mkdirSync(join(dir, "src-tauri", "src"), { recursive: true });
  mkdirSync(join(dir, "src-tauri", "capabilities"), { recursive: true });
  mkdirSync(join(dir, "qa"), { recursive: true });
  copyFileSync(join(root, "tools", "security-check.mjs"), join(dir, "tools", "security-check.mjs"));
  return dir;
}

/** Denetleyiciyi sandbox'ta koş; çıkış kodu + çıktı döner. */
function runCheck(dir) {
  try {
    const out = execFileSync(process.execPath, [join(dir, "tools", "security-check.mjs")], {
      cwd: dir,
      encoding: "utf8",
      stdio: "pipe",
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout ?? "") + String(e.stderr ?? "") };
  }
}

function baseFiles(dir, { csp = true, caps = true } = {}) {
  // Temiz taban: denetim PASS vermeli.
  writeFileSync(join(dir, "src-tauri", "tauri.conf.json"), JSON.stringify(
    {
      app: {
        security: csp
          ? {
              csp: {
                "default-src": "'self'",
                "connect-src": "ipc: http://ipc.localhost",
                "object-src": "'none'",
                "base-uri": "'none'",
                "frame-ancestors": "'none'",
              },
            }
          : {},
      },
    },
    null,
    2,
  ));
  writeFileSync(join(dir, "src-tauri", "src", "lib.rs"), "fn main() {}\n");
  if (caps) {
    writeFileSync(
      join(dir, "src-tauri", "capabilities", "default.json"),
      JSON.stringify({ windows: ["main"], permissions: ["core:default"] }, null, 2),
    );
  }
  writeFileSync(join(dir, "src", "app.ts"), "export const x = 1;\n");
}

console.log("güvenlik kapısı öz-testi\n");

// 0) Temiz taban PASS vermeli
{
  const dir = makeSandbox();
  mkdirSync(join(dir, "src"), { recursive: true });
  baseFiles(dir);
  const r = runCheck(dir);
  if (r.code !== 0) fail(`temiz taban FAIL verdi (beklenen PASS):\n${r.out}`);
  else console.log("  temiz taban: PASS ✓");
  rmSync(dir, { recursive: true, force: true });
}

// 1) S1: gömülü özel anahtar yakalanmalı
{
  const dir = makeSandbox();
  mkdirSync(join(dir, "src"), { recursive: true });
  baseFiles(dir);
  writeFileSync(
    join(dir, "src", "leak.ts"),
    'const k = "-----BEGIN RSA PRIVATE KEY-----";\n',
  );
  const r = runCheck(dir);
  if (r.code === 0 || !/S1/.test(r.out)) fail("S1: gömülü özel anahtarı yakalamadı");
  else console.log("  S1 özel anahtar: yakalandı ✓");
  rmSync(dir, { recursive: true, force: true });
}

// 2) S5: gevşek CSP yakalanmalı
{
  const dir = makeSandbox();
  mkdirSync(join(dir, "src"), { recursive: true });
  baseFiles(dir);
  writeFileSync(
    join(dir, "src-tauri", "tauri.conf.json"),
    JSON.stringify({
      app: {
        security: {
          csp: { "default-src": "'self' 'unsafe-eval'", "connect-src": "http://localhost:1420" },
        },
      },
    }),
  );
  const r = runCheck(dir);
  if (r.code === 0 || !/S5/.test(r.out)) fail("S5: gevşek CSP'yi yakalamadı");
  else console.log("  S5 gevşek CSP: yakalandı ✓");
  rmSync(dir, { recursive: true, force: true });
}

// 3) S4: korumasız statik sunucu yakalanmalı
{
  const dir = makeSandbox();
  mkdirSync(join(dir, "src"), { recursive: true });
  baseFiles(dir);
  writeFileSync(
    join(dir, "qa", "server.mjs"),
    'import { createServer } from "node:http";\nconst s = createServer((req, res) => { const p = req.url; });\n',
  );
  const r = runCheck(dir);
  if (r.code === 0 || !/S4/.test(r.out)) fail("S4: korumasız statik sunucuyu yakalamadı");
  else console.log("  S4 korumasız sunucu: yakalandı ✓");
  rmSync(dir, { recursive: true, force: true });
}

// 4) S6: joker opener URL yakalanmalı
{
  const dir = makeSandbox();
  mkdirSync(join(dir, "src"), { recursive: true });
  baseFiles(dir);
  writeFileSync(
    join(dir, "src-tauri", "capabilities", "default.json"),
    JSON.stringify({
      windows: ["main"],
      permissions: [
        "core:default",
        { identifier: "opener:allow-open-url", allow: [{ url: "https://*" }] },
      ],
    }),
  );
  const r = runCheck(dir);
  if (r.code === 0 || !/S6/.test(r.out)) fail("S6: joker opener URL'yi yakalamadı");
  else console.log("  S6 joker URL: yakalandı ✓");
  rmSync(dir, { recursive: true, force: true });
}

// 5) S3: kabuk argümanı format! ile kurulursa yakalanmalı
{
  const dir = makeSandbox();
  mkdirSync(join(dir, "src"), { recursive: true });
  baseFiles(dir);
  writeFileSync(
    join(dir, "src-tauri", "src", "ps.rs"),
    [
      "use std::process::Command;",
      "fn f(user: &str) {",
      '    Command::new("powershell")',
      '        .arg(format!("-Command {}", user))',
      "        .status();",
      "}",
    ].join("\n"),
  );
  const r = runCheck(dir);
  if (r.code === 0 || !/S3/.test(r.out)) fail("S3: format! ile kurulan kabuk argümanını yakalamadı");
  else console.log("  S3 komut enjeksiyonu: yakalandı ✓");
  rmSync(dir, { recursive: true, force: true });
}

if (problems.length) {
  console.log(`\nSONUC: FAIL (${problems.length} öz-test başarısız)`);
  process.exit(1);
}
console.log("\nSONUC: PASS (5 ihlal sınıfı yakalanıyor, temiz taban geçiyor)");
