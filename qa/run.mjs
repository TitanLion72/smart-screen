// Visual + functional QA for the smart-screen panel at 800x600.
// Serves ../dist with a stubbed Tauri bridge, walks the four tabs,
// captures screenshots into ./shots, and fails on overflow, dead controls
// or console exceptions.

import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const qaDir = dirname(fileURLToPath(import.meta.url));
const distDir = join(qaDir, "..", "dist");
const shotDir = join(qaDir, "shots");

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

const stubScript = (themeName, themeMode, exe) => `
window.__invocations = [];
window.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    window.__invocations.push([cmd, args ?? null]);
    switch (cmd) {
      case "brightness_get": return 42;
      case "is_fullscreen": return false;
      case "foreground_exe": return ${JSON.stringify(exe ?? "firefox.exe")};
      case "theme_get": return [${JSON.stringify(themeName)}, ${JSON.stringify(themeMode)}];
      case "decide_target": return ["vesper", "dark", 30];
      case "decide_brightness": return (args && typeof args.desired === "number") ? args.desired : 30;
      case "brightness_floor": return 0;
      case "light_sample": return [20.5, 1.0, "dark", "neutral"];
      case "autostart_get": return true;
      case "pref_get": return null;
      case "pref_list": return [];
      case "pref_get_bright": return null;
      case "battery_status": return [85, true];
      case "contrast_audit": return [
        { name: "ss-night", mode: "dark", text_on_bg: 8.5, muted_on_bg: 5.9, syntax_min: 4.9, verdict: "AA" },
        { name: "soluk-tema", mode: "dark", text_on_bg: 2.2, muted_on_bg: 1.1, syntax_min: 1.0, verdict: "FAIL" },
      ];
      case "log_lines": return ["2026-10-06T20:58:00.000Z | source=auto/auto | level=dark | tone=neutral | desired=30 | applied=30 | theme=vesper/dark | note=izle"];
      case "stats_summary": return {
        buckets: ${JSON.stringify(buckets)},
        themeChangesToday: 3,
        avgAppliedToday: 46,
        frozenTicksToday: 2,
        ticksToday: 24,
      };
      default: return null;
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

async function run() {
  await mkdir(shotDir, { recursive: true });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^[/\\]+/, "");
      const file = join(distDir, normalize(rel));
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

  async function scenario(themeName, themeMode, steps, exe) {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    await page.addInitScript(stubScript(themeName, themeMode, exe));
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const invocations = async () => page.evaluate(() => window.__invocations);
    const openTab = async (name) => {
      await page.locator(`.tab[data-tab="${name}"]`).click();
      await page.waitForTimeout(350);
    };
    await steps({ page, invocations, openTab });
    await page.close();
  }

  const checkOverflow = async (page, label) => {
    const height = await page.evaluate(() => document.body.scrollHeight);
    if (height > 600) fail("tasma", `${label}: body.scrollHeight=${height}`);
  };

  // 1. Panel: no leaks, no overflow.
  await scenario("catppuccin-macchiato", "dark", async ({ page }) => {
    await checkOverflow(page, "panel");
    for (const id of ["break-band", "risk-band"]) {
      if (await page.locator(`#${id}`).isVisible()) fail("sizinti", `#${id} panelde gorunuyor`);
    }
    const chips = await page.locator("#profile-switch .chip").count();
    if (chips < 2) fail("panel", `profil hizli secimi yok (${chips})`);
    // Swallowed exceptions inside tick() never reach the console; catch them here.
    for (const id of ["st-bright", "st-theme", "st-light"]) {
      const text = await page.locator(`#${id}`).textContent();
      if (!text || text === "-") fail("panel", `#${id} dolmadi (tick hata yutmus olabilir)`);
    }
    const logText = await page.locator("#log").textContent();
    if (logText && logText.includes("hata:")) fail("panel", `tick hatasi: ${logText.slice(0, 120)}`);
    await page.screenshot({ path: join(shotDir, "1-panel.png") });
  });

  // 2. Settings: segmented control, theme chip, tag editor, switches.
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, openTab }) => {
    await openTab("settings");
    await checkOverflow(page, "ayarlar");
    await page.locator("#mode-seg .seg-item").nth(1).click();
    await page.waitForTimeout(250);
    const activeSeg = await page.locator("#mode-seg .seg-item.active").textContent();
    if (!activeSeg) fail("ayarlar", "mod segmenti secim gostermiyor");
    await page.locator("#theme-picker .chip").first().click();
    await page.waitForTimeout(300);
    const cmds = (await invocations()).map(([c]) => c);
    if (!cmds.includes("theme_set")) fail("ayarlar", "tema cipi theme_set cagrilmadi");
    if (!cmds.includes("pref_learn")) fail("ayarlar", "tema cipi pref_learn cagrilmadi");
    const pills = await page.locator("#block-editor .tag-pill").count();
    if (pills === 0) fail("ayarlar", "engelli listesi bos gorunuyor");
    await page.locator("#add-current-btn").click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(shotDir, "2-ayarlar.png") });
  });

  // 3. Risky external theme warns and offers a named target.
  await scenario("synthwave84", "dark", async ({ page }) => {
    const label = await page.locator("#risk-fix-btn").textContent();
    if (!label || !label.includes("Dön")) fail("risk", `dugme etiketi belirsiz: ${label}`);
    if (!(await page.locator("#risk-band").isVisible())) fail("risk", "risk bandi gorunmedi");
    await page.screenshot({ path: join(shotDir, "3-risk.png") });
  });

  // 4. Profiles: create, edit, persist.
  await scenario("catppuccin-macchiato", "dark", async ({ page, openTab }) => {
    await openTab("profiles");
    const before = await page.locator("#profile-cards .profile-card").count();
    await page.locator("#pf-add").click();
    await page.waitForTimeout(250);
    const after = await page.locator("#profile-cards .profile-card").count();
    if (after !== before + 1) fail("profil", `yeni profil eklenmedi (${before} -> ${after})`);
    const meta = await page.locator("#profile-cards .pc-meta").count();
    if (meta < after) fail("profil", `kartlarda ozet satiri eksik (${meta}/${after})`);
    await page.locator("#pf-name").fill("Gece");
    await page.locator("#pf-save").click();
    await page.waitForTimeout(250);
    const names = await page.locator("#profile-cards .pc-name").allTextContents();
    if (!names.includes("Gece")) fail("profil", `kaydedilen isim yok: ${names.join(",")}`);
    await checkOverflow(page, "profiller");
    await page.screenshot({ path: join(shotDir, "4-profiller.png") });
  });

  // 5. History: summary numbers and 12-bar chart.
  await scenario("catppuccin-macchiato", "dark", async ({ page, openTab }) => {
    await openTab("history");
    const bars = await page.locator("#chart rect").count();
    if (bars < 12) fail("grafik", `cubuk sayisi=${bars} (beklenen >=12)`);
    if ((await page.locator("#sum-changes").textContent()) !== "3") fail("grafik", "ozet sayilari dolmadi");
    const rows = await page.locator("#hist-panel div").count();
    if (rows === 0) fail("gecmis", "kayit satiri yok");
    await checkOverflow(page, "gecmis");
    await page.screenshot({ path: join(shotDir, "5-gecmis.png") });
  });

  // 6. Display extras: warmth, reading mode, calibration hint.
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, openTab }) => {
    await openTab("settings");
    await page.locator("#warm-switch").click();
    await page.waitForTimeout(250);
    const warmState = await page.locator("#warm-switch").getAttribute("aria-checked");
    if (warmState !== "true") fail("ekran", "sicak ton anahtari acilmadi");
    await page.locator("#warm-plus").click();
    await page.waitForTimeout(250);
    const warmVal = Number(await page.locator("#warm-val").textContent());
    if (!(warmVal > 35)) fail("ekran", `ton siddeti artmadi: ${warmVal}`);
    await page.locator("#read-btn").click();
    await page.waitForTimeout(400);
    if (!(await page.locator("#read-btn").getAttribute("class"))?.includes("active")) {
      fail("ekran", "okuma profili vurgusu gelmedi");
    }
    const hint = await page.locator("#calib-hint").textContent();
    if (!hint || !hint.includes("kalibrasyon")) fail("ekran", "kalibrasyon gosterimi eksik");
    const cmds = (await invocations()).map(([c]) => c);
    if (!cmds.includes("gamma_set_warmth")) fail("ekran", "gamma_set_warmth cagrilmadi");
    if (!cmds.includes("animations_set")) fail("ekran", "animations_set cagrilmadi");
    await page.screenshot({ path: join(shotDir, "6-ekran.png") });
  });

  // 7. Contrast audit: measured ratios render and the gate toggles.
  await scenario("catppuccin-macchiato", "dark", async ({ page, openTab }) => {
    await openTab("settings");
    const rows = await page.locator("#audit-list .audit-row").count();
    if (rows < 2) fail("kontrast", `denetim satiri az: ${rows}`);
    const badges = await page.locator("#audit-list .badge").allTextContents();
    if (!badges.includes("FAIL")) fail("kontrast", "FAIL rozeti gorunmedi");
    if (!badges.includes("AA")) fail("kontrast", "AA rozeti gorunmedi");
    const colors = await page.locator("#audit-list .audit-muted").allTextContents();
    if (!colors.some((c) => c.includes("renk"))) fail("kontrast", "renk kodu sutunu gorunmedi");
    await page.locator("#audit-refresh").click();
    await page.waitForTimeout(200);
    await page.locator("#gate-switch").click();
    await page.waitForTimeout(150);
    const gate = await page.locator("#gate-switch").getAttribute("aria-checked");
    if (gate !== "false") fail("kontrast", `kontrast kapisi kapanmadi: ${gate}`);
    await checkOverflow(page, "kontrast");
    await page.screenshot({ path: join(shotDir, "7-kontrast.png") });
  });

  // 8. App-bound profile takes over when its app is in front.
  await scenario("catppuccin-macchiato", "dark", async ({ page }) => {
    const logText = (await page.locator("#log").textContent()) ?? "";
    if (!logText.includes("(code.exe)")) fail("bagim", "bagli profil log'a dusmedi");
    const pill = (await page.locator("#profile-pill").textContent()) ?? "";
    if (!pill.includes("\u2192")) fail("bagim", `rozet devri gostermedi: ${pill}`);
    if (logText.includes("hata:")) fail("bagim", `tick hatasi: ${logText.slice(0, 120)}`);
    await checkOverflow(page, "bagim");
    await page.screenshot({ path: join(shotDir, "8-uygulama.png") });
  }, "code.exe");

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