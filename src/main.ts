import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getVersion } from "@tauri-apps/api/app";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { ACCENTS, MODE_OPTIONS, MODE_LABEL, RISKY, SOURCE_LABEL, SOURCE_OPTIONS, THEMES } from "./catalog";
import type { Mode, Source } from "./catalog";
import { MAX_PROFILES, createProfile, duplicateProfile, getSetting, loadActiveId, loadProfiles, saveActiveId, saveProfiles, setSetting, upsertProfile } from "./store";
import type { Profile } from "./store";
import { bindSwitch, buildSeg, buildTagEditor } from "./widgets";
import type { TagHandle } from "./widgets";

type Level = "info" | "ok" | "warn" | "bad";

interface Bucket {
  hoursAgo: number;
  appliedAvg: number;
  desiredAvg: number;
  samples: number;
}

interface StatsSummary {
  buckets: Bucket[];
  themeChangesToday: number;
  avgAppliedToday: number;
  frozenTicksToday: number;
  ticksToday: number;
}

/** WCAG denetim raporu (backend `contrast::Report`). */
interface AuditReport {
  name: string;
  mode: string;
  text_on_bg: number;
  muted_on_bg: number;
  /** Sözdizimi + geri bildirim renklerinin en kötü oranı. */
  syntax_min: number;
  verdict: string;
}

const WATCH_MS = 60 * 1000;
const CAM_MS = 5 * 60 * 1000;
const CAM_MS_LOW = 15 * 60 * 1000;
const BREAK_MS = 20 * 60 * 1000;
const SNOOZE_MS = 5 * 60 * 1000;
const UNDO_DEPTH = 5;

const DEFAULT_BLOCKLIST =
  "vlc.exe,mpv.exe,mpc-hc64.exe,mpc-hc.exe,mpc-be.exe,potplayer.exe,kodi.exe,plex.exe,wmplayer.exe,sumatrapdf.exe,acrobat.exe,acrord32.exe,foxitreader.exe";
const DEFAULT_ALLOWLIST =
  "windowsterminal.exe,wezterm-gui.exe,alacritty.exe,code.exe,notepad++.exe,ghostty.exe";

let mode = getSetting("mode", "auto") as Mode;
let source = getSetting("source", "auto") as Source;
let locked = getSetting("locked", "0") === "1";
let paused = false;
let offset = Number(getSetting("brightOffset", "0")) || 0;
let breakEnabled = getSetting("breakEnabled", "1") === "1";
let sleepStart = Number(getSetting("sleepStart", "1")) || 1;
let sleepEnd = Number(getSetting("sleepEnd", "7")) || 7;
let sleepCap = Number(getSetting("sleepCap", "15")) || 15;
let blockItems = splitList(getSetting("blocklist", DEFAULT_BLOCKLIST));
let allowItems = splitList(getSetting("allowlist", DEFAULT_ALLOWLIST));
let warmEnabled = getSetting("warmEnabled", "0") === "1";
let warmPercent = Number(getSetting("warmPercent", "35")) || 35;
let readingMode = getSetting("readingMode", "0") === "1";

let profiles: Profile[] = loadProfiles();
let activeId = loadActiveId();
if (!activeId || !profiles.some((p) => p.id === activeId)) {
  activeId = profiles[0]?.id ?? "";
  saveActiveId(activeId);
}
let draft: Profile = { ...(profiles.find((p) => p.id === activeId) ?? createProfile("Profil")) };
let editorDirty = false;

let pendingKey: string | null = null;
let pendingCount = 0;
let appliedKey: string | null = null;
let lastAct = 0;
let lastAppliedBright = 0;
let lastCam: { lum: number; level: string; tone: string; at: number } | null = null;
let undoStack: { name: string; mode: string; value: number }[] = [];
let breakDueAt = Date.now() + BREAK_MS;
let breakState: "waiting" | "alerting" = "waiting";
let notifyReady = false;
let tagBlock: TagHandle | null = null;
let tagAllow: TagHandle | null = null;
let tagApps: TagHandle | null = null;
let audits: AuditReport[] = [];
let auditGate = getSetting("auditGate", "1") === "1";
let lastGateWarn = "";
let boundName: string | null = null;
let lastBoundExe: string | null = null;

function splitList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 0);
}

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error("eksik element: " + id);
  return node;
}

function activeProfile(): Profile | null {
  return profiles.find((p) => p.id === activeId) ?? null;
}

function setDot(id: string, cls: string): void {
  el(id).className = "dot " + cls;
}

function log(msg: string, level: Level = "info"): void {
  const box = el("log");
  box.querySelector(".log-empty")?.remove();
  const row = document.createElement("div");
  row.className = "log-row";
  const dot = document.createElement("span");
  dot.className =
    "dot " + (level === "ok" ? "ok" : level === "warn" ? "warn" : level === "bad" ? "bad" : "");
  const text = document.createElement("span");
  text.textContent = msg;
  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = new Date().toLocaleTimeString("tr-TR");
  row.append(dot, text, time);
  box.prepend(row);
  while (box.children.length > 100) box.lastChild?.remove();
}

async function diskLog(note: string, desired: number, applied: number, theme: string, level = "-", tone = "-"): Promise<void> {
  const line = `${new Date().toISOString()} | source=${mode}/${source} | level=${level} | tone=${tone} | desired=${desired} | applied=${applied} | theme=${theme} | note=${note}`;
  await invoke("log_tick", { line }).catch(() => undefined);
}

// ---------- tabs ----------

function switchTab(name: string): void {
  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
  });
  for (const page of ["panel", "profiles", "settings", "history"]) {
    el(`page-${page}`).hidden = page !== name;
  }
  if (name === "history") {
    void loadHistory();
  }
}

