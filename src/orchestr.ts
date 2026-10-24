/**
 * orchestr.ts — durum + tur/karar motoru (DOM yok).
 *
 * Bağımlılık tek yönlü: `panels → orchestr ← main`. Bu katman yalnız
 * `@tauri-apps` + `catalog` + `store` kullanır; DOM'a dokunmaz. Arayüz
 * güncellemeleri `setHooks` ile bağlanan `render()` / `log()` /
 * `renderEditor()` geri çağrılarına bırakılır.
 *
 * "stabilite:" yorumları denetim bulgularından gelen düzeltmeleri işaretler:
 *   (a) tick yeniden giriş koruması  (d) autoWarmth hatada 0 değil
 *   (b) erken dönüşte pending sıfırlama  (e) kamera hatası gizlenmez
 *   (c) elle tema kalibrasyonu kirletmez  (f) pil hatası sessiz [100,true] değil
 *   (g) duraklatma zamana bağlı (pauseUntil)
 */

import { invoke } from "@tauri-apps/api/core";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { MODE_LABEL, SOURCE_LABEL } from "./catalog";
import type { Mode, Source } from "./catalog";
import {
  FREE_MAX_PROFILES,
  MAX_PROFILES,
  createProfile,
  duplicateProfile,
  getSetting,
  loadActiveId,
  loadProfiles,
  restoreSeedProfiles,
  saveActiveId,
  saveProfiles,
  setSetting,
  upsertProfile,
} from "./store";
import type { Profile } from "./store";

// ---------- tipler ----------

export type Level = "info" | "ok" | "warn" | "bad";
/** Sıcak ton kipi: auto = saate/ışığa göre, fixed = sabit şiddet, off = kapalı. */
export type WarmMode = "auto" | "fixed" | "off";
export type BreakState = "waiting" | "alerting";

export interface Bucket {
  hoursAgo: number;
  appliedAvg: number;
  desiredAvg: number;
  samples: number;
}

export interface StatsSummary {
  buckets: Bucket[];
  themeChangesToday: number;
  avgAppliedToday: number;
  frozenTicksToday: number;
  ticksToday: number;
}

/** WCAG denetim raporu (backend `contrast::Report`). */
export interface AuditReport {
  name: string;
  mode: string;
  text_on_bg: number;
  muted_on_bg: number;
  /** Sözdizimi + geri bildirim renklerinin en kötü oranı. */
  syntax_min: number;
  verdict: string;
}

/** Bağlı monitör kaydı (backend `monitor::MonitorInfo`). */
export interface MonitorInfo {
  id: string;
  name: string;
  is_internal: boolean;
  /** "wmi" (dahili panel) | "ddc" (harici monitör). */
  api: string;
}

/** Lisans durumu (backend `license_status`); kayıt backend'de tutulur. */
export interface LicenseStatus {
  pro: boolean;
  email: string | null;
  issued: string | null;
}

export interface CamSample {
  lum: number;
  level: string;
  tone: string;
  at: number;
}

export interface UndoEntry {
  name: string;
  mode: string;
  value: number;
}

/** Monitör satırının alan verisi; DOM panels'ta çizilir. */
export interface MonitorRowState {
  info: MonitorInfo;
  value: number | null;
  error: string | null;
}

/** Hero/Işık kartına düşen son tur görünüm verisi. */
export interface LightCard {
  text: string;
  title: string;
  sub: string;
  dot: string;
}

// ---------- sabitler ----------

const CAM_MS = 5 * 60 * 1000;
const CAM_MS_LOW = 15 * 60 * 1000;
export const BREAK_MS = 20 * 60 * 1000;
export const SNOOZE_MS = 5 * 60 * 1000;
const UNDO_DEPTH = 5;
export const HOUR_MS = 60 * 60 * 1000;

export const DEFAULT_BLOCKLIST =
  "vlc.exe,mpv.exe,mpc-hc64.exe,mpc-hc.exe,mpc-be.exe,potplayer.exe,kodi.exe,plex.exe,wmplayer.exe,sumatrapdf.exe,acrobat.exe,acrord32.exe,foxitreader.exe";
export const DEFAULT_ALLOWLIST =
  "windowsterminal.exe,wezterm-gui.exe,alacritty.exe,code.exe,notepad++.exe,ghostty.exe";

export const WARM_MODE_LABEL: Record<WarmMode, string> = {
  auto: "Otomatik",
  fixed: "Sabit",
  off: "Kapalı",
};

export const WARM_OPTIONS = (Object.keys(WARM_MODE_LABEL) as WarmMode[]).map((value) => ({
  value,
  label: WARM_MODE_LABEL[value],
}));

/**
 * `warmth_auto` (src-tauri/src/decide.rs) çapa noktaları — dakika, şiddet.
 * Yalnız "sonraki değişim" saatini hesaplamak için kullanılır; asıl eğri
 * backend'dedir, burada uygulanmaz.
 */
const WARM_ANCHORS: Array<[number, number]> = [
  [0, 40],
  [300, 40],
  [360, 25],
  [420, 10],
  [480, 0],
  [900, 0],
  [1020, 10],
  [1140, 25],
  [1260, 35],
  [1380, 40],
  [1440, 40],
];

// ---------- durum ----------

export interface AppState {
  mode: Mode;
  source: Source;
  locked: boolean;
  /** stabilite (g): duraklatma zamanlı — null = duraklatılmadı, sayı = bitiş anı. */
  pauseUntil: number | null;
  /** Hangi düğme duraklattı (durum kartı + .active için). */
  pauseKind: "hour" | "day" | null;
  offset: number;
  breakEnabled: boolean;
  breakDueAt: number;
  breakState: BreakState;
  breakVisible: boolean;
  sleepStart: number;
  sleepEnd: number;
  sleepCap: number;
  blockItems: string[];
  allowItems: string[];
  warmMode: WarmMode;
  warmPercent: number;
  /** Son uygulanan sıcak ton şiddeti (stabilite d). */
  lastWarmApplied: number | null;
  readingMode: boolean;
  readingPrevWarm: WarmMode | null;
  animations: boolean;
  profiles: Profile[];
  activeId: string;
  draft: Profile;
  editorDirty: boolean;
  pendingKey: string | null;
  pendingCount: number;
  appliedKey: string | null;
  lastAct: number;
  lastAppliedBright: number;
  lastMeasureAt: number | null;
  lastCam: CamSample | null;
  undoStack: UndoEntry[];
  boundName: string | null;
  boundExe: string | null;
  lastBoundExe: string | null;
  /** Donma nedeni ("uygulama: vlc.exe" / "tam ekran (x.exe)"); null = akıyor. */
  freezeReason: string | null;
  audits: AuditReport[];
  auditGate: boolean;
  lastGateWarn: string;
  risk: { name: string; text: string; fixLabel: string } | null;
  licensePro: boolean;
  licenseStatus: LicenseStatus | null;
  licenseError: string | null;
  monitors: MonitorRowState[];
  monitorSel: string | null;
  monitorCtrlEnabled: boolean;
  lastAppliedByMonitor: Record<string, number | undefined>;
  monitorFailed: string[];
  light: LightCard;
  /** Son turun hedef yüzdesi (ofset dahil) ve taban değeri. */
  targetPct: number | null;
  desiredBase: number | null;
  lowPower: boolean;
  calibHint: string;
  histLines: string[];
  stats: StatsSummary | null;
  notifyReady: boolean;
}

