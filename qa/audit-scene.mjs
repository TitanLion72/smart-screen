// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   qa/audit-scene.mjs — sahne WebGL katmanı (v3.0)

   Katman DEKORATİF: varlığı hiçbir işlevi değiştirmemeli. Bu araç şunları
   kalıcı denetler:

     1. WebGL varsa `<html>` `webgl-on` alır ve canvas görünür olur.
     2. Yalnız `sahne` şablonunda görünür; diğer üç şablonda opacity 0.
     3. Palet değişince canvas yeniden çizilir (piksel renkleri değişir) —
        yani renk CSS değişkenlerinden okunuyor, gömülü değil.
     4. `prefers-reduced-motion` açıkken tek statik kare (rAF bir kez).
     5. WebGL YOKSA: `webgl-on` eklenmez, canvas görünmez, uygulama çalışır.

   Kareler: qa/audit/scene-*.png
   ═══════════════════════════════════════════════════════════════════ */

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

const STUB = (disableWebgl) => `
  window.__calls = [];
  ${disableWebgl ? `
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (String(type).startsWith("webgl")) return null;
    return orig.call(this, type, ...rest);
  };` : ""}
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    transformCallback: () => 1,
    unregisterCallback: () => undefined,
    invoke: async (cmd, args) => {
      window.__calls.push(cmd);
      if (cmd === "brightness_get") return 55;
      if (cmd === "brightness_set") return args && args.value;
      if (cmd === "is_fullscreen") return false;
      if (cmd === "foreground_exe") return null;
      if (cmd === "foreground_blocked") return null;
      if (cmd === "animations_set") return null;
      if (cmd === "app_version") return "3.0.0-qa";
      if (cmd === "log_lines") return [];
      if (cmd === "log_clear") return null;
      if (cmd === "log_tick") return null;
      if (cmd === "theme_get") return ["ss-dusk", "dark"];
      if (cmd === "theme_set") return null;
      if (cmd === "autostart_get") return true;
      if (cmd === "battery_status") return [80, true];
      if (cmd === "nightlight_status") return null;
      if (cmd === "pref_get") return null;
      if (cmd === "pref_list") return [];
      if (cmd === "stats_summary") return null;
      if (cmd === "monitor_list") return [];
      if (cmd === "hdr_status_all") return [];
      if (cmd === "monitor_color_temp_info") return [];
      if (cmd === "contrast_audit") return [];
      if (cmd === "warmth_auto") return 30;
      if (cmd === "gamma_set_warmth") return null;
      if (cmd === "gamma_restore") return null;
      if (cmd === "gamma_verify_warmth") return [100, 100];
      if (cmd === "decide_target") return ["ss-dusk", "dark", 55];
      if (cmd === "decide_brightness") return args && args.current;
      if (cmd === "decide_level") return "normal";
      if (cmd === "light_sample") return [120, 0.5, "normal", "neutral"];
      if (cmd === "pref_learn") return null;
      if (cmd === "pref_learn_bright") return null;
      if (cmd === "pref_get_bright") return null;
      if (cmd === "plugin:app|version") return "3.0.0-qa";
      if (cmd === "plugin:notification|is_permission_granted") return true;
      if (cmd === "plugin:event|listen") return 1;
      if (cmd === "plugin:event|unlisten") return null;
      if (cmd === "plugin:event|emit") return null;
      throw new Error("bilinmeyen invoke komutu: " + cmd);
    },
  };
`;

async function open(disableWebgl = false, reducedMotion = "no-preference") {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1040, height: 900 },
    reducedMotion,
  });
  const page = await ctx.newPage();
  await page.addInitScript(STUB(disableWebgl));
  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  return { browser, page };
}

const setTemplate = async (page, id) => {
  await page.evaluate((t) => {
    document.documentElement.dataset.template = t;
  }, id);
  await page.waitForTimeout(400);
};

const state = (page) =>
  page.evaluate(() => {
    const c = document.getElementById("hero-webgl");
    const cs = c ? getComputedStyle(c) : null;
    return {
      hasCanvas: !!c,
      webglOn: document.documentElement.classList.contains("webgl-on"),
      opacity: cs ? Number(cs.opacity) : -1,
      width: c ? c.width : 0,
      height: c ? c.height : 0,
    };
  });

/** Canvas'ın ortasından örnek piksel; saydamlık öncesi (premultiplied) RGB. */
const centerPixel = (page) =>
  page.evaluate(() => {
    const c = document.getElementById("hero-webgl");
    if (!c) return null;
    const gl = c.getContext("webgl");
    if (!gl) return null;
    const px = new Uint8Array(4);
    gl.readPixels(
      Math.floor(c.width / 2),
      Math.floor(c.height / 2),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      px,
    );
    // Canvas saydam ve düz alfa: renk doğrudan okunur.
    return { rgb: [px[0], px[1], px[2]], alpha: px[3] };
  });

