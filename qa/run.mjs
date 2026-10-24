// Visual + functional QA for the smart-screen UI shell (index.html SÖZLEŞME v2).
// Serves ../dist with a stubbed Tauri bridge, walks the four tabs, captures
// screenshots into ./shots, and fails on overflow, dead controls, swallowed
// tick errors or console exceptions.
//
// Stub policy: UNKNOWN invoke commands THROW (never return null) so real
// regressions surface instead of silently degrading. The Pro gate mimic in the
// stub is a "UI davranış testi" aid — it imitates the backend rejection so the
// free/Pro UI paths can be exercised; the real gate lives in src-tauri.

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
window.__licPro = false;
window.__theme = [${JSON.stringify(themeName)}, ${JSON.stringify(themeMode)}];
window.__target = ["vesper", "dark", 30];
window.__logs = ["2026-10-06T20:58:00.000Z | source=auto/auto | level=dark | tone=neutral | desired=30 | applied=30 | theme=vesper/dark | note=izle"];
window.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    window.__invocations.push([cmd, args ?? null]);
    switch (cmd) {
      case "brightness_get": return 42;
      case "brightness_set": return null;
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
      case "decide_brightness": return (args && typeof args.desired === "number") ? args.desired : 30;
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
      case "warmth_auto": return 35;
      case "gamma_set_warmth": return null;
      case "gamma_restore": return null;
      case "animations_set": return null;
      case "contrast_audit": return [
        { name: "ss-night", mode: "dark", text_on_bg: 8.5, muted_on_bg: 5.9, syntax_min: 4.9, verdict: "AA" },
        { name: "soluk-tema", mode: "dark", text_on_bg: 2.2, muted_on_bg: 1.1, syntax_min: 1.0, verdict: "FAIL" },
      ];
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
      case "stats_summary": return {
        buckets: ${JSON.stringify(buckets)},
        themeChangesToday: 3,
        avgAppliedToday: 46,
        frozenTicksToday: 2,
        ticksToday: 24,
      };
      // Tauri eklenti köprüleri (app/version, notification, opener).
      case "plugin:app|version": return "1.4.0";
      case "plugin:notification|is_permission_granted": return true;
      case "plugin:notification|request_permission": return "granted";
      case "plugin:notification|notify": return null;
      case "plugin:opener|open_url": return null;
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
    // log-clear-btn onaylıdır; QA onayı otomatik verir.
    page.on("dialog", (d) => void d.accept());
    await page.addInitScript(stubScript(themeName, themeMode, exe));
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const invocations = async () => page.evaluate(() => window.__invocations);
    const openTab = async (name) => {
      await page.locator(`.tab[data-tab="${name}"]`).click();
      await page.waitForTimeout(300);
    };
    const openAdvanced = async () => {
      await page.locator("#advanced").click();
      await page.waitForTimeout(150);
    };
    // Karar "2 tur bekleme" kuralıyla uygulanır: hedefi değiştir, iki tur koş.
    const snap = async (target) => {
      await page.evaluate((t) => {
        window.__target = t;
      }, target);
      await page.locator("#now-btn").click();
      await page.waitForTimeout(400);
      await page.locator("#now-btn").click();
      await page.waitForTimeout(700);
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

  // 1. Bugün: hero + durum kartları + monitörler + olay akışı.
  await scenario("catppuccin-macchiato", "dark", async ({ page, shot }) => {
    await checkOverflow(page, "bugun");
    for (const id of ["break-band", "risk-band"]) {
      check(!(await page.locator(`#${id}`).isVisible()), "sizinti", `#${id} panelde gorunuyor`);
    }
    const bright = await text(page, "#st-bright");
    check(/^%\d+$/.test(bright), "hero", `st-bright dolmadi: "${bright}"`);
    const target = await text(page, "#hero-target");
    check(/^%\d+$/.test(target), "hero", `hero-target dolmadi: "${target}"`);
    const pill = await text(page, "#mode-pill");
    check(pill === "Akıllı", "hero", `mode-pill beklenen rozet degil: "${pill}"`);
    const next = await text(page, "#next-change");
    check(
      next === "ölçüme göre" || /^sonraki değişim: \d{2}:\d{2}$/.test(next),
      "hero",
      `next-change belirsiz: "${next}"`,
    );
    const why = await text(page, "#why-line");
    check(why.includes("ölçüme göre akıyor"), "hero", `why-line akıyor durumunu gostermedi: "${why}"`);
    const sub = await text(page, "#sub-bright");
    check(sub.includes("hedef:"), "hero", `sub-bright hedef satiri yok: "${sub}"`);
    const clock = await text(page, "#clock");
    check(/^\d{2}:\d{2}$/.test(clock), "hero", `clock canli saat gostermedi: "${clock}"`);
    for (const id of ["st-light", "st-theme", "st-frozen"]) {
      const t = await text(page, `#${id}`);
      check(t && t !== "-", "panel", `#${id} dolmadi (tick hata yutmus olabilir): "${t}"`);
    }
    const rows = await page.locator("#monitor-list .monitor-row").count();
    check(rows >= 3, "monitor", `monitor satiri az: ${rows}`);
    const firstVal = await page.locator("#monitor-list .monitor-row .mon-val").first().textContent();
    check((firstVal ?? "").includes("%42"), "monitor", `ilk satir yuzdesi dolmadi: "${firstVal}"`);
    const chips = await page.locator("#profile-switch .chip").count();
    check(chips >= 2, "panel", `profil hizli secimi yok (${chips})`);
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
    check(modeBadge.includes("İzliyor"), "sekme", `mode-badge izliyor gostermedi: "${modeBadge}"`);
    const profPill = await text(page, "#profile-pill");
    check(profPill.length > 0, "sekme", "profile-pill bos");
    await shot("2-sekmeler.png");
  });

  // 3. Ritim: kip kartlari + sicak ton + gece korumasi + okuma.
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, openTab, shot }) => {
    await openTab("settings");
    await checkOverflow(page, "ritim");
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
    check(note.includes("Canlı önizleme"), "ritim", `onizleme notu yok: "${note}"`);
    const left = await page.locator("#day-now").evaluate((el2) => el2.style.left);
    check(left.endsWith("%"), "ritim", `day-now konumu yuzde degil: "${left}"`);
    const calib = await text(page, "#calib-hint");
    check(calib.includes("kalibrasyon"), "ritim", `kalibrasyon gosterimi eksik: "${calib}"`);

    await page.locator("#sleep-start").fill("2");
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
    check(badges.includes("FAIL"), "kontrast", "FAIL rozeti gorunmedi");
    check(badges.includes("AA"), "kontrast", "AA rozeti gorunmedi");
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
    await checkOverflow(page, "advanced");
    await shot("4-advanced.png");
  });

  // 5. Lisans akisi: kilitli -> etkin -> kaldirilmis + otomatik yol kilidi.
  await scenario("catppuccin-macchiato", "dark", async ({ page, invocations, openTab, openAdvanced, snap, shot }) => {
    // Ucretsiz: karar uygulanir ama harici monitore yazma DENENMEZ bile.
    await snap(["ss-night", "dark", 28]);
    const logFree = await text(page, "#log");
    check(logFree.includes("tema: ss-night"), "lisans", `ucretsiz karar uygulanmadi: ${logFree.slice(0, 80)}`);
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
    const mini0 = await text(page, "#lic-mini-status");
    check(mini0.includes("ücretsiz"), "lisans", `mini durum ucretsiz gostermedi: ${mini0}`);
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
    const mini = await text(page, "#lic-mini-status");
    check(mini.includes("Pro"), "lisans", `mini durum Pro gostermedi: ${mini}`);
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
    await page.locator("#pf-add").click();
    await page.waitForTimeout(250);
    const after = await page.locator("#profile-cards .profile-card").count();
    check(after === before + 1, "profil", `yeni profil eklenmedi (${before} -> ${after})`);
    const meta = await page.locator("#profile-cards .pc-meta").count();
    check(meta >= after, "profil", `kartlarda ozet satiri eksik (${meta}/${after})`);
    await page.locator("#pf-name").fill("Gece");
    await page.locator("#pf-save").click();
    await page.waitForTimeout(250);
    const names = await page.locator("#profile-cards .pc-name").allTextContents();
    check(names.includes("Gece"), "profil", `kaydedilen isim yok: ${names.join(",")}`);

    // Iki asamali silme: ilk tik onay, ikinci tik siler.
    await page.locator("#pf-delete").click();
    await page.waitForTimeout(150);
    const armLabel = (await page.locator("#pf-delete").textContent()) ?? "";
    check(armLabel.includes("Emin"), "profil", `silme onayi cikmadi: ${armLabel}`);
    const armedCount = await page.locator("#profile-cards .profile-card").count();
    check(armedCount === after, "profil", "tek tikta silindi, onay beklenirdi");
    await page.locator("#pf-delete").click();
    await page.waitForTimeout(300);
    const afterDelete = await page.locator("#profile-cards .profile-card").count();
    check(afterDelete === after - 1, "profil", `ikinci tikta silinmedi (${after} -> ${afterDelete})`);

    // Geri getirme: silinen tohum profil geri gelir.
    const filmCard = page.locator("#profile-cards .profile-card").filter({ hasText: "Film" });
    if ((await filmCard.count()) > 0) {
      await filmCard.first().click();
      await page.waitForTimeout(250);
      await page.locator("#pf-delete").click();
      await page.waitForTimeout(150);
      await page.locator("#pf-delete").click();
      await page.waitForTimeout(300);
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
    await filmCard.first().click();
    await page.waitForTimeout(250);
    const countBefore = await text(page, "#pf-apps-count");
    await page.locator("#pf-bind-current").click();
    await page.waitForTimeout(250);
    const countAfter = await text(page, "#pf-apps-count");
    check(countAfter !== countBefore, "bagim", `on plandaki eklemedi: ${countBefore} -> ${countAfter}`);
    check(countAfter.includes("1 uygulama"), "bagim", `baglanan uygulama sayisi yanlis: "${countAfter}"`);
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
    check(await page.locator("#lic-mini").isVisible(), "gecmis", "lic-mini gorunmuyor");

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
    check(logText.includes("tema:"), "otomatik", "karar uygulanmadi (tema log'u yok)");
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
    check((await text(page, "#mode-badge")).includes("İzliyor"), "duraklatma", "duraklatma bitmedi");

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