/**
 * panels.ts — render katmanı: DOM'a YALNIZ burası dokunur.
 *
 * Bağımlılık tek yönlü: `panels → orchestr`. Buradaki işlevler durumu
 * `orchestr`'ten okur, DOM'u yazar; karar vermez. Etkileşim geri çağrıları
 * `orchestr` işlevlerini çağırır (tek yön korunur).
 *
 * index.html'in üstündeki SÖZLEŞME bloğu sınıf/id sözleşmesinin kaynağıdır.
 */

import { ACCENTS, MODE_LABEL, MODE_OPTIONS, SOURCE_OPTIONS, THEMES } from "./catalog";
import type { Mode, Source, ThemeEntry } from "./catalog";
import { FREE_MAX_PROFILES, MAX_PROFILES } from "./store";
import { bindSwitch, buildSeg, buildTagEditor } from "./widgets";
import type { SwitchHandle, TagHandle } from "./widgets";
import {
  S,
  WARM_OPTIONS,
  ackBreak,
  activateLicense,
  addProfile,
  applyMonitorBrightness,
  applyProfile,
  applyWarmth,
  autostartEnabled,
  deactivateLicense,
  deleteDraft,
  duplicateDraft,
  fixRisk,
  learnBrightness,
  loadAudit,
  loadHistory,
  nextWarmthChange,
  pauseRemainingText,
  pickTheme,
  restoreSeeds,
  saveDraft,
  selectForEdit,
  selectMonitor,
  setAllowList,
  setAnimations,
  setAutostart,
  setBlockList,
  setBreakEnabled,
  setGate,
  setMode,
  setSource,
  setWarmMode,
  setWarmPercent,
  snoozeBreak,
  toggleDayOff,
  toggleLock,
  toggleReading,
  undo,
  updateDraft,
} from "./orchestr";
import type { StatsSummary } from "./orchestr";

// ---------- yardımcılar ----------

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error("eksik element: " + id);
  return node;
}

function inputEl(id: string): HTMLInputElement {
  return el(id) as HTMLInputElement;
}

function btnEl(id: string): HTMLButtonElement {
  return el(id) as HTMLButtonElement;
}

function setDot(id: string, cls: string): void {
  el(id).className = "dot " + cls;
}

const MODE_DESC: Record<Mode, string> = {
  auto: "ışığı ölçer, kendisi karar verir",
  time: "saate göre",
  light: "ışığa göre",
  fixed: "dokunma",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function hhmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function pausedNow(): boolean {
  return S.pauseUntil !== null && Date.now() < S.pauseUntil;
}

// ---------- sekmeler ----------

export function switchTab(name: string): void {
  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
    t.setAttribute("aria-selected", t.dataset.tab === name ? "true" : "false");
  });
  for (const page of ["panel", "profiles", "settings", "history"]) {
    el(`page-${page}`).hidden = page !== name;
  }
  if (name === "history") void loadHistory();
}

// ---------- olay akışı ----------

/** `orchestr`'ün log kanalı: satırı #log içine yazar (en fazla 100 satır). */
export function appendLog(msg: string, level: "info" | "ok" | "warn" | "bad" = "info"): void {
  const box = el("log");
  box.querySelector(".log-empty")?.remove();
  const row = document.createElement("div");
  row.className = "log-row";
  const dot = document.createElement("span");
  dot.className = "dot " + (level === "ok" ? "ok" : level === "warn" ? "warn" : level === "bad" ? "bad" : "");
  const text = document.createElement("span");
  text.textContent = msg;
  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = new Date().toLocaleTimeString("tr-TR");
  row.append(dot, text, time);
  box.prepend(row);
  while (box.children.length > 100) box.lastChild?.remove();
}

// ---------- tema çipleri ----------