function loadNumber(key: string, fallback: number): number {
  const raw = getSetting(key, "").trim();
  if (raw === "") return fallback;
  const n = Number(raw);
  return Number.isNaN(n) ? fallback : n;
}

function loadWarmMode(): WarmMode {
  const saved = getSetting("warmMode", "");
  if (saved === "auto" || saved === "fixed" || saved === "off") return saved;
  // Eski kayıt: sıcak ton anahtarlıydı. Açık mıydı diye bak, yoksa otomatik.
  return getSetting("warmEnabled", "0") === "1" ? "fixed" : "auto";
}

function splitList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 0);
}

const initialProfiles = loadProfiles();
const initialActive = ((): string => {
  const saved = loadActiveId();
  if (saved && initialProfiles.some((p) => p.id === saved)) return saved;
  const fallback = initialProfiles[0]?.id ?? "";
  saveActiveId(fallback);
  return fallback;
})();

export const S: AppState = {
  mode: getSetting("mode", "auto") as Mode,
  source: getSetting("source", "auto") as Source,
  locked: getSetting("locked", "0") === "1",
  pauseUntil: null,
  pauseKind: null,
  offset: Math.round(Number(getSetting("brightOffset", "0")) || 0),
  breakEnabled: getSetting("breakEnabled", "1") === "1",
  breakDueAt: Date.now() + BREAK_MS,
  breakState: "waiting",
  breakVisible: false,
  sleepStart: loadNumber("sleepStart", 1),
  sleepEnd: loadNumber("sleepEnd", 7),
  sleepCap: loadNumber("sleepCap", 15),
  blockItems: splitList(getSetting("blocklist", DEFAULT_BLOCKLIST)),
  allowItems: splitList(getSetting("allowlist", DEFAULT_ALLOWLIST)),
  warmMode: loadWarmMode(),
  warmPercent: Math.round(loadNumber("warmPercent", 35)),
  lastWarmApplied: null,
  readingMode: getSetting("readingMode", "0") === "1",
  readingPrevWarm: null,
  animations: getSetting("animations", "1") === "1",
  profiles: initialProfiles,
  activeId: initialActive,
  draft: {
    ...(initialProfiles.find((p) => p.id === initialActive) ?? createProfile("Profil")),
  },
  editorDirty: false,
  pendingKey: null,
  pendingCount: 0,
  appliedKey: null,
  lastAct: 0,
  lastAppliedBright: 0,
  lastMeasureAt: null,
  lastCam: null,
  undoStack: [],
  boundName: null,
  boundExe: null,
  lastBoundExe: null,
  freezeReason: null,
  audits: [],
  auditGate: getSetting("auditGate", "1") === "1",
  lastGateWarn: "",
  risk: null,
  licensePro: false,
  licenseStatus: null,
  licenseError: null,
  monitors: [],
  monitorSel: null,
  monitorCtrlEnabled: false,
  lastAppliedByMonitor: {},
  monitorFailed: [],
  light: { text: "-", title: "", sub: "-", dot: "" },
  targetPct: null,
  desiredBase: null,
  lowPower: false,
  calibHint: "kalibrasyon: henüz gözlem yok",
  histLines: [],
  stats: null,
  notifyReady: false,
};

// ---------- view kancaları ----------

export interface ViewHooks {
  log(msg: string, level: Level): void;
  render(): void;
  /** Profil editörü yalnız açıkça yeniden çizilir (yazmayı silmemek için). */
  renderEditor(): void;
}

const defaultHooks: ViewHooks = {
  log: (msg, level) => console.log(`[log/${level}] ${msg}`),
  render: () => undefined,
  renderEditor: () => undefined,
};

let hooks: ViewHooks = defaultHooks;

export function setHooks(next: Partial<ViewHooks>): void {
  hooks = { ...hooks, ...next };
}

export function log(msg: string, level: Level = "info"): void {
  hooks.log(msg, level);
}

function render(): void {
  hooks.render();
}

function renderEditor(): void {
  hooks.renderEditor();
}

// ---------- küçük yardımcılar ----------

export function activeProfile(): Profile | null {
  return S.profiles.find((p) => p.id === S.activeId) ?? null;
}

async function diskLog(
  note: string,
  desired: number,
  applied: number,
  theme: string,
  level = "-",
  tone = "-",
): Promise<void> {
  const line = `${new Date().toISOString()} | source=${S.mode}/${S.source} | level=${level} | tone=${tone} | desired=${desired} | applied=${applied} | theme=${theme} | note=${note}`;
  await invoke("log_tick", { line }).catch((e) => console.warn("diskLog:", e));
}

export async function foregroundExe(): Promise<string | null> {
  return await invoke<string | null>("foreground_exe").catch(() => null);
}

// ---------- stabilite (g): zamana bağlı duraklatma ----------

export function isPaused(): boolean {
  if (S.pauseUntil === null) return false;
  if (Date.now() >= S.pauseUntil) {
    // Süre dolduysa duraklatma kendiliğinden biter.
    S.pauseUntil = null;
    S.pauseKind = null;
    render();
    return false;
  }
  return true;
}

export function pauseRemainingMs(): number {
  return S.pauseUntil === null ? 0 : Math.max(0, S.pauseUntil - Date.now());
}

/** "47 dk" / "3 sa 12 dk" gibi kalan süre metni. */
export function pauseRemainingText(): string {
  const totalMin = Math.max(1, Math.round(pauseRemainingMs() / 60000));
  if (totalMin < 60) return `${totalMin} dk`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} sa` : `${h} sa ${m} dk`;
}

/** "1 saat duraklat": açıkken tekrar basmak duraklatmayı bitirir. */
export function togglePauseHour(): void {
  if (S.pauseUntil !== null) {
    clearPause("duraklatma bitti");
    return;
  }
  S.pauseUntil = Date.now() + HOUR_MS;
  S.pauseKind = "hour";
  log("1 saat duraklatıldı", "warn");
  render();
}

/** "Bugün kapat": gece yarısına kadar duraklatır. */
export function toggleDayOff(): void {
  if (S.pauseUntil !== null) {
    clearPause("bugün kapatma iptal edildi");
    return;
  }
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  S.pauseUntil = midnight.getTime();
  S.pauseKind = "day";
  log("bugün kapatıldı — gece yarısına kadar dokunulmayacak", "warn");
  render();
}

export function clearPause(note: string): void {
  S.pauseUntil = null;
  S.pauseKind = null;
  log(note, "ok");
  render();
}

// ---------- sıcak ton ----------

/** Çapa tablosunda (ışık kaydırması olmadan) o dakikadaki şiddet. */
function warmBaseAt(minute: number): number {
  const t = Math.max(0, Math.min(1440, minute));
  for (let i = 0; i < WARM_ANCHORS.length - 1; i++) {
    const [m0, v0] = WARM_ANCHORS[i];
    const [m1, v1] = WARM_ANCHORS[i + 1];
    if (t >= m0 && t <= m1) {
      const ratio = (t - m0) / (m1 - m0);
      return v0 + ratio * (v1 - v0);
    }
  }
  return 0;
}

/**
 * Sıcak ton eğrisindeki bir sonraki "değer değişim" saati; bilinmiyorsa null.
 * panels bunu `#next-change` için "sonraki değişim: HH:MM" diye yazar.
 */