// ── 1) WebGL var: katman kurulur ────────────────────────────────────
{
  console.log("1) WebGL var — katman kuruluyor");
  const { browser, page } = await open(false);
  await setTemplate(page, "sahne");
  const s = await state(page);
  check(s.hasCanvas, "#hero-webgl canvas DOM'da yok");
  check(s.webglOn, "WebGL kuruldu ama <html> webgl-on almadı");
  check(s.opacity > 0.3, `sahne şablonunda katman görünmüyor (opacity ${s.opacity})`);
  check(s.width > 100 && s.height > 100, `canvas boyutu kurulmamış: ${s.width}x${s.height}`);
  const px = await centerPixel(page);
  check(px && px.rgb.some((v) => v > 12), `canvas simsiyah: ${JSON.stringify(px)}`);
  console.log(
    `   canvas ${s.width}x${s.height} · opacity ${s.opacity} · piksel ${px && px.rgb} ✓`,
  );
  await page.screenshot({ path: join(out, "scene-sahne.png") });

  // ── 2) Diğer şablonlarda görünmez ─────────────────────────────────
  console.log("2) bento/dergi/konsol — katman gizli");
  for (const t of ["bento", "dergi", "konsol"]) {
    await setTemplate(page, t);
    const st = await state(page);
    check(st.opacity === 0, `${t} şablonunda katman görünüyor (opacity ${st.opacity})`);
  }
  console.log("   üç şablonda opacity 0 ✓");

  // ── 3) Palet değişince yeniden çizilir ────────────────────────────
  console.log("3) palet değişimi canvas'ı yeniden çiziyor");
  await setTemplate(page, "sahne");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "obsidyen";
  });
  await page.waitForTimeout(500);
  const dark = await centerPixel(page);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "fildisi";
  });
  await page.waitForTimeout(500);
  const light = await centerPixel(page);
  check(
    dark && light && dark.rgb.some((v) => v > 0) && light.rgb.some((v) => v > 0),
    "palet sonrası piksel okunamadı",
  );
  const diff =
    dark && light
      ? Math.abs(dark.rgb[0] - light.rgb[0]) +
        Math.abs(dark.rgb[1] - light.rgb[1]) +
        Math.abs(dark.rgb[2] - light.rgb[2])
      : 0;
  check(diff > 60, `palet değişti ama canvas aynı kaldı (fark ${diff})`);
  console.log(`   obsidyen ${dark && dark.rgb} → fildisi ${light && light.rgb} (fark ${diff}) ✓`);
  await page.screenshot({ path: join(out, "scene-fildisi.png") });
  await browser.close();
}

// ── 4) reduced-motion: statik kare ──────────────────────────────────
{
  console.log("4) hareket azaltma — tek statik kare");
  const { browser, page } = await open(false, "reduce");
  await setTemplate(page, "sahne");
  await page.waitForTimeout(300);
  const frames = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        const orig = window.requestAnimationFrame;
        window.requestAnimationFrame = (cb) => {
          n++;
          return orig.call(window, cb);
        };
        setTimeout(() => {
          window.requestAnimationFrame = orig;
          resolve(n);
        }, 600);
      }),
  );
  // rAF sayacı sahne kurulduktan sonra bağlandı; 0'a yakın olmalı.
  check(frames <= 2, `hareket azaltmada sürekli çizim var (${frames} rAF)`);
  const s = await state(page);
  check(s.webglOn && s.opacity > 0.3, "hareket azaltmada katman kayboldu (statik kare olmalı)");
  console.log(`   ${frames} rAF · katman görünür ✓`);
  await browser.close();
}

// ── 5) WebGL yok: sessiz geri düşüş ─────────────────────────────────
{
  console.log("5) WebGL yok — sessiz geri düşüş");
  const { browser, page } = await open(true);
  await setTemplate(page, "sahne");
  const s = await state(page);
  check(!s.webglOn, "WebGL yokken webgl-on eklendi (CSS katmanı boş açılır)");
  check(s.opacity === 0, `WebGL yokken canvas görünüyor (opacity ${s.opacity})`);
  // Uygulama çalışmaya devam ediyor: hero metni ve düğmeler yerinde.
  const alive = await page.evaluate(() => ({
    bright: document.getElementById("st-bright")?.textContent ?? "",
    runBtn: !!document.getElementById("now-btn"),
  }));
  check(alive.runBtn, "WebGL yokken düğmeler kayboldu");
  console.log(`   katman kapalı · uygulama ayakta (parlaklık "${alive.bright.trim()}") ✓`);
  await page.screenshot({ path: join(out, "scene-no-webgl.png") });
  await browser.close();
}

server.close();
if (problems.length === 0) {
  console.log("SONUC: PASS — sahne katmanı (WebGL var/yok · palet · hareket azaltma) · 3 kare: qa/audit/");
  process.exit(0);
}
console.log(`SONUC: FAIL (${problems.length} problem)`);
process.exit(1);