/** Tema çipi: isim + zemin/metin/vurgu renkli önizleme şeridi. */
function makeThemeChip(t: ThemeEntry, active: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip swatched" + (active ? " active" : "");
  b.title = `${t.name} — ${t.note}`;
  b.dataset.name = t.name;
  b.dataset.mode = t.mode;
  const label = document.createElement("span");
  label.className = "chip-label";
  label.textContent = t.name;
  b.append(label);
  if (t.swatch) {
    const strip = document.createElement("span");
    strip.className = "swatch-strip";
    strip.style.setProperty("--a", t.swatch.bg);
    strip.style.setProperty("--b", t.swatch.text);
    strip.style.setProperty("--c", t.swatch.accent);
    b.append(strip);
  }
  b.addEventListener("click", onClick);
  return b;
}

function renderThemePicker(): void {
  const host = el("theme-picker");
  host.replaceChildren();
  for (const t of THEMES) {
    host.append(
      makeThemeChip(t, false, () => {
        void pickTheme(t.name, t.mode);
      }),
    );
  }
  syncThemeChips();
}

function syncThemeChips(): void {
  document.querySelectorAll<HTMLButtonElement>("#theme-picker .chip").forEach((b) => {
    b.classList.toggle("active", S.appliedKey === `${b.dataset.name}|${b.dataset.mode}`);
  });
}

// ---------- vurgu rengi ----------

function setAccent(id: string): void {
  document.documentElement.dataset.accent = id;
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
    b.setAttribute("aria-label", a.label);
    b.dataset.accent = a.id;
    b.style.setProperty("--sw", a.hex);
    b.addEventListener("click", () => setAccent(a.id));
    host.append(b);
  }
}

// ---------- kontrast denetimi ----------

function badgeClass(verdict: string): string {
  return verdict === "FAIL" ? "bad" : verdict === "AAA" || verdict === "AA" ? "ok" : "warn";
}

let auditSignature = "";