// ---------- header / badges ----------

function syncBadge(): void {
  const badge = el("mode-badge");
  const parts: string[] = [];
  if (locked) parts.push("Kilitli");
  else if (paused) parts.push("Duraklatıldı");
  if (parts.length === 0) parts.push("İzliyor");
  badge.textContent = parts.join(" • ");
  badge.className = "badge " + (locked || paused ? "warn" : "");
  const prof = activeProfile();
  el("profile-pill").textContent = boundName
    ? `${prof ? prof.name : "-"} → ${boundName}`
    : prof
      ? prof.name
      : "Profil yok";
  el("profile-pill").title = boundName
    ? `${boundName} bağlı uygulama yüzünden yönetiyor`
    : "aktif profil";
}

function updateUndoBtn(): void {
  (el("undo-btn") as HTMLButtonElement).disabled = undoStack.length === 0;
}

// ---------- theme + risk ----------

function renderThemePicker(): void {
  const host = el("theme-picker");
  host.replaceChildren();
  for (const t of THEMES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.title = `${t.name} — ${t.note}`;
    b.textContent = t.name;
    b.dataset.name = t.name;
    b.dataset.mode = t.mode;
    b.addEventListener("click", () => {
      void pickTheme(t.name, t.mode);
    });
    host.append(b);
  }
  syncChips();
}

function syncChips(): void {
  document.querySelectorAll<HTMLButtonElement>("#theme-picker .chip").forEach((b) => {
    b.classList.toggle("active", appliedKey === `${b.dataset.name}|${b.dataset.mode}`);
  });
}

async function pushUndo(currentName: string, currentValue: number): Promise<void> {
  const [, tmode] = await invoke<[string, string | null]>("theme_get").catch(
    () => [currentName, ""] as [string, string],
  );
  undoStack.push({ name: currentName, mode: tmode ?? "", value: currentValue });
  if (undoStack.length > UNDO_DEPTH) undoStack.shift();
  updateUndoBtn();
}

async function pickTheme(name: string, themeMode: string): Promise<void> {
  try {
    const current = await invoke<number>("brightness_get");
    await pushUndo(appliedKey?.split("|")[0] ?? name, current);
    await invoke("theme_set", { name, mode: themeMode });
    appliedKey = `${name}|${themeMode}`;
    pendingKey = null;
    pendingCount = 0;
    const light = lastCam ? `${lastCam.level}/${lastCam.tone}` : "unknown";
    await invoke("pref_learn", { hour: new Date().getHours(), light, name, mode: themeMode });
    log(`elle tema: ${name} (${themeMode})`, "ok");
    await learnBrightness();
    await refresh(null);
  } catch (e) {
    log("tema değişmedi: " + String(e), "bad");
  }
}

async function undo(): Promise<void> {
  const prev = undoStack.pop();
  updateUndoBtn();
  if (!prev) {
    log("geri alınacak değişiklik yok", "warn");
    return;
  }
  try {
    await invoke("theme_set", { name: prev.name, mode: prev.mode || null });
    await invoke("brightness_set", { value: prev.value });
    appliedKey = `${prev.name}|${prev.mode}`;
    pendingKey = null;
    pendingCount = 0;
    log(`geri alındı: ${prev.name}`, "ok");
    await refresh(null);
  } catch (e) {
    log("geri alınamadı: " + String(e), "bad");
  }
}

/** Temanin olculmus kontrast raporu; olcusulmemisse null. */
function findAudit(name: string, themeMode: string | null): AuditReport | null {
  const norm = name.toLowerCase();
  const mine = audits.filter((r) => r.name.toLowerCase() === norm);
  if (mine.length === 0) return null;
  const want = themeMode === "light" ? "light" : "dark";
  return mine.find((r) => r.mode === want) ?? mine[0];
}

/** FAIL cikan tema otomatik secimde uygulanmaz (anahtar acikken). */
function gateReason(name: string, themeMode: string): string | null {
  if (!auditGate) return null;
  const rep = findAudit(name, themeMode);
  return rep && rep.verdict === "FAIL" ? `kontrast ${rep.text_on_bg}:1 (WCAG FAIL)` : null;
}

function badgeClass(verdict: string): string {
  return verdict === "FAIL" ? "bad" : verdict === "AAA" || verdict === "AA" ? "ok" : "warn";
}

function renderAudit(): void {
  const host = el("audit-list");
  host.replaceChildren();
  if (audits.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "Ölçülecek tema dosyası yok (~/.config/opencode/themes).";
    host.append(empty);
    return;
  }
  for (const r of audits) {
    const row = document.createElement("div");
    row.className = "audit-row";
    const name = document.createElement("span");
    name.className = "audit-name";
    name.textContent = r.name;
    const modeEl = document.createElement("span");
    modeEl.className = "audit-mode";
    modeEl.textContent = r.mode;
    const ratio = document.createElement("span");
    ratio.className = "audit-ratio";
    ratio.textContent = `${r.text_on_bg}:1`;
    ratio.title = `metin/zemin ${r.text_on_bg}:1 • ikincil metin ${r.muted_on_bg}:1 • renk kodu ${r.syntax_min}:1`;
    const verdict = document.createElement("span");
    verdict.className = "badge " + badgeClass(r.verdict);
    verdict.textContent = r.verdict;
    const colors = document.createElement("span");
    colors.className = "audit-muted";
    colors.textContent = `renk ${r.syntax_min ?? 0}`;
    row.append(name, modeEl, ratio, verdict, colors);
    host.append(row);
  }
}

async function loadAudit(): Promise<void> {
  try {
    const rows = await invoke<AuditReport[]>("contrast_audit");
    audits = Array.isArray(rows) ? rows : [];
  } catch (e) {
    audits = [];
    log("kontrast denetimi okunamadı: " + String(e), "bad");
    return;
  }
  renderAudit();
}