export function nextWarmthChange(now: Date = new Date()): Date | null {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const current = warmBaseAt(nowMin);
  for (const [m] of WARM_ANCHORS) {
    if (m <= nowMin) continue;
    if (Math.abs(warmBaseAt(m) - current) < 0.5) continue;
    const d = new Date(now);
    d.setHours(Math.floor(m / 60) % 24, m % 60, 0, 0);
    if (m >= 1440) d.setDate(d.getDate() + 1);
    return d;
  }
  return null;
}

/**
 * Saat + ışık seviyesine göre otomatik şiddet; `warmPercent` tavan.
 * stabilite (d): hata durumunda sessizce 0 dönmez — null döner, çağıran
 * mevcut şiddeti korur ve hatayı bir kez loglar.
 */
let warmWarned = "";

async function autoWarmth(): Promise<number | null> {
  const now = new Date();
  try {
    const raw = await invoke<number>("warmth_auto", {
      hour: now.getHours(),
      minute: now.getMinutes(),
      lightLevel: S.lastCam ? S.lastCam.level : "unknown",
    });
    warmWarned = "";
    return Math.min(Number(raw) || 0, S.warmPercent);
  } catch (e) {
    const msg = String(e);
    if (warmWarned !== msg) {
      warmWarned = msg;
      log("sıcak ton hesaplanamadı, mevcut şiddet korunuyor: " + msg, "warn");
    }
    return null;
  }
}

/** Sıcak ton: kipe göre hesaplayıp gamma'ya yazar. auto = saat + ışık. */
export async function applyWarmth(): Promise<void> {
  try {
    if (S.warmMode === "off") {
      await invoke("gamma_restore");
      S.lastWarmApplied = 0;
      return;
    }
    const percent = S.warmMode === "fixed" ? S.warmPercent : await autoWarmth();
    // stabilite (d): hesaplanamadıysa son uygulanan şiddet korunur.
    const value = Math.round(percent === null ? (S.lastWarmApplied ?? S.warmPercent) : percent);
    await invoke("gamma_set_warmth", { percent: value });
    S.lastWarmApplied = value;
  } catch (e) {
    log("sıcak ton uygulanamadı: " + String(e), "bad");
  }
}

export function setWarmMode(v: WarmMode): void {
  S.warmMode = v;
  setSetting("warmMode", v);
  log("sıcak ton: " + WARM_MODE_LABEL[v]);
  void applyWarmth();
  render();
}

export function setWarmPercent(v: number): void {
  S.warmPercent = Math.max(0, Math.min(60, Math.round(v)));
  setSetting("warmPercent", String(S.warmPercent));
  void applyWarmth();
  render();
}

// ---------- okuma / animasyon ----------

/** Okuma profili: sakin tema + düşük tavan + animasyon kapalı + sıcak ton. */
export async function toggleReading(): Promise<void> {
  S.readingMode = !S.readingMode;
  setSetting("readingMode", S.readingMode ? "1" : "0");
  try {
    await setAnimations(!S.readingMode, true);
    if (S.readingMode) {
      S.readingPrevWarm = S.warmMode;
      S.warmMode = "fixed";
      setSetting("warmMode", "fixed");
      await applyWarmth();
      await pickTheme("ss-dusk", "dark");
      log("okuma profili: sıcak sakin tema, düşük tavan, animasyon kapalı", "ok");
    } else {
      S.warmMode = S.readingPrevWarm ?? "auto";
      S.readingPrevWarm = null;
      setSetting("warmMode", S.warmMode);
      await applyWarmth();
      log("okuma profili kapandı", "ok");
    }
  } catch (e) {
    log("okuma profili değişmedi: " + String(e), "bad");
  }
  render();
}

export async function setAnimations(enabled: boolean, quiet = false): Promise<void> {
  S.animations = enabled;
  setSetting("animations", enabled ? "1" : "0");
  try {
    await invoke("animations_set", { enabled });
    if (!quiet) log(enabled ? "animasyonlar açık" : "animasyonlar kapalı", "ok");
  } catch (e) {
    log("animasyon ayarı değişmedi: " + String(e), "bad");
  }
  render();
}

// ---------- tema + risk + kontrast ----------

async function pushUndo(currentName: string, currentValue: number): Promise<void> {
  const [, tmode] = await invoke<[string, string | null]>("theme_get").catch(
    () => [currentName, ""] as [string, string],
  );
  S.undoStack.push({ name: currentName, mode: tmode ?? "", value: currentValue });
  if (S.undoStack.length > UNDO_DEPTH) S.undoStack.shift();
  render();
}

export async function pickTheme(name: string, themeMode: string): Promise<void> {
  try {
    const current = await invoke<number>("brightness_get");
    // stabilite: appliedKey yoksa (soğuk açılış) geri alınacak tema yoktur —
    // pushUndo aynı temaya dönen anlamsız kayıt yazmasın.
    if (S.appliedKey) {
      await pushUndo(S.appliedKey.split("|")[0], current);
    }
    await invoke("theme_set", { name, mode: themeMode });
    S.appliedKey = `${name}|${themeMode}`;
    S.pendingKey = null;
    S.pendingCount = 0;
    const light = S.lastCam ? `${S.lastCam.level}/${S.lastCam.tone}` : "unknown";
    await invoke("pref_learn", { hour: new Date().getHours(), light, name, mode: themeMode });
    log(`elle tema: ${name} (${themeMode})`, "ok");
    // stabilite (c): elle tema seçimi parlaklık kalibrasyonunu KİRLETMEZ —
    // learnBrightness burada çağrılmaz; kalibrasyon yalnız bilinçli parlaklık
    // düzeltmelerinden (ofset düğmeleri) öğrenilir.
    await refresh();
  } catch (e) {
    log("tema değişmedi: " + String(e), "bad");
  }
}