export function renderAudit(): void {
  // stabilite: veri değişmedikçe listeyi yeniden kurma — odak/kaydırma kaybı.
  const next = JSON.stringify(S.audits);
  if (next === auditSignature) return;
  auditSignature = next;
  const host = el("audit-list");
  host.replaceChildren();
  if (S.audits.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "Ölçülecek tema dosyası yok (~/.config/opencode/themes).";
    host.append(empty);
    return;
  }
  for (const r of S.audits) {
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

// ---------- monitör satırları ----------

interface MonitorEls {
  row: HTMLButtonElement;
  val: HTMLElement;
  err: HTMLElement;
}

const monEls = new Map<string, MonitorEls>();
let monSig = "";

function rebuildMonitorRows(): void {
  const host = el("monitor-list");
  host.replaceChildren();
  monEls.clear();
  if (S.monitors.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "Bağlı monitör bulunamadı.";
    host.append(empty);
    return;
  }
  for (const m of S.monitors) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "monitor-row";
    row.title = m.info.id;
    const name = document.createElement("span");
    name.className = "mon-name";
    name.textContent = m.info.name;
    const kind = document.createElement("span");
    kind.className = "badge muted";
    kind.textContent = m.info.is_internal ? "dahili" : "harici";
    const api = document.createElement("span");
    api.className = "badge info";
    api.textContent = m.info.api;
    const val = document.createElement("span");
    val.className = "mon-val";
    val.textContent = "%-";
    const err = document.createElement("span");
    err.className = "mon-err";
    row.append(name, kind, api, val, err);
    row.addEventListener("click", () => void selectMonitor(m.info.id));
    host.append(row);
    monEls.set(m.info.id, { row, val, err });
  }
}

function renderMonitors(): void {
  const sig = S.monitors.map((m) => m.info.id).join("|");
  if (sig !== monSig) {
    monSig = sig;
    rebuildMonitorRows();
  }
  for (const m of S.monitors) {
    const els = monEls.get(m.info.id);
    if (!els) continue;
    els.row.classList.toggle("active", m.info.id === S.monitorSel);
    els.row.classList.toggle("bad", m.error !== null);
    els.row.title = m.error ?? m.info.id;
    els.val.textContent = m.value !== null ? `%${m.value}` : "%-";
    els.err.textContent = m.error ?? "";
  }
  const sel = S.monitors.find((m) => m.info.id === S.monitorSel) ?? null;
  const ctrl = el("monitor-ctrl");
  ctrl.hidden = sel === null;
  const proLock = sel !== null && !sel.info.is_internal && !S.licensePro;
  el("monitor-pro-lock").hidden = !proLock;
  const enabled = S.monitorCtrlEnabled && !proLock;
  const slider = inputEl("monitor-bright");
  slider.disabled = !enabled;
  btnEl("monitor-minus").disabled = !enabled;
  btnEl("monitor-plus").disabled = !enabled;
  // "soluk" görünüm: Pro kilidinde slider karartılır.
  ctrl.classList.toggle("locked", proLock);
  if (sel && sel.value !== null && document.activeElement !== slider) {
    slider.value = String(sel.value);
    el("monitor-bright-val").textContent = `%${sel.value}`;
  } else if (!sel) {
    el("monitor-bright-val").textContent = "%-";
  }
}

// ---------- profil kartları / hızlı çipler ----------

let pfCardsSig = "";
let pfSwitchSig = "";

function renderProfileCards(): void {
  const host = el("profile-cards");
  host.replaceChildren();
  for (const p of S.profiles) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "profile-card" + (p.id === S.activeId ? " active" : "");
    const name = document.createElement("div");
    name.className = "pc-name";
    name.textContent = p.name;
    const meta = document.createElement("div");
    meta.className = "pc-meta";
    meta.textContent = `${MODE_LABEL[p.mode]} • ${p.theme}`;
    const meta2 = document.createElement("div");
    meta2.className = "pc-meta";
    const appCount = (p.apps ?? []).length;
    meta2.textContent = `düzeltme ${p.offset >= 0 ? "+" : ""}${p.offset}${p.autoLock ? " • otomatik kilit" : ""}${
      appCount ? ` • ${appCount} uygulama` : ""
    }`;
    const t = THEMES.find((x) => x.name === p.theme && x.mode === p.themeMode);
    if (t?.swatch) {
      const strip = document.createElement("span");
      strip.className = "pc-strip";
      strip.style.setProperty("--a", t.swatch.bg);
      strip.style.setProperty("--b", t.swatch.text);
      strip.style.setProperty("--c", t.swatch.accent);
      strip.title = `${p.theme} — ${p.themeMode}`;
      b.append(strip);
    }
    b.append(name, meta, meta2);
    b.addEventListener("click", () => {
      selectForEdit(p.id);
      // Kart tıklaması profili uygular (eski davranış); selectForEdit
      // editorDirty'yi sıfırladığı için koşulsuz uygula.
      applyProfile(p);
    });
    host.append(b);
  }
}

function renderProfileSwitch(): void {
  const host = el("profile-switch");
  host.replaceChildren();
  for (const p of S.profiles) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (p.id === S.activeId ? " active" : "");
    b.textContent = p.name;
    b.addEventListener("click", () => applyProfile(p));
    host.append(b);
  }
}

function renderProfiles(): void {
  const sig = `${S.profiles.map((p) => `${p.id}:${p.name}`).join("|")}@${S.activeId}`;
  if (sig !== pfCardsSig) {
    pfCardsSig = sig;
    renderProfileCards();
  }
  const switchSig = `${S.profiles.map((p) => p.id).join("|")}@${S.activeId}`;
  if (switchSig !== pfSwitchSig) {
    pfSwitchSig = switchSig;
    renderProfileSwitch();
  }
}

// ---------- profil editörü (yalnız açıkça çizilir) ----------

let pfAutolock: SwitchHandle | null = null;
let tagApps: TagHandle | null = null;

export function getAppsTag(): TagHandle | null {
  return tagApps;
}