async function updateRisk(name: string, themeMode: string | null): Promise<void> {
  const rep = findAudit(name, themeMode);
  const risky = rep ? rep.verdict === "FAIL" : RISKY.includes(name.toLowerCase());
  el("risk-band").hidden = !risky;
  if (!risky) return;
  el("risk-text").textContent = rep
    ? `${name}: ${rep.text_on_bg}:1 — WCAG ${rep.verdict} (${rep.mode}), gözü yorar.`
    : `${name} yüksek kontrastlı — gece göz yorar.`;
  try {
    const [target] = await invoke<[string, string, number]>("decide_target", {
      hour: new Date().getHours(),
      source,
    });
    (el("risk-fix-btn") as HTMLButtonElement).textContent = `Dön: ${target}`;
  } catch {
    (el("risk-fix-btn") as HTMLButtonElement).textContent = "Güvenli temaya dön";
  }
}

// ---------- refresh + tick ----------

async function applyWarmth(): Promise<void> {
  try {
    if (warmEnabled) {
      await invoke("gamma_set_warmth", { percent: warmPercent });
    } else {
      await invoke("gamma_restore");
    }
  } catch (e) {
    log("sıcak ton uygulanamadı: " + String(e), "bad");
  }
}

/** Okuma profili: sakin tema + düşük tavan + animasyon kapalı + sıcak ton. */
async function toggleReading(): Promise<void> {
  readingMode = !readingMode;
  setSetting("readingMode", readingMode ? "1" : "0");
  try {
    await invoke("animations_set", { enabled: !readingMode });
    if (readingMode) {
      warmEnabled = true;
      setSetting("warmEnabled", "1");
      await applyWarmth();
      await pickTheme("ss-dusk", "dark");
      log("okuma profili: sıcak sakin tema, düşük tavan, animasyon kapalı", "ok");
    } else {
      await invoke("animations_set", { enabled: true });
      await applyWarmth();
      log("okuma profili kapandı", "ok");
    }
  } catch (e) {
    log("okuma profili değişmedi: " + String(e), "bad");
  }
  syncControls();
}

async function learnBrightness(): Promise<void> {
  try {
    const current = await invoke<number>("brightness_get");
    const hour = new Date().getHours();
    const light = lastCam ? `${lastCam.level}/${lastCam.tone}` : "unknown";
    await invoke("pref_learn_bright", { hour, light, value: current });
    await showCalibration();
  } catch {
    /* öğrenme sessizce atlanabilir */
  }
}

async function showCalibration(): Promise<void> {
  try {
    const hour = new Date().getHours();
    const light = lastCam ? `${lastCam.level}/${lastCam.tone}` : "unknown";
    const got = await invoke<[number, number] | null>("pref_get_bright", { hour, light });
    el("calib-hint").textContent = got
      ? `kalibrasyon: %${got[0]} (${got[1]} gözlem) — bu saatte tercihin`
      : "kalibrasyon: henüz gözlem yok";
  } catch {
    /* gösterim atlanabilir */
  }
}

async function refresh(frozen?: string | null): Promise<void> {
  try {
    const bright = await invoke<number>("brightness_get");
    lastAppliedBright = bright;
    el("st-bright").textContent = `%${bright}`;
    el("st-bright").title = `mevcut: %${bright}, hedef düzeltmesi dahil`;
    const [name, themeMode] = await invoke<[string, string | null]>("theme_get");
    el("st-theme").textContent = name;
    el("st-theme").title = `${name} (${themeMode ?? "-"})`;
    el("sub-theme").textContent = themeMode ? `mod: ${themeMode}` : "mod: -";
    appliedKey = `${name}|${themeMode ?? ""}`;
    void updateRisk(name, themeMode);
    syncChips();
    el("st-frozen").textContent = frozen ?? (locked ? "Kilit" : paused ? "Duraklatıldı" : "İzliyor");
    el("sub-frozen").textContent = frozen ?? (locked ? "manuel kilit" : paused ? "duraklatıldı" : "serbest");
    setDot("dot-frozen", frozen || locked || paused ? "warn" : "ok");
    syncBadge();
  } catch (e) {
    log("durum okunamadı: " + String(e), "bad");
  }
}

function inSleepWindow(hour: number): boolean {
  return sleepStart <= sleepEnd ? hour >= sleepStart && hour < sleepEnd : hour >= sleepStart || hour < sleepEnd;
}

function applySleepCap(desired: number, hour: number): number {
  return inSleepWindow(hour) ? Math.min(desired, sleepCap) : desired;
}

async function cameraSample(force: boolean, camLimit: number): Promise<{ lum: number; level: string; tone: string } | null> {
  if (!force && lastCam && Date.now() - lastCam.at < camLimit) return lastCam;
  try {
    const [lum, , level, tone] = await invoke<[number, number, string, string]>("light_sample");
    lastCam = { lum, level, tone, at: Date.now() };
    return lastCam;
  } catch {
    return lastCam;
  }
}