export async function undo(): Promise<void> {
  const prev = S.undoStack.pop();
  render();
  if (!prev) {
    log("geri alınacak değişiklik yok", "warn");
    return;
  }
  try {
    await invoke("theme_set", { name: prev.name, mode: prev.mode || null });
    await invoke("brightness_set", { value: Math.round(prev.value) });
    S.appliedKey = `${prev.name}|${prev.mode}`;
    S.pendingKey = null;
    S.pendingCount = 0;
    log(`geri alındı: ${prev.name}`, "ok");
    await refresh();
  } catch (e) {
    log("geri alınamadı: " + String(e), "bad");
  }
}

/** Temanin olculmus kontrast raporu; olcusulmemisse null. */
function findAudit(name: string, themeMode: string | null): AuditReport | null {
  const norm = name.toLowerCase();
  const mine = S.audits.filter((r) => r.name.toLowerCase() === norm);
  if (mine.length === 0) return null;
  const want = themeMode === "light" ? "light" : "dark";
  return mine.find((r) => r.mode === want) ?? mine[0];
}

/** FAIL cikan tema otomatik secimde uygulanmaz (anahtar acikken). */
function gateReason(name: string, themeMode: string): string | null {
  if (!S.auditGate) return null;
  const rep = findAudit(name, themeMode);
  return rep && rep.verdict === "FAIL" ? `kontrast ${rep.text_on_bg}:1 (WCAG FAIL)` : null;
}

export async function loadAudit(): Promise<void> {
  try {
    const rows = await invoke<AuditReport[]>("contrast_audit");
    S.audits = Array.isArray(rows) ? rows : [];
  } catch (e) {
    S.audits = [];
    log("kontrast denetimi okunamadı: " + String(e), "bad");
    render();
    return;
  }
  render();
}

export function setGate(v: boolean): void {
  S.auditGate = v;
  setSetting("auditGate", v ? "1" : "0");
  S.lastGateWarn = "";
  log(v ? "kontrast kapısı açık: FAIL olan temalar uygulanmaz" : "kontrast kapısı kapalı", "ok");
  render();
}

export async function updateRisk(name: string, themeMode: string | null): Promise<void> {
  const rep = findAudit(name, themeMode);
  const risky = rep ? rep.verdict === "FAIL" : isRiskyName(name);
  if (!risky) {
    S.risk = null;
    render();
    return;
  }
  let fixLabel = "Güvenli temaya dön";
  try {
    const [target] = await invoke<[string, string, number]>("decide_target", {
      hour: new Date().getHours(),
      source: S.source,
    });
    fixLabel = `Dön: ${target}`;
  } catch {
    /* düğme genel etiketle kalır */
  }
  S.risk = {
    name,
    text: rep
      ? `${name}: ${rep.text_on_bg}:1 — WCAG ${rep.verdict} (${rep.mode}), gözü yorar.`
      : `${name} yüksek kontrastlı — gece göz yorar.`,
    fixLabel,
  };
  render();
}

/** Riskli dış tema adları (catalog.ts RISKY ile aynı aile). */
function isRiskyName(name: string): boolean {
  return ["synthwave84", "matrix", "nightowl", "cobalt2", "dracula", "aura"].includes(
    name.toLowerCase(),
  );
}

export async function fixRisk(): Promise<void> {
  try {
    const [n, m] = await invoke<[string, string]>("decide_target", {
      hour: new Date().getHours(),
      source: S.source,
    });
    await pickTheme(n, m);
    S.risk = null;
    render();
  } catch (e) {
    log("güvenli temaya dönülemedi: " + String(e), "bad");
  }
}

// ---------- kalibrasyon ----------

/**
 * Bilinçli parlaklık düzeltmesi: öğrenme BURADAN çağrılır.
 * Elle tema seçimi bunu çağırmaz (stabilite c).
 */
export async function learnBrightness(): Promise<void> {
  try {
    const current = await invoke<number>("brightness_get");
    const hour = new Date().getHours();
    const light = S.lastCam ? `${S.lastCam.level}/${S.lastCam.tone}` : "unknown";
    await invoke("pref_learn_bright", { hour, light, value: current });
    await showCalibration();
  } catch {
    /* öğrenme sessizce atlanabilir */
  }
}

export async function showCalibration(): Promise<void> {
  try {
    const hour = new Date().getHours();
    const light = S.lastCam ? `${S.lastCam.level}/${S.lastCam.tone}` : "unknown";
    const got = await invoke<[number, number] | null>("pref_get_bright", { hour, light });
    S.calibHint = got
      ? `kalibrasyon: %${got[0]} (${got[1]} gözlem) — bu saatte tercihin`
      : "kalibrasyon: henüz gözlem yok";
  } catch {
    /* gösterim atlanabilir */
  }
  render();
}

// ---------- ışık / pil / kamera ----------

function inSleepWindow(hour: number): boolean {
  return S.sleepStart <= S.sleepEnd
    ? hour >= S.sleepStart && hour < S.sleepEnd
    : hour >= S.sleepStart || hour < S.sleepEnd;
}

function applySleepCap(desired: number, hour: number): number {
  return inSleepWindow(hour) ? Math.min(desired, S.sleepCap) : desired;
}

/**
 * stabilite (e): kamera hatası yutulmaz — aynı hata için tek uyarı satırı
 * yazılır (tekrar spam yok), son bilinen örnek korunur.
 */
let camWarned = "";

async function cameraSample(
  force: boolean,
  camLimit: number,
): Promise<CamSample | null> {
  if (!force && S.lastCam && Date.now() - S.lastCam.at < camLimit) return S.lastCam;
  try {
    const [lum, , level, tone] = await invoke<[number, number, string, string]>("light_sample");
    camWarned = "";
    S.lastCam = { lum, level, tone, at: Date.now() };
    return S.lastCam;
  } catch (e) {
    const msg = String(e);
    if (camWarned !== msg) {
      camWarned = msg;
      log("kamera okunamadı: " + msg, "warn");
    }
    return S.lastCam;
  }
}

/**
 * stabilite (f): `battery_status` hatası sessiz [100,true]'ya düşmez — pil
 * bilinmiyor kabul edilir, davranış muhafazakar kalır (kamera turu
 * kısaltılmaz, adım kısılmaz) ve hata bir kez loglanır.
 */
let batteryWarned = false;

async function readBattery(): Promise<{ pct: number; charging: boolean } | null> {
  try {
    const [pct, charging] = await invoke<[number, boolean]>("battery_status");
    batteryWarned = false;
    return { pct, charging };
  } catch (e) {
    if (!batteryWarned) {
      batteryWarned = true;
      log("pil bilgisi okunamadı — muhafazakar mod: " + String(e), "warn");
    }
    return null;
  }
}

// ---------- refresh + tick ----------

export async function refresh(): Promise<void> {
  try {
    const bright = await invoke<number>("brightness_get");
    S.lastAppliedBright = bright;
    const [name, themeMode] = await invoke<[string, string | null]>("theme_get");
    S.appliedKey = `${name}|${themeMode ?? ""}`;
    void updateRisk(name, themeMode);
  } catch (e) {
    console.error("refresh:", e);
    log("durum okunamadı: " + String(e), "bad");
  }
  render();
}