export function paintEditor(): void {
  inputEl("pf-name").value = S.draft.name;
  el("pf-off-val").textContent = (S.draft.offset >= 0 ? "+" : "") + S.draft.offset;
  buildPfThemePicker();
  buildSeg(el("pf-mode"), MODE_OPTIONS, S.draft.mode, (v) => {
    updateDraft({ mode: v as Mode });
  });
  buildSeg(el("pf-source"), SOURCE_OPTIONS, S.draft.source, (v) => {
    updateDraft({ source: v as Source });
  });
  if (pfAutolock) pfAutolock.set(S.draft.autoLock);
  tagApps = buildTagEditor(el("pf-apps-editor"), S.draft.apps ?? [], (items) => {
    updateDraft({ apps: items });
    el("pf-apps-count").textContent = `${items.length} uygulama`;
  });
  el("pf-apps-count").textContent = `${(S.draft.apps ?? []).length} uygulama`;
  btnEl("pf-delete").disabled = S.profiles.length <= 1;
  applyProGates();
}

/** Profil editörü tema çipleri: seçili tema vurgulanır, tıklamak draft'a yazar. */
function buildPfThemePicker(): void {
  const host = el("pf-theme-picker");
  host.replaceChildren();
  for (const t of THEMES) {
    const active = t.name === S.draft.theme && t.mode === S.draft.themeMode;
    host.append(
      makeThemeChip(t, active, () => {
        updateDraft({ theme: t.name, themeMode: t.mode });
        buildPfThemePicker();
      }),
    );
  }
}

/**
 * Pro kapıları: ücretsizde en fazla `FREE_MAX_PROFILES` profil ve uygulama
 * bağlama kapalı. Mevcut kayıtlara dokunulmaz; yalnız yeni ekleme engellenir.
 */
export function applyProGates(): void {
  const limit = S.licensePro ? MAX_PROFILES : FREE_MAX_PROFILES;
  btnEl("pf-add").disabled = S.profiles.length >= limit;
  const input = el("pf-apps-editor").querySelector<HTMLInputElement>(".tag-input");
  if (input) {
    input.disabled = !S.licensePro;
    input.placeholder = S.licensePro ? "ornek.exe + Enter" : "Pro gerekli";
  }
  el("pf-apps-pro").hidden = S.licensePro;
  btnEl("pf-bind-current").disabled = !S.licensePro;
}

// ---------- Hero + kartlar ----------

function whyText(): string {
  if (S.locked) return "kilitli — dokunmuyoruz";
  if (pausedNow()) return `duraklatıldı — ${pauseRemainingText()} kaldı`;
  if (S.freezeReason) {
    return S.freezeReason.startsWith("uygulama: ")
      ? `${S.freezeReason.slice("uygulama: ".length)} önde — donduruldu`
      : `${S.freezeReason} — donduruldu`;
  }
  if (S.boundName && S.boundExe) return `${S.boundExe} önde — ${S.boundName} devraldı`;
  return "ölçüme göre akıyor";
}

function nextChangeText(): string {
  if (S.warmMode !== "auto") return "ölçüme göre";
  const at = nextWarmthChange();
  return at ? `sonraki değişim: ${hhmm(at)}` : "ölçüme göre";
}

function effMode(): Mode {
  const bound = S.boundExe ? S.profiles.find((p) => (p.apps ?? []).includes(S.boundExe as string)) : null;
  return bound ? bound.mode : S.mode;
}

function renderHero(): void {
  const bright = `%${S.lastAppliedBright}`;
  el("st-bright").textContent = bright;
  el("st-bright").title = `mevcut: ${bright}, hedef düzeltmesi dahil`;
  el("sub-bright").textContent =
    `hedef: ${S.targetPct !== null ? `%${S.targetPct}` : "-"}` +
    (S.lowPower ? " • pil" : "") +
    (S.readingMode ? " • okuma" : "");
  el("hero-target").textContent = S.targetPct !== null ? `%${S.targetPct}` : "-";
  el("mode-pill").textContent = MODE_LABEL[effMode()];
  el("next-change").textContent = nextChangeText();
  el("why-line").textContent = whyText();
  setDot("dot-bright", S.freezeReason || S.locked || pausedNow() ? "warn" : "accent");
}

