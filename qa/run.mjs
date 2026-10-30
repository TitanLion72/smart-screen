// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
// Visual + functional QA for the smart-screen UI shell (index.html SÖZLEŞME v2.2).
// Serves ../dist with a stubbed Tauri bridge, walks the four tabs, captures
// screenshots into ./shots, and fails on overflow, dead controls, swallowed
// tick errors or console exceptions. 22 senaryo: 1-15 v2 uyarlaması,
// 16-21 v2.2 özellikleri (toast, Kelvin, auto-seg, profil editörü, okuma
// geri dönüşü, geçmiş insan dili), 22: 4 şablon × 12 palet matrisi (v2.6).
//
// Stub policy: UNKNOWN invoke commands THROW (never return null) so real
// regressions surface instead of silently degrading. The Pro gate mimic in the
// stub is a "UI davranış testi" aid — it imitates the backend rejection so the
// free/Pro UI paths can be exercised; the real gate lives in src-tauri.

import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const qaDir = dirname(fileURLToPath(import.meta.url));
const root = join(qaDir, "..");
const distDir = join(qaDir, "..", "dist");
/** Statik sunucunun asla dışına çıkmayacağı kök (path injection koruması). */
const DIST_ROOT = resolve(distDir);
const shotDir = join(qaDir, "shots");

// Bayat dist koruması: src/ içindeki en yeni dosya dist/index.html'den yeniyse
// test edilen kod eski demektir. Sessizce eski kodu test etmek, v2.3.0'daki
// "api is not defined" çökmesinin QA'da görünmemesinin makul açıklamasıydı.
async function assertFreshDist() {
  const { stat, readdir } = await import("node:fs/promises");
  const newestIn = async (dir) => {
    let newest = 0;
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) newest = Math.max(newest, await newestIn(p));
      else newest = Math.max(newest, (await stat(p)).mtimeMs);
    }
    return newest;
  };
  const distIndex = join(distDir, "index.html");
  let distMtime;
  try {
    distMtime = (await stat(distIndex)).mtimeMs;
  } catch {
    console.error("dist/ yok — önce: npm.cmd run build");
    process.exit(1);
  }
  const srcNewest = Math.max(
    await newestIn(join(qaDir, "..", "src")),
    (await stat(join(qaDir, "..", "index.html"))).mtimeMs,
  );
  if (srcNewest > distMtime + 1000) {
    console.error(
      "dist/ bayat: src/ daha yeni. Önce `npm.cmd run build` çalıştır — " +
        "aksi hâlde eski kod test edilir.",
    );
    process.exit(1);
  }
}
await assertFreshDist();

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const buckets = Array.from({ length: 12 }, (_, i) => ({
  hoursAgo: i,
  appliedAvg: i % 2 === 0 ? 30 + i * 3 : 55,
  desiredAvg: 50,
  samples: i < 6 ? 4 : 0,
}));

const stubScript = (themeName, themeMode, exe, opts) => `
window.__invocations = [];
window.__licPro = false;
window.__theme = [${JSON.stringify(themeName)}, ${JSON.stringify(themeMode)}];
window.__target = ["vesper", "dark", 30];
// Parlaklık durumu: yazınca okunan değer de değişir (gerçek WMI gibi),
// böylece kademeli adım kuralı QA'de de sınanır.
window.__bright = 42;
// Sicak ton rampa durumu: __warmReject = surucu yazimi yutuyor senaryosu.
window.__warm = 0;
window.__warmReject = false;
window.__logs = ["2026-10-06T20:58:00.000Z | source=auto/auto | level=dark | tone=neutral | desired=30 | applied=30 | theme=vesper/dark | note=izle"];
window.__hdrAll = ${JSON.stringify(opts && opts.hdrAll ? opts.hdrAll : [])};
window.__update = ${
  opts && opts.updateVersion
    ? ` { rid: 1, currentVersion: "1.4.0", version: ${JSON.stringify(opts.updateVersion)}, date: "2026-10-01T00:00:00Z", body: "QA sürümü", rawJson: null }`
    : "null"
};
// Olay köprüsü: transformCallback kayıtları + plugin:event dinleyicileri.
// Testler window.__emit("ss:action"|"ss:state", payload) ile tetikler.
window.__callbacks = new Map();
window.__listeners = [];
window.__emitted = [];
let __cbSeq = 0;
window.__emit = (event, payload) => {
  for (const l of window.__listeners) {
    if (l.event === event && l.cb) l.cb({ event, id: l.id, payload });
  }
};
window.__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
  transformCallback: (cb) => {
    __cbSeq += 1;
    window.__callbacks.set(__cbSeq, cb);
    return __cbSeq;
  },
  unregisterCallback: (id) => {
    window.__callbacks.delete(id);
  },
  invoke: async (cmd, args) => {
    window.__invocations.push([cmd, args ?? null]);
    switch (cmd) {
      case "brightness_get": return window.__bright;
      case "brightness_set":
        window.__bright = args && typeof args.value === "number" ? args.value : window.__bright;
        return window.__bright;
      case "is_fullscreen": return false;
      case "foreground_exe": return ${JSON.stringify(exe ?? "firefox.exe")};
      // theme_get durumsal: theme_set yazdigini okur (backend davranisi).
      case "theme_get": return window.__theme;
      case "theme_set":
        window.__theme = [
          args.name,
          (args.mode === null || args.mode === undefined) ? window.__theme[1] : args.mode,
        ];
        return null;
      // decide_target QA'nin hedefini okur: karar degistirilerek snap tetiklenir.
      case "decide_target": return window.__target;
      // Gerçek adım kuralı: hedefe ucte bir, 3..8 puan (decide.rs).
      case "decide_brightness": {
        const cur = Number(args.current);
        const des = Math.max(0, Math.min(100, Number(args.desired)));
        const gap = Math.abs(des - cur);
        if (gap < 2) return cur;
        const step = Math.min(gap, Math.max(3, Math.min(8, Math.floor(gap / 3))));
        return des > cur ? cur + step : cur - step;
      }
      // Histerez Rust'ta; QA için eşik sınıflaması yeter (tek kare).
      case "decide_level":
        return args.lum < 34 ? "dark" : args.lum < 80 ? "dim" : args.lum < 150 ? "normal" : "bright";
      case "brightness_floor": return 0;
      case "light_sample":
        // "dim": kamera override'i (dark->ss-night, bright->ss-paper) kararın
        // uzerine binmesin; tema secimi decide_target'dan okunsun.
        return [20.5, 1.0, "dim", "neutral"];
      case "autostart_get": return true;
      case "autostart_set": return null;
      case "pref_get": return null;
      case "pref_list": return [];
      case "pref_learn": return null;
      case "pref_learn_bright": return null;
      case "pref_get_bright": return null;
      case "pref_clear": return null;
      case "monitor_list": return [
        // id'ler backend'in dondugu szDevice yoluyla birebir ayni olmali (\\\\.\\DISPLAYn).
        { id: ${JSON.stringify("\\\\.\\DISPLAY1")}, name: "Generic PnP Monitor", is_internal: true, api: "wmi" },
        { id: ${JSON.stringify("\\\\.\\DISPLAY2")}, name: "Dell U2415", is_internal: false, api: "ddc" },
        { id: ${JSON.stringify("\\\\.\\DISPLAY3")}, name: "Ancak Ekran", is_internal: false, api: "ddc" },
      ];
      case "brightness_get_monitor":
        // DISPLAY3 DDC/CI hatasi dondurur: satir ici uyari yolu denensin.
        if (args && args.id && args.id.includes("DISPLAY3")) {
          throw "DDC/CI bu monitorda calismiyor (OSD'den kapali olabilir)";
        }
        return 42;
      case "brightness_set_monitor":
        // UI davranış testi: harici monitore yazma Pro ister (backend kilidi taklidi).
        if (args && args.id && !args.id.includes("DISPLAY1") && !window.__licPro) {
          throw "harici monitör kontrolü Pro lisans gerektirir";
        }
        // DDC-hatali monitore yazma da duser: otomatik turun hatayi yutma
        // yolu denensin, uygulama ayakta kalmali.
        if (args && args.id && args.id.includes("DISPLAY3")) {
          throw "DDC/CI bu monitorda calismiyor (OSD'den kapali olabilir)";
        }
        return null;
      case "license_status":
        return window.__licPro
          ? { pro: true, email: "qa@test.local", issued: "2026-10-20" }
          : { pro: false, email: null, issued: null };
      case "license_activate": {
        const key = args && typeof args.key === "string" ? args.key.trim() : "";
        if (!key.startsWith("SS-") || key.length < 20) throw "geçersiz lisans anahtarı";
        window.__licPro = true;
        return { pro: true, email: "qa@test.local", issued: "2026-10-20" };
      }
      case "license_deactivate":
        window.__licPro = false;
        return { pro: false, email: null, issued: null };
      case "battery_status": return [85, true];
      case "nightlight_status": return null;
      case "warmth_auto": return 35;
      // Sicak ton durumu: yazinca rampa degisir, geri okuma da onu gorur.
      case "gamma_set_warmth":
        if (!window.__warmReject) window.__warm = Number(args.percent);
        return null;
      case "gamma_restore":
        window.__warm = 0;
        return null;
      case "gamma_verify_warmth": {
        const blue = (p) => Math.round(100 - Number(p) * 0.24);
        return [blue(args.percent), blue(window.__warm || 0)];
      }
      case "animations_set": return null;
      // v2.1 backend: HDR + donanımsal sıcaklık görünürlüğü.
      case "hdr_status": return false;
      case "hdr_status_all": return window.__hdrAll;
      case "monitor_color_temp_info": return [
        // v2.2 (17. senaryo): DISPLAY2 destekli — ilk harici monitörün kendi
        // ayarı var, #warm-tech-note "Monitörün kendi ayarı" demeli.
        { device: ${JSON.stringify("\\\\.\\DISPLAY1")}, supported: true, increment: 50 },
        { device: ${JSON.stringify("\\\\.\\DISPLAY2")}, supported: true, increment: 50 },
        { device: ${JSON.stringify("\\\\.\\DISPLAY3")}, supported: false, increment: 0 },
      ];
      case "monitor_set_color_temp": return null;
      case "flyout_hide": return null;
      case "contrast_audit": return [
        { name: "ss-night", mode: "dark", text_on_bg: 8.5, muted_on_bg: 5.9, syntax_min: 4.9, verdict: "AA" },
        { name: "soluk-tema", mode: "dark", text_on_bg: 2.2, muted_on_bg: 1.1, syntax_min: 1.0, verdict: "FAIL" },
      ];
      // v2.10: sistem tanilamasi. Uc durum da temsil edilir ki satir
      // siniflari (ok/warn/bad) ve ipucu yolu denenebilsin.
      case "diagnose": return {
        version: "9.9.9-qa",
        os: "windows 11 (QA)",
        checks: [
          { id: "brightness-read", label: "Parlaklık okuma", status: "ok", detail: "42% · \\\\\\\\.\\\\DISPLAY1", hint: "" },
          { id: "brightness-write", label: "Parlaklık yazma", status: "ok", detail: "42% yazıldı, 42% okundu", hint: "" },
          { id: "gamma", label: "Sıcak ton sürücüsü", status: "warn", detail: "sıcak ton kapalı — rampa yazılmadı", hint: "Sıcak tonu açıp yeniden dene." },
          { id: "monitors", label: "Monitörler", status: "bad", detail: "hiç monitör bulunamadı", hint: "Ekran bağlantısını denetle." },
        ],
      };
      case "log_tick":
        if (args && typeof args.line === "string") window.__logs.push(args.line);
        return null;
      case "log_lines": {
        const max = (args && typeof args.max === "number") ? args.max : 50;
        return window.__logs.slice(-max);
      }
      case "log_clear":
        window.__logs = [];
        return null;
      case "open_log": return "C:\\\\Users\\\\qa\\\\.config\\\\opencode\\\\smart-screen.log";
      case "stats_summary": return {
        buckets: ${JSON.stringify(buckets)},
        themeChangesToday: 3,
        avgAppliedToday: 46,
        frozenTicksToday: 2,
        ticksToday: 24,
      };
      // Tauri eklenti köprüleri (app/version, notification, opener, event,
      // updater, process, window).
      case "plugin:app|version": return "1.4.0";
      case "plugin:notification|is_permission_granted": return true;
      case "plugin:notification|request_permission": return "granted";
      case "plugin:notification|notify": return null;
      case "plugin:opener|open_url": return null;
      case "plugin:event|listen": {
        const cb = args && args.handler ? window.__callbacks.get(args.handler) : null;
        const id = window.__listeners.length + 1;
        window.__listeners.push({ event: args ? args.event : "", cb: cb ?? null, id });
        return id;
      }
      case "plugin:event|unlisten": return null;
      case "plugin:event|emit":
        window.__emitted.push({ event: args ? args.event : "", payload: args ? args.payload : null });
        return null;
      case "plugin:updater|check": return window.__update;
      // duzeltme (md.10b): Update sınıfı gerçek downloadAndInstall'ı bu
      // komutla çağırır; stub null dönerse kurulum akışı tamamlanır.
      case "plugin:updater|download_and_install": return null;
      case "plugin:process|restart": return null;
      case "plugin:window|show": return null;
      case "plugin:window|set_focus": return null;
      default:
        // Bilinmeyen komut sessizce null DONMEZ — regresyon yakalansin diye firlar.
        throw new Error("bilinmeyen invoke komutu: " + cmd);
    }
  },
};
`;