/**
 * stabilite (a): tur sürerken gelen istek tek "son istek" olarak kuyruğa
 * alınır; tur bitince bir kez koşar. Böylece iç içe turlar yarışmaz.
 */
let tickInFlight = false;
let tickQueued: string | null = null;

export async function tick(reason: string): Promise<void> {
  if (tickInFlight) {
    tickQueued = reason;
    return;
  }
  tickInFlight = true;
  try {
    await runTick(reason);
  } finally {
    tickInFlight = false;
    if (tickQueued !== null) {
      const queued = tickQueued;
      tickQueued = null;
      void tick(queued);
    }
  }
}

/** stabilite (b): erken dönüşlerde birikmiş tema bekleme sayacı sıfırlanır. */
function resetPending(): void {
  S.pendingKey = null;
  S.pendingCount = 0;
}

async function runTick(reason: string): Promise<void> {
  S.lastAct = Date.now();
  S.freezeReason = null;
  if (isPaused()) {
    resetPending();
    log("duraklatıldı, atlandı", "warn");
    await refresh();
    return;
  }
  // Uygulamaya bağlı profil: dondurma kuralları dışında bu turu yönetir.
  const exe = await foregroundExe();
  const bound = exe ? S.profiles.find((p) => (p.apps ?? []).includes(exe)) ?? null : null;
  S.boundName = bound ? bound.name : null;
  S.boundExe = bound ? exe : null;
  if (bound && S.lastBoundExe !== exe) {
    log(`uygulamaya bağlı profil: ${bound.name} (${exe})`, "ok");
    S.lastBoundExe = exe;
  } else if (!bound) {
    S.lastBoundExe = null;
  }
  if (S.locked || (S.mode === "fixed" && !bound)) {
    resetPending();
    await diskLog(`kilitli/sabit ${reason}`, 0, S.lastAppliedBright, S.appliedKey ?? "-");
    log(`kilitli/sabit (${reason}), atlandı`, "warn");
    await refresh();
    return;
  }
  try {
    const prof = activeProfile();
    if (exe && S.blockItems.includes(exe)) {
      if (prof?.autoLock) {
        S.locked = true;
        setSetting("locked", "1");
        await diskLog(`film otomatik kilit ${exe}`, 0, S.lastAppliedBright, S.appliedKey ?? "-", "-", "-");
        log("otomatik kilit (" + exe + ")", "warn");
      } else {
        await diskLog(`donduruldu uygulama ${exe}`, 0, S.lastAppliedBright, S.appliedKey ?? "-", "-", "-");
        log("donduruldu: video/oyun uygulaması (" + exe + ")", "warn");
      }
      S.freezeReason = "uygulama: " + exe;
      resetPending();
      await refresh();
      return;
    }
    if (await invoke<boolean>("is_fullscreen")) {
      if (!exe || !S.allowItems.includes(exe)) {
        const why = "tam ekran" + (exe ? " (" + exe + ")" : "");
        await diskLog(`donduruldu ${why}`, 0, S.lastAppliedBright, S.appliedKey ?? "-", "-", "-");
        log("donduruldu: " + why, "warn");
        S.freezeReason = why;
        resetPending();
        await refresh();
        return;
      }
    }

    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    // stabilite (f): pil bilinmiyorsa lowPower kapalı kalır.
    const battery = await readBattery();
    const lowPower = battery ? battery.pct < 20 && !battery.charging : false;
    S.lowPower = lowPower;
    const camLimit = lowPower ? CAM_MS_LOW : CAM_MS;

    // Bağlı profil gelirse onun ayarları bu turu yönetir; kilit ve dondurma
    // kuralları her durumda önde gelir.
    const effMode: Mode = bound ? bound.mode : S.mode;
    const effSource: Source = bound ? bound.source : S.source;
    const effOffset = bound ? bound.offset : S.offset;
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
        resetPending();
        await refresh();
        return;
      }
      S.light = {
        text: `${cam.level} / ${cam.tone}`,
        title: `ışık: ${cam.level}/${cam.tone} (parlaklık ${cam.lum.toFixed(0)})`,
        sub: `parlaklık: ${cam.lum.toFixed(0)}`,
        dot: cam.level === "dark" ? "" : cam.level === "dim" ? "warn" : "ok",
      };
      if (cam.level === "dark") {
        name = "ss-night";
        themeMode = "dark";
        desired = 30;
      } else if (cam.level === "dim") {
        name = "ss-dusk";
        themeMode = "dark";
        desired = 50;
      } else {
        name = "ss-paper";
        themeMode = "light";
        desired = cam.level === "bright" ? 85 : 70;
      }
    } else {
      const [n, m, base] = await invoke<[string, string, number]>("decide_target", {
        hour,
        source: effSource,
      });
      name = n;
      themeMode = m;
      desired = base;
      if (effSource === "auto" && cam) {
        S.light = {
          text: `zaman + ${cam.level}/${cam.tone}`,
          title: `zaman + ışık: ${cam.level}/${cam.tone} (parlaklık ${cam.lum.toFixed(0)})`,
          sub: `${hour}:${String(minute).padStart(2, "0")} • kaynak: ${SOURCE_LABEL[effSource]}`,
          dot: "accent",
        };
        if (cam.level === "dark") {
          name = "ss-night";
          themeMode = "dark";
          desired = 30;
        } else if (cam.level === "bright") {
          name = "ss-paper";
          themeMode = "light";
          desired = 80;
        } else if (hour >= 18 && hour <= 21 && cam.tone === "cool") {
          name = "ss-dusk";
        }
      } else {
        S.light = {
          text: effSource === "auto" ? "zaman" : SOURCE_LABEL[effSource],
          title: `${SOURCE_LABEL[effSource]} • ${hour}:${String(minute).padStart(2, "0")}`,
          sub: `${hour}:${String(minute).padStart(2, "0")} • kaynak: ${SOURCE_LABEL[effSource]}`,
          dot: "accent",
        };
      }
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
    if (S.readingMode) {
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
    if (key !== appliedKeySafe() && gated) {
      if (S.lastGateWarn !== name) {
        log(`otomatik seçimde reddedildi: ${name} — ${gated}`, "warn");
        S.lastGateWarn = name;
      }
      resetPending();
    } else if (key === appliedKeySafe()) {
      resetPending();
    } else if (key === S.pendingKey) {
      S.pendingCount += 1;
    } else {
      S.pendingKey = key;
      S.pendingCount = 1;
    }

    let snapped = false;
    let appliedNow = S.lastAppliedBright;
    if (S.pendingCount >= 2 && key !== appliedKeySafe() && !gated) {
      const floor = await invoke<number>("brightness_floor", { hour, minute });
      const target = Math.min(100, Math.max(floor, Math.round(desired + effOffset)));
      const cur0 = await invoke<number>("brightness_get");
      await pushUndo(S.appliedKey?.split("|")[0] ?? name, cur0);
      await invoke("theme_set", { name, mode: themeMode });
      S.appliedKey = key;
      S.pendingKey = null;
      S.pendingCount = 0;
      S.lastGateWarn = "";
      log(`tema: ${name} (${themeMode})`, "ok");
      if (!effFixed && target !== cur0) {
        await invoke("brightness_set", { value: Math.round(target) });
        log(`parlaklık atlama: ${cur0} -> ${target}`, "ok");
      }
      // Karar uygulanınca harici monitörlere de aynı hedef yazılır; kilit /
      // duraklat / sabit kipte (effFixed) dahili gibi onlara da dokunulmaz.
      if (!effFixed) await applyAutoMonitors(target);
      appliedNow = effFixed ? cur0 : target;
      snapped = true;
    } else if (key !== appliedKeySafe() && !gated) {
      log(`tema bekliyor: ${name} (${S.pendingCount}/2)`);
    }

    if (!snapped && !effFixed) {
      const current = await invoke<number>("brightness_get");
      let next = await invoke<number>("decide_brightness", {
        current,
        desired: Math.min(100, Math.max(0, Math.round(desired + effOffset))),
        hour,
        minute,
      });
      if (lowPower) next = Math.round(current + (next - current) / 2);
      if (next !== current) {
        await invoke("brightness_set", { value: Math.round(next) });
        log(`parlaklık: ${current} -> ${next}`, "ok");
      }
      appliedNow = next;
    }

    const note = bound
      ? `bağlı profil ${exe} -> ${bound.name}`
      : key !== appliedKeySafe() && gated
        ? `reddedildi: ${gated}`
        : S.pendingKey
          ? `bekliyor ${S.pendingCount}/2`
          : lowPower
            ? "pil modu"
            : learnedApplied
              ? "ogrenilmis parlaklik"
              : remembered
                ? "ogrenilmis tercih"
                : reason;
    await diskLog(note, desired, appliedNow, `${name}/${themeMode}`, level, tone);

    // Otomatik kipte sıcak ton her turda saate göre yeniden hesaplanır.
    // Diğer kiplerde tıklanınca/yanıkken değişir; kimlik rampaya sürekli
    // yazmamak için ("off") burada dokunulmaz.
    if (S.warmMode === "auto") {
      await applyWarmth();
    }

    S.desiredBase = desired;
    S.targetPct = Math.min(100, Math.max(0, Math.round(desired + effOffset)));
    S.lastMeasureAt = Date.now();
    await refresh();
  } catch (e) {
    log("hata: " + String(e), "bad");
    render();
  }
}