function renderCards(): void {
  el("st-light").textContent = S.light.text;
  el("st-light").title = S.light.title;
  el("sub-light").textContent = S.light.sub;
  setDot("dot-light", S.light.dot);

  const [themeName, themeMode] = splitKey(S.appliedKey);
  el("st-theme").textContent = themeName;
  el("st-theme").title = `${themeName} (${themeMode ?? "-"})`;
  el("sub-theme").textContent =
    `mod: ${themeMode ?? "-"}` + (S.pendingKey ? ` • bekliyor (${S.pendingCount}/2)` : "");
  setDot("dot-theme", S.risk ? "bad" : S.pendingKey ? "warn" : "accent");

  const frozen = S.freezeReason;
  el("st-frozen").textContent = frozen
    ? frozen
    : S.locked
      ? "Kilit"
      : pausedNow()
        ? "Duraklatıldı"
        : "İzliyor";
  el("sub-frozen").textContent = frozen
    ? "donduruldu"
    : S.locked
      ? "manuel kilit"
      : pausedNow()
        ? `duraklatıldı • ${pauseRemainingText()} kaldı`
        : "serbest";
  setDot("dot-frozen", frozen || S.locked || pausedNow() ? "warn" : "ok");
}

function splitKey(key: string | null): [string, string | null] {
  if (!key) return ["-", null];
  const [name, mode] = key.split("|");
  return [name, mode || null];
}

function renderHeader(): void {
  const badge = el("mode-badge");
  const parts: string[] = [];
  if (S.locked) parts.push("Kilitli");
  else if (pausedNow()) parts.push("Duraklatıldı");
  if (parts.length === 0) parts.push("İzliyor");
  badge.textContent = parts.join(" • ");
  badge.className = "badge " + (S.locked || pausedNow() ? "warn" : "");
  const prof = S.profiles.find((p) => p.id === S.activeId) ?? null;
  el("profile-pill").textContent = S.boundName
    ? `${prof ? prof.name : "-"} → ${S.boundExe}`
    : prof
      ? prof.name
      : "Profil yok";
  el("profile-pill").title = S.boundName
    ? `${S.boundExe} bağlı uygulama yüzünden yönetiyor`
    : "aktif profil";
}

// ---------- 20-20-20 + hızlı çubuk ----------

function renderBreak(): void {
  el("break-band").hidden = !S.breakVisible;
  const leftMin = Math.max(0, Math.ceil((S.breakDueAt - Date.now()) / 60000));
  const leftSec = Math.max(0, Math.ceil((S.breakDueAt - Date.now()) / 1000));
  el("break-countdown").textContent = !S.breakEnabled
    ? "20-20-20 kapalı"
    : S.breakState === "alerting"
      ? "20-20-20: bakış molası"
      : `20-20-20: ${leftMin} dk`;
  el("break-pill").textContent = !S.breakEnabled
    ? "kapalı"
    : S.breakState === "alerting"
      ? "mola"
      : `${leftMin} dk`;
  el("break-pill").className = "badge " + (S.breakState === "alerting" ? "warn" : S.breakEnabled ? "muted" : "info");
  el("break-next").textContent = !S.breakEnabled
    ? "sonraki mola: kapalı"
    : S.breakState === "alerting"
      ? "sonraki mola: bakış molası"
      : `sonraki mola: ${pad2(Math.floor(leftSec / 60))}:${pad2(leftSec % 60)}`;
}

function renderQuickbar(): void {
  btnEl("pause-btn").classList.toggle("active", pausedNow());
  btnEl("day-off-btn").classList.toggle("active", pausedNow() && S.pauseKind === "day");
  btnEl("lock-btn").classList.toggle("active", S.locked);
  btnEl("undo-btn").disabled = S.undoStack.length === 0;
  btnEl("read-btn").classList.toggle("active", S.readingMode);
  btnEl("read-btn").setAttribute("aria-pressed", S.readingMode ? "true" : "false");
  el("last-measure").textContent = S.lastMeasureAt
    ? hhmm(new Date(S.lastMeasureAt))
    : "-";
  el("clock").textContent = hhmm(new Date());
}

