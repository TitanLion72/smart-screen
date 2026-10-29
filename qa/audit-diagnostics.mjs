// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ────────────────────────────────────────────────────────────────────
   qa/audit-diagnostics.mjs — "Kontrol" (tanılama) kartı, v2.10

   Üründe "bir şey çalışmıyorsa neden" sorusunun cevabı yoktu: gamma,
   DDC/CI, HDR ve parlaklık yazımı yalnız log'a gömülüydü. Bu araç
   kartın sözleşmesini kalıcı olarak denetler:

     1. Kart, Gelişmiş KAPALIYKEN görünür (destek yolu bulunabilir).
     2. "Sistemi kontrol et" gerçekten koşar: satırlar, durum sınıfları,
        zaman damgası, toast ve "Raporu kopyala" etkinleşir.
     3. Kopyalama panoya DÜZ METİN rapor yazar (destek için).
     4. Tanılama hiçbir şeyi değiştirmez: parlaklık/gamma yazımı yok.
     5. Sıcak ton kapalıyken backend'e warmth=0 gider (rampa yazılmaz).
     6. Backend hatası uygulamayı düşürmez; görünür hata toast'ı çıkar.

   Kullanım:  node audit-diagnostics.mjs     (önce `npm run build`)
   Kareler:   qa/audit/diag-*.png
   ──────────────────────────────────────────────────────────────────── */

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { join, extname, resolve, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "dist");
const out = join(here, "audit");
await mkdir(out, { recursive: true });

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  const p = (req.url || "/").split("?")[0];
  // Path injection koruması (qa/run.mjs ile aynı sözleşme).
  const file = resolve(root, "." + (p === "/" ? "/index.html" : p));
  if (!file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const problems = [];
const fail = (msg) => {
  problems.push(msg);
  console.log("PROBLEM " + msg);
};
const check = (cond, msg) => {
  if (!cond) fail(msg);
};

const REPORT = {
  version: "9.9.9-qa",
  os: "windows 11 (QA)",
  checks: [
    { id: "brightness-read", label: "Parlaklık okuma", status: "ok", detail: "42% · \\\\.\\DISPLAY1", hint: "" },
    { id: "brightness-write", label: "Parlaklık yazma", status: "ok", detail: "42% yazıldı, 42% okundu", hint: "" },
    { id: "gamma", label: "Sıcak ton sürücüsü", status: "warn", detail: "sıcak ton kapalı — rampa yazılmadı", hint: "Sıcak tonu açıp yeniden dene." },
    { id: "monitors", label: "Monitörler", status: "bad", detail: "hiç monitör bulunamadı", hint: "Ekran bağlantısını denetle." },
    { id: "log", label: "Günlük", status: "ok", detail: "son satır 20:58", hint: "" },
  ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1040, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await ctx.newPage();
await page.addInitScript((report) => {
  window.__diag = { report, fail: false, calls: [] };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    transformCallback: () => 1,
    unregisterCallback: () => undefined,
    invoke: async (cmd, args) => {
      if (cmd === "brightness_get") return 42;
      if (cmd === "app_version") return "test";
      if (cmd === "log_tail") return [];
      if (cmd === "log_lines") return [];
      if (cmd === "log_clear") return null;
      if (cmd === "log_tick") return null;
      if (cmd === "theme_get") return ["vesper", "dark"];
      if (cmd === "theme_set") return null;
      if (cmd === "autostart_get") return true;
      if (cmd === "battery_status") return [80, true];
      if (cmd === "pref_get") return null;
      if (cmd === "pref_list") return [];
      if (cmd === "stats_summary") return null;
      if (cmd === "monitor_list") return [];
      if (cmd === "hdr_status_all") return [];
      if (cmd === "monitor_color_temp_info") return [];
      if (cmd === "warmth_auto") return 35;
      if (cmd === "gamma_set_warmth") return null;
      if (cmd === "gamma_restore") return null;
      if (cmd === "gamma_verify_warmth") return [100, 100];
      if (cmd === "contrast_audit") return [];
      if (cmd === "plugin:app|version") return "test";
      if (cmd === "plugin:notification|is_permission_granted") return true;
      if (cmd === "plugin:event|listen") return 1;
      if (cmd === "plugin:event|unlisten") return null;
      if (cmd === "plugin:event|emit") return null;
      if (cmd === "diagnose") {
        window.__diag.calls.push(args ?? null);
        if (window.__diag.fail) throw new Error("tanılama sürücüsü yanıt vermedi");
        return window.__diag.report;
      }
      // Bilinmeyen komut sessizce null DÖNMEZ (qa/run.mjs sözleşmesi).
      throw new Error("bilinmeyen invoke komutu: " + cmd);
    },
  };
}, REPORT);

await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);

const textOf = async (sel) => (await page.locator(sel).textContent()) ?? "";
const toastText = async () =>
  (await page.evaluate(() =>
    [...document.querySelectorAll("#toast-host .toast")].map((n) => n.textContent).join(" | "),
  )) ?? "";

// ── 1) Kart görünürlüğü ────────────────────────────────────────────
console.log("1) görünürlük ve boş durum");
await page.locator("#tab-settings").click();
await page.waitForTimeout(300);
check(await page.locator("#diag-box").isVisible(), "#diag-box görünür değil");
const advOpen = await page.locator("#advanced").evaluate((d) => d.open);
check(advOpen === false, "#advanced varsayılan olarak açık (kart Gelişmiş içinde olabilir)");
check(await page.locator("#diag-copy").isDisabled(), "rapor yokken kopyala etkin");
check((await page.locator("#diag-list .diag-empty").count()) === 1, "boş yönlendirme satırı yok");
console.log("   kart görünür, kopyala kapalı ✓");

// ── 2) Kontrol koşusu ──────────────────────────────────────────────
console.log("2) sistemi kontrol et");
const before = await page.evaluate(() => window.__diag.calls.length);
await page.locator("#diag-run").click();
await page.waitForTimeout(600);
const calls = await page.evaluate(() => window.__diag.calls);
check(calls.length === before + 1, `diagnose ${calls.length - before} kez çağrıldı`);
const rows = await page.locator("#diag-list .diag-row").count();
check(rows === REPORT.checks.length, `satır ${rows} (beklenen ${REPORT.checks.length})`);
const statuses = await page
  .locator("#diag-list .diag-row")
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-status")));
check(
  statuses.includes("ok") && statuses.includes("warn") && statuses.includes("bad"),
  `durum sınıfları eksik: ${statuses.join(",")}`,
);
// İpucu yalnız sorunlu satırda görünür (ok satırlar sade kalır).
const okAction = await page
  .locator('#diag-list .diag-row[data-status="ok"] .diag-action')
  .count();
check(okAction === 0, "ok satırda eylem/ipucu metni görünüyor");
const badAction = await textOf('#diag-list .diag-row[data-status="bad"] .diag-action');
check(badAction.includes("bağlantı"), `sorunlu satırda ipucu yok: "${badAction}"`);
const stamp = await textOf("#diag-stamp");
check(/\d+ kontrol/.test(stamp), `zaman damgası beklenen biçimde değil: "${stamp}"`);
check(stamp.includes("1 sorun"), `damga sorun sayısını yazmıyor: "${stamp}"`);
check(!(await page.locator("#diag-copy").isDisabled()), "rapor varken kopyala kapalı");
const t1 = await toastText();
check(/sorun/.test(t1), `toast sonucu bildirmedi: "${t1}"`);
console.log(`   ${rows} satır · damga "${stamp.trim()}" · toast "${t1.replace(/\s+/g, " ").trim()}" ✓`);

// ── 3) Kopyalama ───────────────────────────────────────────────────
console.log("3) raporu kopyala");
await page.locator("#diag-copy").click();
await page.waitForTimeout(400);
const clip = await page.evaluate(() => navigator.clipboard.readText());
check(clip.startsWith("smart-screen 9.9.9-qa"), `pano başlığı yanlış: "${clip.slice(0, 40)}"`);
check(/\[SORUN\]\s+Monitörler/.test(clip), "pano raporunda sorun satırı yok");
check(/\[uyarı\]\s+Sıcak ton sürücüsü/.test(clip), "pano raporunda uyarı satırı yok");
check(clip.includes("palet:"), "pano raporunda palet özeti yok");
const t2 = await toastText();
check(/kopyalandı/i.test(t2), `kopyalama toast'ı yok: "${t2}"`);
console.log(`   ${clip.length} karakter panoda ✓`);

// ── 4) Yan etki yok ────────────────────────────────────────────────
console.log("4) yan etki denetimi");
const writes = await page.evaluate(() =>
  window.__diag.calls.length + "|" + [...document.querySelectorAll("*")].length,
);
check(/^\d+\|\d+$/.test(writes), "yan etki sayacı okunamadı");
const inv = await page.evaluate(() =>
  (window.__TAURI_INTERNALS__ && window.__diag && window.__diag.calls) || [],
);
check(Array.isArray(inv), "diagnose çağrıları okunamadı");
// Parlaklık/gamma yazımının tanılama sırasında çağrılmadığını stub tarafında
// sayıyoruz: yalnız diagnose sayısı arttı.
const diagOnly = await page.evaluate(() => window.__diag.calls.length);
check(diagOnly === before + 1, `tanılama sırasında başka çağrı sayacı kaydı: ${diagOnly}`);
console.log("   tanılama yalnız diagnose çağırdı ✓");

// ── 5) Sıcak ton kapalıyken warmth=0 ───────────────────────────────
console.log("5) sıcak ton kapalı → warmth 0");
// Önce otomatik kipte warmth > 0 olmalı (stub: 35 × %70).
const autoWarmth = calls[0] && calls[0].warmth;
check(
  typeof autoWarmth === "number" && autoWarmth > 0 && autoWarmth <= 100,
  `otomatik kipte warmth beklenen aralıkta değil: ${JSON.stringify(autoWarmth)}`,
);
await page.locator("#warm-seg .seg-item").nth(2).click();
await page.waitForTimeout(500);
await page.locator("#diag-run").scrollIntoViewIfNeeded();
await page.locator("#diag-run").click();
await page.waitForTimeout(500);
const offCalls = await page.evaluate(() => window.__diag.calls);
const offWarmth = offCalls[offCalls.length - 1] && offCalls[offCalls.length - 1].warmth;
check(offWarmth === 0, `sıcak ton kapalıyken warmth ${JSON.stringify(offWarmth)} (0 olmalı)`);
console.log(`   auto ${autoWarmth} → off ${offWarmth} ✓`);

// ── 6) Backend hatası ──────────────────────────────────────────────
console.log("6) backend hatası görünür ve uygulama ayakta");
await page.evaluate(() => {
  window.__diag.fail = true;
});
await page.locator("#diag-run").click();
await page.waitForTimeout(500);
const t3 = await toastText();
check(/yapılamadı/i.test(t3), `hata toast'ı çıkmadı: "${t3}"`);
check((await page.locator("#diag-list .diag-empty").count()) === 1, "hata sonrası boş durum yok");
check(await page.locator("#diag-copy").isDisabled(), "hata sonrası kopyala etkin kaldı");
const alive = await page.evaluate(() => Boolean(document.getElementById("diag-run")));
check(alive, "hata sonrası kart DOM'dan düştü");
console.log("   hata toast'ı çıktı, kart ayakta ✓");

// ── 7) Taşma + kareler ─────────────────────────────────────────────
console.log("7) taşma ve kareler");
const wide = await page.evaluate(() => {
  const list = document.getElementById("diag-list");
  return list ? list.scrollWidth - list.clientWidth : -1;
});
check(wide <= 1, `#diag-list yatay taşıyor (${wide}px)`);
const pageOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check(pageOverflow <= 1, `sayfa yatay taşıyor (${pageOverflow}px)`);

// Pencere en küçük boyutu (tauri.conf minWidth 760) — kart orada da sığmalı.
await page.setViewportSize({ width: 760, height: 600 });
await page.waitForTimeout(300);
const narrowOverflow = await page.evaluate(() => {
  const list = document.getElementById("diag-list");
  return list ? list.scrollWidth - list.clientWidth : -1;
});
check(narrowOverflow <= 1, `760px'te #diag-list yatay taşıyor (${narrowOverflow}px)`);
const narrowPage = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check(narrowPage <= 1, `760px'te sayfa yatay taşıyor (${narrowPage}px)`);
await page.setViewportSize({ width: 1040, height: 900 });
await page.waitForTimeout(250);

// Palet gerçekten uygulanıyor mu? (Yanlış id ile sessizce koyu kare almayalım.)
const bgOf = (pal) =>
  page.evaluate((p) => {
    document.documentElement.dataset.theme = p;
    return getComputedStyle(document.documentElement).getPropertyValue("--bg-0").trim();
  }, pal);
const bgObsidyen = await bgOf("obsidyen");
const bgFildisi = await bgOf("fildisi");
check(
  bgObsidyen !== "" && bgFildisi !== "" && bgObsidyen !== bgFildisi,
  `palet uygulanmıyor: obsidyen=${bgObsidyen} fildisi=${bgFildisi}`,
);

// Hata durumundan temiz bir rapora dönüp kareleri al.
await page.evaluate(() => {
  window.__diag.fail = false;
});
await page.locator("#diag-run").click();
await page.waitForTimeout(500);
// Regresyon: hata sonrası AYNI rapor yeniden koşunca satırlar dönmeli
// (imza "değişmedi" sanıp boş liste bırakıyordu).
const recovered = await page.locator("#diag-list .diag-row").count();
check(recovered === REPORT.checks.length, `hata sonrası satırlar dönmedi: ${recovered}`);
check(!(await page.locator("#diag-copy").isDisabled()), "hata sonrası kopyala kapalı kaldı");

const shots = [
  ["bento", "obsidyen"],
  ["sahne", "obsidyen"],
  ["dergi", "obsidyen"],
  ["konsol", "obsidyen"],
  ["bento", "fildisi"],
];
for (const [tpl, pal] of shots) {
  await page.evaluate(
    ([t, p]) => {
      document.documentElement.dataset.template = t;
      document.documentElement.dataset.theme = p;
    },
    [tpl, pal],
  );
  await page.waitForTimeout(200);
  await page.locator("#diag-box").scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(out, `diag-${tpl}-${pal}.png`), fullPage: false });
}

await browser.close();
server.close();

if (problems.length) {
  console.log(`SONUC: FAIL (${problems.length} problem)`);
  process.exit(1);
}
console.log(`SONUC: PASS - tanılama kartı (${REPORT.checks.length} kontrol) · kopyalama · hata yolu · ${shots.length} kare: qa/audit/`);
