// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
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
import { emit } from "@tauri-apps/api/event";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { DEFAULT_DESIGN_THEME, MODE_LABEL, SOURCE_LABEL } from "./catalog";
import type { Mode, Source } from "./catalog";
import {
  autoPaletteDue,
  extendRespect,
  finalTarget,
  isExternalChange,
  isIndependentTurn,
  learnAllowed,
  learnDelta,
  lightKey,
  medianTone,
  skipReason,
  themeGate,
  warmthToKelvin,
} from "./engine";
import type { LightLevel, Tone, WriteRecord } from "./engine";
import { toast } from "./toast";
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

/** Sistem tanılaması tek kontrol (backend `diagnose::Check`). */
export interface DiagCheck {
  id: string;
  label: string;
  status: "ok" | "warn" | "bad";
  detail: string;
  hint: string;
}

/** Tanılama raporu (backend `diagnose::Report`). */
export interface DiagReport {
  version: string;
  os: string;
  checks: DiagCheck[];
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

/** Bağlı monitör kaydı (backend `monitor::MonitorInfo`). */export interface MonitorInfo {
  id: string;
  name: string;
  is_internal: boolean;
  /** "wmi" (dahili panel) | "ddc" (harici monitör). */
  api: string;
}

/** Monitör başına HDR durumu (backend `hdr_status_all`). */
export interface HdrStatus {
  device: string;
  hdr: boolean;
}

/** Monitör başına donanımsal sıcaklık desteği (backend `monitor_color_temp_info`). */
export interface ColorTempInfo {
  device: string;
  supported: boolean;
  /** duzeltme (md.12): backend anlık K gönderiyorsa dolu gelir. */
  kelvin?: number;
  increment: number;
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
  /** Monitörde HDR açık mı (rozet + soluk satır)? */
  hdr: boolean;
  /** Donanımsal sıcaklık desteği; null = bilinmiyor. */
  ctSupported: boolean | null;
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
/** `decide_level` çıktısını doğrulamak için (Rust `Level::as_str`). */
const LEVEL_NAMES: LightLevel[] = ["dark", "dim", "normal", "bright"];
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
  [0, 88],
  [300, 88],
  [360, 56],
  [420, 22],
  [480, 0],
  [900, 0],
  [1020, 22],
  [1140, 56],
  [1260, 78],
  [1380, 88],
  [1440, 88],
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
  /** duzeltme v2.2 (madde 12): otomatik kilidi tetikleyen engelli exe; kilit
   *  yalnız bu exe önden gitince kendiliğinden çözülür (manuel kilidi etkilemez). */
  autoLockExe: string | null;
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
  /** duzeltme v2.2 (E): Kelvin arayüzünün son değeri (2500–6500). */
  warmKelvin: number;
  /** Son Kelvin uygulaması monitörün kendi ayarıyla mı yapıldı? */
  warmKelvinHw: boolean;
  /** Son uygulanan sıcak ton şiddeti (stabilite d). */
  lastWarmApplied: number | null;
  /**
   * v2.5: yazımdan sonraki geri okuma farkı (beklenen − okunan mavi %).
   * null = ölçülmedi; |fark| > 4 ise sürücü rampayı reddediyordur.
   */
  warmthDrift: number | null;
  readingMode: boolean;
  /** Okuma profili açılmadan önceki tema/sarılık/animasyon (geri yükleme için). */
  readingPrev: { warm: WarmMode; themeKey: string | null; animations: boolean } | null;
  animations: boolean;
  profiles: Profile[];
  activeId: string;
  draft: Profile;
  editorDirty: boolean;
  pendingKey: string | null;
  pendingCount: number;
  appliedKey: string | null;
  /** Son otomatik tema değişiminin zamanı (dwell kapısı). */
  lastThemeAt: number | null;
  /** Son "bekliyor" notunun anahtarı: aynı not her turda loglanmaz. */
  lastPendingNote: string | null;
  /** Kendi yazdığımız parlaklık ve zamanı (dış müdahaleyi ayırt eder). */
  lastWritten: WriteRecord | null;
  /** Dış müdahale sonrası dokunmama penceresinin bitişi. */
  respectUntil: number;
  /** Ekran kapalı uyarısı bir kez loglanır. */
  screenOffLogged: boolean;
  /** Histerezli (Rust `decide_level`) ışık seviyesi ve medyan tonu. */
  camLevel: LightLevel;
  camTone: Tone;
  /** Son 5 ölçümün tonu (medyan için). */
  camHistory: Array<{ tone: string; at: number }>;
  /** Tema turu sayılan son ölçümün zamanı (önbellek karesi sayılmaz). */
  lastCountedCamAt: number | null;
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
  /** v2.8: oyun/video sırasında %100 parlaklık açık mı (Ayarlar anahtarı). */
  gameBright: boolean;
  /** Boost uygulandı mı; çıkışta geri dönülecek değer burada tutulur. */
  gameBoost: boolean;
  gameBoostPrev: number | null;
  /** v2.9: "Günün rengi" — saate göre otomatik palet. */
  autoPalette: boolean;
  /** Elle palet seçiminin zamanı (10 dk dwell penceresi). */
  lastManualPaletteAt: number;
  /** v2.10: son sistem tanılaması (Ayarlar → Kontrol). null = hiç koşmadı. */
  diag: DiagReport | null;
  audits: AuditReport[];
  auditGate: boolean;
  lastGateWarn: string;
  risk: { name: string; text: string; fixLabel: string } | null;
  licensePro: boolean;
  /** Windows gece ışığı: true açık, false kapalı, null bilinmiyor (v3.0). */
  nightLightOn: boolean | null;
  licenseStatus: LicenseStatus | null;
  licenseError: string | null;
  monitors: MonitorRowState[];
  monitorSel: string | null;
  monitorCtrlEnabled: boolean;
  lastAppliedByMonitor: Record<string, number | undefined>;
  monitorFailed: string[];
  /** Herhangi bir bağlı monitörde HDR açık mı (flyout + why-line + not)? */
  hdrOn: boolean;
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

/**
 * v2.5: sıcak ton ölçeği 0-45'ten 0-100'e taşındı ve `warmPercent` artık
 * tavan değil şiddet. Eski varsayılan (35) yeni ölçekte çok kısık kalıyordu;
 * bir kez 70'e taşınır. Kullanıcı sonradan kendisi değiştirdiyse dokunulmaz.
 */
function loadWarmPercent(): number {
  const raw = Math.max(0, Math.min(100, Math.round(loadNumber("warmPercent", 70))));
  if (getSetting("warmScale", "") === "2") return raw;
  const migrated = raw <= 40 ? 70 : raw;
  setSetting("warmPercent", String(migrated));
  setSetting("warmScale", "2");
  return migrated;
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
  autoLockExe: null,
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
  warmPercent: loadWarmPercent(),
  warmKelvin: Math.max(2500, Math.min(6500, Math.round(loadNumber("warmKelvin", 6500)))),
  warmKelvinHw: false,
  lastWarmApplied: null,
  warmthDrift: null,
  readingMode: getSetting("readingMode", "0") === "1",
  readingPrev: null,
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
  lastThemeAt: null,
  lastPendingNote: null,
  lastWritten: null,
  respectUntil: 0,
  screenOffLogged: false,
  camLevel: "normal",
  camTone: "neutral",
  camHistory: [],
  lastCountedCamAt: null,
  lastAct: 0,
  lastAppliedBright: 0,
  lastMeasureAt: null,
  lastCam: null,
  undoStack: [],
  boundName: null,
  boundExe: null,
  lastBoundExe: null,
  freezeReason: null,
  gameBright: getSetting("gameBright", "1") === "1",
  gameBoost: false,
  gameBoostPrev: null,
  autoPalette: getSetting("autoPalette", "0") === "1",
  lastManualPaletteAt: 0,
  diag: null,
  audits: [],
  auditGate: getSetting("auditGate", "1") === "1",
  lastGateWarn: "",
  risk: null,
  licensePro: false,
  nightLightOn: null,
  licenseStatus: null,
  licenseError: null,
  monitors: [],
  monitorSel: null,
  monitorCtrlEnabled: false,
  lastAppliedByMonitor: {},
  monitorFailed: [],
  hdrOn: false,
  light: { text: "-", title: "", sub: "-", dot: "" },
  targetPct: null,
  desiredBase: null,
  lowPower: false,
  calibHint: "Öğrenilen tercih: henüz gözlem yok",
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
  scheduleStateEmit();
}

function renderEditor(): void {
  hooks.renderEditor();
}

// ---------- flyout durum köprüsü ----------

/** ss:state emit sıklığı: her render sonrası en fazla 1 sn'de bir. */
const STATE_EMIT_MS = 1000;
let stateEmitTimer: number | null = null;
let stateEmitAt = 0;

/**
 * Flyout'a giden durum özeti. Emit hatası yutulur: flyout kapalıyken
 * (pencere yok) hata normaldir, log şişmemesi gerekir.
 */
function scheduleStateEmit(): void {
  if (stateEmitTimer !== null) return;
  const wait = Math.max(0, stateEmitAt + STATE_EMIT_MS - Date.now());
  stateEmitTimer = window.setTimeout(() => {
    stateEmitTimer = null;
    stateEmitAt = Date.now();
    void emit("ss:state", {
      brightness: Math.round(S.lastAppliedBright),
      target: S.targetPct !== null ? Math.round(S.targetPct) : null,
      theme: S.appliedKey ? S.appliedKey.split("|")[0] : null,
      mode: S.mode,
      pausedUntil: S.pauseUntil,
      licensed: S.licensePro,
      hdr: S.hdrOn,
      locked: S.locked,
      dayOff: S.pauseKind === "day" && S.pauseUntil !== null,
      // v2.7: flyout aynı şablonu/paleti giysin (disk de paylaşılıyor;
      // bu alanlar anlık senkron için — ayar değişince beklemeden gider).
      template: document.documentElement.dataset.template ?? null,
      designTheme: document.documentElement.dataset.theme ?? null,
    }).catch(() => undefined);
  }, wait);
}

// ---------- küçük yardımcılar ----------

// duzeltme v2.2 (D): toast'a düşen hatalar 3 sn içinde aynı mesajla
// tekrar gelmez (spam koruması). Yalnız hata toast'larında kullanılır.
const errToastAt = new Map<string, number>();

function toastErrOnce(msg: string, detail?: string): void {
  const now = Date.now();
  const last = errToastAt.get(msg) ?? 0;
  if (now - last < 3000) return;
  errToastAt.set(msg, now);
  toast.err(msg, detail ? { detail } : undefined);
}

/**
 * duzeltme v2.2: busy toast'u hata durumunda "ok" görünmeden kapatmak için
 * toast.ts'in Esc sözleşmesini kullanır (Esc en üstteki görünür toast'u
 * kapatır). toast.ts değiştirilmeden tek yol bu.
 */
function closeTopToast(): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
}

/** Kamera seviyesi/ton etiketleri → insan dilinde (sözlük: bright/cool…). */
const LEVEL_TR: Record<string, string> = {
  bright: "parlak",
  dim: "loş",
  dark: "karanlık",
  normal: "normal",
  unknown: "bilinmiyor",
};
const TONE_TR: Record<string, string> = {
  cool: "soğuk",
  warm: "sıcak",
  neutral: "nötr",
  unknown: "bilinmiyor",
};

function levelTr(level: string): string {
  return LEVEL_TR[level] ?? level;
}

function toneTr(tone: string): string {
  return TONE_TR[tone] ?? tone;
}

export function activeProfile(): Profile | null {
  return S.profiles.find((p) => p.id === S.activeId) ?? null;
}

/** Yerel saat + ofset (`2026-10-27T14:32:05+03:00`) — UTC damga teşhisi
 *  zorlaştırıyordu (PLAN-v3 §2/A7). RFC3339, `stats.rs` aynı şekilde okur. */
function localIso(d: Date): string {
  const pad = (n: number): string => String(Math.abs(n)).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
  );
}