function appliedKeySafe(): string {
  return S.appliedKey ?? "";
}

// ---------- 20-20-20 ----------

async function notify(title: string, body: string): Promise<void> {
  if (S.notifyReady) {
    try {
      await sendNotification({ title, body });
      return;
    } catch {
      /* fall through to band */
    }
  }
  S.breakVisible = true;
  render();
}

/** Yeni döngü başlatır: uyarı bir kez çıkar, onaylanana kadar tekrar etmez. */
export function resetBreak(ms: number, note?: string): void {
  S.breakDueAt = Date.now() + ms;
  S.breakState = "waiting";
  S.breakVisible = false;
  if (note) log(note, "ok");
  render();
}

export function ackBreak(): void {
  resetBreak(BREAK_MS, "mola tamamlandı, 20 dk sonra yeni uyarı");
}

export function snoozeBreak(): void {
  resetBreak(SNOOZE_MS, "ertelendi, 5 dk sonra yeni uyarı");
}

export function setBreakEnabled(v: boolean): void {
  S.breakEnabled = v;
  setSetting("breakEnabled", v ? "1" : "0");
  if (!v) {
    S.breakState = "waiting";
    S.breakVisible = false;
    render();
  } else {
    resetBreak(BREAK_MS);
  }
}

export function tickBreak(): void {
  if (!S.breakEnabled || S.breakState === "alerting") return;
  if (S.locked || isPaused()) return;
  if (Date.now() < S.breakDueAt) return;
  const h = new Date().getHours();
  if (h >= 0 && h < 7) return;
  S.breakState = "alerting";
  S.breakVisible = true;
  render();
  void notify("20-20-20", "20 saniye uzaklara bak.");
}

// ---------- geçmiş ----------

export async function loadHistory(): Promise<void> {
  try {
    const lines = await invoke<string[]>("log_lines", { max: 50 });
    S.histLines = lines.slice().reverse();
  } catch (e) {
    S.histLines = [];
    log("log okunamadı: " + String(e), "bad");
  }
  try {
    S.stats = await invoke<StatsSummary>("stats_summary");
  } catch {
    S.stats = null;
  }
  render();
}

export async function clearLogs(): Promise<void> {
  try {
    await invoke("log_clear");
    await loadHistory();
    log("kayıtlar temizlendi", "ok");
  } catch (e) {
    log("temizlenemedi: " + String(e), "bad");
  }
}

// ---------- monitörler ----------

function monitorRow(id: string): MonitorRowState | null {
  return S.monitors.find((m) => m.info.id === id) ?? null;
}

/**
 * Seçim + değer tazeleme: liste değişince çağrılır. Seçim korunur; yoksa ilk
 * monitör (genelde dahili panel) seçilir ve tüm satırların yüzdesi okunur.
 */
function syncMonitors(): Promise<void> {
  if (S.monitors.length === 0) {
    S.monitorSel = null;
    S.monitorCtrlEnabled = false;
    render();
    return Promise.resolve();
  }
  const initial =
    S.monitorSel && S.monitors.some((m) => m.info.id === S.monitorSel)
      ? S.monitorSel
      : S.monitors[0].info.id;
  const jobs = S.monitors
    .filter((m) => m.info.id !== initial)
    .map((m) => refreshMonitorValue(m.info.id));
  return selectMonitor(initial).then(() => Promise.all(jobs)).then(() => undefined);
}

/** Açılışta bağlı monitörleri listeler; hata olursa boş listeyle devam edilir. */
export async function initMonitors(): Promise<void> {
  try {
    const list = await invoke<MonitorInfo[]>("monitor_list");
    S.monitors = (Array.isArray(list) ? list : []).map((info) => ({
      info,
      value: null,
      error: null,
    }));
  } catch (e) {
    S.monitors = [];
    log("monitörler okunamadı: " + String(e), "warn");
  }
  render();
  await syncMonitors();
}

/**
 * Hotplug: monitor_list tazeler. Yalnız id kümesi değiştiyse yeniden çizilir
 * (seçim korunur, yoksa ilk monitör); değişmediyse dokunulmaz — flicker yok.
 */