async function tick(reason: string): Promise<void> {
  lastAct = Date.now();
  if (paused) {
    log("duraklatıldı, atlandı", "warn");
    await refresh(null);
    return;
  }
  // Uygulamaya bağlı profil: dondurma kuralları dışında bu turu yönetir.
  const exe = await invoke<string | null>("foreground_exe").catch(() => null);
  const bound = exe ? profiles.find((p) => (p.apps ?? []).includes(exe)) ?? null : null;
  boundName = bound ? bound.name : null;
  if (bound && lastBoundExe !== exe) {
    log(`uygulamaya bağlı profil: ${bound.name} (${exe})`, "ok");
    lastBoundExe = exe;
  } else if (!bound) {
    lastBoundExe = null;
  }
  if (locked || (mode === "fixed" && !bound)) {
    await diskLog(`kilitli/sabit ${reason}`, 0, lastAppliedBright, appliedKey ?? "-");
    log(`kilitli/sabit (${reason}), atlandı`, "warn");
    await refresh(null);
    return;
  }
  try {
    const prof = activeProfile();
    if (exe && blockItems.includes(exe)) {
      if (prof?.autoLock) {
        locked = true;
        setSetting("locked", "1");
        await diskLog(`film otomatik kilit ${exe}`, 0, lastAppliedBright, appliedKey ?? "-", "-", "-");
        log("otomatik kilit (" + exe + ")", "warn");
      } else {
        await diskLog(`donduruldu uygulama ${exe}`, 0, lastAppliedBright, appliedKey ?? "-", "-", "-");
        log("donduruldu: video/oyun uygulaması (" + exe + ")", "warn");
      }
      await refresh("uygulama: " + exe);
      return;
    }
    if (await invoke<boolean>("is_fullscreen")) {
      if (!exe || !allowItems.includes(exe)) {
        const why = "tam ekran" + (exe ? " (" + exe + ")" : "");
        await diskLog(`donduruldu ${why}`, 0, lastAppliedBright, appliedKey ?? "-", "-", "-");
        log("donduruldu: " + why, "warn");
        await refresh(why);
        return;
      }
    }

    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const [pct, charging] = await invoke<[number, boolean]>("battery_status").catch(
      () => [100, true] as [number, boolean],
    );
    const lowPower = pct < 20 && !charging;
    const camLimit = lowPower ? CAM_MS_LOW : CAM_MS;

    // Bağlı profil gelirse onun ayarları bu turu yönetir; kilit ve dondurma
    // kuralları her durumda önde gelir.
    const effMode: Mode = bound ? bound.mode : mode;
    const effSource: Source = bound ? bound.source : source;
    const effOffset = bound ? bound.offset : offset;
    const effFixed = effMode === "fixed";

    let name: string;
    let themeMode: string;
    let desired: number;
    let level = "-";
    let tone = "-";

    const fresh = reason === "odak" || reason === "manuel" || reason === "açılış";
    const cam = await cameraSample(fresh, camLimit);
    if (cam) {
      level = cam.level;
      tone = cam.tone;
    }

    if (effMode === "light") {
      if (!cam) {
        log("kamera yok, atlandı", "warn");
        await refresh(null);
        return;
      }
      el("st-light").textContent = `${cam.level} / ${cam.tone}`;
      el("st-light").title = `ışık: ${cam.level}/${cam.tone} (parlaklık ${cam.lum.toFixed(0)})`;
      el("sub-light").textContent = `parlaklık: ${cam.lum.toFixed(0)}`;
      setDot("dot-light", cam.level === "dark" ? "" : cam.level === "dim" ? "warn" : "ok");
      if (cam.level === "dark") {
        name = "vesper";
        themeMode = "dark";
        desired = 30;
      } else if (cam.level === "dim") {
        const warm = cam.tone === "warm" || (cam.tone === "neutral" && effSource !== "cool");
        name = warm ? "catppuccin-macchiato" : "tokyonight";
        themeMode = "dark";
        desired = 50;
      } else {
        name = "github";
        themeMode = "light";
        desired = cam.level === "bright" ? 85 : 70;
      }
    } else {
      const [n, m, base] = await invoke<[string, string, number]>("decide_target", { hour, source: effSource });
      name = n;
      themeMode = m;
      desired = base;
      if (effSource === "auto" && cam) {
        el("st-light").textContent = `zaman + ${cam.level}/${cam.tone}`;
        el("st-light").title = `zaman + ışık: ${cam.level}/${cam.tone} (parlaklık ${cam.lum.toFixed(0)})`;
        if (cam.level === "dark") {
          name = "vesper";
          themeMode = "dark";
          desired = 30;
        } else if (cam.level === "bright") {
          name = "github";
          themeMode = "light";
          desired = 80;
        } else if (hour >= 18 && hour <= 21 && cam.tone === "cool") {
          name = "tokyonight";
        }
      } else {
        el("st-light").textContent = effSource === "auto" ? "zaman" : SOURCE_LABEL[effSource];
        el("st-light").title = `${SOURCE_LABEL[effSource]} • ${hour}:${String(minute).padStart(2, "0")}`;
      }
      el("sub-light").textContent = `${hour}:${String(minute).padStart(2, "0")} • kaynak: ${SOURCE_LABEL[effSource]}`;
      setDot("dot-light", "accent");
    }

    // Bağlı profil açık niyettir: öğrenilmiş tercih onu ezmez.
    const remembered = bound
      ? null
      : await invoke<[string, string] | null>("pref_get", {
          hour,
          light: `${level}/${tone}`,
        });
    if (remembered) {
      name = remembered[0];
      themeMode = remembered[1];
    }
    if (bound) {
      name = bound.theme;
      themeMode = bound.themeMode;
    }

    desired = applySleepCap(desired, hour);
    if (readingMode) {
      desired = Math.min(desired, 45);
    }

    // Ogrenilmis parlaklik tercihi: en az 2 gozlem varsa hedefi devralir.
    let learned: [number, number] | null = null;
    if (!bound) {
      try {
        learned = await invoke<[number, number] | null>("pref_get_bright", {
          hour,
          light: `${level}/${tone}`,
        });
      } catch {
        learned = null;
      }
    }
    const learnedApplied = learned !== null && learned[1] >= 2;
    if (learnedApplied && learned) {
      desired = Math.min(Math.max(desired, learned[0] - 10), learned[0] + 10);
    }
    if (lowPower) log("pil modu: ölçüm ve adım kısıldı", "warn");

    const key = `${name}|${themeMode}`;
    // Kapı yalnız otomatik seçim içindir: bağlı profil açık niyettir, onu
    // ölçüm veto etmez (elle tema seçimi de serbest).
    const gated = bound ? null : gateReason(name, themeMode);
    if (key !== appliedKey && gated) {
      if (lastGateWarn !== name) {
        log(`otomatik seçimde reddedildi: ${name} — ${gated}`, "warn");
        lastGateWarn = name;
      }
      pendingKey = null;
      pendingCount = 0;
    } else if (key === appliedKey) {
      pendingKey = null;
      pendingCount = 0;
    } else if (key === pendingKey) {
      pendingCount += 1;
    } else {
      pendingKey = key;
      pendingCount = 1;
    }

    let snapped = false;
    let appliedNow = lastAppliedBright;
    if (pendingCount >= 2 && key !== appliedKey && !gated) {
      const floor = await invoke<number>("brightness_floor", { hour, minute });
      const target = Math.min(100, Math.max(floor, desired + effOffset));
      const cur0 = await invoke<number>("brightness_get");
      await pushUndo(appliedKey?.split("|")[0] ?? name, cur0);
      await invoke("theme_set", { name, mode: themeMode });
      appliedKey = key;
      pendingKey = null;
      pendingCount = 0;
      lastGateWarn = "";
      log(`tema: ${name} (${themeMode})`, "ok");
      if (!effFixed && target !== cur0) {
        await invoke("brightness_set", { value: target });
        log(`parlaklık atlama: ${cur0} -> ${target}`, "ok");
      }
      appliedNow = effFixed ? cur0 : target;
      snapped = true;
    } else if (key !== appliedKey && !gated) {
      log(`tema bekliyor: ${name} (${pendingCount}/2)`);
    }

    if (!snapped && !effFixed) {
      const current = await invoke<number>("brightness_get");
      let next = await invoke<number>("decide_brightness", {
        current,
        desired: Math.min(100, Math.max(0, desired + effOffset)),
        hour,
        minute,
      });
      if (lowPower) next = current + (next - current) / 2;
      if (next !== current) {
        await invoke("brightness_set", { value: next });
        log(`parlaklık: ${current} -> ${next}`, "ok");
      }
      appliedNow = next;
    }

    const note = bound
      ? `uygulama ${exe} -> ${bound.name}`
      : key !== appliedKey && gated
        ? `reddedildi: ${gated}`
        : pendingKey
          ? `bekliyor ${pendingCount}/2`
          : lowPower
            ? "pil modu"
            : learnedApplied
              ? "ogrenilmis parlaklik"
              : remembered
                ? "ogrenilmis tercih"
                : reason;
    await diskLog(note, desired, appliedNow, `${name}/${themeMode}`, level, tone);

    el("sub-bright").textContent = `hedef: %${desired}${lowPower ? " • pil" : ""}${readingMode ? " • okuma" : ""}`;
    el("last-measure").textContent = new Date().toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    await refresh(null);
    if (pendingKey) el("sub-theme").textContent += ` • bekliyor (${pendingCount}/2)`;
  } catch (e) {
    log("hata: " + String(e), "bad");
  }
}