// ---------- sıcak ton bölümü ----------

const segSigs: Record<string, string> = { mode: "", source: "", warm: "" };

function renderWarm(): void {
  el("warm-val").textContent = String(S.warmPercent);
  const range = inputEl("warm-range");
  if (document.activeElement !== range) range.value = String(S.warmPercent);
  el("warm-preview-note").textContent =
    `Canlı önizleme: %${S.warmPercent} — kip yalnız otomatikte saat + ışığa göre uygulanır.`;
  el("calib-hint").textContent = S.calibHint;
  const now = new Date();
  const pct = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;
  el("day-now").style.left = `${pct.toFixed(2)}%`;

  if (segSigs.mode !== S.mode) {
    segSigs.mode = S.mode;
    buildModeCards();
  }
  if (segSigs.source !== S.source) {
    segSigs.source = S.source;
    buildSeg(el("source-seg"), SOURCE_OPTIONS, S.source, (v) => setSource(v as Source));
  }
  if (segSigs.warm !== S.warmMode) {
    segSigs.warm = S.warmMode;
    buildSeg(el("warm-seg"), WARM_OPTIONS, S.warmMode, (v) => setWarmMode(v as "auto" | "fixed" | "off"));
  }
}

/** Kip kartları: etiket + tek cümle açıklama (`.seg-desc`). */
function buildModeCards(): void {
  const host = el("mode-seg");
  host.replaceChildren();
  for (const o of MODE_OPTIONS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "seg-item" + (o.value === S.mode ? " active" : "");
    b.dataset.value = o.value;
    b.setAttribute("aria-pressed", o.value === S.mode ? "true" : "false");
    const label = document.createElement("span");
    label.textContent = o.label;
    const desc = document.createElement("small");
    desc.className = "seg-desc";
    desc.textContent = MODE_DESC[o.value as Mode] ?? "";
    b.append(label, desc);
    b.addEventListener("click", () => setMode(o.value as Mode));
    host.append(b);
  }
}

// ---------- lisans kartı ----------

function renderLicense(): void {
  const st = S.licenseStatus;
  el("lic-status").textContent = S.licensePro
    ? `Pro — ${st?.email ?? "?"} (${st?.issued ?? "?"})`
    : "Ücretsiz sürüm (3 profil) — Pro: harici monitör kontrolü, 6 profil, uygulama bağlama";
  el("lic-mini-status").textContent = S.licensePro ? `Pro — ${st?.email ?? "?"}` : "ücretsiz sürüm";
  btnEl("lic-deactivate").hidden = !S.licensePro;
  el("lic-err").textContent = S.licenseError ?? "";
  el("lic-err").hidden = !S.licenseError;
}

// ---------- geçmiş ----------

