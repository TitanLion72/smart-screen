// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — tanıtım sitesini gh-pages'e yayınla
   (tools/site-publish.mjs)

   Neden ayrı dal: GitHub Pages kaynağı `gh-pages` (kök). `main`'deki
   dahili belgeler (HANDOFF, PLAN-*, REKABET-*) yayına GİRMEMELİ.
   Bu yüzden `site/dist` ayrı bir worktree'ye kopyalanır ve tek commit
   olarak itilir.

   Kullanım:
     node tools/site-publish.mjs --dry-run   # ne değişecek, yazmadan
     node tools/site-publish.mjs             # yayınla

   Güvenlik:
   - Force-push YOK. Geçmiş korunur.
   - Worktree her durumda temizlenir (try/finally).
   - Hedefteki eski dosyalar silinir: `gh-pages` yalnız çıktıyı taşır.
   ═══════════════════════════════════════════════════════════════════ */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = join(root, "site/v2", "dist");
const worktree = join(root, ".site-publish");
const BRANCH = "gh-pages";
const dryRun = process.argv.includes("--dry-run");

const git = (args, opts = {}) =>
  execFileSync("git", ["-C", opts.cwd ?? root, ...args], {
    encoding: "utf8",
    stdio: opts.stdio ?? "pipe",
  }).trim();

if (!existsSync(dist)) {
  console.error("HATA: site/dist yok — önce: npm run site:build");
  process.exit(2);
}

const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

// ── çalışma ağacını hazırla ─────────────────────────────────────────
function cleanup() {
  if (existsSync(worktree)) {
    try {
      execFileSync("git", ["-C", root, "worktree", "remove", "--force", worktree], { stdio: "pipe" });
    } catch {
      rmSync(worktree, { recursive: true, force: true });
    }
  }
}

cleanup(); // yarım kalmış önceki koşudan kalıntı olabilir

let published = false;
try {
  execFileSync("git", ["-C", root, "fetch", "origin", BRANCH], { stdio: "pipe" });
  execFileSync("git", ["-C", root, "worktree", "add", "--detach", worktree, `origin/${BRANCH}`], {
    stdio: "pipe",
  });
  execFileSync("git", ["-C", worktree, "checkout", "-B", BRANCH], { stdio: "pipe" });
  // Yerel dal uzakla aynı olsun: aksi hâlde "her şey silinmiş" gibi görünür.
  execFileSync("git", ["-C", worktree, "reset", "--hard", `origin/${BRANCH}`], { stdio: "pipe" });

  // ── eski içeriği temizle (.git hariç) ──
  for (const name of readdirSync(worktree)) {
    if (name === ".git") continue;
    rmSync(join(worktree, name), { recursive: true, force: true });
  }

  if (dryRun) {
    const before = execFileSync("git", ["-C", worktree, "ls-files"], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    const after = [];
    const walk = (dir, prefix = "") => {
      for (const name of readdirSync(dir)) {
        const abs = join(dir, name);
        const rel = prefix ? `${prefix}/${name}` : name;
        if (name === ".git") continue;
        try {
          readdirSync(abs);
          walk(abs, rel);
        } catch {
          after.push(rel);
        }
      }
    };
    walk(dist);
    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    const removed = [...beforeSet].filter((f) => !afterSet.has(f));
    const added = [...afterSet].filter((f) => !beforeSet.has(f));
    console.log(`[dry-run] dal: ${BRANCH}`);
    console.log(`[dry-run] eklenecek: ${added.length} dosya`);
    for (const f of added.slice(0, 12)) console.log("  + " + f);
    if (added.length > 12) console.log(`  … +${added.length - 12}`);
    console.log(`[dry-run] silinecek: ${removed.length} dosya`);
    for (const f of removed.slice(0, 12)) console.log("  - " + f);
    if (removed.length > 12) console.log(`  … -${removed.length - 12}`);
    console.log("[dry-run] hiçbir şey yazılmadı");
  } else {
    // ── çıktıyı kopyala ──
    cpSync(dist, worktree, { recursive: true, force: true });
    // Jekyll işlemesin: alt çizgiyle başlayan dosyalar silinmesin.
    writeFileSync(join(worktree, ".nojekyll"), "", "utf8");

    execFileSync("git", ["-C", worktree, "add", "-A"], { stdio: "pipe" });
    const status = execFileSync("git", ["-C", worktree, "status", "--porcelain"], { encoding: "utf8" }).trim();
    if (!status) {
      console.log("değişiklik yok: gh-pages zaten güncel");
    } else {
      const changed = status.split("\n").length;
      execFileSync(
        "git",
        ["-C", worktree, "commit", "-m", `site: yayın ${version} (${changed} dosya)`],
        { stdio: "pipe" },
      );
      const head = execFileSync("git", ["-C", worktree, "rev-parse", "--short", "HEAD"], {
        encoding: "utf8",
      }).trim();
      execFileSync("git", ["-C", worktree, "push", "origin", `${BRANCH}:${BRANCH}`], {
        stdio: "inherit",
      });
      console.log(`push edildi: ${head} (${changed} dosya)`);
      published = true;
    }
  }
} finally {
  cleanup();
}

if (published) {
  console.log("");
  console.log("Pages derlemesi birkaç dakika sürebilir. Doğrula:");
  console.log("  node tools/site-check.mjs --smoke --base https://titanlion72.github.io/smart-screen/");
}