async function diskLog(
  note: string,
  desired: number,
  applied: number,
  theme: string,
  level = "-",
  tone = "-",
  read: number | null = null,
  written: number | null = null,
  /** v2.9: karar verilen ama HENÜZ uygulanmamış tema (`theme` = uygulanmış).
   *  Eskiden iki farklı şey aynı `theme=` alanına yazılıyordu: normal turda
   *  "karar", donmuş turda "uygulanmış". 21:33'te `catppuccin` yazıp 21:34'te
   *  `zenburn` yazması teşhisi imkânsız kılıyordu (dwell dolmadığı için
   *  uygulanmamıştı). Artık: `theme=` daima uygulanmış, `want=` karar. */
  want: string | null = null,
): Promise<void> {
  const extra =
    (read === null ? "" : ` | read=${read}`) +
    (written === null ? "" : ` | written=${written}`) +
    (want === null ? "" : ` | want=${want}`);
  const line = `${localIso(new Date())} | source=${S.mode}/${S.source} | level=${level} | tone=${tone} | desired=${desired}${extra} | applied=${applied} | theme=${theme} | note=${note}`;
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

/**
 * "1 saat" düğmesi: yalnız saatlik duraklatmayı açar/kapar.
 * duzeltme v2.2 (madde 11): "Bugün" duraklatması etkinken bu düğme onu
 * iptal ETMEZ — ikisi ayrı durumlardır, yalnız kendi durumunu değiştirir.
 */
export function togglePauseHour(): void {
  if (S.pauseKind === "day" && S.pauseUntil !== null && Date.now() < S.pauseUntil) {
    log("bugün kapatma etkin — saatlik duraklatma yok sayıldı", "warn");
    return;
  }
  if (S.pauseKind === "hour" && S.pauseUntil !== null) {
    clearPause("duraklatma bitti");
    return;
  }
  S.pauseUntil = Date.now() + HOUR_MS;
  S.pauseKind = "hour";
  log("1 saat duraklatıldı", "warn");
  // v2.8: duraklatma sessiz kalmasın — kullanıcı "neden dokunmuyor" diye
  // bakıyor. Geri alma düğmeli toast: tek tıkla geri dönüş.
  toast.action("Otomatik ayar 1 saat duraklatıldı", {
    action: { label: "Geri al", onAct: () => clearPause("duraklatma geri alındı") },
  });
  render();
}

/**
 * "Bugün" düğmesi: gece yarısına kadar duraklatır.
 * duzeltme v2.2 (madde 11): saatlik duraklatma etkinken bu düğme onu
 * iptal ETMEZ; kendi durumunu değiştirir.
 */
export function toggleDayOff(): void {
  if (S.pauseKind === "hour" && S.pauseUntil !== null && Date.now() < S.pauseUntil) {
    log("saatlik duraklatma etkin — bugün kapatma yok sayıldı", "warn");
    return;
  }
  if (S.pauseKind === "day" && S.pauseUntil !== null) {
    clearPause("bugün kapatma iptal edildi");
    return;
  }
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  S.pauseUntil = midnight.getTime();
  S.pauseKind = "day";
  log("bugün kapatıldı — gece yarısına kadar dokunulmayacak", "warn");
  toast.action("Bugün için otomatik ayar kapalı", {
    detail: "Gece yarısına kadar dokunulmaz.",
    action: { label: "Geri al", onAct: () => clearPause("bugün kapatma geri alındı") },
  });
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
 * Saat + ışık seviyesine göre otomatik şiddet; `warmPercent` artık **tavan
 * değil şiddet** (PLAN-v3 §4.2/2): eğri ile çarpılır ve 3 puandan küçük
 * değişim gamma'ya yazılmaz (yazım disiplini, §4.2/4).
 * Hata durumunda sessizce 0 dönmez — null döner, çağıran mevcut şiddeti
 * korur ve hatayı bir kez loglar.
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
    return Math.max(0, Math.min(100, Number(raw) || 0));
  } catch (e) {
    const msg = String(e);
    if (warmWarned !== msg) {
      warmWarned = msg;
      log("sarılaştırma düzeyi hesaplanamadı, mevcut düzey korunuyor: " + msg, "warn");
    }
    return null;
  }
}