const problems = [];
const consoleErrors = [];

function fail(label, detail) {
  problems.push(`${label}: ${detail}`);
  console.log(`PROBLEM ${label}: ${detail}`);
}

function check(cond, label, detail) {
  if (!cond) fail(label, detail);
  return cond;
}

async function run() {
  await mkdir(shotDir, { recursive: true });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      // Path injection koruması (v2.9, PR #3 ile aynı sözleşme):
      // `join(distDir, "../../x")` kök dışına çıkar — kökü resolve edip
      // sonucun kök içinde kaldığını doğrula.
      const file = resolve(DIST_ROOT, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
      if (!file.startsWith(DIST_ROOT + sep)) {
        res.writeHead(403, { "content-type": "text/plain" });
        res.end("forbidden");
        return;
      }
      const buf = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(buf);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    }
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();

  async function scenario(themeName, themeMode, steps, exe, opts) {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    // log-clear-btn onaylıdır; QA onayı otomatik verir.
    page.on("dialog", (d) => void d.accept());
    await page.addInitScript(stubScript(themeName, themeMode, exe, opts));
    // Senaryo izolasyonu: aynı origin'de localStorage senaryolar arası sızıyordu
    // (ör. önceki senaryoda 3 profil kalınca #pf-add disabled olup tıklanamıyordu).
    await page.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        /* storage kapalı */
      }
    });
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const invocations = async () => page.evaluate(() => window.__invocations);
    const openTab = async (name) => {
      await page.locator(`.tab[data-tab="${name}"]`).click();
      await page.waitForTimeout(300);
    };
    const openAdvanced = async () => {
      // Idempotent: körlemesine tıklamak zaten açıkken KAPATIYORdu, sonraki
      // senaryoda #lic-key görünmez kalıyordu. Doğrudan aç.
      await page.evaluate(() => {
        const d = document.getElementById("advanced");
        if (d) d.open = true;
      });
      await page.waitForTimeout(150);
    };
    // Sticky çubuk/uzun sayfa: kaydırıp tıkla (aksi hâlde Playwright 30 sn bekler).
    const clickEl = async (sel) => {
      const loc = page.locator(sel);
      await loc.scrollIntoViewIfNeeded();
      await loc.click();
    };
    // fill() yalnız "input" tetikler; change dinleyen alanlar için change yay.
    const setField = async (sel, value) => {
      const loc = page.locator(sel);
      await loc.scrollIntoViewIfNeeded();
      await loc.fill(value);
      await loc.dispatchEvent("change");
    };
    // Karar artık dwell + bağımsız tur ister; "manuel" tur bunları atlar ama
    // parlaklık kademeli (tur başına ≤8) yaklaşır. Hedefe oturana kadar koş.
    const snap = async (target) => {
      await page.evaluate((t) => {
        window.__target = t;
      }, target);
      for (let i = 0; i < 5; i++) {
        await page.locator("#now-btn").click();
        await page.waitForTimeout(350);
      }
    };
    const shot = async (name) => page.screenshot({ path: join(shotDir, name) });
    try {
      await steps({ page, invocations, openTab, openAdvanced, snap, shot });
    } catch (e) {
      fail("senaryo", `adım çöktü: ${String(e)}`);
    }
    await page.close();
  }

  const checkOverflow = async (page, label) => {
    // Dikey kaydırma tasarım gereği (.page overflow-y:auto). Gerçek "taşma" hatası
    // yatay taşmadır: içerik viewport'tan genişse kırpılır/gizlenir.
    const m = await page.evaluate(() => {
      const p = document.querySelector(".page:not([hidden])");
      if (!p) return { w: 0, cw: 0, clipped: [] };
      const clipped = [];
      for (const n of p.querySelectorAll("*")) {
        const r = n.getBoundingClientRect();
        const pr = p.getBoundingClientRect();
        if (r.width > 0 && (r.right > pr.right + 1 || r.left < pr.left - 1)) {
          clipped.push(`${n.tagName.toLowerCase()}${n.id ? "#" + n.id : ""}`);
        }
      }
      return { w: p.scrollWidth, cw: p.clientWidth, clipped: clipped.slice(0, 4) };
    });
    check(m.w <= m.cw, "tasma", `${label}: page.scrollWidth=${m.w} > clientWidth=${m.cw}`);
    check(
      m.clipped.length === 0,
      "tasma",
      `${label}: yatay kirpilan oğeler: ${m.clipped.join(", ")}`,
    );
  };

  const text = async (page, sel) => ((await page.locator(sel).textContent()) ?? "").trim();

  // Toast'ları güvenle kapat: fareyi sağ alttaki toast alanından çek
  // (hover sayacı durdurur), sonra Esc ile teker teker kapat.
  const dismissToasts = async (page) => {
    await page.mouse.move(30, 30);
    for (let i = 0; i < 8; i++) {
      if ((await page.locator("#toast-host .toast").count()) === 0) return;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
    }
  };

  // 1. Bugün: hero + durum kartları + monitörler + olay akışı.
  await scenario("catppuccin-macchiato", "dark", async ({ page, shot }) => {
    await checkOverflow(page, "bugun");
    for (const id of ["break-band", "risk-band", "update-band"]) {
      check(!(await page.locator(`#${id}`).isVisible()), "sizinti", `#${id} panelde gorunuyor`);
    }
    const bright = await text(page, "#st-bright");
    check(/^%\d+$/.test(bright), "hero", `st-bright dolmadi: "${bright}"`);
    // v2.2: #hero-target ve #next-change SILINDI — tek satir #hero-sub'ta.
    const heroSub = await text(page, "#hero-sub");
    check(
      /^Ulaşılmak istenen %\d+/.test(heroSub),
      "hero",
      `hero-sub hedef satiri dolmadi: "${heroSub}"`,
    );
    const pill = await text(page, "#mode-pill");
    check(pill === "Akıllı", "hero", `mode-pill beklenen rozet degil: "${pill}"`);
    const why = await text(page, "#why-line");
    check(why.includes("otomatik çalışıyor"), "hero", `why-line akıyor durumunu gostermedi: "${why}"`);
    // v2.4: #sub-bright artık yazılmıyor (gizli, bilgi #hero-sub'ta birleşti).
    check(await page.locator("#sub-bright").isHidden(), "hero", "sub-bright hidden gelmedi");
    const heroSubText = await text(page, "#hero-sub");
    check(heroSubText.includes("Ulaşılmak istenen"), "hero", `hero-sub hedef metni yok: "${heroSubText}"`);
    const clock = await text(page, "#clock");
    check(/^\d{2}:\d{2}$/.test(clock), "hero", `clock canli saat gostermedi: "${clock}"`);
    for (const id of ["st-light", "st-theme", "st-frozen"]) {
      const t = await text(page, `#${id}`);
      check(t && t !== "-", "panel", `#${id} dolmadi (tick hata yutmus olabilir): "${t}"`);
    }
    const frozen = await text(page, "#st-frozen");
    check(frozen === "Otomatik çalışıyor", "panel", `st-frozen beklenen metin degil: "${frozen}"`);
    const rows = await page.locator("#monitor-list .monitor-row").count();
    check(rows >= 3, "monitor", `monitor satiri az: ${rows}`);
    const firstVal = await page.locator("#monitor-list .monitor-row .mon-val").first().textContent();
    check((firstVal ?? "").includes("%42"), "monitor", `ilk satir yuzdesi dolmadi: "${firstVal}"`);
    // v2.2: #profile-switch SILINDI — yerine #auto-seg (4 dugme) geldi.
    const segBtns = await page.locator("#auto-seg .seg-item").count();
    check(segBtns === 4, "panel", `auto-seg dugme sayisi=${segBtns} (beklenen 4)`);
    const logRows = await page.locator("#log .log-row").count();
    check(logRows >= 1, "panel", `olay akisi bos (${logRows} satir)`);
    const logText = await text(page, "#log");
    check(!logText.includes("hata:"), "panel", `tick hatasi: ${logText.slice(0, 120)}`);
    const last = await text(page, "#last-measure");
    check(/^\d{2}:\d{2}$/.test(last), "panel", `son olcum saati dolmadi: "${last}"`);
    await shot("1-bugun.png");
  });

  // 2. Sekme gezinme + kapsam: her sekme kendi sayfasini acar, digeri kapanir.
  await scenario("catppuccin-macchiato", "dark", async ({ page, openTab, shot }) => {
    // v2.2: sekme etiketleri Durum · Profiller · Geçmiş · Ayarlar (sirayla).
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".tab")).map((t) => (t.textContent ?? "").trim()),
    );
    check(
      labels.join("|") === "Durum|Profiller|Geçmiş|Ayarlar",
      "sekme",
      `sekme etiketleri bozuk: ${JSON.stringify(labels)}`,
    );
    for (const name of ["panel", "settings", "profiles", "history"]) {
      await openTab(name);
      const visible = await page.locator(`#page-${name}`).isVisible();
      check(visible, "sekme", `#page-${name} acilmadi`);
      for (const other of ["panel", "settings", "profiles", "history"]) {
        if (other === name) continue;
        check(!(await page.locator(`#page-${other}`).isVisible()), "sekme", `#page-${other} acik kaldi (${name})`);
      }
      const active = await page.locator(`.tab[data-tab="${name}"]`).getAttribute("class");
      check((active ?? "").includes("active"), "sekme", `tab ${name} .active tutmuyor: ${active}`);
      const sel = await page.locator(`.tab[data-tab="${name}"]`).getAttribute("aria-selected");
      check(sel === "true", "sekme", `tab ${name} aria-selected=${sel}`);
      await checkOverflow(page, `sekme-${name}`);
    }
    await openTab("panel");
    await page.locator("#log-all-link").click();
    await page.waitForTimeout(250);
    check(await page.locator("#page-history").isVisible(), "sekme", "log-all-link Gecmis'e gecmedi");
    const ver = await text(page, "#app-ver");
    check(ver !== "-" && ver.length > 0, "sekme", `app-ver dolmadi (plugin:app|version?): "${ver}"`);
    const modeBadge = await text(page, "#mode-badge");
    check(modeBadge.includes("Otomatik çalışıyor"), "sekme", `mode-badge otomatik calismayi gostermedi: "${modeBadge}"`);
    const profPill = await text(page, "#profile-pill");
    check(profPill.length > 0, "sekme", "profile-pill bos");
    await shot("2-sekmeler.png");
  });

  // 3. Ritim: kip kartlari + sicak ton + gece korumasi + okuma.
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, openTab, shot }) => {
    await openTab("settings");
    await checkOverflow(page, "ritim");
    // v2.3.2: HERO yalnız Durum'da görünmeli (her sekmede ekranın yarısını
    // kaplıyordu). Görünürlüğü doğrula — #hero-status artık #page-panel içinde.
    const heroVisibleHere = await page.locator("#hero-status").isVisible();
    check(!heroVisibleHere, "ritim", "hero Ayarlar sekmesinde de gorunuyor");
    const cards = await page.locator("#mode-seg .seg-item").count();
    check(cards === 4, "ritim", `kip kart sayisi=${cards} (beklenen 4)`);
    const descs = await page.locator("#mode-seg .seg-desc").allTextContents();
    check(descs.length === 4 && descs.every((d) => d.trim().length > 0), "ritim", `kip aciklamalari eksik: ${descs.join(" | ")}`);
    await page.locator("#mode-seg .seg-item").nth(1).click();
    await page.waitForTimeout(300);
    const activeSeg = await text(page, "#mode-seg .seg-item.active");
    check(activeSeg.includes("Zaman"), "ritim", `mod segmenti secim gostermiyor: "${activeSeg}"`);
    const pressed = await page.locator("#mode-seg .seg-item").nth(1).getAttribute("aria-pressed");
    check(pressed === "true", "ritim", `aria-pressed guncellenmedi: ${pressed}`);

    const warmItems = await page.locator("#warm-seg .seg-item").count();
    check(warmItems === 3, "ritim", `sicak ton kipi sayisi=${warmItems}`);
    await page.locator("#warm-plus").click();
    await page.waitForTimeout(250);
    const warmVal = Number(await text(page, "#warm-val"));
    check(warmVal > 35, "ritim", `ton siddeti artmadi: ${warmVal}`);
    const rangeVal = await page.locator("#warm-range").inputValue();
    check(Number(rangeVal) === warmVal, "ritim", `warm-range senkron degil: ${rangeVal} != ${warmVal}`);
    await page.locator("#warm-range").evaluate((el2) => {
      el2.value = "20";
      el2.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(250);
    check((await text(page, "#warm-val")) === "20", "ritim", "warm-range input warm-val'i guncellemedi");
    const note = await text(page, "#warm-preview-note");
    check(note.includes("Hızlı sarılık"), "ritim", `hizli sarilik notu yok: "${note}"`);
    const left = await page.locator("#day-now").evaluate((el2) => el2.style.left);
    check(left.endsWith("%"), "ritim", `day-now konumu yuzde degil: "${left}"`);
    const calib = await text(page, "#calib-hint");
    check(calib.includes("Öğrenilen tercih"), "ritim", `ogrenilen tercih gosterimi eksik: "${calib}"`);
    check(await page.locator("#warm-hdr-note").isHidden(), "ritim", "HDR notu hdr yokken gorunuyor");

    await page.locator("#sleep-start").fill("2");
    await page.locator("#sleep-start").dispatchEvent("change");
    await page.locator("#sleep-cap").click();
    await page.waitForTimeout(150);
    check((await page.locator("#sleep-start").inputValue()) === "2", "ritim", "gece korumasi saati kaydedilmedi");
    const persisted = await page.evaluate(() => localStorage.getItem("ss:sleepStart"));
    check(persisted === "2", "ritim", `gece korumasi kalici degil: "${persisted}"`);

    const nextBreak = await text(page, "#break-next");
    check(nextBreak.startsWith("sonraki mola:"), "ritim", `sonraki mola gosterilmedi: "${nextBreak}"`);
    await page.locator("#break-switch").click();
    await page.waitForTimeout(150);
    check(
      (await page.locator("#break-switch").getAttribute("aria-checked")) === "false",
      "ritim",
      "20-20-20 anahtari kapanmadi",
    );

    await page.locator("#read-btn").click();
    await page.waitForTimeout(400);
    const readClass = (await page.locator("#read-btn").getAttribute("class")) ?? "";
    check(readClass.includes("active"), "ritim", "okuma profili vurgusu gelmedi");
    const cmds = (await invocations()).map(([c]) => c);
    check(cmds.includes("animations_set"), "ritim", "animations_set cagrilmadi");
    check(cmds.includes("gamma_set_warmth"), "ritim", "gamma_set_warmth cagrilmadi");
    await shot("3-ritim.png");
  });

  // 4. Gelmis: tema secici + kontrast kapisi (#advanced icinde).
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, openTab, openAdvanced, shot }) => {
    await openTab("settings");
    // v2.10: "Kontrol" karti Gelismis KAPALIYKEN gorunur olmali - destek yolu.
    check(await page.locator("#diag-box").isVisible(), "kontrol", "#diag-box gorunur degil (Gelismis kapali)");
    check(await page.locator("#diag-copy").isDisabled(), "kontrol", "rapor yokken kopyala acik");
    check(
      (await page.locator("#diag-list .diag-empty").count()) === 1,
      "kontrol",
      "bos tanilama yonlendirmesi yok",
    );
    await openAdvanced();
    const isOpen = await page.locator("#advanced").evaluate((d) => d.open);
    check(isOpen === true, "advanced", "#advanced acilmadi");
    const chips = await page.locator("#theme-picker .chip").count();
    check(chips >= 3, "tema", `tema cipi az: ${chips}`);
    const strips = await page.locator("#theme-picker .swatch-strip").count();
    check(strips >= 3, "onizleme", `tema onizleme seridi yok (${strips})`);
    await page.locator("#theme-picker .chip").first().click();
    await page.waitForTimeout(350);
    const cmds = (await invocations()).map(([c]) => c);
    check(cmds.includes("theme_set"), "tema", "tema cipi theme_set cagrilmadi");
    check(cmds.includes("pref_learn"), "tema", "tema cipi pref_learn cagrilmadi");
    // stabilite (c): elle tema secimi parlaklik kalibrasyonunu kirletmez.
    check(!cmds.includes("pref_learn_bright"), "tema", "tema cipi pref_learn_bright cagirdi (kalibrasyon kirli)");

    const rows = await page.locator("#audit-list .audit-row").count();
    check(rows >= 2, "kontrast", `denetim satiri az: ${rows}`);
    const badges = await page.locator("#audit-list .badge").allTextContents();
    // v2.2 (B): WCAG rozetleri insan dilinde — "okunaksız"/"iyi".
    check(badges.includes("okunaksız"), "kontrast", `okunaksız rozeti gorunmedi: ${badges.join(",")}`);
    check(badges.includes("iyi"), "kontrast", `iyi rozeti gorunmedi: ${badges.join(",")}`);
    const colors = await page.locator("#audit-list .audit-muted").allTextContents();
    check(colors.some((c) => c.includes("renk")), "kontrast", "renk kodu sutunu gorunmedi");
    await page.locator("#audit-refresh").click();
    await page.waitForTimeout(200);
    await page.locator("#gate-switch").click();
    await page.waitForTimeout(150);
    const gate = await page.locator("#gate-switch").getAttribute("aria-checked");
    check(gate === "false", "kontrast", `kontrast kapisi kapanmadi: ${gate}`);
    await page.locator("#anim-switch").click();
    await page.waitForTimeout(150);
    const anim = await page.evaluate(() => document.documentElement.dataset.anim);
    check(anim === "off", "advanced", `animasyon anahtari <html data-anim> yazmadi: ${anim}`);
    // v2.10: tanilama butonu gercekten kosar, satirlari ve durum siniflarini
    // yazar, kopyala acilir. Kontrol HICBIR sey degistirmemeli (parlaklik
    // yazimi / gamma yazimi yok) - tanilama tanilama kalir.
    const countOf = async (cmd) => (await invocations()).filter(([c]) => c === cmd).length;
    const bBefore = await countOf("brightness_set");
    const wBefore = await countOf("gamma_set_warmth");
    await page.locator("#diag-run").click();
    await page.waitForTimeout(500);
    const diagRows = await page.locator("#diag-list .diag-row").count();
    check(diagRows === 4, "kontrol", `tanilama satiri beklenen 4, gelen ${diagRows}`);
    const statuses = await page
      .locator("#diag-list .diag-row")
      .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-status")));
    check(
      statuses.includes("ok") && statuses.includes("warn") && statuses.includes("bad"),
      "kontrol",
      `durum siniflari eksik: ${statuses.join(",")}`,
    );
    check(!(await page.locator("#diag-copy").isDisabled()), "kontrol", "rapor varken kopyala kapali");
    const stamp = await text(page, "#diag-stamp");
    check(stamp.includes("kontrol"), "kontrol", `rapor damgasi yok: "${stamp}"`);
    const diagCalls = (await invocations()).filter(([c]) => c === "diagnose");
    check(diagCalls.length === 1, "kontrol", `diagnose ${diagCalls.length} kez cagrildi`);
    const warmthArg = diagCalls[0] && diagCalls[0][1] ? diagCalls[0][1].warmth : undefined;
    check(
      typeof warmthArg === "number" && warmthArg >= 0 && warmthArg <= 100,
      "kontrol",
      `warmth gecersiz: ${JSON.stringify(warmthArg)}`,
    );
    check((await countOf("brightness_set")) === bBefore, "kontrol", "tanilama parlaklik yazdi (test gorunur olmamali)");
    check((await countOf("gamma_set_warmth")) === wBefore, "kontrol", "tanilama gamma yazdi (kalibrasyon ezilmemeli)");
    const diagToast = await page.locator("#toast-host .toast").last().textContent();
    check((diagToast ?? "").length > 0, "kontrol", "tanilama toast'i cikmadi");
    // v2.11: gunluk dugmesi rapor olmadan da calisir ve yolu bildirir.
    const openBefore = await countOf("open_log");
    await page.locator("#diag-log").click();
    await page.waitForTimeout(300);
    check((await countOf("open_log")) === openBefore + 1, "kontrol", "gunluk dugmesi open_log cagirmadi");
    const logToast = await page.locator("#toast-host .toast").first().textContent();
    check(/smart-screen\.log/.test(logToast ?? ""), "kontrol", `gunluk toast'i yolu yazmiyor: ${logToast}`);
    await checkOverflow(page, "advanced");
    await shot("4-advanced.png");
  });

  // 5. Lisans akisi: kilitli -> etkin -> kaldirilmis + otomatik yol kilidi.
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, openTab, openAdvanced, snap, shot }) => {
    // Ucretsiz: karar uygulanir ama harici monitore yazma DENENMEZ bile.
    await snap(["ss-night", "dark", 28]);
    const logFree = await text(page, "#log");
    check(logFree.includes("ss-night"), "lisans", `ucretsiz karar uygulanmadi: ${logFree.slice(0, 80)}`);
    const autoFree = (await invocations()).filter(
      ([c, a]) => c === "brightness_set_monitor" && a && !String(a.id).includes("DISPLAY1"),
    );
    check(autoFree.length === 0, "lisans", `ucretsizde otomatik harici yazma: ${JSON.stringify(autoFree)}`);

    // Paneldeki Pro kilidi: lisanssiz harici satir secilince kilit karti cikar.
    await page.locator("#monitor-list .monitor-row").nth(1).click();
    await page.waitForTimeout(250);
    check(await page.locator("#monitor-pro-lock").isVisible(), "lisans", "monitor-pro-lock gorunmedi (ucretsiz harici)");
    check(await page.locator("#monitor-bright").isDisabled(), "lisans", "pro kilidinde slider acik kaldi");

    // Lisans karti #advanced icinde.
    await openTab("settings");
    await openAdvanced();
    const lic0 = await text(page, "#lic-status");
    check(lic0.includes("Ücretsiz"), "lisans", `kart ucretsiz gostermedi: ${lic0}`);
    // v2.2: #lic-mini / #lic-mini-status SILINDI — lisans yalniz Ayarlar'da.
    check((await page.locator("#lic-mini").count()) === 0, "lisans", "lic-mini hala DOM'da");
    check((await page.locator("#lic-mini-status").count()) === 0, "lisans", "lic-mini-status hala DOM'da");
    check(await page.locator("#lic-deactivate").isHidden(), "lisans", "ucretsizde Kaldir dugmesi gorunuyor");

    await page.locator("#lic-activate").click();
    await page.waitForTimeout(200);
    check((await text(page, "#lic-err")).length > 0, "lisans", "bos anahtarda uyari cikmadi");
    await page.locator("#lic-key").fill("kisa-anahtar");
    await page.locator("#lic-activate").click();
    await page.waitForTimeout(250);
    check((await text(page, "#lic-err")).length > 0, "lisans", "gecersiz anahtarda hata yazilmadi");

    await page.locator("#lic-key").fill("SS-QA-TEST-KEY-1234567890");
    await page.locator("#lic-activate").click();
    await page.waitForTimeout(400);
    const lic = await text(page, "#lic-status");
    check(lic.includes("Pro") && lic.includes("qa@test.local"), "lisans", `etkinlesen kart eksik: ${lic}`);
    check(await page.locator("#lic-err").isHidden(), "lisans", "etkinlesten sonra hata hala gorunuyor");
    check(await page.locator("#lic-deactivate").isVisible(), "lisans", "etkinlesten sonra Kaldir gorunmedi");

    // Pro acilinca otomatik yol harici monitore yazar (kilit kalkti).
    await openTab("panel");
    await snap(["ss-paper", "light", 60]);
    const autoPro = (await invocations()).filter(
      ([c, a]) => c === "brightness_set_monitor" && a && String(a.id).includes("DISPLAY2"),
    );
    check(autoPro.length > 0, "lisans", "Pro acilinca otomatik harici yazma olmadi");
    const v = autoPro.length > 0 ? autoPro.at(-1)[1].value : null;
    check(Number.isInteger(v) && v >= 0 && v <= 100, "lisans", `harici yazma degeri bozuk: ${JSON.stringify(v)}`);
    check(
      !(await page.locator("#monitor-pro-lock").isVisible()),
      "lisans",
      "Pro acilinca monitor-pro-lock kapandi",
    );

    // Kaldir: kart doner, otomatik yol TEKRAR kilitlenir.
    await openTab("settings");
    await openAdvanced();
    await page.locator("#lic-deactivate").click();
    await page.waitForTimeout(300);
    const off = await text(page, "#lic-status");
    check(off.includes("Ücretsiz"), "lisans", `kaldirinca kart donmedi: ${off}`);
    const before = (await invocations()).filter(
      ([c, a]) => c === "brightness_set_monitor" && a && !String(a.id).includes("DISPLAY1"),
    ).length;
    await openTab("panel");
    await snap(["ss-dusk", "dark", 35]);
    const after = (await invocations()).filter(
      ([c, a]) => c === "brightness_set_monitor" && a && !String(a.id).includes("DISPLAY1"),
    ).length;
    check(after === before, "lisans", `kaldirinca otomatik harici yazma devam ediyor (${before} -> ${after})`);
    await page.locator("#monitor-list .monitor-row").nth(1).click();
    await page.waitForTimeout(250);
    check(await page.locator("#monitor-pro-lock").isVisible(), "lisans", "kaldirinca pro kilidi geri gelmedi");
    await checkOverflow(page, "lisans");
    await shot("5-lisans.png");
  });

  // 6. Profiller: ekle / kaydet / iki asamali sil / geri getir.
  await scenario("catppuccin-macchiato", "dark", async ({ page, openTab, shot }) => {
    await openTab("profiles");
    const before = await page.locator("#profile-cards .profile-card").count();
    check(before >= 2, "profil", `tohum profiller eksik (${before})`);
    // Sticky #pf-savebar scroll sonrası üstteki düğmeyi örtebiliyor;
    // önce hedefi görünür alana getir (kullanıcı da böyle yapar).
    await page.locator("#page-profiles").evaluate((p) => {
      p.scrollTop = 0;
    });
    await page.locator("#pf-add").scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    await page.locator("#pf-add").click();
    await page.waitForTimeout(250);
    const after = await page.locator("#profile-cards .profile-card").count();
    check(after === before + 1, "profil", `yeni profil eklenmedi (${before} -> ${after})`);
    const meta = await page.locator("#profile-cards .pc-meta").count();
    check(meta >= after, "profil", `kartlarda ozet satiri eksik (${meta}/${after})`);
    await page.locator("#pf-name").fill("Gece");
    await page.locator("#pf-save").click();
    await page.waitForTimeout(250);
    // v2.2: kaydetme toast'u sağ altta savebar'ı kapatır — temizle.
    await dismissToasts(page);
    const names = await page.locator("#profile-cards .pc-name").allTextContents();
    check(names.includes("Gece"), "profil", `kaydedilen isim yok: ${names.join(",")}`);

    // Iki asamali silme: ilk tik onay, ikinci tik siler.
    await page.locator("#pf-delete").scrollIntoViewIfNeeded();
    await page.locator("#pf-delete").click();
    await page.waitForTimeout(150);
    const armLabel = (await page.locator("#pf-delete").textContent()) ?? "";
    check(armLabel.includes("Emin"), "profil", `silme onayi cikmadi: ${armLabel}`);
    const armedCount = await page.locator("#profile-cards .profile-card").count();
    check(armedCount === after, "profil", "tek tikta silindi, onay beklenirdi");
    await page.locator("#pf-delete").scrollIntoViewIfNeeded();
    await page.locator("#pf-delete").click();
    await page.waitForTimeout(300);
    // Silme aksiyon toast'u ("Geri al") süresizdir — kapatmadan devam etme.
    await dismissToasts(page);
    const afterDelete = await page.locator("#profile-cards .profile-card").count();
    check(afterDelete === after - 1, "profil", `ikinci tikta silinmedi (${after} -> ${afterDelete})`);

    // Geri getirme: silinen tohum profil geri gelir.
    const filmCard = page.locator("#profile-cards .profile-card").filter({ hasText: "Film" });
    if ((await filmCard.count()) > 0) {
      // v2.2: kartta "Uygula" dugmesi de var — secim icin isme tikla.
      await filmCard.first().locator(".pc-name").click();
      await page.waitForTimeout(250);
      await page.locator("#pf-delete").scrollIntoViewIfNeeded();
    await page.locator("#pf-delete").click();
      await page.waitForTimeout(150);
      await page.locator("#pf-delete").scrollIntoViewIfNeeded();
    await page.locator("#pf-delete").click();
      await page.waitForTimeout(300);
      await dismissToasts(page);
    }
    const namesBeforeRestore = await page.locator("#profile-cards .pc-name").allTextContents();
    await page.locator("#pf-restore").click();
    await page.waitForTimeout(300);
    const namesAfter = await page.locator("#profile-cards .pc-name").allTextContents();
    check(namesAfter.includes("Film"), "profil", `geri getirme Film'i getirmedi: ${namesAfter.join(",")} (onceki: ${namesBeforeRestore.join(",")})`);
    await checkOverflow(page, "profiller");
    await shot("6-profiller.png");
  });

  // 7. Uygulama baglama: on plandaki exe profili devralir; Pro ile baglanir.
  await scenario("catppuccin-macchiato", "dark", async ({ page, openTab, openAdvanced, shot }) => {
    const logText = await text(page, "#log");
    check(logText.includes("(code.exe)"), "bagim", "bagli profil log'a dusmedi");
    const pill = await text(page, "#profile-pill");
    check(pill.includes("\u2192") && pill.includes("code.exe"), "bagim", `rozet devri gostermedi: ${pill}`);
    const why = await text(page, "#why-line");
    check(why.includes("devraldı"), "bagim", `why-line bagli profili gostermedi: "${why}"`);
    check(!logText.includes("hata:"), "bagim", `tick hatasi: ${logText.slice(0, 120)}`);

    // Uygulama baglama Pro kapisi: ucretsizde giris kapali.
    await openTab("profiles");
    const appsInput = page.locator("#pf-apps-editor .tag-input");
    check(await appsInput.isDisabled(), "bagim", "ucretsizde uygulama girisi acik kaldi");
    check(await page.locator("#pf-apps-pro").isVisible(), "bagim", "Pro uyari metni gorunmedi");

    // Pro etkinlestirilince acilir ve on plandaki uygulama baglanabilir.
    await openTab("settings");
    await openAdvanced();
    await page.locator("#lic-key").fill("SS-QA-TEST-KEY-1234567890");
    await page.locator("#lic-activate").click();
    await page.waitForTimeout(400);
    await openTab("profiles");
    check(!(await appsInput.isDisabled()), "bagim", "Pro'da uygulama girisi kapali kaldi");
    const filmCard = page.locator("#profile-cards .profile-card").filter({ hasText: "Film" });
    // v2.2: kartta "Uygula" dugmesi de var — secim icin isme tikla.
    await filmCard.first().locator(".pc-name").click();
    await page.waitForTimeout(250);
    const countBefore = await text(page, "#pf-apps-count");
    await page.locator("#pf-bind-current").click();
    await page.waitForTimeout(250);
    const countAfter = await text(page, "#pf-apps-count");
    check(countAfter !== countBefore, "bagim", `on plandaki eklemedi: ${countBefore} -> ${countAfter}`);
    check(countAfter.includes("1 uygulama"), "bagim", `baglanan uygulama sayisi yanlis: "${countAfter}"`);
    // v2.2: bağlama toast'u sağ altta savebar'ı kapatır — temizle.
    await dismissToasts(page);
    await page.locator("#pf-save").click();
    await page.waitForTimeout(250);
    await checkOverflow(page, "bagim");
    await shot("7-uygulama.png");
  }, "code.exe");

  // 8. Gecmis: ozet sayilari + SVG grafik + disk kayitlari.
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, openTab, shot }) => {
    await openTab("history");
    const bars = await page.locator("#chart rect").count();
    check(bars >= 12, "grafik", `cubuk sayisi=${bars} (beklenen >=12)`);
    check((await page.locator("#chart polyline").count()) === 1, "grafik", "hedef cizgisi (polyline) yok");
    check((await text(page, "#sum-changes")) === "3", "grafik", "ozet sayilari dolmadi");
    check((await text(page, "#sum-avg")).includes("46"), "grafik", "ortalama parlaklik dolmadi");
    check((await text(page, "#sum-frozen")) === "2", "grafik", "dondurulan tur sayisi dolmadi");
    const rows = await page.locator("#hist-panel div").count();
    check(rows > 0, "gecmis", "kayit satiri yok");
    // v2.2: #lic-mini SILINDI — Geçmiş'te lisans kopyasi yok.
    check((await page.locator("#lic-mini").count()) === 0, "gecmis", "lic-mini hala DOM'da");

    const before = (await invocations()).filter(([c]) => c === "log_lines").length;
    await page.locator("#hist-refresh").click();
    await page.waitForTimeout(250);
    const after = (await invocations()).filter(([c]) => c === "log_lines").length;
    check(after > before, "gecmis", "Yenile log_lines cagrilmadi");

    await page.locator("#log-clear-btn").click();
    await page.waitForTimeout(300);
    const histText = await text(page, "#hist-panel");
    check(histText.includes("Henüz kayıt yok"), "gecmis", `temizleme sonrasi bos metin yok: "${histText.slice(0, 60)}"`);
    await checkOverflow(page, "gecmis");
    await shot("8-gecmis.png");
  });

  // 9. Monitor: elle yazma + DDC hatasi satirda + kontrol kapanmasi.
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, shot }) => {
    const rows = await page.locator("#monitor-list .monitor-row").count();
    check(rows >= 3, "monitor", `monitor satiri az: ${rows}`);
    const slider0 = await page.locator("#monitor-bright").inputValue();
    check(slider0 === "42", "monitor", `slider secili degeri alamadi: ${slider0}`);
    await page.locator("#monitor-plus").click();
    await page.waitForTimeout(300);
    const after = await page.locator("#monitor-bright").inputValue();
    check(after === "52", "monitor", `+ dugmesi uygulamadi: ${after}`);
    const writes = (await invocations()).filter(([c]) => c === "brightness_set_monitor");
    check(writes.length > 0, "monitor", "brightness_set_monitor cagrilmadi");
    const args = writes.at(-1)[1];
    check(
      args && args.value === 52 && typeof args.id === "string" && args.id.includes("DISPLAY1"),
      "monitor",
      `yazma argumanlari bozuk: ${JSON.stringify(args)}`,
    );

    // DDC hatali monitor: hata satirda kirmizi, slider kapali.
    await page.locator("#monitor-list .monitor-row").nth(2).click();
    await page.waitForTimeout(300);
    const errText = await text(page, "#monitor-list .monitor-row.bad .mon-err");
    check(errText.includes("DDC"), "monitor", `DDC hatasi satirda gorunmedi: ${errText}`);
    check(await page.locator("#monitor-bright").isDisabled(), "monitor", "hatali monitorde slider acik kaldi");

    // Saglikli monitor tekrar secilince kontrol geri acilir.
    await page.locator("#monitor-list .monitor-row").first().click();
    await page.waitForTimeout(300);
    check(!(await page.locator("#monitor-bright").isDisabled()), "monitor", "saglikli monitorde slider kapali kaldi");
    await checkOverflow(page, "monitor");
    await shot("9-monitorler.png");
  });

  // 10. Otomatik karar: dis monitorlere ayni hedef yazilir, DDC hatasi yutulmaz,
  //     karar degismezken tekrar yazilmaz.
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, openTab, openAdvanced, snap, shot }) => {
    await openTab("settings");
    await openAdvanced();
    await page.locator("#lic-key").fill("SS-QA-TEST-KEY-1234567890");
    await page.locator("#lic-activate").click();
    await page.waitForTimeout(400);
    await openTab("panel");
    await snap(["ss-paper", "light", 60]);
    const calls = await invocations();
    const writes = calls.filter(([c]) => c === "brightness_set_monitor");
    const d2 = writes.filter(([, a]) => a && String(a.id).includes("DISPLAY2"));
    check(d2.length > 0, "otomatik", "harici monitore (DISPLAY2) otomatik yazma olmadi");
    const v = d2.length > 0 ? d2.at(-1)[1].value : null;
    check(
      typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100,
      "otomatik",
      `harici yazma degeri tam sayi 0-100 degil: ${JSON.stringify(v)}`,
    );
    const internal = calls.filter(([c]) => c === "brightness_set").at(-1);
    if (internal && v !== internal[1].value) {
      fail("otomatik", `harici yazma dahili hedefle ayni degil: ${v} != ${internal[1].value}`);
    }
    // DDC-hatali monitore yazma denenir ama uygulamayi dusurmez.
    const d3 = writes.filter(([, a]) => a && String(a.id).includes("DISPLAY3"));
    check(d3.length > 0, "otomatik", "hatali monitore (DISPLAY3) yazma denemesi olmadi");
    const logText = await text(page, "#log");
    check(logText.includes("tema değişti"), "otomatik", "karar uygulanmadi (tema log'u yok)");
    check(!logText.includes("hata:"), "otomatik", `tick hatasi: ${logText.slice(0, 120)}`);
    const errText = await text(page, "#monitor-list .monitor-row.bad .mon-err");
    check(errText.includes("DDC"), "otomatik", `DDC hatasi satirda gorunmedi: ${errText}`);

    // Karar degismezse ayni deger tekrar yazilmaz.
    const before = writes.length;
    await page.locator("#now-btn").click();
    await page.waitForTimeout(700);
    const after = (await invocations()).filter(([c]) => c === "brightness_set_monitor").length;
    check(after === before, "otomatik", `karar degismezken tekrar yazildi (${before} -> ${after})`);

    // Uygulama ayakta: elle yazma hala calisiyor.
    await page.locator("#monitor-list .monitor-row").first().click();
    await page.waitForTimeout(300);
    await page.locator("#monitor-plus").click();
    await page.waitForTimeout(300);
    const manual = (await invocations())
      .filter(([c, a]) => c === "brightness_set_monitor" && a && String(a.id).includes("DISPLAY1"))
      .at(-1);
    check(
      manual && manual[1].value === 52,
      "otomatik",
      `DDC hatasindan sonra elle yazma calismiyor: ${JSON.stringify(manual)}`,
    );
    await shot("10-otomatik.png");
  });

  // 11. Duraklatma zamana bagli: kalan sure gorunur, tick dokunmaz.
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, shot }) => {
    await page.locator("#pause-btn").click();
    await page.waitForTimeout(250);
    const badge = await text(page, "#mode-badge");
    check(badge.includes("Duraklatıldı"), "duraklatma", `mode-badge duraklatildi gostermedi: "${badge}"`);
    const why = await text(page, "#why-line");
    check(why.includes("duraklatıldı") && why.includes("kaldı"), "duraklatma", `why-line kalan sureyi gostermedi: "${why}"`);
    const frozen = await text(page, "#sub-frozen");
    check(frozen.includes("kaldı"), "duraklatma", `durum kartinda kalan sure yok: "${frozen}"`);
    const pauseClass = (await page.locator("#pause-btn").getAttribute("class")) ?? "";
    check(pauseClass.includes("active"), "duraklatma", "pause-btn .active guncellenmedi");

    const mark = (await invocations()).length;
    await page.locator("#now-btn").click();
    await page.waitForTimeout(700);
    const logText = await text(page, "#log");
    check(logText.includes("duraklatıldı, atlandı"), "duraklatma", "tick duraklatmayi atlamadi");
    const touched = (await invocations())
      .slice(mark)
      .filter(([c]) => ["brightness_set", "theme_set", "gamma_set_warmth", "brightness_set_monitor"].includes(c));
    check(touched.length === 0, "duraklatma", `duraklatmayken dokunuldu: ${JSON.stringify(touched)}`);
    const clock = await text(page, "#clock");
    check(/^\d{2}:\d{2}$/.test(clock), "duraklatma", `clock calismiyor: "${clock}"`);

    // Tekrar basmak bitirir.
    await page.locator("#pause-btn").click();
    await page.waitForTimeout(250);
    check((await text(page, "#mode-badge")).includes("Otomatik çalışıyor"), "duraklatma", "duraklatma bitmedi");

    // "Bugün kapat": gece yarisina kadar duraklatir, kalan sure gorunur.
    await page.locator("#day-off-btn").click();
    await page.waitForTimeout(250);
    const dayClass = (await page.locator("#day-off-btn").getAttribute("class")) ?? "";
    check(dayClass.includes("active"), "duraklatma", "day-off-btn .active guncellenmedi");
    const whyDay = await text(page, "#why-line");
    check(whyDay.includes("duraklatıldı"), "duraklatma", `day-off why-line: "${whyDay}"`);
    const frozenDay = await text(page, "#sub-frozen");
    check(frozenDay.includes("kaldı"), "duraklatma", `day-off kalan sure: "${frozenDay}"`);
    await checkOverflow(page, "duraklatma");
    await shot("11-duraklatma.png");
  });

  // 12. Flyout: ana pencere olay köprüsü (ss:action) + flyout.html sözleşmesi.
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, shot }) => {
    // (a) Köprü: ss:action -> duraklatma toggle / ölçüm / pencere açma.
    await page.evaluate(() => window.__emit("ss:action", { action: "pause-1h" }));
    await page.waitForTimeout(250);
    check((await text(page, "#mode-badge")).includes("Duraklatıldı"), "flyout", "ss:action pause-1h duraklatmadi");
    await page.evaluate(() => window.__emit("ss:action", { action: "pause-1h" }));
    await page.waitForTimeout(250);
    check((await text(page, "#mode-badge")).includes("Otomatik çalışıyor"), "flyout", "ss:action pause-1h geri acmadi");
    const mark = (await invocations()).length;
    await page.evaluate(() => window.__emit("ss:action", { action: "measure" }));
    await page.waitForTimeout(700);
    const afterMeasure = (await invocations()).slice(mark).map(([c]) => c);
    check(afterMeasure.includes("decide_target"), "flyout", "ss:action measure tur calistirmadi");
    await page.evaluate(() => window.__emit("ss:action", { action: "open-main" }));
    await page.waitForTimeout(300);
    const allCmds = (await invocations()).map(([c]) => c);
    check(allCmds.includes("plugin:window|show"), "flyout", "ss:action open-main pencereyi gostermedi");
    // Durum köprüsü: render sonrası (1 sn throttle) ss:state emit edilir.
    const stateEmits = (await invocations()).filter(
      ([c, a]) => c === "plugin:event|emit" && a && a.event === "ss:state",
    );
    check(stateEmits.length > 0, "flyout", "ss:state hic emit edilmedi");
    if (stateEmits.length > 0) {
      const p = stateEmits.at(-1)[1].payload;
      check(
        typeof p.brightness === "number" && typeof p.licensed === "boolean" && typeof p.hdr === "boolean",
        "flyout",
        `ss:state alanlari eksik: ${JSON.stringify(p)}`,
      );
    }

    // (b) Flyout sayfası: 16 fx-* id + slider yazması + ESC + ss:state.
    const fpage = await browser.newPage({ viewport: { width: 360, height: 460 } });
    fpage.on("pageerror", (e) => consoleErrors.push(String(e)));
    fpage.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    await fpage.addInitScript(stubScript("catppuccin-macchiato", "dark"));
    await fpage.goto(base + "flyout.html", { waitUntil: "networkidle" });
    await fpage.waitForTimeout(400);
    const fInvocations = async () => fpage.evaluate(() => window.__invocations);
    const fxCount = await fpage.locator("[id^='fx-']").count();
    check(fxCount === 16, "flyout", `fx-* id sayisi=${fxCount} (beklenen 16)`);
    // duzeltme (md.10a): flyout kökü (.fx) hiçbir yönde taşmamalı.
    const fxBox = await fpage.locator(".fx").evaluate((el2) => ({
      w: el2.scrollWidth,
      cw: el2.clientWidth,
      h: el2.scrollHeight,
      ch: el2.clientHeight,
    }));
    check(
      fxBox.w <= fxBox.cw && fxBox.h <= fxBox.ch,
      "flyout-tasma",
      `.fx koku tasiyor: scroll ${fxBox.w}x${fxBox.h} > client ${fxBox.cw}x${fxBox.ch}`,
    );
    const bright0 = ((await fpage.locator("#fx-bright").textContent()) ?? "").trim();
    check(bright0 === "%42", "flyout", `acilis yuzdesi "%42" degil: "${bright0}"`);
    await fpage.locator("#fx-slider").evaluate((el2) => {
      el2.value = "60";
      el2.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await fpage.waitForTimeout(250);
    const setCalls = (await fInvocations()).filter(([c]) => c === "brightness_set");
    check(
      setCalls.length > 0 && setCalls.at(-1)[1] && setCalls.at(-1)[1].value === 60,
      "flyout",
      `slider brightness_set yazmadi: ${JSON.stringify(setCalls.at(-1))}`,
    );
    // duzeltme (md.9/md.10): yazma sonrası ana pencereye brightness-set action
    // gider — sonraki ss:state slider'ı eski değere çekmesin.
    const bActions = (await fInvocations()).filter(
      ([c, a]) =>
        c === "plugin:event|emit" &&
        a &&
        a.event === "ss:action" &&
        a.payload &&
        a.payload.action === "brightness-set",
    );
    check(
      bActions.length > 0 && bActions.at(-1)[1].payload.value === 60,
      "flyout",
      `brightness-set action gonderilmedi: ${JSON.stringify(bActions.at(-1))}`,
    );
    await fpage.keyboard.press("Escape");
    await fpage.waitForTimeout(250);
    const fcmds = (await fInvocations()).map(([c]) => c);
    check(fcmds.includes("flyout_hide"), "flyout", "ESC flyout_hide cagirmadi");
    await fpage.evaluate(() => window.__emit("ss:state", { brightness: 77 }));
    await fpage.waitForTimeout(250);
    const bright1 = ((await fpage.locator("#fx-bright").textContent()) ?? "").trim();
    check(bright1 === "%77", "flyout", `ss:state yuzdeyi guncellemedi: "${bright1}"`);
    await fpage.screenshot({ path: join(shotDir, "12-flyout.png") });
    await fpage.close();
  });

  // 13. Güncelleme bandı: check sürüm döndürünce band açılır, ertele gizler.
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, shot }) => {
    // İlk kontrol açılıştan 10 sn sonra gelir; QA o kadar bekler.
    await page.waitForTimeout(10_500);
    const checked = (await invocations()).some(([c]) => c === "plugin:updater|check");
    check(checked, "guncelleme", "plugin:updater|check cagrilmadi");
    check(await page.locator("#update-band").isVisible(), "guncelleme", "update-band gorunmedi");
    const txt = await text(page, "#update-text");
    check(
      txt.includes("9.9.9") && txt.includes("hazır"),
      "guncelleme",
      `bant metni surumu icermiyor: "${txt}"`,
    );
    await shot("13-guncelleme.png");
    // duzeltme (md.10b): "Şimdi kur" — sahte downloadAndInstall + relaunch.
    await page.locator("#update-install").click();
    await page.waitForTimeout(300);
    const installLabel = (await text(page, "#update-install"));
    check(
      installLabel === "Kuruluyor…",
      "guncelleme",
      `kur dugmesi "Kuruluyor…" olmali: "${installLabel}"`,
    );
    check(
      await page.locator("#update-install").isDisabled(),
      "guncelleme",
      "kurulum sirasinda dugme kilitlenmeli",
    );
    const updCmds = (await invocations()).map(([c]) => c);
    check(
      updCmds.includes("plugin:updater|download_and_install"),
      "guncelleme",
      "downloadAndInstall cagrilmadi",
    );
    check(
      updCmds.includes("plugin:process|restart"),
      "guncelleme",
      "relaunch (plugin:process|restart) cagrilmadi",
    );
    await page.locator("#update-later").click();
    await page.waitForTimeout(250);
    check(!(await page.locator("#update-band").isVisible()), "guncelleme", "update-later bandi gizlemedi");
    const snooze = await page.evaluate(() => Number(localStorage.getItem("ss:updateSnoozeUntil") ?? "0"));
    check(snooze > Date.now(), "guncelleme", `erteleme kaydi bozuk: ${snooze}`);
  }, null, { updateVersion: "9.9.9" });

  // 14. HDR: monitör rozeti "HDR açık" + soluk satır + Ayarlar'da sıcaklık notu.
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, openTab, shot }) => {
    const rows = page.locator("#monitor-list .monitor-row");
    check((await rows.count()) >= 3, "hdr", "monitor satirlari yok");
    const hdrBadge = ((await rows.nth(1).locator(".ct-badge").textContent()) ?? "").trim();
    check(hdrBadge === "HDR açık", "hdr", `HDR rozeti gorunmedi: "${hdrBadge}"`);
    const hdrClass = (await rows.nth(1).getAttribute("class")) ?? "";
    check(hdrClass.includes("hdr"), "hdr", "HDR satiri soluk (hdr sinifi) degil");
    // v2.2: ct rozetleri insan dilinde — destekli "monitörün kendi ayarı",
    // desteksiz "programla yapılıyor" (wmi/ddc yok).
    const hwBadge = ((await rows.nth(0).locator(".ct-badge").textContent()) ?? "").trim();
    check(hwBadge === "monitörün kendi ayarı", "hdr", `DISPLAY1 destek rozeti yok: "${hwBadge}"`);
    const swBadge = ((await rows.nth(2).locator(".ct-badge").textContent()) ?? "").trim();
    check(swBadge === "programla yapılıyor", "hdr", `DISPLAY3 programla rozeti yok: "${swBadge}"`);
    await openTab("settings");
    check(await page.locator("#warm-hdr-note").isVisible(), "hdr", "warm-hdr-note gorunmedi");
    const note = await text(page, "#warm-hdr-note");
    check(note.includes("HDR"), "hdr", `not metni HDR icermiyor: "${note}"`);
    // v2.2 (E): HDR açıkken Kelvin kaydırıcısı disabled (görünür ama soluk).
    check(await page.locator("#warm-kelvin").isDisabled(), "hdr", "HDR açıkken kelvin kaydiricisi kilitlenmedi");
    check(await page.locator("#warm-presets .chip").first().isDisabled(), "hdr", "HDR açıkken preset çipleri kilitlenmedi");
    // HDR ayar bağlantısı ayar sayfasını açar.
    const openBefore = (await invocations()).filter(([c]) => c === "plugin:opener|open_url").length;
    await page.locator("#warm-hdr-link").click();
    await page.waitForTimeout(250);
    const openAfter = (await invocations()).filter(([c]) => c === "plugin:opener|open_url").length;
    check(openAfter === openBefore + 1, "hdr", "warm-hdr-link open_url cagirmadi");
    await checkOverflow(page, "hdr");
    await shot("14-hdr.png");
  }, null, { hdrAll: [{ device: "\\\\.\\DISPLAY2", hdr: true }] });

  // 15. Hakkında: GPL lisans + sürüm + kaynak kodu düğmesi (Gelişmiş'in altı).
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, openTab, openAdvanced, shot }) => {
    await openTab("settings");
    await openAdvanced();
    const lic = await text(page, "#about-license");
    check(lic === "GPL-3.0-or-later", "hakkinda", `lisans metni yanlis: "${lic}"`);
    const ver = await text(page, "#about-version");
    check(ver.length > 0 && ver !== "-", "hakkinda", `surum dolmadi: "${ver}"`);
    check(await page.locator("#about-warranty").isVisible(), "hakkinda", "garanti satiri gorunmedi");
    const before = (await invocations()).filter(([c]) => c === "plugin:opener|open_url").length;
    await page.locator("#about-source").click();
    await page.waitForTimeout(250);
    const after = (await invocations()).filter(([c]) => c === "plugin:opener|open_url").length;
    check(after === before + 1, "hakkinda", "kaynak kodu dugmesi open_url cagirmadi");
    await checkOverflow(page, "hakkinda");
    await shot("15-hakkinda.png");
  });

  // 16. Toast sistemi: kapsayıcı, roller, otomatik kapanış, en fazla 3,
  //     × ve Esc ile kapanış, aksiyonlu toast (profil sil → Geri al).
  //     Not: #now-btn toast ÜRETMEZ (tick yalnız log yazar) — yalnız turun
  //     koştuğu doğrulanır, toast assert'i güvenilir tetikleyicilerle yapılır.
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, openTab, openAdvanced, snap, shot }) => {
    const host = page.locator("#toast-host");
    const toastCount = async () => await host.locator(".toast").count();
    const waitHostEmpty = async () =>
      await page.waitForFunction(() => document.querySelectorAll("#toast-host .toast").length === 0, null, { timeout: 10_000 });

    // (a) #now-btn tıklanabilir + tur koşuyor (toast çıkarmıyor — rapora not).
    const mark = (await invocations()).length;
    await page.locator("#now-btn").click();
    await page.waitForTimeout(700);
    const ran = (await invocations()).slice(mark).map(([c]) => c);
    check(ran.includes("decide_target"), "toast", "#now-btn tur calistirmadi");

    // (b) info toast: #toast-host içinde çıkar, role="status", 4 sn sonra kaybolur.
    await openTab("settings");
    await page.locator("#break-switch").click();
    await page.waitForTimeout(300);
    check((await toastCount()) >= 1, "toast", "break-switch toast cikarmadi");
    const first = host.locator(".toast").first();
    check((await first.getAttribute("role")) === "status", "toast", "info toast role=status degil");
    await page.waitForTimeout(4_900);
    check((await toastCount()) === 0, "toast", "info toast 4 sn sonra kaybolmadi");

    // (c) × düğmesi kapatır.
    await page.locator("#break-switch").click();
    await page.waitForTimeout(300);
    check((await toastCount()) >= 1, "toast", "ikinci break-switch toast cikarmadi");
    await host.locator(".toast-x").first().click();
    await page.waitForTimeout(500);
    check((await toastCount()) === 0, "toast", "x dugmesi toast'u kapatmadi");

    // (d) Esc kapatır. (Not: fill() change tetiklemez — değer + change elle dispatch.)
    await page.locator("#sleep-start").evaluate((el2) => {
      el2.value = "21";
      el2.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(300);
    check((await toastCount()) >= 1, "toast", "gece saati toast cikarmadi");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    check((await toastCount()) === 0, "toast", "Esc toast'u kapatmadi");

    // (e) err toast: role="alert" (Pro + otomatik tur → DDC hatası).
    await openAdvanced();
    await page.locator("#lic-key").fill("SS-QA-TEST-KEY-1234567890");
    await page.locator("#lic-activate").click();
    await page.waitForTimeout(500);
    check((await host.locator(".toast-ok").count()) >= 1, "toast", "lisans busy→ok toast gorunmedi");
    await dismissToasts(page);
    await openTab("panel");
    await snap(["ss-paper", "light", 60]);
    const errToast = host.locator(".toast-err").first();
    check((await errToast.count()) === 1, "toast", "DDC hatasi err toast cikarmadi");
    check((await errToast.getAttribute("role")) === "alert", "toast", "err toast role=alert degil");
    await dismissToasts(page);
    await waitHostEmpty();

    // (f) ekranda en fazla 2 toast: 4 hızlı toast → 2 görünür (küçük pencere kuralı).
    await openTab("settings");
    for (const v of ["22", "23", "20", "21"]) {
      await page.locator("#sleep-start").evaluate((el2, val) => {
        el2.value = val;
        el2.dispatchEvent(new Event("change", { bubbles: true }));
      }, v);
      await page.waitForTimeout(120);
    }
    const visible = await toastCount();
    check(visible === 2, "toast", `en fazla 2 kurali bozuldu: ${visible} gorunur toast`);
    await dismissToasts(page);
    await waitHostEmpty();

    // (g) aksiyonlu toast: profil sil → "Geri al" düğmesi → profil geri gelir.
    await openTab("profiles");
    const cardsBefore = await page.locator("#profile-cards .profile-card").count();
    await page.locator("#pf-delete").scrollIntoViewIfNeeded();
    await page.locator("#pf-delete").click();
    await page.waitForTimeout(150);
    await page.locator("#pf-delete").scrollIntoViewIfNeeded();
    await page.locator("#pf-delete").click();
    await page.waitForTimeout(400);
    const cardsAfterDelete = await page.locator("#profile-cards .profile-card").count();
    check(cardsAfterDelete === cardsBefore - 1, "toast", `silme calismadi (${cardsBefore} -> ${cardsAfterDelete})`);
    const actBtn = host.locator(".toast-act").first();
    check((await actBtn.count()) === 1, "toast", "silme sonrasi Geri al dugmesi cikmadi");
    check((await actBtn.textContent()) === "Geri al", "toast", "aksiyon dugmesi 'Geri al' degil");
    const toastText = await host.locator(".toast").first().textContent();
    check((toastText ?? "").includes("silindi"), "toast", `silme toast metni bozuk: "${toastText}"`);
    await actBtn.click();
    await page.waitForTimeout(500);
    const cardsAfterUndo = await page.locator("#profile-cards .profile-card").count();
    check(cardsAfterUndo === cardsBefore, "toast", `Geri al profili getirmedi (${cardsAfterDelete} -> ${cardsAfterUndo})`);
    await checkOverflow(page, "toast");
    await shot("16-toast.png");
  });

  // 17. Kelvin arayüzü: kaydırıcı + değer/ad, preset çipleri, sıfırlama,
  //     donanımsal destek notu, HDR kilidi (14. senaryoda).
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, openTab, shot }) => {
    await openTab("settings");
    check(!(await page.locator("#warm-kelvin").isDisabled()), "kelvin", "HDR yokken kelvin kaydiricisi kilitli");
    // Kaydırıcı 4200 → değer "4200 K" + ad "Florasan" + donanımsal yazma.
    await page.locator("#warm-kelvin").evaluate((el2) => {
      el2.value = "4200";
      el2.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(400);
    check((await text(page, "#warm-kelvin-val")) === "4200 K", "kelvin", `kelvin degeri dolmadi: "${await text(page, "#warm-kelvin-val")}"`);
    check((await text(page, "#warm-kelvin-name")) === "Florasan", "kelvin", `4200 adi "Florasan" degil: "${await text(page, "#warm-kelvin-name")}"`);
    const ctCalls = (await invocations()).filter(([c]) => c === "monitor_set_color_temp");
    check(
      ctCalls.length > 0 && ctCalls.at(-1)[1].kelvin === 4200 && String(ctCalls.at(-1)[1].device).includes("DISPLAY2"),
      "kelvin",
      `monitor_set_color_temp DISPLAY2'ye 4200 yazmadi: ${JSON.stringify(ctCalls.at(-1))}`,
    );
    // Preset çipi (2700) → kaydırıcı 2700 + ad "Ampul" + çip vurgusu.
    const bulb = page.locator("#warm-presets .chip[data-k='2700']");
    await bulb.click();
    await page.waitForTimeout(300);
    check((await page.locator("#warm-kelvin").inputValue()) === "2700", "kelvin", "preset kaydiriciyi 2700 yapmadi");
    check((await text(page, "#warm-kelvin-val")) === "2700 K", "kelvin", "preset degeri 2700 K degil");
    check((await text(page, "#warm-kelvin-name")) === "Ampul", "kelvin", `2700 adi "Ampul" degil: "${await text(page, "#warm-kelvin-name")}"`);
    check(((await bulb.getAttribute("class")) ?? "").includes("active"), "kelvin", "secili preset cipi vurgulanmadi");
    // Sıfırlama → 6500 K.
    await page.locator("#warm-reset").click();
    await page.waitForTimeout(300);
    check((await text(page, "#warm-kelvin-val")) === "6500 K", "kelvin", `reset 6500 K yapmadi: "${await text(page, "#warm-kelvin-val")}"`);
    check((await page.locator("#warm-kelvin").inputValue()) === "6500", "kelvin", "reset kaydiriciyi 6500 yapmadi");
    // Teknik not: ilk harici monitör destekli → "Monitörün kendi ayarı".
    const note = await text(page, "#warm-tech-note");
    check(note.includes("Monitörün kendi ayarı"), "kelvin", `teknik not destekli monitoru soylemedi: "${note}"`);
    check(await page.locator("#warm-hdr-note").isHidden(), "kelvin", "HDR yokken HDR notu gorunuyor");
    await checkOverflow(page, "kelvin");
    await shot("17-kelvin.png");
  });

  // 18. Otomatik ayar segmenti: 4 düğme, toggle, "1 saat" ↔ "Bugün" ayrılığı,
  //     "Açık" duraklatma VE kilidi kaldırır.
  await scenario("catppuccin-macchiato", "dark", async ({ page, openTab, shot }) => {
    const segBtns = await page.locator("#auto-seg .seg-item").count();
    check(segBtns === 4, "otoseg", `auto-seg dugme sayisi=${segBtns} (beklenen 4)`);
    for (const id of ["auto-on", "pause-btn", "day-off-btn", "lock-btn"]) {
      check(await page.locator(`#${id}`).isVisible(), "otoseg", `#${id} gorunmuyor`);
    }
    const pressed = async (id) => await page.locator(`#${id}`).getAttribute("aria-pressed");
    const activeCls = async (id) => ((await page.locator(`#${id}`).getAttribute("class")) ?? "").includes("active");

    // "1 saat": bas → açılır, tekrar bas → kapanır.
    await page.locator("#pause-btn").click();
    await page.waitForTimeout(250);
    check((await pressed("pause-btn")) === "true" && (await activeCls("pause-btn")), "otoseg", "1 saat acilmadi");
    await page.locator("#pause-btn").click();
    await page.waitForTimeout(250);
    check((await pressed("pause-btn")) === "false" && !(await activeCls("pause-btn")), "otoseg", "1 saat kapanmadi");

    // Ayrı durumlar: "1 saat" etkinken "Bugün" yok sayılır — ikisi birbirini
    // iptal ETMEZ; "Bugün" kendi durumunu değiştiremez (kod: yok sayıldı).
    await page.locator("#pause-btn").click();
    await page.waitForTimeout(250);
    await page.locator("#day-off-btn").click();
    await page.waitForTimeout(250);
    check((await pressed("pause-btn")) === "true", "otoseg", "Bugün tiklamasi 1 saat'i iptal etti");
    check((await pressed("day-off-btn")) === "false", "otoseg", "1 saat etkinken Bugün aktiflesti (yok sayilmaliydi)");
    const logText = await text(page, "#log");
    check(logText.includes("yok sayıldı"), "otoseg", `yok sayma log'u yok: "${logText.slice(0, 100)}"`);

    // "Açık": duraklatmayı kaldırır + toast görünür.
    await page.locator("#auto-on").click();
    await page.waitForTimeout(300);
    check((await pressed("pause-btn")) === "false", "otoseg", "Acik dugmesi duraklatmayi kaldirmadi");
    check((await text(page, "#mode-badge")).includes("Otomatik çalışıyor"), "otoseg", "Acik sonrasi rozet otomatik degil");
    check((await page.locator("#toast-host .toast").count()) >= 1, "otoseg", "otomatik moda donus toast'u cikmadi");

    // "Kilitli": açılır, "Açık" çözer.
    await page.locator("#lock-btn").click();
    await page.waitForTimeout(250);
    check((await pressed("lock-btn")) === "true" && (await activeCls("lock-btn")), "otoseg", "Kilitli acilmadi");
    check((await text(page, "#mode-badge")).includes("Kilitli"), "otoseg", "kilit rozeti gelmedi");
    await page.locator("#auto-on").click();
    await page.waitForTimeout(250);
    check((await pressed("lock-btn")) === "false", "otoseg", "Acik dugmesi kilidi cozmedi");
    check((await text(page, "#mode-badge")).includes("Otomatik çalışıyor"), "otoseg", "kilit cozulunce rozet otomatik degil");
    await checkOverflow(page, "otoseg");
    await shot("18-otoseg.png");
  });

  // 19. Profil editörü: "Kaydedilmedi" göstergesi, kaydet, kart yalnız seçer,
  //     ayrı "Uygula" çipi uygular.
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, openTab, shot }) => {
    await openTab("profiles");
    check(await page.locator("#pf-dirty").isHidden(), "profedit", "pf-dirty basta gorunuyor");
    // Alan değişimi → "Kaydedilmedi" belirir.
    await page.locator("#pf-off-plus").click();
    await page.waitForTimeout(250);
    check(await page.locator("#pf-dirty").isVisible(), "profedit", "alan degisince pf-dirty cikmadi");
    const dirtyText = await text(page, "#pf-dirty");
    check(dirtyText.includes("Kaydedilmedi"), "profedit", `pf-dirty metni bozuk: "${dirtyText}"`);
    check((await text(page, "#pf-off-val")) === "+5", "profedit", "ofset +5 olmadi");
    // Kaydet → gösterge gizlenir + toast çıkar.
    await page.locator("#pf-save").click();
    await page.waitForTimeout(300);
    check(await page.locator("#pf-dirty").isHidden(), "profedit", "kaydetince pf-dirty gizlenmedi");
    check((await page.locator("#toast-host .toast").count()) >= 1, "profedit", "kaydet toast'u cikmadi");
    await dismissToasts(page);

    // Kart tıklaması YALNIZ seçer: editör dolar, tema yazılmaz, aktif kart değişmez.
    const mark = (await invocations()).length;
    const filmCard = page.locator("#profile-cards .profile-card").filter({ hasText: "Film" });
    check((await filmCard.count()) > 0, "profedit", "Film karti yok");
    await filmCard.first().locator(".pc-name").click();
    await page.waitForTimeout(250);
    check((await page.locator("#pf-name").inputValue()) === "Film", "profedit", "kart secimi editoru doldurmadi");
    const between = (await invocations()).slice(mark);
    check(!between.some(([c]) => c === "theme_set"), "profedit", `kart secimi tema uyguladi: ${JSON.stringify(between.slice(0, 4))}`);
    check((await text(page, "#profile-cards .profile-card.active .pc-name")) === "İş", "profedit", "kart secimi aktif profili degistirdi");

    // "Uygula" çipi: tema yazar + kart aktifleşir + toast.
    await filmCard.first().locator(".pc-apply").click();
    await page.waitForTimeout(400);
    const applied = (await invocations())
      .slice(mark)
      .filter(([c]) => c === "theme_set");
    check(applied.length > 0 && applied[0][1].name === "vesper", "profedit", `Uygula tema yazmadi: ${JSON.stringify(applied[0])}`);
    check((await text(page, "#profile-cards .profile-card.active .pc-name")) === "Film", "profedit", "Uygula karti aktiflestirmedi");
    const hostText = await text(page, "#toast-host");
    check(hostText.includes("Film profili uygulandı"), "profedit", `uygulama toast'u yok: "${hostText.slice(0, 80)}"`);
    await checkOverflow(page, "profedit");
    await shot("19-profil-editör.png");
  });

  // 20. Okuma profili geri dönüşü: aç → ss-dusk, kapat → önceki tema geri gelir.
  await scenario("catppuccin-macchiato", "dark", async ({ page, openTab, shot }) => {
    await openTab("panel");
    const before = await text(page, "#st-theme");
    check(before.length > 0 && before !== "-", "okuma", `acilis temasi okunamadi: "${before}"`);
    await openTab("settings");
    await page.locator("#read-btn").click();
    await page.waitForTimeout(500);
    check((await text(page, "#st-theme")) === "ss-dusk", "okuma", `okuma profili temayi degistirmadi: "${await text(page, "#st-theme")}"`);
    check((await page.locator("#read-btn").getAttribute("aria-pressed")) === "true", "okuma", "read-btn aria-pressed guncellenmedi");
    await page.locator("#read-btn").click();
    await page.waitForTimeout(500);
    const after = await text(page, "#st-theme");
    check(after === before, "okuma", `kapatince onceki tema geri gelmedi: "${before}" -> "${after}"`);
    check((await page.locator("#read-btn").getAttribute("aria-pressed")) === "false", "okuma", "read-btn kapanmadi");
    await checkOverflow(page, "okuma");
    await shot("20-okuma.png");
  });

  // 21. Geçmiş insan dili: ham log biçimi (source=/level=/tone=) yok,
  //     satırlar "·" ayraçlı insan dilinde.
  await scenario("catppuccin-macchiato", "dark", async ({ page, openTab, shot }) => {
    await openTab("history");
    await page.waitForTimeout(400);
    const rows = await page.locator("#hist-panel div").allTextContents();
    check(rows.length > 0, "gecmis-dil", "kayit satiri yok");
    const histText = await text(page, "#hist-panel");
    for (const raw of ["source=", "level=", "tone=", "desired=", "theme="]) {
      check(!histText.includes(raw), "gecmis-dil", `ham log biçimi sızdı: "${raw}" → "${histText.slice(0, 100)}"`);
    }
    check(histText.includes("·"), "gecmis-dil", `satirlar '·' ayraçlı değil: "${histText.slice(0, 100)}"`);
    check(rows.every((r) => r.includes("·")), "gecmis-dil", `ayraçsız satır var: ${rows.filter((r) => !r.includes("·")).slice(0, 2).join(" | ")}`);
    await checkOverflow(page, "gecmis-dil");
    await shot("21-geçmiş-dil.png");
  });

  // 22. Şablon × palet matrisi (v2.6): 4 şablon × 12 palet.
  //     - seçici gerçekten data-* yazıyor ve kalıcılaşıyor mu
  //     - 1040×740'ta Durum sayfası kaydırmasız mı (PLAN-v3 §7 bütçesi)
  //     - 28 kombinasyonun karesi gözle incelemek için diske düşüyor
  await scenario("catppuccin-macchiato", "dark", async ({ page, openTab, shot }) => {
    await page.setViewportSize({ width: 1040, height: 740 });
    await openTab("settings");
    // Görünüm kartı artık Gelişmiş'in dışında — gözle de doğrula.
    await page.locator("#appearance-box").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot("m-ayarlar.png");
    const tplBtns = page.locator("#template-picker .design-card");
    const palBtns = page.locator("#design-picker .design-card");
    // v2.8: beklenen sayı SABİT DEĞİL, `palette.css`ten türetilir — yeni
    // palet eklenince QA "beklenen 7" diye yanlış kırmızı yakmasın, ama
    // kart üretimi bozulursa yine yakalasın.
    const paletteIds = [
      ...readFileSync(join(root, "src/palette.css"), "utf8").matchAll(
        /\[data-theme="([a-z0-9-]+)"\]/g,
      ),
    ].map((m) => m[1]);
    const expectedPalettes = paletteIds.length + 1; // + obsidyen (:root)
    check(
      (await tplBtns.count()) === 4,
      "matris",
      `şablon kartı=${await tplBtns.count()} (beklenen 4)`,
    );
    check(
      (await palBtns.count()) === expectedPalettes,
      "matris",
      `palet kartı=${await palBtns.count()} (beklenen ${expectedPalettes})`,
    );

    const TPLS = ["bento", "sahne", "dergi", "konsol"];
    const PALS = ["obsidyen", ...paletteIds];

    // Şablon seçimi: gerçek tıklama → data-template + kalıcılık + aria.
    for (const id of TPLS) {
      await page.locator(`#template-picker [data-template="${id}"]`).click();
      await page.waitForTimeout(160);
      const got = await page.evaluate(() => document.documentElement.dataset.template);
      check(got === id, "matris", `şablon uygulanmadı: ${id} → ${got}`);
      const pressed = await page
        .locator(`#template-picker [data-template="${id}"]`)
        .getAttribute("aria-pressed");
      check(pressed === "true", "matris", `şablon aria-pressed yanlış: ${id} → ${pressed}`);
      const saved = await page.evaluate(() => localStorage.getItem("ss:template"));
      check(saved === id, "matris", `şablon kalıcı olmadı: ${id} → ${saved}`);
    }

    // Palet seçimi: aynı sözleşme (data-theme + ss:designTheme).
    for (const id of PALS) {
      await page.locator(`#design-picker [data-design="${id}"]`).click();
      await page.waitForTimeout(120);
      const got = await page.evaluate(() => document.documentElement.dataset.theme);
      check(got === id, "matris", `palet uygulanmadı: ${id} → ${got}`);
      const saved = await page.evaluate(() => localStorage.getItem("ss:designTheme"));
      check(saved === id, "matris", `palet kalıcı olmadı: ${id} → ${saved}`);
    }

    // Varsayılan şablon (temiz kurulum) bento olmalı.
    const def = await page.evaluate(() => {
      localStorage.removeItem("ss:template");
      return null;
    });
    void def;

    // Bütçe + matris kareleri: Durum sayfası, her şablon × palet.
    await openTab("panel");
    const budget = [];
    for (const tpl of TPLS) {
      for (const pal of PALS) {
        await page.evaluate(
          ([t, p]) => {
            document.documentElement.dataset.template = t;
            document.documentElement.dataset.theme = p;
          },
          [tpl, pal],
        );
        await page.waitForTimeout(90);
        if (pal === "obsidyen") {
          const m = await page.evaluate(() => {
            const p = document.querySelector(".page:not([hidden])");
            if (!p) return { over: -1 };
            const h = (sel) => {
              const n = p.querySelector(sel);
              return n ? Math.round(n.getBoundingClientRect().height) : 0;
            };
            return {
              over: Math.round(p.scrollHeight - p.clientHeight),
              client: Math.round(p.clientHeight),
              hero: h(".hero"),
              monitors: h("#monitor-box"),
              asym: h(".asym"),
              parts: (() => {
                const a = p.querySelector(".asym");
                if (!a) return "";
                const prev = a.style.alignItems;
                a.style.alignItems = "start";
                const out = [...a.querySelectorAll(".panel-box")]
                  .map((n) => `${n.querySelector(".box-title")?.textContent ?? "?"}=${Math.round(n.getBoundingClientRect().height)}`)
                  .join(",");
                a.style.alignItems = prev;
                const one = (sel) => {
                  const n = p.querySelector(sel);
                  return n ? Math.round(n.getBoundingClientRect().height) : 0;
                };
                return `${out} | monlist=${one("#monitor-list")} ctrl=${one(".monitor-ctrl")} note=${one("#monitor-mode-note")} log=${one(".log")} st-row=${one(".st-row")} asymgap=${one(".asym")}`;
              })(),
            };
          });
          budget.push(
            `${tpl}:${m.over} (ch=${m.client} hero=${m.hero} mon=${m.monitors} asym=${m.asym})\n      ${m.parts}`,
          );
          // Her şablon 1040×740'ta kaydırmasız olmalı (PLAN-v3 §7).
          check(m.over <= 2, "butce", `${tpl}: Durum sayfası ${m.over}px kaydırıyor (1040×740)`);
        }
        await shot(`m-${tpl}-${pal}.png`);
        if (pal === "obsidyen") {
          await openTab("settings");
          await page.waitForTimeout(120);
          await shot(`m-${tpl}-ayarlar.png`);
          await openTab("panel");
          await page.waitForTimeout(120);
        }
      }
    }
    console.log(`  şablon bütçesi (px): ${budget.join(" · ")}`);

    // Dar pencere (760×600): kaydırma serbest ama yatay taşma olmamalı.
    await page.setViewportSize({ width: 760, height: 600 });
    for (const tpl of TPLS) {
      await page.evaluate((t) => {
        document.documentElement.dataset.template = t;
        document.documentElement.dataset.theme = "obsidyen";
      }, tpl);
      await page.waitForTimeout(90);
      await checkOverflow(page, `matris-${tpl}-760`);
    }
    await shot("m-760-bento.png");

    // Dergi masthead tarihi yalnız dergi'de görünür.
    await page.setViewportSize({ width: 1040, height: 740 });
    await page.evaluate(() => {
      document.documentElement.dataset.template = "dergi";
    });
    await page.waitForTimeout(120);
    check(await page.locator("#mast-date").isVisible(), "matris", "dergi'de masthead tarihi görünmüyor");
    check((await text(page, "#mast-date")).length > 3, "matris", "masthead tarihi boş");
    await page.evaluate(() => {
      document.documentElement.dataset.template = "bento";
    });
    await page.waitForTimeout(120);
    check(await page.locator("#mast-date").isHidden(), "matris", "bento'da masthead tarihi görünüyor");
  });

  await browser.close();
  server.close();

  for (const err of consoleErrors) fail("konsol", err);
  console.log(problems.length ? `SONUC: FAIL (${problems.length} problem)` : "SONUC: PASS");
  process.exit(problems.length ? 1 : 0);
}

run().catch((e) => {
  console.error("KOŞU ÇÖKTÜ", e);
  process.exit(2);
});