export async function refreshMonitorList(): Promise<void> {
  let list: MonitorInfo[] = [];
  try {
    list = await invoke<MonitorInfo[]>("monitor_list");
  } catch {
    return;
  }
  const next = Array.isArray(list) ? list : [];
  const ids = new Set(next.map((m) => m.id));
  const same = ids.size === S.monitors.length && S.monitors.every((m) => ids.has(m.info.id));
  if (same) return;
  S.monitors = next.map((info) => {
    const prev = monitorRow(info.id);
    return prev ? { ...prev, info } : { info, value: null, error: null };
  });
  // Tak/çıkar sonrası hata ve yazma geçmişi çıkarılan monitörlere ait olabilir.
  S.monitorFailed = [];
  for (const key of Object.keys(S.lastAppliedByMonitor)) {
    if (!ids.has(key)) delete S.lastAppliedByMonitor[key];
  }
  log(`monitörler değişti: ${next.map((m) => m.name).join(", ") || "yok"}`, "ok");
  render();
  await syncMonitors();
}

/** Monitör seçimi: satır vurgulanır, değeri okununca slider dolar. */
export async function selectMonitor(id: string): Promise<void> {
  if (!monitorRow(id)) return;
  S.monitorSel = id;
  // Okuma donene kadar kontrol kapali: eski monitorun yuzdesiyle yeni
  // monitore yanlis deger yazilmasin.
  S.monitorCtrlEnabled = false;
  render();
  await refreshMonitorValue(id);
}

/** Tek monitörün parlaklığını okur: satır yüzdesini, seçiliyse slider'ı da günceller. */
export async function refreshMonitorValue(id: string): Promise<void> {
  const row = monitorRow(id);
  if (!row) return;
  try {
    const raw = await invoke<number>("brightness_get_monitor", { id });
    const pct = Math.max(0, Math.min(100, Math.round(raw)));
    row.value = pct;
    row.error = null;
    if (id === S.monitorSel) S.monitorCtrlEnabled = true;
  } catch (e) {
    row.value = null;
    row.error = String(e);
    log(`${row.info.name}: parlaklık okunamadı — ${String(e)}`, "bad");
    if (id === S.monitorSel) S.monitorCtrlEnabled = false;
  }
  render();
}

/** Seçili monitör harici mi ve Pro kilidi açık mı? (slider soluk + kilit kartı) */
export function monitorProLocked(): boolean {
  const sel = S.monitorSel ? monitorRow(S.monitorSel) : null;
  return !!sel && !sel.info.is_internal && !S.licensePro;
}

/** Seçili monitöre yazar; değer daima tam sayı (u8) ve 0-100 aralığında. */
export async function applyMonitorBrightness(value: number): Promise<void> {
  if (!S.monitorSel) return;
  const id = S.monitorSel;
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const row = monitorRow(id);
  const internal = row?.info.is_internal === true;
  if (monitorProLocked()) {
    log("harici monitör kontrolü Pro lisans gerektirir", "warn");
    render();
    return;
  }
  // Elle yazma hata durumunu sıfırlar: sonraki otomatik tur yine denesin.
  S.monitorFailed = S.monitorFailed.filter((x) => x !== id);
  monWriteChain = monWriteChain
    .then(async () => {
      await invoke("brightness_set_monitor", { id, value: pct });
      S.lastAppliedByMonitor[id] = pct;
      const r = monitorRow(id);
      if (r) {
        r.value = pct;
        r.error = null;
      }
      if (id === S.monitorSel) S.monitorCtrlEnabled = true;
      // Dahili panel ayni donanimi kullaniyor: otomatik turun tabanini
      // guncelle ki bir sonraki dakika elle secim hemen geri almasin.
      if (internal) S.lastAppliedBright = pct;
      log(`${row ? row.info.name : id}: parlaklık %${pct}`, "ok");
      render();
    })
    .catch((e) => {
      const msg = String(e);
      const r = monitorRow(id);
      if (r) r.error = msg;
      log(`${row ? row.info.name : id}: parlaklık yazılamadı — ${msg}`, "bad");
      render();
    });
  await monWriteChain;
}

/** Yazmalari siraya koyar: hizli +/− / slider DDC uzerinde yaris yaratmasin. */
let monWriteChain: Promise<void> = Promise.resolve();

/**
 * Otomatik karar uygulanınca harici monitörlere (is_internal === false) aynı
 * hedef değeri yazar. Yazmalar monWriteChain üzerinden sıraya girer; aynı değer
 * (fark < 3) tekrar yazılmaz, hata satırda görünür ve monitör başına bir kez
 * loglanır. Dahili paneli `brightness_set` (WMI) yönetir, burada dokunulmaz.
 */
export async function applyAutoMonitors(target: number): Promise<void> {
  const value = Math.max(0, Math.min(100, Math.round(target)));
  for (const m of S.monitors) {
    if (m.info.is_internal) continue;
    // Pro kapısı: ücretsiz sürümde harici monitörlere otomatik yazma denenmez —
    // backend zaten reddedecek, her turda hata logu şişmesin.
    if (!S.licensePro) continue;
    // 0 geçerli değerdir: undefined kontrolü falsy ile yapılmamalı.
    const prev = S.lastAppliedByMonitor[m.info.id];
    if (prev !== undefined && Math.abs(prev - value) < 3) continue;
    const id = m.info.id;
    const name = m.info.name;
    monWriteChain = monWriteChain
      .then(async () => {
        await invoke("brightness_set_monitor", { id, value });
        S.lastAppliedByMonitor[id] = value;
        S.monitorFailed = S.monitorFailed.filter((x) => x !== id);
        const r = monitorRow(id);
        if (r) {
          r.value = value;
          r.error = null;
        }
        render();
      })
      .catch((e) => {
        const msg = String(e);
        const r = monitorRow(id);
        if (r) r.error = msg;
        if (!S.monitorFailed.includes(id)) {
          S.monitorFailed = [...S.monitorFailed, id];
          log(`${name}: otomatik parlaklık yazılamadı — ${msg}`, "bad");
        }
        render();
      });
  }
  await monWriteChain;
}

// ---------- lisans ----------

/** Lisans durumunu çeker, kartı günceller ve monitör/profil kapılarını tazeler. */
export async function refreshLicense(): Promise<void> {
  try {
    const st = await invoke<LicenseStatus>("license_status");
    S.licenseStatus = st;
    S.licensePro = st?.pro === true;
    S.licenseError = null;
  } catch (e) {
    S.licenseStatus = null;
    S.licensePro = false;
    S.licenseError = "lisans durumu okunamadı: " + String(e);
  }
  render();
}

export async function activateLicense(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    S.licenseError = "lisans anahtarı girin";
    render();
    return;
  }
  try {
    const st = await invoke<LicenseStatus>("license_activate", { key: trimmed });
    S.licenseStatus = st;
    S.licensePro = st?.pro === true;
    S.licenseError = null;
    log(S.licensePro ? "Pro lisans etkinleştirildi" : "lisans geçerli değil", S.licensePro ? "ok" : "warn");
  } catch (e) {
    S.licenseError = String(e);
    log("lisans etkinleştirilemedi: " + String(e), "bad");
  }
  render();
}