/**
 * v3.0: sıcak tonu **tüm destekli harici monitörlerin** kendi renk sıcaklığına
 * da yazar (DDC/CI VCP 0x0C). Pro kapısı backend'de; burada yalnız "gerek var
 * mı" kararı verilir.
 *
 * - Yalnız Pro + destekli (`ctSupported === true`) + HDR kapalı monitörler.
 * - Aynı Kelvin'e ikinci kez yazılmaz (DDC yazması yavaş, monitör OSD'si titrer).
 * - 10 dakikalık hız sınırı backend'de (`colortemp`), burada ayrıca tutulmaz.
 * - Hata yutulur: desteksiz monitör döngüyü durdurmamalı, yazılımsal gamma
 *   zaten çalışıyor.
 */
const monCtLast = new Map<string, number>();

export async function applyMonitorColorTemp(warmth: number): Promise<void> {
  if (!S.licensePro) return;
  const kelvin = warmthToKelvin(warmth);
  for (const m of S.monitors) {
    if (m.info.is_internal || m.ctSupported !== true || m.hdr) continue;
    if (monCtLast.get(m.info.id) === kelvin) continue;
    try {
      await invoke("monitor_set_color_temp", { device: m.info.id, kelvin });
      monCtLast.set(m.info.id, kelvin);
      log(`monitör renk sıcaklığı ${kelvin} K: ${m.info.id}`, "ok");
    } catch (e) {
      // Tek satır: monitör başına her turda değil, yalnız ilk hatada.
      const key = "monCtErr:" + m.info.id;
      if (S.lastGateWarn !== key) {
        S.lastGateWarn = key;
        log(`monitör renk sıcaklığı yazılamadı (${m.info.id}): ${String(e)}`, "warn");
      }
    }
  }
}

export async function applyWarmth(force = false): Promise<void> {
  try {
    if (S.warmMode === "off") {
      await invoke("gamma_restore");
      S.lastWarmApplied = 0;
      // Monitör de nötre dönsün; yoksa "kapattım ama ekran sarı" kalır.
      await applyMonitorColorTemp(0);
      return;
    }
    // Windows gece ışığı açıksa kendi rampaımızı yazmayız: iki katman üst
    // üste binerse ekran iki kez sararır. Önce bizim rampayı geri al.
    if (S.nightLightOn === true) {
      if (S.lastWarmApplied !== 0) {
        await invoke("gamma_restore").catch(() => undefined);
        S.lastWarmApplied = 0;
        log(
          "gece ışığı açık — kendi sıcak tonumuz kapatıldı (çifte sararma olmasın)",
          "warn",
        );
      }
      return;
    }
    let percent: number | null;
    if (S.warmMode === "fixed") {
      percent = S.warmPercent;
    } else {
      const auto = await autoWarmth();
      // İki eksen çarpımsal: eğri × kullanıcı şiddeti.
      percent = auto === null ? null : (auto * S.warmPercent) / 100;
    }
    // stabilite (d): hesaplanamadıysa son uygulanan şiddet korunur.
    const value = Math.round(percent === null ? (S.lastWarmApplied ?? S.warmPercent) : percent);
    // Monitör katmanı gamma eşiğinden bağımsız: harici ekranın kendi ayarı
    // 3 puanlık yazılımsal farktan etkilenmesin (DDC yazması pahalı).
    await applyMonitorColorTemp(value);
    if (!force && S.lastWarmApplied !== null && Math.abs(value - S.lastWarmApplied) < 3) return;
    await invoke("gamma_set_warmth", { percent: value });
    S.lastWarmApplied = value;
    // v2.5: sürücü rampayı sessizce reddedebiliyor (SetDeviceGammaRamp sezgisi).
    // Yazımdan hemen sonra geri okuruz; fark büyükse kullanıcıya görünür olsun.
    const check = await invoke<[number, number]>("gamma_verify_warmth", { percent: value })
      .catch(() => null);
    if (check) {
      const [want, got] = check;
      S.warmthDrift = want - got;
      if (Math.abs(want - got) > 4) {
        log(
          `sıcak ton sürücüde tutmadı: warmth=${value} beklenen mavi=%${want} okunan=%${got}`,
          "warn",
        );
      }
    }
  } catch (e) {
    log("ekran sarılaştırılamadı: " + String(e), "bad");
    // duzeltme v2.2 (D): sıcaklık uygulanamadıysa hata toast'u — tek sefer.
    toastErrOnce("Ekran sarılaştırılamadı", String(e));
  }
}

/** Kelvin → hızlı sarılık yüzdesi (6500 K = %0, 2500 K = %60). */
function kelvinToPercent(kelvin: number): number {
  return Math.max(0, Math.min(60, Math.round(((6500 - kelvin) / 4000) * 60)));
}

/**
 * duzeltme v2.2 (E): Kelvin uygula. Yalnız harici + destekli monitörde
 * monitörün kendi ayarıyla yazılır; hata/desteksizlikte sessizce yazılımsal
 * yola (hızlı sarılık) düşer.
 */
export async function applyKelvin(kelvin: number): Promise<void> {
  const k = Math.max(2500, Math.min(6500, Math.round(kelvin / 100) * 100));
  S.warmKelvin = k;
  setSetting("warmKelvin", String(k));
  const sel = S.monitorSel ? S.monitors.find((m) => m.info.id === S.monitorSel) : null;
  const target =
    (sel && !sel.info.is_internal && sel.ctSupported === true ? sel : null) ??
    S.monitors.find((m) => !m.info.is_internal && m.ctSupported === true) ??
    null;
  if (target && !S.hdrOn) {
    try {
      await invoke("monitor_set_color_temp", { device: target.info.id, kelvin: k });
      S.warmKelvinHw = true;
      render();
      return;
    } catch {
      /* sessizce yazılımsal yola düş */
    }
  }
  S.warmKelvinHw = false;
  setWarmPercent(kelvinToPercent(k));
}

export function setWarmMode(v: WarmMode): void {
  S.warmMode = v;
  setSetting("warmMode", v);
  log("ekranı sarılaştırma: " + WARM_MODE_LABEL[v]);
  void applyWarmth(true);
  render();
}

export function setWarmPercent(v: number): void {
  S.warmPercent = Math.max(0, Math.min(100, Math.round(v)));
  setSetting("warmPercent", String(S.warmPercent));
  void applyWarmth(true);
  render();
}

// ---------- okuma / animasyon ----------