// ---------- 20-20-20 ----------

async function notify(title: string, body: string): Promise<void> {
  if (notifyReady) {
    try {
      sendNotification({ title, body });
      return;
    } catch {
      /* fall through to band */
    }
  }
  el("break-band").hidden = false;
}

/** Yeni döngü başlatır: uyarı bir kez çıkar, onaylanana kadar tekrar etmez. */
function resetBreak(ms: number): void {
  breakDueAt = Date.now() + ms;
  breakState = "waiting";
  el("break-band").hidden = true;
}

function tickBreak(): void {
  const left = Math.max(0, Math.ceil((breakDueAt - Date.now()) / 60000));
  el("break-countdown").textContent = !breakEnabled
    ? "20-20-20 kapalı"
    : breakState === "alerting"
      ? "20-20-20: bakış molası"
      : `20-20-20: ${left} dk`;
  el("break-pill").textContent = !breakEnabled
    ? "kapalı"
    : breakState === "alerting"
      ? "mola"
      : `${left} dk`;
  el("break-pill").className = "badge " + (breakState === "alerting" ? "warn" : breakEnabled ? "muted" : "info");
  if (!breakEnabled || breakState === "alerting") return;
  if (locked || paused) return;
  if (Date.now() < breakDueAt) return;
  const h = new Date().getHours();
  if (h >= 0 && h < 7) return;
  breakState = "alerting";
  el("break-band").hidden = false;
  el("break-text").textContent = "20 dakika doldu — 20 saniye uzaklara bak.";
  void notify("20-20-20", "20 saniye uzaklara bak.");
}

// ---------- history + chart ----------