export async function deactivateLicense(): Promise<void> {
  try {
    const st = await invoke<LicenseStatus>("license_deactivate");
    S.licenseStatus = st;
    S.licensePro = st?.pro === true;
    S.licenseError = null;
    log("lisans kaldırıldı", "warn");
  } catch (e) {
    S.licenseError = String(e);
    render();
    return;
  }
  render();
}

/** Ücretsiz sürümde profil sınırı doluysa true döner ve "Pro gerekli" yazar. */
function proProfileBlocked(): boolean {
  if (S.licensePro || S.profiles.length < FREE_MAX_PROFILES) return false;
  log(`Pro gerekli: ücretsiz sürümde en fazla ${FREE_MAX_PROFILES} profil`, "warn");
  return true;
}

// ---------- profiller ----------

export function selectForEdit(id: string): void {
  const p = S.profiles.find((x) => x.id === id);
  if (!p) return;
  S.draft = { ...p };
  S.editorDirty = false;
  renderEditor();
  render();
}

export function updateDraft(patch: Partial<Profile>): void {
  S.draft = { ...S.draft, ...patch };
  S.editorDirty = true;
  renderEditor();
  render();
}

export function setMode(v: Mode): void {
  S.mode = v;
  setSetting("mode", v);
  resetPending();
  log("mod: " + MODE_LABEL[v]);
  render();
  void tick("mod değişti");
}

export function setSource(v: Source): void {
  S.source = v;
  setSetting("source", v);
  resetPending();
  log("kaynak: " + SOURCE_LABEL[v]);
  render();
  void tick("kaynak değişti");
}

export function setBlockList(items: string[]): void {
  S.blockItems = items;
  setSetting("blocklist", items.join(","));
  log("engelli liste güncellendi");
}

export function setAllowList(items: string[]): void {
  S.allowItems = items;
  setSetting("allowlist", items.join(","));
  log("izinli liste güncellendi");
}

export function setSleep(key: "sleepStart" | "sleepEnd" | "sleepCap", value: number): void {
  const v = Number.isFinite(value) ? Math.round(value) : 0;
  if (key === "sleepStart") S.sleepStart = v;
  else if (key === "sleepEnd") S.sleepEnd = v;
  else S.sleepCap = v;
  setSetting(key, String(v));
  log("zamanlama güncellendi");
  render();
}

export function toggleLock(): void {
  S.locked = !S.locked;
  setSetting("locked", S.locked ? "1" : "0");
  log(S.locked ? "manuel kilit açıldı" : "manuel kilit kapandı", "warn");
  render();
  void refresh();
}

export function applyProfile(p: Profile): void {
  S.activeId = p.id;
  saveActiveId(S.activeId);
  S.mode = p.mode;
  S.source = p.source;
  S.offset = p.offset;
  setSetting("mode", S.mode);
  setSetting("source", S.source);
  setSetting("brightOffset", String(S.offset));
  void invoke("theme_set", { name: p.theme, mode: p.themeMode }).catch((e) =>
    log("tema değişmedi: " + String(e), "bad"),
  );
  S.appliedKey = `${p.theme}|${p.themeMode}`;
  resetPending();
  if (!S.editorDirty) {
    S.draft = { ...p };
    renderEditor();
  }
  log(`profil: ${p.name}`, "ok");
  void diskLog(`profil ${p.name}`, 0, S.lastAppliedBright, S.appliedKey);
  render();
  void tick("profil");
}

export function saveDraft(name: string, apps: string[]): void {
  if (name.trim()) S.draft.name = name.trim();
  S.draft.apps = apps;
  S.profiles = upsertProfile(S.profiles, { ...S.draft });
  saveProfiles(S.profiles);
  S.editorDirty = false;
  log(`profil kaydedildi: ${S.draft.name}`, "ok");
  // Aktif profil kaydedildiyse global state'i de ona göre senkronla.
  if (S.draft.id === S.activeId) {
    S.mode = S.draft.mode;
    S.source = S.draft.source;
    S.offset = S.draft.offset;
    setSetting("mode", S.mode);
    setSetting("source", S.source);
    setSetting("brightOffset", String(S.offset));
    void invoke("theme_set", { name: S.draft.theme, mode: S.draft.themeMode }).catch((e) =>
      log("tema değişmedi: " + String(e), "bad"),
    );
    S.appliedKey = `${S.draft.theme}|${S.draft.themeMode}`;
    resetPending();
  }
  renderEditor();
  render();
}

export function addProfile(): void {
  if (proProfileBlocked()) return;
  if (S.profiles.length >= MAX_PROFILES) return;
  const p = createProfile(`Profil ${S.profiles.length + 1}`);
  S.profiles = upsertProfile(S.profiles, p);
  saveProfiles(S.profiles);
  S.draft = { ...p };
  S.editorDirty = false;
  renderEditor();
  render();
}

export function duplicateDraft(): void {
  if (proProfileBlocked()) return;
  if (S.profiles.length >= MAX_PROFILES) return;
  const p = duplicateProfile(S.draft);
  S.profiles = upsertProfile(S.profiles, p);
  saveProfiles(S.profiles);
  S.draft = { ...p };
  S.editorDirty = false;
  renderEditor();
  render();
}

export function deleteDraft(): void {
  if (S.profiles.length <= 1) return;
  const removed = S.draft;
  S.profiles = S.profiles.filter((p) => p.id !== removed.id);
  saveProfiles(S.profiles);
  if (S.activeId === removed.id) {
    S.activeId = S.profiles[0].id;
    saveActiveId(S.activeId);
    const next = S.profiles.find((p) => p.id === S.activeId);
    if (next) applyProfile(next);
  } else {
    saveActiveId(S.activeId);
    S.draft = { ...(S.profiles.find((p) => p.id === S.activeId) ?? S.profiles[0]) };
    S.editorDirty = false;
    renderEditor();
    render();
  }
  log("profil silindi", "warn");
}

export function restoreSeeds(): void {
  // Geri getirme de yeni profil ekler: ücretsizde sınır doluysa Pro ister.
  if (proProfileBlocked()) return;
  const result = restoreSeedProfiles(S.profiles);
  S.profiles = result.profiles;
  saveProfiles(S.profiles);
  log(
    result.added > 0
      ? `hazır profiller geri getirildi (+${result.added})`
      : "hazır profiller zaten yerinde",
    result.added > 0 ? "ok" : "warn",
  );
  render();
}

// ---------- otomatik başlatma ----------

export async function autostartEnabled(): Promise<boolean> {
  try {
    return await invoke<boolean>("autostart_get");
  } catch {
    return false;
  }
}

export async function setAutostart(v: boolean): Promise<void> {
  try {
    await invoke("autostart_set", { enabled: v });
    log(v ? "otomatik başlatma açıldı" : "otomatik başlatma kapandı", "ok");
  } catch (e) {
    log("otomatik başlatma değiştirilemedi: " + String(e), "bad");
  }
}