function drawChart(stats: StatsSummary | null): void {
  const svg = el("chart");
  if (!stats) {
    svg.innerHTML = "";
    return;
  }
  const W = 720;
  const H = 180;
  const pad = 24;
  const n = Math.max(1, stats.buckets.length);
  const step = W / n;
  const barW = Math.max(6, step - 14);
  const top = (v: number): number => H - pad - (Math.max(0, Math.min(100, v)) / 100) * (H - pad * 2);
  const parts: string[] = [
    `<line x1="0" y1="${H - pad}" x2="${W}" y2="${H - pad}" stroke="rgba(255,255,255,0.12)" />`,
  ];
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

let histSig = "";

function renderHistory(): void {
  const sig = `${S.histLines.length}|${S.histLines[0] ?? ""}|${S.stats ? S.stats.ticksToday : "-"}`;
  if (sig !== histSig) {
    histSig = sig;
    const host = el("hist-panel");
    host.replaceChildren();
    if (S.histLines.length === 0) {
      const row = document.createElement("div");
      row.textContent = "Henüz kayıt yok — ilk ölçüm birkaç dakika içinde düşer.";
      host.append(row);
    } else {
      for (const line of S.histLines) {
        const row = document.createElement("div");
        row.textContent = line;
        host.append(row);
      }
    }
    drawChart(S.stats);
    el("sum-changes").textContent = S.stats ? String(S.stats.themeChangesToday) : "-";
    el("sum-avg").textContent = S.stats && S.stats.ticksToday > 0 ? `%${S.stats.avgAppliedToday}` : "-";
    el("sum-frozen").textContent = S.stats ? String(S.stats.frozenTicksToday) : "-";
  }
}

// ---------- ana render ----------

export function renderAll(): void {
  document.documentElement.dataset.anim = S.animations ? "on" : "off";
  renderHeader();
  renderHero();
  renderCards();
  renderQuickbar();
  renderBreak();
  renderWarm();
  renderMonitors();
  renderRisk();
  renderLicense();
  renderProfiles();
  renderHistory();
  syncThemeChips();
  renderAudit();
  // Editörün yalnız metin etiketleri güncellenir; input değeri çizilmez.
  el("pf-off-val").textContent = (S.draft.offset >= 0 ? "+" : "") + S.draft.offset;
  el("pf-apps-count").textContent = `${(S.draft.apps ?? []).length} uygulama`;
  applyProGates();
}

/** Kontrast uyarı bandı: FAIL tema görünürse açılır, düzeltme önerisiyle. */
function renderRisk(): void {
  el("risk-band").hidden = !S.risk;
  if (S.risk) {
    el("risk-text").textContent = S.risk.text;
    btnEl("risk-fix-btn").textContent = S.risk.fixLabel;
  }
}

// ---------- dinamik kontrol kurulumu ----------

let tagBlock: TagHandle | null = null;

export function bootWidgets(): void {
  renderThemePicker();
  renderAccents();
  renderAudit();
  buildModeCards();
  syncThemeChips();

  tagBlock = buildTagEditor(el("block-editor"), S.blockItems, (items) => setBlockList(items));
  buildTagEditor(el("allow-editor"), S.allowItems, (items) => setAllowList(items));

  pfAutolock = bindSwitch(btnEl("pf-autolock"), S.draft.autoLock, (v) => updateDraft({ autoLock: v }));
  bindSwitch(btnEl("anim-switch"), S.animations, (v) => void setAnimations(v));
  bindSwitch(btnEl("break-switch"), S.breakEnabled, (v) => setBreakEnabled(v));
  bindSwitch(btnEl("gate-switch"), S.auditGate, (v) => setGate(v));
  void autostartEnabled().then((on) => {
    bindSwitch(btnEl("auto-switch"), on, (v) => void setAutostart(v));
  });

  paintEditor();
  renderAll();
}

/** "Ön plandakini ekle" — engelli listesine yazar. */
export function addBlockedExe(exe: string): void {
  const items = tagBlock?.get() ?? S.blockItems;
  if (!items.includes(exe)) tagBlock?.set([...items, exe]);
  setBlockList(tagBlock?.get() ?? items);
}

/** "Ön plandakini bağla" — profilin bağlı uygulamalarına yazar. */
export function addAppExe(exe: string): void {
  const items = tagApps?.get() ?? S.draft.apps ?? [];
  if (!items.includes(exe)) tagApps?.set([...items, exe]);
  const next = tagApps?.get() ?? items;
  updateDraft({ apps: next });
  el("pf-apps-count").textContent = `${next.length} uygulama`;
}

/** `#pf-name` girişini okur (yalnız kaydetmede). */
export function readDraftName(): string {
  return inputEl("pf-name").value;
}

// ---------- düğme eylemleri (main'in çağırdığı kısa yollar) ----------

export function wireButtons(): void {
  btnEl("break-done").addEventListener("click", () => ackBreak());
  btnEl("break-snooze").addEventListener("click", () => snoozeBreak());
  btnEl("risk-fix-btn").addEventListener("click", () => void fixRisk());
  btnEl("audit-refresh").addEventListener("click", () => void loadAudit());
  btnEl("lic-activate").addEventListener("click", () => {
    void activateLicense(inputEl("lic-key").value).then(() => {
      if (S.licensePro) inputEl("lic-key").value = "";
    });
  });
  btnEl("lic-deactivate").addEventListener("click", () => void deactivateLicense());
  inputEl("lic-key").addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key !== "Enter") return;
    e.preventDefault();
    void activateLicense(inputEl("lic-key").value).then(() => {
      if (S.licensePro) inputEl("lic-key").value = "";
    });
  });

  btnEl("pf-add").addEventListener("click", () => addProfile());
  btnEl("pf-duplicate").addEventListener("click", () => duplicateDraft());
  btnEl("pf-restore").addEventListener("click", () => restoreSeeds());
  btnEl("pf-save").addEventListener("click", () => {
    const apps = tagApps?.get() ?? S.draft.apps ?? [];
    saveDraft(readDraftName(), apps);
  });
  btnEl("pf-name").addEventListener("input", () => {
    S.editorDirty = true;
  });
  // Silme iki aşamalı: yanlışlıkla tek tık silmesin, 3 sn içinde tekrar basılınca sil.
  let deleteArmed = false;
  let deleteTimer = 0;
  btnEl("pf-delete").addEventListener("click", () => {
    const btn = btnEl("pf-delete");
    if (S.profiles.length <= 1) return;
    if (!deleteArmed) {
      deleteArmed = true;
      btn.textContent = "Emin misin? Sil";
      deleteTimer = window.setTimeout(() => {
        deleteArmed = false;
        btn.textContent = "Sil";
      }, 3000);
      return;
    }
    if (deleteTimer) window.clearTimeout(deleteTimer);
    deleteArmed = false;
    btn.textContent = "Sil";
    deleteDraft();
  });

  btnEl("pf-off-minus").addEventListener("click", () => {
    updateDraft({ offset: Math.max(-20, S.draft.offset - 5) });
    // stabilite (c): ofset düzeltmesi BİLİNÇLİ kalibrasyondur — öğrenmeye devam.
    void learnBrightness();
  });
  btnEl("pf-off-plus").addEventListener("click", () => {
    updateDraft({ offset: Math.min(20, S.draft.offset + 5) });
    void learnBrightness();
  });

  btnEl("warm-minus").addEventListener("click", () => {
    setWarmPercent(S.warmPercent - 5);
    void applyWarmth();
  });
  btnEl("warm-plus").addEventListener("click", () => {
    setWarmPercent(S.warmPercent + 5);
    void applyWarmth();
  });
  inputEl("warm-range").addEventListener("input", () => {
    setWarmPercent(Number(inputEl("warm-range").value));
    void applyWarmth();
  });

  el("day-off-btn").addEventListener("click", () => toggleDayOff());
  btnEl("lock-btn").addEventListener("click", () => toggleLock());
  btnEl("undo-btn").addEventListener("click", () => void undo());
  btnEl("read-btn").addEventListener("click", () => void toggleReading());
  btnEl("log-all-link").addEventListener("click", () => switchTab("history"));

  // Monitör elle kontrol: slider label anında, yazma change'de gelir.
  const monSlider = inputEl("monitor-bright");
  monSlider.addEventListener("input", () => {
    el("monitor-bright-val").textContent = `%${monSlider.value}`;
  });
  monSlider.addEventListener("change", () => {
    void applyMonitorBrightness(Number(monSlider.value));
  });
  btnEl("monitor-minus").addEventListener("click", () => {
    void applyMonitorBrightness(Number(monSlider.value) - 10);
  });
  btnEl("monitor-plus").addEventListener("click", () => {
    void applyMonitorBrightness(Number(monSlider.value) + 10);
  });
}