function drawChart(stats: StatsSummary): void {
  const svg = el("chart");
  const W = 720;
  const H = 180;
  const pad = 24;
  const n = Math.max(1, stats.buckets.length);
  const step = W / n;
  const barW = Math.max(6, step - 14);
  const top = (v: number): number => H - pad - (Math.max(0, Math.min(100, v)) / 100) * (H - pad * 2);
  const parts: string[] = [`<line x1="0" y1="${H - pad}" x2="${W}" y2="${H - pad}" stroke="rgba(255,255,255,0.12)" />`];
  const pts: string[] = [];
  stats.buckets.forEach((b, i) => {
    const cx = i * step + step / 2;
    const y = top(b.appliedAvg);
    const h = Math.max(2, H - pad - y);
    parts.push(
      `<rect x="${cx - barW / 2}" y="${y}" width="${barW}" height="${h}" rx="3" fill="var(--accent)" opacity="${b.samples > 0 ? 0.75 : 0.15}" />`,
    );
    pts.push(`${cx},${top(b.desiredAvg)}`);
    if (i % 3 === 0) {
      const label = b.hoursAgo === 0 ? "şimdi" : `-${b.hoursAgo}s`;
      parts.push(
        `<text x="${cx}" y="${H - 8}" fill="#5B6480" font-size="10" text-anchor="middle" font-family="ui-monospace, monospace">${label}</text>`,
      );
    }
  });
  parts.push(
    `<polyline points="${pts.join(" ")}" fill="none" stroke="var(--warning)" stroke-width="2" stroke-dasharray="5 4" />`,
  );
  svg.innerHTML = parts.join("");
}

async function loadHistory(): Promise<void> {
  try {
    const lines = await invoke<string[]>("log_lines", { max: 50 });
    const host = el("hist-panel");
    host.replaceChildren();
    for (const line of lines.slice().reverse()) {
      const row = document.createElement("div");
      row.textContent = line;
      host.append(row);
    }
    if (lines.length === 0) {
      const row = document.createElement("div");
      row.textContent = "Henüz kayıt yok — ilk ölçüm birkaç dakika içinde düşer.";
      host.append(row);
    }
  } catch (e) {
    log("log okunamadı: " + String(e), "bad");
  }
  try {
    const stats = await invoke<StatsSummary>("stats_summary");
    el("sum-changes").textContent = String(stats.themeChangesToday);
    el("sum-avg").textContent = stats.ticksToday > 0 ? `%${stats.avgAppliedToday}` : "-";
    el("sum-frozen").textContent = String(stats.frozenTicksToday);
    drawChart(stats);
  } catch {
    el("sum-changes").textContent = "-";
    el("sum-avg").textContent = "-";
    el("sum-frozen").textContent = "-";
  }
}

// ---------- profiles ----------

function applyProfile(p: Profile): void {
  activeId = p.id;
  saveActiveId(activeId);
  mode = p.mode;
  source = p.source;
  offset = p.offset;
  setSetting("mode", mode);
  setSetting("source", source);
  setSetting("brightOffset", String(offset));
  void invoke("theme_set", { name: p.theme, mode: p.themeMode });
  appliedKey = `${p.theme}|${p.themeMode}`;
  pendingKey = null;
  pendingCount = 0;
  log(`profil: ${p.name}`, "ok");
  void diskLog(`profil ${p.name}`, 0, lastAppliedBright, appliedKey);
  renderProfileCards();
  buildModeSegs();
  syncControls();
  void refresh(null);
  void tick("profil");
}

function renderProfileCards(): void {
  const host = el("profile-cards");
  host.replaceChildren();
  for (const p of profiles) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "profile-card" + (p.id === activeId ? " active" : "");
    const name = document.createElement("div");
    name.className = "pc-name";
    name.textContent = p.name;
    const meta = document.createElement("div");
    meta.className = "pc-meta";
    meta.textContent = `${MODE_LABEL[p.mode]} • ${SOURCE_LABEL[p.source]} • ${p.theme}`;
    const meta2 = document.createElement("div");
    meta2.className = "pc-meta";
    const appCount = (p.apps ?? []).length;
    meta2.textContent = `düzeltme ${p.offset >= 0 ? "+" : ""}${p.offset}${p.autoLock ? " • otomatik kilit" : ""}${
      appCount ? ` • ${appCount} uygulama` : ""
    }`;
    b.append(name, meta, meta2);
    b.addEventListener("click", () => {
      selectForEdit(p.id);
      if (!editorDirty) applyProfile(p);
    });
    b.addEventListener("dblclick", () => applyProfile(p));
    host.append(b);
  }
}

function selectForEdit(id: string): void {
  const p = profiles.find((x) => x.id === id);
  if (!p) return;
  draft = { ...p };
  editorDirty = false;
  paintEditor();
}

function paintEditor(): void {
  (el("pf-name") as HTMLInputElement).value = draft.name;
  (el("pf-off-val") as HTMLButtonElement).textContent = (draft.offset >= 0 ? "+" : "") + draft.offset;
  const sel = el("pf-theme") as HTMLSelectElement;
  sel.replaceChildren();
  for (const t of THEMES) {
    const opt = document.createElement("option");
    opt.value = `${t.name}|${t.mode}`;
    opt.textContent = `${t.name} (${t.note})`;
    opt.selected = t.name === draft.theme && t.mode === draft.themeMode;
    sel.append(opt);
  }
  buildSeg(el("pf-mode"), MODE_OPTIONS, draft.mode, (v) => {
    draft.mode = v as Mode;
    editorDirty = true;
  });
  buildSeg(el("pf-source"), SOURCE_OPTIONS, draft.source, (v) => {
    draft.source = v as Source;
    editorDirty = true;
  });
  bindSwitch(el("pf-autolock") as HTMLButtonElement, draft.autoLock, (v) => {
    draft.autoLock = v;
    editorDirty = true;
  });
  tagApps = buildTagEditor(el("pf-apps-editor"), draft.apps ?? [], (items) => {
    draft.apps = items;
    editorDirty = true;
    el("pf-apps-count").textContent = `${items.length} uygulama`;
  });
  el("pf-apps-count").textContent = `${(draft.apps ?? []).length} uygulama`;
  (el("pf-delete") as HTMLButtonElement).disabled = profiles.length <= 1;
  (el("pf-add") as HTMLButtonElement).disabled = profiles.length >= MAX_PROFILES;
}