/** Okuma profili: sakin tema + düşük tavan + animasyon kapalı + sıcak ton. */
export async function toggleReading(): Promise<void> {
  S.readingMode = !S.readingMode;
  setSetting("readingMode", S.readingMode ? "1" : "0");
  try {
    if (S.readingMode) {
      // duzeltme v2.2 (madde 2): önceki tema/sarılık/animasyon saklanır;
      // kapanışta hepsi geri yüklenir (eskiden yalnız sarılık kipi dönüyordu).
      S.readingPrev = {
        warm: S.warmMode,
        themeKey: S.appliedKey,
        animations: S.animations,
      };
      S.warmMode = "fixed";
      setSetting("warmMode", "fixed");
      await applyWarmth();
      await pickTheme("ss-dusk", "dark");
      await setAnimations(false, true);
      log("okuma profili: sıcak sakin tema, düşük tavan, animasyon kapalı", "ok");
      toast.info("Okuma profili açıldı");
    } else {
      const prev = S.readingPrev;
      S.readingPrev = null;
      S.warmMode = prev?.warm ?? "auto";
      setSetting("warmMode", S.warmMode);
      await applyWarmth();
      if (prev?.themeKey) {
        const [name, mode] = prev.themeKey.split("|");
        if (name) {
          await invoke("theme_set", { name, mode: mode || null });
          S.appliedKey = prev.themeKey;
        }
      }
      if (prev) await setAnimations(prev.animations, true);
      log("okuma profili kapandı", "ok");
      toast.info("Okuma profili kapandı");
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
    S.lastThemeAt = Date.now();
    S.pendingKey = null;
    S.pendingCount = 0;
    S.lastPendingNote = null;
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
    S.lastWritten = { value: Math.round(prev.value), at: Date.now() };
    S.appliedKey = `${prev.name}|${prev.mode}`;
    S.lastThemeAt = Date.now();
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

/** Okunaksız çıkan tema otomatik seçimde uygulanmaz (anahtar açıkken). */
function gateReason(name: string, themeMode: string): string | null {
  if (!S.auditGate) return null;
  const rep = findAudit(name, themeMode);
  return rep && rep.verdict === "FAIL" ? `metin/zemin oranı ${rep.text_on_bg}:1 — okunaksız` : null;
}

export async function loadAudit(): Promise<void> {
  // v2.8.1: "Yeniden ölç" sessizdi — veri aynıysa render önbelleği listeyi
  // yeniden çizmiyor, kullanıcı "buton çalışmıyor" sanıyordu. Artık döner
  // simge + sonuç toast'ı var; ölçüm gerçekten diske gidip yeniden okur.
  const busy = toast.busy("Kontrast ölçülüyor");
  try {
    const rows = await invoke<AuditReport[]>("contrast_audit");
    S.audits = Array.isArray(rows) ? rows : [];
    const bad = S.audits.filter((r) => r.verdict === "FAIL").length;
    busy.done(
      S.audits.length === 0
        ? "Ölçülecek tema dosyası yok"
        : `${S.audits.length} tema ölçüldü${bad > 0 ? ` · ${bad} okunaksız` : " · hepsi okunur"}`,
    );
  } catch (e) {
    S.audits = [];
    log("kontrast denetimi okunamadı: " + String(e), "bad");
    toast.err("Kontrast ölçülemedi", { detail: String(e) });
    render();
    return;
  }
  render();
}

/**
 * v2.10: sistem tanılaması — "bir şey çalışmıyorsa neden".
 *
 * Sıcak ton şiddeti: uygulamanın ŞU AN kullandığı değer geçirilir ki test
 * görünür bir değişiklik yapmasın. `off` kipinde 0 geçilir; backend bu
 * durumda gamma rampası **yazmaz** (kalibrasyonu ezmemek için).
 */
export async function runDiagnostics(): Promise<void> {
  const busy = toast.busy("Sistem kontrol ediliyor");
  try {
    const warmth = S.warmMode === "off" ? 0 : Math.round(S.lastWarmApplied ?? S.warmPercent);
    const report = await invoke<DiagReport>("diagnose", { warmth });
    S.diag = report;
    const checks = report.checks ?? [];
    const bad = checks.filter((c) => c.status === "bad").length;
    const warn = checks.filter((c) => c.status === "warn").length;
    busy.done(
      bad > 0
        ? `${bad} sorun bulundu${warn > 0 ? ` · ${warn} uyarı` : ""}`
        : warn > 0
          ? `${warn} uyarı — çalışmayan yok`
          : `${checks.length} kontrolün hepsi sağlam`,
    );
    log(`sistem kontrolü: ${bad} sorun, ${warn} uyarı`, bad > 0 ? "bad" : "ok");
  } catch (e) {
    S.diag = null;
    log("sistem kontrolü yapılamadı: " + String(e), "bad");
    toast.err("Sistem kontrolü yapılamadı", { detail: String(e) });
    render();
    return;
  }
  render();
}

/** Tanılama raporunu düz metne çevirir (panoya kopyalanır, destek için). */
export function diagReportText(): string {
  if (!S.diag) return "";
  const icon = (s: string) => (s === "ok" ? "[ok]" : s === "warn" ? "[uyarı]" : "[SORUN]");
  const lines = [
    `smart-screen ${S.diag.version} · ${S.diag.os}`,
    `tarih: ${localIso(new Date())}`,
    "",
    ...S.diag.checks.map((c) =>
      `${icon(c.status)} ${c.label}: ${c.detail}${c.hint ? ` — ${c.hint}` : ""}`,
    ),
    "",
    `düzen: ${document.documentElement.dataset.template ?? "-"} · palet: ${
      document.documentElement.dataset.theme ?? "-"
    }`,
  ];
  return lines.join("\n");
}

/**
 * v2.11: günlük dosyasını varsayılan editörde açar. "Raporu kopyala"nın
 * yanına konur: kullanıcı `~/.config/opencode` yolunu elle aramasın.
 * Backend dosya yoksa klasörü açar ve açtığı yolu döndürür.
 */
export async function openLogFile(): Promise<void> {
  try {
    const path = await invoke<string>("open_log");
    toast.ok("Günlük açıldı", { detail: path });
    log("günlük dosyası açıldı", "ok");
  } catch (e) {
    log("günlük dosyası açılamadı: " + String(e), "bad");
    toast.err("Günlük açılamadı", { detail: String(e) });
  }
}

export function setGate(v: boolean): void {
  S.auditGate = v;
  setSetting("auditGate", v ? "1" : "0");
  S.lastGateWarn = "";
  log(
    v
      ? "okunaksız temalar otomatik seçimde uygulanmaz"
      : "okunaksız temalar da otomatik seçime girebilir",
    "ok",
  );
  render();
}

/**
 * v2.8: oyun/video sırasında %100 parlaklık anahtarı.
 * Kapatınca boost hemen geri alınır (oyun sürüyorsa bile) — anahtar
 * "şu an"ı değiştirir, sadece gelecek turları değil.
 */
export function setGameBright(v: boolean): void {
  S.gameBright = v;
  setSetting("gameBright", v ? "1" : "0");
  if (!v) void gameBoostOff();
  log(
    v
      ? "oyun/video sırasında parlaklık %100'e çıkacak"
      : "oyun/video sırasında parlaklığa dokunulmayacak",
    "ok",
  );
  render();
}

/**
 * v2.9: "Günün rengi" — saate göre otomatik palet.
 *
 * Neden: 12 palet var ama çoğu kullanıcı birini seçip bırakıyor. Gündüz
 * aydınlık, akşam sıcak, gece derin palet göz konforu için gerçek fark
 * yaratıyor (uygulamanın varlık nedeni bu).
 *
 * Kurallar:
 * - Kapalıyken hiçbir şey yapılmaz (kullanıcı seçimi kutsal).
 * - Elle palet seçimi 10 dk "dokunma" penceresi açar (dwell) — kullanıcı
 *   bir renk seçtiğinde hemen geri çevrilmez.
 * - Yalnız `autoPalette` açıkken, yarım saatte bir, saat dilimine göre.
 *
 * v2.11: dwell kararı `engine.autoPaletteDue` içine taşındı (saf fonksiyon,
 * `npm test` ile doğrulanıyor) — burada yalnız zaman/palet girdisi toplanır.
 */

/** Saat dilimine göre önerilen palet. */
export function paletteForHour(hour: number): string {
  if (hour >= 7 && hour < 11) return "fildisi"; // sabah: aydınlık kâğıt
  if (hour >= 11 && hour < 17) return "kagit"; // gündüz: nötr açık
  if (hour >= 17 && hour < 20) return "gunbatimi"; // akşam: sıcak amber
  if (hour >= 20 && hour < 23) return "obsidyen"; // gece başı: sıcak kömür
  return "gece"; // gece: derin lacivert
}

export function setAutoPalette(v: boolean): void {
  S.autoPalette = v;
  setSetting("autoPalette", v ? "1" : "0");
  if (v) {
    // Açılır açılmaz uygula (kullanıcı sonucu hemen görsün).
    S.lastManualPaletteAt = 0;
    applyAutoPalette(true);
    toast.ok("Günün rengi açıldı", { detail: "Saat dilimine göre palet kendisi seçilir." });
  } else {
    toast.info("Günün rengi kapalı", { detail: "Renk seçimin sabit kalır." });
  }
  log(v ? "günün rengi açıldı" : "günün rengi kapatıldı", "ok");
  render();
}

/**
 * Saat dilimine göre paleti uygular. `force` yoksa dwell ve tekrar
 * denetimi yapılır (her turda yazmaz). Karar `engine.autoPaletteDue` —
 * v2.11'de test edilebilir olması için dışarı alındı.
 */
export function applyAutoPalette(force = false): void {
  if (!S.autoPalette) return;
  const want = paletteForHour(new Date().getHours());
  const current = document.documentElement.dataset.theme ?? DEFAULT_DESIGN_THEME;
  if (
    !force &&
    !autoPaletteDue({
      auto: true,
      now: Date.now(),
      lastManualAt: S.lastManualPaletteAt,
      current,
      want,
    })
  ) {
    return;
  }
  if (want === current) return;
  // Palet değişimi JS'te (panels) yapılır; döngüsel bağımlılık olmasın diye
  // callback ile: orchestr → panels yönü yok, main kablolar.
  autoPaletteApply?.(want);
}

/** main.ts kablolar: orchestr'ın palet yazma yolunu tersine çevirmeden. */
let autoPaletteApply: ((id: string) => void) | null = null;
export function bindAutoPalette(fn: (id: string) => void): void {
  autoPaletteApply = fn;
}

/** Elle palet seçildi: 10 dk dokunma penceresi. */
export function noteManualPalette(): void {
  S.lastManualPaletteAt = Date.now();
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
      ? `${name}: metin/zemin oranı ${rep.text_on_bg}:1 — okunaksız, gözü yorar.`
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
    const now = new Date();
    const [n, m] = await invoke<[string, string]>("decide_target", {
      hour: now.getHours(),
      minute: now.getMinutes(),
      source: S.source,
      level: S.lastCam ? S.lastCam.level : "normal",
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
 *
 * v2.5: mutlak parlaklık değil, **hedefe göre delta** öğrenilir; aksi hâlde
 * öğrenilen ham değer yıllarca aynı kalıp sahne hedefini eziyordu
 * (PLAN-v3 §2/A4, §4.1/7).
 */
export async function learnBrightness(): Promise<void> {
  try {
    const current = await invoke<number>("brightness_get");
    const now = new Date();
    const hour = now.getHours();
    const light = lightKey(S.camLevel, S.camTone);
    const [, , base] = await invoke<[string, string, number]>("decide_target", {
      hour,
      minute: now.getMinutes(),
      source: S.source,
      level: S.camLevel,
    });
    const delta = learnDelta(current, base + S.offset);
    if (delta === null) return;
    await invoke("pref_learn_bright", { hour, light, delta });
    await showCalibration();
    // duzeltme v2.2 (D): kalibrasyon artık sessiz değil.
    toast.ok(`Parlaklık tercihi öğrenildi (${delta >= 0 ? "+" : ""}${delta})`);
  } catch {
    /* öğrenme sessizce atlanabilir */
  }
}

export async function showCalibration(): Promise<void> {
  try {
    const hour = new Date().getHours();
    const light = lightKey(S.camLevel, S.camTone);
    const got = await invoke<[number, number, number] | null>("pref_get_bright", { hour, light });
    S.calibHint = got
      ? `Öğrenilen tercih: ${got[0] >= 0 ? "+" : ""}${got[0]} puan (${got[1]} gözlem / ${got[2]} gün)${
          learnAllowed(got[1], got[2]) ? "" : " — 3 gün dolunca uygulanır"
        }`
      : "Öğrenilen tercih: henüz gözlem yok";
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

// duzeltme v2.2 (madde 3): gece tavanı (üst sınır) — istenen değer gece
// penceresinde bu sayının ÜSTÜNE çıkmaz. Okuma kipi de tavan koyar; ikisi
// birlikteyse düşük olan geçerlidir.
function comfortCap(hour: number): number | null {
  const caps: number[] = [];
  if (inSleepWindow(hour)) caps.push(S.sleepCap);
  if (S.readingMode) caps.push(45);
  return caps.length > 0 ? Math.min(...caps) : null;
}

/**
 * stabilite (e): kamera hatası yutulmaz — aynı hata için tek uyarı satırı
 * yazılır (tekrar spam yok), son bilinen örnek korunur.
 */
let camWarned = "";

/** Parlaklık yazımı sürücü tarafından reddedilirse tek uyarı (spam yok). */
let brightWarned = "";

async function cameraSample(
  force: boolean,
  camLimit: number,
): Promise<CamSample | null> {
  if (!force && S.lastCam && Date.now() - S.lastCam.at < camLimit) return S.lastCam;
  try {
    const [lum, , rawLevel, rawTone] = await invoke<[number, number, string, string]>("light_sample");
    camWarned = "";
    const at = Date.now();
    // Seviye histerezi Rust'ta: esik etrafındaki ±6 gürültü sahneyi oynatmaz.
    const level = await invoke<string>("decide_level", { prev: S.camLevel, lum }).catch(
      () => rawLevel,
    );
    S.camLevel = LEVEL_NAMES.includes(level as LightLevel) ? (level as LightLevel) : S.camLevel;
    S.camHistory.push({ tone: rawTone, at });
    if (S.camHistory.length > 5) S.camHistory.shift();
    // Ton: son üç örneğin medyanı — tek gürültülü kare tonu çevirmez.
    S.camTone = medianTone(S.camHistory.map((h) => h.tone));
    S.lastCam = { lum, level: S.camLevel, tone: S.camTone, at };
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

export async function refresh(current?: number): Promise<void> {
  try {
    const bright = current ?? (await invoke<number>("brightness_get"));
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
 * duzeltme (md.9): flyout slider'ının yazdığı parlaklık ana duruma işlenir.
 * Böylece sonraki render/ss:state slider'ı eski değere geri çekmez; dakikalık
 * tur da yeni değeri taban alır. Aynı donanımı kullanan dahili panel için
 * ekstra okuma gerekmez.
 */
export function noteExternalBrightness(value: number): void {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  if (!Number.isFinite(v)) return;
  S.lastAppliedBright = v;
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
  S.lastPendingNote = null;
}

/* ═══════════════ v2.8: oyun/video sırasında %100 ═══════════════
   Oyuna/videoya girerken ekran parlaklığı çoğu zaman yetmiyor; kullanıcı
   tam ekranı bırakıp parlaklık açmak zorunda kalıyordu. Burada donma
   kararı verilirken bir kez %100 yazılır, çıkışta ESKİ değere dönülür.

   Neden güvenli:
   - Yalnız `gameBright` açıkken (varsayılan açık, Ayarlar'dan kapanır).
   - Kilitli ekranda (lockapp.exe) asla çalışmaz — kilit ekranı parlamaz.
   - Pil boşalırken de yazılır: oyun sırasında zaten güç çekiliyor; geri
     dönüş değeri saklandığı için çıkışta tüketim artmıyor.
   - `lastWritten` güncellenir; aksi halde kendi yazdığımız değeri "dış
     müdahale" sanıp 15 dk saygı penceresi açardık (v2.5 dersi).
   ═══════════════════════════════════════════════════════════════════ */

const GAME_BOOST_PCT = 100;

/** Oyun/video başladı: parlaklığı %100'e al, eski değeri sakla. */
async function gameBoostOn(tag: string): Promise<void> {
  if (!S.gameBright || S.gameBoost) return;
  const current = await invoke<number>("brightness_get").catch(() => null);
  if (current === null) return;
  // Zaten %100'e yakınsa yazma (gereksiz WMI yazımı + titreme).
  if (current >= GAME_BOOST_PCT) {
    S.gameBoost = true;
    S.gameBoostPrev = current;
    return;
  }
  S.gameBoostPrev = current;
  try {
    const verified = await invoke<number>("brightness_set", { value: GAME_BOOST_PCT });
    S.gameBoost = true;
    S.lastWritten = { value: Math.round(verified || GAME_BOOST_PCT), at: Date.now() };
    S.lastAppliedBright = Math.round(verified || GAME_BOOST_PCT);
    log(`oyun/video: parlaklık %${current} → %${GAME_BOOST_PCT} (${tag})`, "ok");
  } catch (e) {
    // Yazamadıysak boost "uygulandı" sayılmaz: çıkışta geri yazmayalım.
    S.gameBoostPrev = null;
    log("oyun/video parlaklığı yazılamadı: " + String(e), "warn");
  }
}

/** Oyun/video bitti: saklanan değere dön (kullanıcı elleyse dokunma). */
async function gameBoostOff(): Promise<void> {
  const prev = S.gameBoostPrev;
  if (!S.gameBoost) return;
  S.gameBoost = false;
  S.gameBoostPrev = null;
  if (prev === null) return;
  const current = await invoke<number>("brightness_get").catch(() => null);
  // Kullanıcı oyun sırasında kendisi değiştirdiyse onun değeri kalsın.
  if (current === null || current < GAME_BOOST_PCT - 1) return;
  try {
    const verified = await invoke<number>("brightness_set", { value: Math.round(prev) });
    S.lastWritten = { value: Math.round(verified || prev), at: Date.now() };
    S.lastAppliedBright = Math.round(verified || prev);
    log(`oyun/video bitti: parlaklık %${Math.round(prev)}'e döndü`, "ok");
  } catch (e) {
    log("parlaklık geri yazılamadı: " + String(e), "warn");
  }
}

async function runTick(reason: string): Promise<void> {
  S.lastAct = Date.now();
  S.freezeReason = null;  if (isPaused()) {
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
  // duzeltme v2.2 (madde 12): otomatik kilit iki yönlü — kilit, engelli bir
  // uygulama yüzünden atıldıysa ve o uygulama önden gittiyse kendiliğinden
  // çözülür. Manuel kilit (autoLockExe === null) buradan etkilenmez.
  if (S.autoLockExe !== null && exe !== S.autoLockExe) {
    S.autoLockExe = null;
    if (S.locked) {
      S.locked = false;
      setSetting("locked", "0");
      log("engelli uygulama kapandı — otomatik ayarın kilidi çözüldü", "ok");
    }
  }
  if (S.locked || (S.mode === "fixed" && !bound)) {
    resetPending();
    await diskLog(`kilitli/sabit ${reason}`, 0, S.lastAppliedBright, S.appliedKey ?? "-");
    log("kilitli ya da sabit kipte — ayar yapılmadı", "warn");
    await refresh();
    return;
  }
  // Windows kilit ekranı ön plan penceresidir: ayar turu tamamen atlanır.
  // Eskiden burada tema/parlaklık yazılıyor, kilitten sonra ekran 0 okunup
  // "durduk yere çok kısık" görünümü üretiyordu (PLAN-v3 §2/A6).
  if (exe === "lockapp.exe") {
    resetPending();
    S.freezeReason = "ekran kilitli";
    // v2.8: kilit ekranında %100 boost kalmasın (gece ekranı parlamasın).
    await gameBoostOff();
    log("ekran kilitli — ayar yapılmadı", "warn");
    // v2.6: bu tur da diske yazılır. Eskiden yazılmıyordu ve "24 saat log"
    // kanıtı kilitli saatlerde tamamen kör kalıyordu (tur var, iz yok).
    // Yalnız dosya yazımı — parlaklık/tema/gamma'ya dokunulmaz.
    await diskLog("ekran kilitli", 0, S.lastAppliedBright, S.appliedKey ?? "-", "-", "-");
    await refresh();
    return;
  }
  try {
    const prof = activeProfile();
    if (exe && S.blockItems.includes(exe)) {
      if (prof?.autoLock) {
        S.locked = true;
        S.autoLockExe = exe;
        setSetting("locked", "1");
        // Kilitliyken parlaklık yazılmaz: kilit "dokunma" demektir.
        await diskLog(`film otomatik kilit ${exe}`, 0, S.lastAppliedBright, S.appliedKey ?? "-", "-", "-");
        log("otomatik ayar kilitlendi (" + exe + ")", "warn");
      } else {
        // v2.8: oyun/video önde — parlaklık %100, çıkışta eski değere döner.
        await gameBoostOn(exe);
        await diskLog(`donduruldu uygulama ${exe}`, 0, S.lastAppliedBright, S.appliedKey ?? "-", "-", "-");
        log("ayar yapılmadı: video/oyun uygulaması önde (" + exe + ")", "warn");
      }
      S.freezeReason = "uygulama: " + exe;
      resetPending();
      await refresh();
      return;
    }
    if (await invoke<boolean>("is_fullscreen")) {
      if (!exe || !S.allowItems.includes(exe)) {
        const why = "tam ekran" + (exe ? " (" + exe + ")" : "");
        // v2.8: tam ekran oyun/video — parlaklık %100.
        await gameBoostOn(exe ?? "tam ekran");
        await diskLog(`donduruldu ${why}`, 0, S.lastAppliedBright, S.appliedKey ?? "-", "-", "-");
        log("ayar yapılmadı: " + why, "warn");
        S.freezeReason = why;
        resetPending();
        await refresh();
        return;
      }
    }
    // Buraya geldiysek oyun/video bitti: boost açıksa eski değere dön.
    await gameBoostOff();

    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    // stabilite (f): pil bilinmiyorsa lowPower kapalı kalır.
    const battery = await readBattery();
    const lowPower = battery ? battery.pct < 20 && !battery.charging : false;
    S.lowPower = lowPower;
    const camLimit = lowPower ? CAM_MS_LOW : CAM_MS;

    // Windows gece ışığı: yalnız okunur (programatik yazma desteklenmiyor).
    // `null` = bilinmiyor → davranış değişmez; tahmin etmeyiz.
    S.nightLightOn = await invoke<boolean | null>("nightlight_status").catch(() => null);

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
        text: `${levelTr(cam.level)} / ${toneTr(cam.tone)}`,
        title: `ışık: ${levelTr(cam.level)}/${toneTr(cam.tone)} (ölçüm ${cam.lum.toFixed(0)})`,
        sub: `ölçüm değeri: ${cam.lum.toFixed(0)}`,
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
        minute,
        source: effSource,
        level: cam ? cam.level : "normal",
      });
      name = n;
      themeMode = m;
      desired = base;
      if (effSource === "auto") {
        S.light = {
          text:
            effMode === "auto" && cam
              ? `zaman + ${levelTr(cam.level)}/${toneTr(cam.tone)}`
              : "zaman",
          title: cam
            ? `zaman + ışık: ${levelTr(cam.level)}/${toneTr(cam.tone)} (ölçüm ${cam.lum.toFixed(0)})`
            : `${SOURCE_LABEL[effSource]} • ${hour}:${String(minute).padStart(2, "0")}`,
          sub: `${hour}:${String(minute).padStart(2, "0")} • ışık varsayımı: ${SOURCE_LABEL[effSource]}`,
          dot: "accent",
        };
      } else {
        S.light = {
          text: SOURCE_LABEL[effSource],
          title: `${SOURCE_LABEL[effSource]} • ${hour}:${String(minute).padStart(2, "0")}`,
          sub: `${hour}:${String(minute).padStart(2, "0")} • ışık varsayımı: ${SOURCE_LABEL[effSource]}`,
          dot: "accent",
        };
      }
    }

    // Bağlı profil açık niyettir: öğrenilmiş tercih onu ezmez.
    const light = lightKey(level, tone);
    const remembered = bound
      ? null
      : await invoke<[string, string] | null>("pref_get", {
          hour,
          light,
          mode: themeMode,
        });
    if (remembered) {
      name = remembered[0];
      themeMode = remembered[1];
    }
    if (bound) {
      name = bound.theme;
      themeMode = bound.themeMode;
    }

    // Öğrenilmiş parlaklık: değer DELTA, en az 3 gözlem + 3 farklı gün
    // (PLAN-v3 §4.1/7). Eski ±10 kelepçesi kaldırıldı.
    let learnedDelta: number | null = null;
    let learnedText: string | null = null;
    if (!bound) {
      try {
        const got = await invoke<[number, number, number] | null>("pref_get_bright", {
          hour,
          light,
        });
        if (got) {
          const sign = got[0] >= 0 ? "+" : "";
          learnedText = `${sign}${got[0]}p ${got[1]}göz/${got[2]}gün`;
          if (learnAllowed(got[1], got[2])) learnedDelta = got[0];
        }
      } catch {
        learnedDelta = null;
      }
    }

    // Nihai hedef: taban + delta + ofset; gece/okuma tavanı ve okunaksız
    // kombinasyon kapısı motor kurallarıyla (engine.ts).
    const floor = await invoke<number>("brightness_floor", { hour, minute }).catch(() => 0);
    const cap = comfortCap(hour);
    const target = finalTarget({
      base: desired,
      learnDelta: learnedDelta,
      offset: effOffset,
      floor,
      cap,
      mode: themeMode,
    });
    if (lowPower) log("pil modu: ölçüm ve adım kısıldı", "warn");

    // ---- tema: dwell + bağımsız tur ----
    const key = `${name}|${themeMode}`;
    // Kapı yalnız otomatik seçim içindir: bağlı profil açık niyettir, onu
    // ölçüm veto etmez (elle tema seçimi de serbest).
    const gated = bound ? null : gateReason(name, themeMode);
    const sameKey = key === appliedKeySafe();
    // Önbellekten dönen kare bağımsız tur saymaz (PLAN-v3 §2/A2); kamera
    // yoksa (zaman modu) her tur bağımsızdır — v2.11.1, aksi halde kapı 1/3'te
    // asılı kalıyordu.
    const newMeasurement = isIndependentTurn({
      camAt: cam ? cam.at : null,
      lastCountedAt: S.lastCountedCamAt,
    });
    if (cam !== null && newMeasurement) S.lastCountedCamAt = cam.at;

    // Parlaklık tur başına tek okunur (PLAN-v3 §11: tur başına ≤ 1 okuma).
    const current = await invoke<number>("brightness_get").catch(() => null);
    let appliedNow = current ?? S.lastAppliedBright;
    // Ekran kapalıyken (WMI 0) tema da değiştirilmez: kilit ekranında
    // cli.json yazıp durmak anlamsız (PLAN-v3 §2/A6).
    const skip = skipReason({ locked: S.locked, current, desired: target });
    const screenOff = skip !== null && skip !== "kilitli";

    let themeChanged = false;
    if (screenOff) {
      resetPending();
    } else if (gated) {
      if (S.lastGateWarn !== name) {
        log(`otomatik seçimde uygulanmadı: ${name} — ${gated}`, "warn");
        S.lastGateWarn = name;
      }
      resetPending();
    } else if (sameKey) {
      resetPending();
    } else if (key === S.pendingKey) {
      if (newMeasurement) S.pendingCount += 1;
    } else {
      S.pendingKey = key;
      S.pendingCount = 1;
    }

    if (!screenOff && !gated && !sameKey && key === S.pendingKey) {
      // "Şimdi uygula" ve açılış kullanıcı niyetidir: 10 dk dwell beklemez
      // (QA ve kullanıcı "bastım ama hiçbir şey olmadı" demesin).
      const manualTheme = reason === "manuel" || reason === "açılış";
      const gate = manualTheme
        ? { ok: true, reason: "ok" as const }
        : themeGate({
            now: Date.now(),
            lastAt: S.lastThemeAt,
            turns: S.pendingCount,
            required: lowPower ? 2 : undefined,
          });
      if (gate.ok) {
        if (S.appliedKey) await pushUndo(S.appliedKey.split("|")[0], appliedNow);
        await invoke("theme_set", { name, mode: themeMode });
        S.appliedKey = key;
        S.lastThemeAt = Date.now();
        S.lastGateWarn = "";
        S.lastPendingNote = null;
        resetPending();
        log(`tema değişti: ${name}`, "ok");
        themeChanged = true;
      } else if (S.lastPendingNote !== key) {
        S.lastPendingNote = key;
        log(
          gate.reason === "dwell"
            ? `tema değişecek: ${name} (10 dk dolmadı)`
            : `tema değişecek: ${name} (${S.pendingCount}/${
                lowPower ? 2 : 3
              } bağımsız tur)`,
        );
      }
    }

    // ---- parlaklık: yumuşak adım, dış müdahale ve ekran kapalı koruması ----
    let wroteBright = false;
    let respected = false;
    if (!effFixed && !skip) {
      if (Date.now() < S.respectUntil) {
        // Dış müdahale saygı penceresi: yazma yok, sadece bekle.
        respected = true;
      } else if (isExternalChange(current, S.lastWritten, Date.now())) {
        // WMI bazen yazdığımızı bir tur gecikmeli yansıtır: kısa bir
        // doğrulama okuması olmadan 15 dk'lık saygı penceresi yanlış açılır.
        await new Promise((r) => setTimeout(r, 250));
        const confirm = await invoke<number>("brightness_get").catch(() => current);
        if (isExternalChange(confirm, S.lastWritten, Date.now())) {
          S.respectUntil = extendRespect(S.respectUntil, Date.now());
          respected = true;
          log("parlaklık dışarıdan değişti — 15 dk dokunulmuyor", "warn");
        }
      } else if (current !== null) {
        S.screenOffLogged = false;
        let next = await invoke<number>("decide_brightness", {
          current,
          desired: target,
          hour,
          minute,
        });
        if (lowPower) next = Math.round(current + (next - current) / 2);
        if (next !== current) {
          try {
            const verified = await invoke<number>("brightness_set", { value: Math.round(next) });
            brightWarned = "";
            S.lastWritten = { value: Math.round(verified || next), at: Date.now() };
            appliedNow = Math.round(verified || next);
            wroteBright = true;
            log(`parlaklık %${current} → %${appliedNow}`, "ok");
          } catch (e) {
            const msg = String(e);
            if (brightWarned !== msg) {
              brightWarned = msg;
              log("parlaklık yazılamadı: " + msg, "bad");
              toastErrOnce("Parlaklık yazılamadı", msg);
            }
          }
        }
      }
    } else if (skip && skip !== "kilitli") {
      if (!S.screenOffLogged) {
        S.screenOffLogged = true;
        log(`parlaklık yazılmadı: ${skip}`, "warn");
      }
    }
    // Harici monitörler yalnız yazma serbestken ve yazılan değerle beslenir;
    // hedefe sıçratmak dış ekranda ani parlaklık demekti.
    if (!effFixed && !skip && !respected && wroteBright) {
      await applyAutoMonitors(appliedNow).catch(() => undefined);
    }

    const note = bound
      ? `bağlı profil ${exe} -> ${bound.name}`
      : skip
        ? `${skip}`
        : respected
          ? "dış müdahale — saygı penceresi"
          : gated
            ? `reddedildi: ${gated}`
            : themeChanged
              ? "tema değişti"
              : S.pendingKey
                ? `bekliyor ${S.pendingCount}/${lowPower ? 2 : 3}`
                : learnedText
                  ? `öğrenilmiş delta ${learnedText}`
                  : remembered
                    ? "öğrenilmiş tercih"
                    : reason;
    // v2.9 log semantiği: `theme=` UYGULANMIŞ tema, `want=` karar verilen.
    // Aynıysa `want` yazılmaz (gürültü olmasın); farklıysa ikisi de görünür.
    const appliedTheme = S.appliedKey ?? "-";
    const wantedTheme = `${name}/${themeMode}`;
    await diskLog(
      note,
      target,
      appliedNow,
      appliedTheme,
      level,
      tone,
      current,
      wroteBright ? appliedNow : null,
      wantedTheme === appliedTheme ? null : wantedTheme,
    );

    // Otomatik kipte sıcak ton her turda saate göre yeniden hesaplanır.
    // Diğer kiplerde tıklanınca/yanıkken değişir; kimlik rampaya sürekli
    // yazmamak için ("off") burada dokunulmaz.
    if (S.warmMode === "auto") {
      await applyWarmth();
    }

    S.desiredBase = desired;
    S.targetPct = target;
    S.lastMeasureAt = Date.now();
    await refresh(appliedNow);
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
      hdr: false,
      ctSupported: null,
    }));
  } catch (e) {
    S.monitors = [];
    log("monitörler okunamadı: " + String(e), "warn");
  }
  render();
  await refreshMonitorMeta();
  await syncMonitors();
}

/**
 * Monitör başına HDR ve donanımsal sıcaklık (MCCS) desteğini çeker. Hata
 * durumunda alanlar boş kalır ve komut başına yalnız bir kez log yazılır
 * (dakikalık turda spam yok).
 */
let hdrWarned = "";
let ctWarned = "";

async function refreshMonitorMeta(): Promise<void> {
  let hdrAll: HdrStatus[] = [];
  let ctInfo: ColorTempInfo[] = [];
  try {
    const raw = await invoke<HdrStatus[]>("hdr_status_all");
    hdrAll = Array.isArray(raw) ? raw : [];
    hdrWarned = "";
  } catch (e) {
    const msg = String(e);
    if (hdrWarned !== msg) {
      hdrWarned = msg;
      log("monitör HDR bilgisi okunamadı: " + msg, "warn");
    }
  }
  try {
    const raw = await invoke<ColorTempInfo[]>("monitor_color_temp_info");
    ctInfo = Array.isArray(raw) ? raw : [];
    ctWarned = "";
  } catch (e) {
    const msg = String(e);
    if (ctWarned !== msg) {
      ctWarned = msg;
      log("monitör sıcaklık desteği okunamadı: " + msg, "warn");
    }
  }
  const hdrMap = new Map(hdrAll.map((h) => [h.device, h.hdr === true]));
  const ctMap = new Map(ctInfo.map((c) => [c.device, c.supported === true]));
  for (const m of S.monitors) {
    m.hdr = hdrMap.get(m.info.id) ?? false;
    m.ctSupported = ctMap.has(m.info.id) ? (ctMap.get(m.info.id) ?? null) : null;
  }
  // duzeltme (md.6): HDR durumu bir önceki tura göre değiştiyse sıcak ton
  // yeniden uygulanır — kullanıcı HDR'ı sonradan açıp kapatınca ekran seçenek
  // değişene kadar sıcak (ya da soğuk) kalmasın. Duraklatma/kilit kuralı
  // burada da geçerlidir.
  const hdrChanged = S.hdrOn !== S.monitors.some((m) => m.hdr);
  S.hdrOn = S.monitors.some((m) => m.hdr);
  if (hdrChanged && !isPaused() && !S.locked) {
    void applyWarmth();
  }
  render();
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
  if (same) {
    // Küme değişmese de HDR/sıcaklık desteği tazelenir (dışarıdan açılıp
    // kapatılabilir).
    await refreshMonitorMeta();
    return;
  }
  S.monitors = next.map((info) => {
    const prev = monitorRow(info.id);
    return prev ? { ...prev, info } : { info, value: null, error: null, hdr: false, ctSupported: null };
  });
  // Tak/çıkar sonrası hata ve yazma geçmişi çıkarılan monitörlere ait olabilir.
  S.monitorFailed = [];
  for (const key of Object.keys(S.lastAppliedByMonitor)) {
    if (!ids.has(key)) delete S.lastAppliedByMonitor[key];
  }
  log(`monitörler değişti: ${next.map((m) => m.name).join(", ") || "yok"}`, "ok");
  render();
  await refreshMonitorMeta();
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
      // duzeltme v2.2 (D): monitör yazma hatası artık toast ile de görünür.
      toastErrOnce(`${row ? row.info.name : id}: parlaklık yazılamadı`, msg);
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
          // duzeltme v2.2 (D): otomatik yazma hatası da toast'a düşer (tek sefer).
          toastErrOnce(`${name}: parlaklık yazılamadı`, msg);
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
  // duzeltme v2.2 (D): etkinleştirme busy → ok; hata yalnız #lic-err'de (inline).
  const busy = toast.busy("Lisans doğrulanıyor…");
  try {
    const st = await invoke<LicenseStatus>("license_activate", { key: trimmed });
    S.licenseStatus = st;
    S.licensePro = st?.pro === true;
    S.licenseError = null;
    if (S.licensePro) {
      busy.done("Lisans etkinleştirildi");
      log("Pro lisans etkinleştirildi", "ok");
    } else {
      closeTopToast();
      S.licenseError = "lisans geçerli değil";
      log("lisans geçerli değil", "warn");
    }
  } catch (e) {
    closeTopToast();
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
    toast.info("Lisans kaldırıldı");
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
  log("çalışma biçimi: " + MODE_LABEL[v]);
  render();
  void tick("mod değişti");
}

export function setSource(v: Source): void {
  S.source = v;
  setSetting("source", v);
  resetPending();
  log("ışık varsayımı: " + SOURCE_LABEL[v]);
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
  log("gece saatleri kaydedildi");
  // duzeltme v2.2 (D): gece koruması kaydı artık toast ile de görünür.
  toast.info("Gece saatleri kaydedildi");
  render();
}

export function toggleLock(): void {
  S.locked = !S.locked;
  setSetting("locked", S.locked ? "1" : "0");
  // duzeltme v2.2: manuel kilit çözülürken otomatik kilit kaydı da temizlenir.
  if (!S.locked) S.autoLockExe = null;
  log(
    S.locked ? "otomatik ayar kilitlendi" : "otomatik ayarın kilidi çözüldü",
    "warn",
  );
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
  log(`profil uygulandı: ${p.name}`, "ok");
  // duzeltme v2.2 (D): profil uygulama artık toast ile de görünür.
  toast.ok(`${p.name} profili uygulandı`);
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
  // duzeltme v2.2 (D): profil kaydetme artık toast ile de görünür.
  toast.ok("Profil kaydedildi");
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
  // duzeltme v2.2 (D): çoğaltma artık toast ile de görünür.
  toast.ok(`"${p.name}" profili çoğaltıldı`);
  renderEditor();
  render();
}

/** duzeltme v2.2 (D + madde 10): silinen profili Geri al ile eski yerine koyar. */
function restoreProfile(removed: Profile, idx: number): void {
  if (S.profiles.length >= MAX_PROFILES) return;
  if (S.profiles.some((p) => p.id === removed.id)) return;
  const next = S.profiles.slice();
  next.splice(Math.min(Math.max(idx, 0), next.length), 0, removed);
  S.profiles = next;
  saveProfiles(S.profiles);
  toast.ok(`"${removed.name}" profili geri getirildi`);
  render();
}

export function deleteDraft(): void {
  if (S.profiles.length <= 1) return;
  const removed = S.draft;
  const idx = S.profiles.findIndex((p) => p.id === removed.id);
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
  // duzeltme v2.2 (D): silme onaysız ama Geri al ile telafi edilebilir.
  toast.action(`"${removed.name}" profili silindi`, {
    action: { label: "Geri al", onAct: () => restoreProfile(removed, idx) },
  });
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
    // duzeltme v2.2 (D): açılışta başlatma değişimi toast ile görünür.
    toast.ok(v ? "Windows açılışında başlatma açıldı" : "Windows açılışında başlatma kapatıldı");
  } catch (e) {
    log("otomatik başlatma değiştirilemedi: " + String(e), "bad");
    toastErrOnce("Windows açılışında başlatma değiştirilemedi", String(e));
  }
}