function saveDraft(): void {
  const name = (el("pf-name") as HTMLInputElement).value.trim();
  if (name) draft.name = name;
  const [theme, themeMode] = (el("pf-theme") as HTMLSelectElement).value.split("|");
  draft.theme = theme;
  draft.themeMode = themeMode;
  draft.apps = tagApps?.get() ?? draft.apps;
  profiles = upsertProfile(profiles, { ...draft });
  saveProfiles(profiles);
  editorDirty = false;
  log(`profil kaydedildi: ${draft.name}`, "ok");
  renderProfileCards();
  buildProfileSwitch();
  syncBadge();
}

function buildProfileSwitch(): void {
  const host = el("profile-switch");
  host.replaceChildren();
  for (const p of profiles) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (p.id === activeId ? " active" : "");
    b.textContent = p.name;
    b.addEventListener("click", () => applyProfile(p));
    host.append(b);
  }
}

// ---------- controls ----------

function buildModeSegs(): void {
  buildSeg(el("mode-seg"), MODE_OPTIONS, mode, (v) => {
    mode = v as Mode;
    setSetting("mode", mode);
    pendingKey = null;
    pendingCount = 0;
    log("mod: " + MODE_LABEL[mode]);
    void tick("mod değişti");
  });
  buildSeg(el("source-seg"), SOURCE_OPTIONS, source, (v) => {
    source = v as Source;
    setSetting("source", source);
    pendingKey = null;
    pendingCount = 0;
    log("kaynak: " + SOURCE_LABEL[source]);
    void tick("kaynak değişti");
  });
}

function setAccent(id: string): void {
  document.documentElement.dataset.accent = id;
  setSetting("accent", id);
  el("accent-picker").querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
    b.setAttribute("aria-pressed", b.dataset.accent === id ? "true" : "false");
  });
}

function renderAccents(): void {
  const host = el("accent-picker");
  host.replaceChildren();
  for (const a of ACCENTS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.title = a.label;
    b.dataset.accent = a.id;
    b.style.setProperty("--sw", a.hex);
    b.addEventListener("click", () => setAccent(a.id));
    host.append(b);
  }
  setAccent(getSetting("accent", "blue"));
}

async function syncAutostart(): Promise<boolean> {
  try {
    return await invoke<boolean>("autostart_get");
  } catch {
    return false;
  }
}

function syncControls(): void {
  (el("pf-off-val") as HTMLElement).textContent = (draft.offset >= 0 ? "+" : "") + draft.offset;
  el("warm-val").textContent = String(warmPercent);
  el("read-btn").classList.toggle("active", readingMode);
  el("lock-btn").classList.toggle("active", locked);
  el("pause-btn").classList.toggle("active", paused);
  updateUndoBtn();
  syncBadge();
}

// ---------- boot ----------

window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((t) => {
    t.addEventListener("click", () => switchTab(t.dataset.tab ?? "panel"));
  });

  renderThemePicker();
  renderAccents();
  buildModeSegs();
  renderProfileCards();
  buildProfileSwitch();
  selectForEdit(activeId);
  syncControls();
  switchTab("panel");

  getVersion()
    .then((v) => {
      el("app-ver").textContent = v;
    })
    .catch(() => undefined);

  isPermissionGranted()
    .then(async (granted) => granted || (await requestPermission()) === "granted")
    .then((ok) => {
      notifyReady = ok;
    })
    .catch(() => {
      notifyReady = false;
    });

  tagBlock = buildTagEditor(el("block-editor"), blockItems, (items) => {
    blockItems = items;
    setSetting("blocklist", items.join(","));
    log("engelli liste güncellendi");
  });
  tagAllow = buildTagEditor(el("allow-editor"), allowItems, (items) => {
    allowItems = items;
    setSetting("allowlist", items.join(","));
    log("izinli liste güncellendi");
  });

  (el("sleep-start") as HTMLInputElement).value = String(sleepStart);
  (el("sleep-end") as HTMLInputElement).value = String(sleepEnd);
  (el("sleep-cap") as HTMLInputElement).value = String(sleepCap);
  for (const [id, apply] of [
    ["sleep-start", (v: number) => (sleepStart = v)],
    ["sleep-end", (v: number) => (sleepEnd = v)],
    ["sleep-cap", (v: number) => (sleepCap = v)],
  ] as const) {
    (el(id) as HTMLInputElement).addEventListener("change", (e) => {
      const v = Number((e.target as HTMLInputElement).value) || 0;
      apply(v);
      setSetting(id.replace("-", ""), String(v));
      log("zamanlama güncellendi");
    });
  }

  void syncAutostart().then((on) => {
    bindSwitch(el("auto-switch") as HTMLButtonElement, on, (v) => {
      void invoke("autostart_set", { enabled: v }).then(() => {
        log(v ? "otomatik başlatma açıldı" : "otomatik başlatma kapandı", "ok");
      });
    });
  });
  bindSwitch(el("break-switch") as HTMLButtonElement, breakEnabled, (v) => {
    breakEnabled = v;
    setSetting("breakEnabled", v ? "1" : "0");
    if (!v) {
      breakState = "waiting";
      el("break-band").hidden = true;
    }
    tickBreak();
  });
  bindSwitch(el("warm-switch") as HTMLButtonElement, warmEnabled, (v) => {
    warmEnabled = v;
    setSetting("warmEnabled", v ? "1" : "0");
    void applyWarmth();
  });
  el("warm-minus").addEventListener("click", () => {
    warmPercent = Math.max(0, warmPercent - 5);
    setSetting("warmPercent", String(warmPercent));
    syncControls();
    void applyWarmth();
  });
  el("warm-plus").addEventListener("click", () => {
    warmPercent = Math.min(60, warmPercent + 5);
    setSetting("warmPercent", String(warmPercent));
    syncControls();
    void applyWarmth();
  });
  el("read-btn").addEventListener("click", () => {
    void toggleReading();
  });

  el("now-btn").addEventListener("click", () => void tick("manuel"));
  el("lock-btn").addEventListener("click", () => {
    locked = !locked;
    setSetting("locked", locked ? "1" : "0");
    syncControls();
    log(locked ? "manuel kilit açıldı" : "manuel kilit kapandı", "warn");
    void refresh(null);
  });
  el("pause-btn").addEventListener("click", () => {
    paused = !paused;
    syncControls();
    void refresh(null);
  });
  el("undo-btn").addEventListener("click", () => void undo());
  el("risk-fix-btn").addEventListener("click", async () => {
    const [n, m] = await invoke<[string, string]>("decide_target", {
      hour: new Date().getHours(),
      source,
    });
    await pickTheme(n, m);
    el("risk-band").hidden = true;
  });
  el("break-done").addEventListener("click", () => {
    resetBreak(BREAK_MS);
    log("mola tamamlandı, 20 dk sonra yeni uyarı", "ok");
  });
  el("break-snooze").addEventListener("click", () => {
    resetBreak(SNOOZE_MS);
    log("ertelendi, 5 dk sonra yeni uyarı", "ok");
  });
  el("night-btn").addEventListener("click", () => {
    openUrl("ms-settings:nightlight").catch((e: unknown) => {
      log("gece ışığı açılamadı: " + String(e), "bad");
    });
  });
  el("add-current-btn").addEventListener("click", async () => {
    const exe = await invoke<string | null>("foreground_exe").catch(() => null);
    if (!exe) {
      log("ön plandaki uygulama okunamadı", "warn");
      return;
    }
    const target = tagBlock ?? tagAllow;
    if (!target) return;
    const items = target.get();
    if (!items.includes(exe)) target.set([...items, exe]);
    blockItems = tagBlock?.get() ?? blockItems;
    allowItems = tagAllow?.get() ?? allowItems;
    setSetting("blocklist", blockItems.join(","));
    setSetting("allowlist", allowItems.join(","));
    log(`eklendi: ${exe}`, "ok");
  });

  el("pf-bind-current").addEventListener("click", async () => {
    const exe = await invoke<string | null>("foreground_exe").catch(() => null);
    if (!exe) {
      log("ön plandaki uygulama okunamadı", "warn");
      return;
    }
    const items = tagApps?.get() ?? draft.apps ?? [];
    if (!items.includes(exe)) tagApps?.set([...items, exe]);
    draft.apps = tagApps?.get() ?? items;
    editorDirty = true;
    el("pf-apps-count").textContent = `${draft.apps.length} uygulama`;
    log(`bağlandı: ${exe} → ${draft.name} (Kaydet ile kalıcı olur)`, "ok");
  });

  el("audit-refresh").addEventListener("click", () => void loadAudit());
  bindSwitch(el("gate-switch") as HTMLButtonElement, auditGate, (v) => {
    auditGate = v;
    setSetting("auditGate", v ? "1" : "0");
    lastGateWarn = "";
    log(v ? "kontrast kapısı açık: FAIL olan temalar uygulanmaz" : "kontrast kapısı kapalı", "ok");
  });

  el("pf-save").addEventListener("click", saveDraft);
  el("pf-add").addEventListener("click", () => {
    if (profiles.length >= MAX_PROFILES) return;
    const p = createProfile(`Profil ${profiles.length + 1}`);
    profiles = upsertProfile(profiles, p);
    saveProfiles(profiles);
    renderProfileCards();
    buildProfileSwitch();
    selectForEdit(p.id);
  });
  el("pf-duplicate").addEventListener("click", () => {
    if (profiles.length >= MAX_PROFILES) return;
    const p = duplicateProfile(draft);
    profiles = upsertProfile(profiles, p);
    saveProfiles(profiles);
    renderProfileCards();
    buildProfileSwitch();
    selectForEdit(p.id);
  });
  el("pf-delete").addEventListener("click", () => {
    if (profiles.length <= 1) return;
    profiles = profiles.filter((p) => p.id !== draft.id);
    saveProfiles(profiles);
    if (activeId === draft.id) activeId = profiles[0].id;
    saveActiveId(activeId);
    renderProfileCards();
    buildProfileSwitch();
    selectForEdit(activeId);
    log("profil silindi", "warn");
  });
  (el("pf-name") as HTMLInputElement).addEventListener("input", () => {
    editorDirty = true;
  });
  (el("pf-theme") as HTMLSelectElement).addEventListener("change", () => {
    editorDirty = true;
  });
  el("pf-off-minus").addEventListener("click", () => {
    draft.offset = Math.max(-20, draft.offset - 5);
    editorDirty = true;
    syncControls();
    void learnBrightness();
  });
  el("pf-off-plus").addEventListener("click", () => {
    draft.offset = Math.min(20, draft.offset + 5);
    editorDirty = true;
    syncControls();
    void learnBrightness();
  });
  el("hist-refresh").addEventListener("click", () => void loadHistory());
  el("log-clear-btn").addEventListener("click", async () => {
    try {
      await invoke("log_clear");
      await loadHistory();
      log("kayıtlar temizlendi", "ok");
    } catch (e) {
      log("temizlenemedi: " + String(e), "bad");
    }
  });

  tickBreak();
  void loadAudit();
  void showCalibration();
  void applyWarmth();
  void tick("açılış");
  window.setInterval(() => {
    tickBreak();
    void tick("izle");
  }, WATCH_MS);
  window.addEventListener("focus", () => {
    if (Date.now() - lastAct > WATCH_MS) void tick("odak");
  });
});