// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/**
 * panels.ts — render katmanı: DOM'a YALNIZ burası dokunur.
 *
 * Bağımlılık tek yönlü: `panels → orchestr`. Buradaki işlevler durumu
 * `orchestr`'ten okur, DOM'u yazar; karar vermez. Etkileşim geri çağrıları
 * `orchestr` işlevlerini çağırır (tek yön korunur).
 *
 * index.html'in üstündeki SÖZLEŞME bloğu sınıf/id sözleşmesinin kaynağıdır.
 */

import {
  ACCENTS,
  DEFAULT_DESIGN_THEME,
  DEFAULT_TEMPLATE,
  DESIGN_THEMES,
  MODE_LABEL,
  MODE_OPTIONS,
  SOURCE_OPTIONS,
  TEMPLATES,
  THEMES,
} from "./catalog";
import type { Mode, Source, ThemeEntry } from "./catalog";
import { FREE_MAX_PROFILES, MAX_PROFILES, getSetting, setSetting } from "./store";
import { toast } from "./toast";
import { bindSwitch, buildSeg, buildTagEditor } from "./widgets";
import type { SwitchHandle, TagHandle } from "./widgets";
import {
  S,
  WARM_OPTIONS,
  ackBreak,
  activateLicense,
  addProfile,
  applyKelvin,
  applyMonitorBrightness,
  applyProfile,
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
    const on = t.dataset.tab === name;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
    // v2.3 (reviewer #3): roving tabindex — sekme grubunda Tab bir kez durur,
    // sekmeler arası geçiş ok tuşlarıyla yapılır (WAI-ARIA tabs deseni).
    t.tabIndex = on ? 0 : -1;
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

// ---------- şablon (v2.6, ikinci eksen) ----------

/**
 * `<html data-template>` yazar + kalıcılaştırır. Şablon yalnız geometri,
 * tipografi ve gezinmeyi değiştirir; renk `data-theme` paletinden gelir.
 */
export function setTemplate(id: string): void {
  const valid = TEMPLATES.some((t) => t.id === id) ? id : DEFAULT_TEMPLATE;
  document.documentElement.dataset.template = valid;
  setSetting("template", valid);
  el("template-picker").querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
    const on = b.dataset.template === valid;
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.classList.toggle("active", on);
  });
}

/** Açılışta kaydedilmiş şablonu uygular (varsayılan bento). */
export function initTemplate(): void {
  const saved = getSetting("template", DEFAULT_TEMPLATE);
  const valid = TEMPLATES.some((t) => t.id === saved) ? saved : DEFAULT_TEMPLATE;
  document.documentElement.dataset.template = valid;
}

function renderTemplates(): void {
  const host = el("template-picker");
  host.replaceChildren();
  const current = document.documentElement.dataset.template ?? DEFAULT_TEMPLATE;
  for (const t of TEMPLATES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "design-card template-card";
    b.dataset.template = t.id;
    b.title = t.note;
    b.setAttribute("aria-label", `${t.label} — ${t.note}`);
    b.setAttribute("aria-pressed", t.id === current ? "true" : "false");
    if (t.id === current) b.classList.add("active");

    // İskelet önizleme: şablonun kendi geometrisini 3-4 blokla anlatır.
    const sk = document.createElement("span");
    sk.className = `tpl-skel tpl-${t.id}`;
    sk.setAttribute("aria-hidden", "true");
    sk.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));

    const label = document.createElement("span");
    label.className = "design-label";
    label.textContent = t.label;

    b.append(sk, label);
    b.addEventListener("click", () => setTemplate(t.id));
    host.append(b);
  }
}

// ---------- tasarım teması (görünüm) ----------

/** `<html data-theme>` yazar + kalıcılaştırır. Palet CSS'te tanımlı. */
export function setDesignTheme(id: string): void {
  document.documentElement.dataset.theme = id;
  setSetting("designTheme", id);
  el("design-picker").querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
    const on = b.dataset.design === id;
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.classList.toggle("active", on);
  });
}

/** Açılışta kaydedilmiş temayı uygular. */
export function initDesignTheme(): void {
  const saved = getSetting("designTheme", DEFAULT_DESIGN_THEME);
  const valid = DESIGN_THEMES.some((t) => t.id === saved) ? saved : DEFAULT_DESIGN_THEME;
  document.documentElement.dataset.theme = valid;
}

function renderDesignThemes(): void {
  const host = el("design-picker");
  host.replaceChildren();
  const current = document.documentElement.dataset.theme ?? DEFAULT_DESIGN_THEME;
  for (const t of DESIGN_THEMES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "design-card";
    b.dataset.design = t.id;
    b.title = t.note;
    b.setAttribute("aria-label", `${t.label} — ${t.note}`);
    b.setAttribute("aria-pressed", t.id === current ? "true" : "false");
    if (t.id === current) b.classList.add("active");

    const strip = document.createElement("span");
    strip.className = "design-strip";
    strip.style.setProperty("--d-bg", t.swatch.bg);
    strip.style.setProperty("--d-surface", t.swatch.surface);
    strip.style.setProperty("--d-accent", t.swatch.accent);

    const label = document.createElement("span");
    label.className = "design-label";
    label.textContent = t.label;

    const note = document.createElement("span");
    note.className = "design-note";
    note.textContent = t.note;

    b.append(strip, label, note);
    b.addEventListener("click", () => setDesignTheme(t.id));
    host.append(b);
  }
}

// ---------- vurgu rengi ----------

function setAccent(id: string): void {
  document.documentElement.dataset.accent = id;
  // duzeltme v2.2 (madde 1): seçim kalıcı — açılışta geri okunur.
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
    b.setAttribute("aria-label", a.label);
    b.dataset.accent = a.id;
    b.style.setProperty("--sw", a.hex);
    b.addEventListener("click", () => setAccent(a.id));
    host.append(b);
  }
  // duzeltme v2.2 (madde 1): kayıtlı vurgu rengi açılışta uygulanır.
  const saved = getSetting("accent", "");
  if (ACCENTS.some((a) => a.id === saved)) setAccent(saved);
  // v2.4: görünüm teması da açılışta uygulanır (palet CSS'te).
  initDesignTheme();
}

// ---------- kontrast denetimi ----------

function badgeClass(verdict: string): string {
  return verdict === "FAIL" ? "bad" : verdict === "AAA" || verdict === "AA" ? "ok" : "warn";
}

/** duzeltme v2.2 (B): WCAG rozetleri insan dilinde — AAA/FAIL görünmez. */
const VERDICT_LABEL: Record<string, string> = {
  AAA: "çok iyi",
  AA: "iyi",
  "AA-large": "sınır",
  FAIL: "okunaksız",
  UNKNOWN: "bilinmiyor",
};

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
    verdict.textContent = VERDICT_LABEL[r.verdict] ?? r.verdict;
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
  ct: HTMLElement;
}

const monEls = new Map<string, MonitorEls>();
let monSig = "";

/**
 * Kullanıcıya gösterilecek monitör adı.
 * Backend `friendly_name` bulamazsa `\\.\DISPLAYn` gibi ham cihaz yolunu
 * döndürüyor; bu kullanıcıya gösterilmez (v2.4).
 */
function displayNameFor(info: { id: string; name: string; is_internal: boolean }): string {
  const raw = (info.name ?? "").trim();
  const isDevicePath = /^\\\\\.\\DISPLAY\d+$/i.test(raw) || raw.startsWith("\\\\");
  if (raw && !isDevicePath) return raw;
  const m = info.id.match(/DISPLAY(\d+)/i);
  const n = m ? m[1] : "1";
  return info.is_internal ? `Dahili ekran ${n}` : `Ekran ${n}`;
}

/** Monitör satırındaki sıcaklık rozeti: monitörün kendi ayarı / programla / HDR. */
function paintCtBadge(ct: HTMLElement, m: (typeof S.monitors)[number]): void {
  if (m.hdr) {
    ct.textContent = "HDR açık";
    ct.className = "ct-badge hdr";
    ct.title = "HDR açıkken ekran sarılaştırılamıyor";
    return;
  }
  if (m.ctSupported === true) {
    ct.textContent = "monitörün kendi ayarı";
    ct.className = "ct-badge";
    ct.title = "Renk sıcaklığı bu ekranda monitörün kendi ayarıyla değişir";
  } else {
    ct.textContent = "programla yapılıyor";
    ct.className = "ct-badge";
    ct.title = "Renk sıcaklığı programla ayarlanır";
  }
}

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
    // v2.4: backend ad bulamazsa ham cihaz yolunu (\\.\DISPLAY1) döndürüyor;
    // kullanıcıya asla gösterilmez. "Ekran 1" gibi okunur bir ad üret.
    name.textContent = displayNameFor(m.info);
    name.title = m.info.id;
    const kind = document.createElement("span");
    kind.className = "badge muted";
    // duzeltme v2.3: is_internal ile api iki ayrı rozet olarak aynı bilgiyi
    // yazıyordu ("dahili" + "dahili panel"). Harici/dahili ayrımı tek rozette;
    // api (wmi/ddc) kullanıcı için iç detay, gösterilmez.
    kind.textContent = m.info.is_internal ? "dahili panel" : "harici";
    const ct = document.createElement("span");
    ct.className = "ct-badge";
    const val = document.createElement("span");
    val.className = "mon-val";
    val.textContent = "%-";
    const err = document.createElement("span");
    err.className = "mon-err";
    row.append(name, kind, ct, val, err);
    row.addEventListener("click", () => void selectMonitor(m.info.id));
    host.append(row);
    monEls.set(m.info.id, { row, val, err, ct });
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
    // HDR açık monitör satırı soluk: otomasyon oraya sıcak ton yazamaz.
    els.row.classList.toggle("hdr", m.hdr);
    els.row.title = m.error ?? m.info.id;
    els.val.textContent = m.value !== null ? `%${m.value}` : "%-";
    els.err.textContent = m.error ?? "";
    paintCtBadge(els.ct, m);
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

// ---------- profil kartları ----------

let pfCardsSig = "";

function renderProfileCards(): void {
  const host = el("profile-cards");
  host.replaceChildren();
  for (const p of S.profiles) {
    // duzeltme v2.2 (madde 7): kart tıklaması YALNIZ düzenlemeye seçer;
    // uygulamak için kart üzerinde ayrı "Uygula" düğmesi var — yanlışlıkla
    // uygulama bitti.
    const card = document.createElement("div");
    card.className = "profile-card" + (p.id === S.activeId ? " active" : "");
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.addEventListener("click", () => selectForEdit(p.id));
    card.addEventListener("keydown", (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === "Enter" || key === " ") {
        e.preventDefault();
        selectForEdit(p.id);
      }
    });
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
      card.append(strip);
    }
    card.append(name, meta, meta2);
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "chip pc-apply";
    apply.textContent = "Uygula";
    apply.title = `${p.name} profilini uygula`;
    apply.addEventListener("click", (e) => {
      e.stopPropagation();
      applyProfile(p);
    });
    card.append(apply);
    host.append(card);
  }
}

function renderProfiles(): void {
  const sig = `${S.profiles.map((p) => `${p.id}:${p.name}`).join("|")}@${S.activeId}`;
  if (sig !== pfCardsSig) {
    pfCardsSig = sig;
    renderProfileCards();
  }
}

// ---------- profil editörü (yalnız açıkça çizilir) ----------

let pfAutolock: SwitchHandle | null = null;
let animSwitchRef: SwitchHandle | null = null;
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
    const prevCount = (S.draft.apps ?? []).length;
    updateDraft({ apps: items });
    el("pf-apps-count").textContent = `${items.length} uygulama`;
    // duzeltme v2.2 (D): uygulama bağlama/kaldırma toast ile görünür.
    if (items.length < prevCount) toast.info("Uygulama bağlantısı kaldırıldı");
    else if (items.length > prevCount) toast.ok("Uygulama profili bağlandı");
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

/** duzeltme v2.2 (madde 5): sınır dolunca küçük yan metin düğmenin yanında. */
let pfAddHintEl: HTMLElement | null = null;

function pfAddHint(): HTMLElement {
  if (!pfAddHintEl || !pfAddHintEl.isConnected) {
    pfAddHintEl = document.createElement("span");
    pfAddHintEl.className = "hint";
    pfAddHintEl.textContent = "Ücretsiz sürümde 3 profil — Pro ile 6";
    el("pf-add").after(pfAddHintEl);
  }
  return pfAddHintEl;
}

/**
 * Pro kapıları: ücretsizde en fazla `FREE_MAX_PROFILES` profil ve uygulama
 * bağlama kapalı. Mevcut kayıtlara dokunulmaz; yalnız yeni ekleme engellenir.
 */
export function applyProGates(): void {
  const limit = S.licensePro ? MAX_PROFILES : FREE_MAX_PROFILES;
  const add = btnEl("pf-add");
  const full = S.profiles.length >= limit;
  add.disabled = full;
  add.title = full ? "Ücretsiz sürümde 3 profil — Pro ile 6" : "";
  pfAddHint().hidden = !(full && !S.licensePro);
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
  if (S.locked) return "kilitli — ayar yapılmıyor";
  if (pausedNow()) return `duraklatıldı — ${pauseRemainingText()} kaldı`;
  if (S.freezeReason) {
    return S.freezeReason.startsWith("uygulama: ")
      ? `${S.freezeReason.slice("uygulama: ".length)} önde — ayar yapılmıyor`
      : `${S.freezeReason} — ayar yapılmıyor`;
  }
  if (S.boundName && S.boundExe) return `${S.boundExe} önde — ${S.boundName} devraldı`;
  if (S.hdrOn && S.warmMode === "off") return "HDR açıkken ekran sarılaştırılamıyor";
  return "otomatik çalışıyor";
}

function effMode(): Mode {
  const bound = S.boundExe ? S.profiles.find((p) => (p.apps ?? []).includes(S.boundExe as string)) : null;
  return bound ? bound.mode : S.mode;
}

function renderHero(): void {
  const bright = `%${S.lastAppliedBright}`;
  const target = S.targetPct !== null ? `%${S.targetPct}` : "-";
  el("st-bright").textContent = bright;
  el("st-bright").title = `şu an ${bright} • ulaşmak istenen ${target}`;
  // #sub-bright gizli ve artık yazılmıyor (v2.4, inceleme #13): bilgi #hero-sub'ta.
  // duzeltme v2.2: #hero-target ve #next-change SİLİNDİ — hedef + sonraki
  // değişim saati tek satırda #hero-sub'a birleşir.
  const parts: string[] = [`Ulaşılmak istenen ${target}`];
  if (S.warmMode === "auto") {
    const at = nextWarmthChange();
    if (at) parts.push(`${hhmm(at)}'da değişecek`);
  }
  if (S.lowPower) parts.push("pil modu");
  if (S.readingMode) parts.push("okuma profili");
  el("hero-sub").textContent = parts.join(" · ");
  el("mode-pill").textContent = MODE_LABEL[effMode()];
  el("why-line").textContent = whyText();
  setDot("dot-bright", S.freezeReason || S.locked || pausedNow() ? "warn" : "accent");
  renderHeroCurve();
}

/**
 * Hero eğrisi: gün boyunca ekran sarılığı (tek eğri).
 * Çapa noktaları `src-tauri/src/decide.rs` ANCHORS ile BİREBİR aynıdır —
 * uydurma eğri çizmiyoruz, backend'in gerçek karar eğrisini gösteriyoruz.
 */
const WARM_ANCHORS: Array<[number, number]> = [
  [0, 40], [300, 40], [360, 25], [420, 10], [480, 0],
  [900, 0], [1020, 10], [1140, 25], [1260, 35], [1380, 40], [1440, 40],
];

function warmAt(minute: number): number {
  const t = Math.max(0, Math.min(1440, minute));
  for (let i = 0; i < WARM_ANCHORS.length - 1; i++) {
    const [t0, v0] = WARM_ANCHORS[i];
    const [t1, v1] = WARM_ANCHORS[i + 1];
    if (t >= t0 && t <= t1) {
      const k = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * k;
    }
  }
  return WARM_ANCHORS[0][1];
}

function renderHeroCurve(): void {
  const svg = document.getElementById("hero-curve");
  if (!svg) return;
  const now = new Date();
  const minute = now.getHours() * 60 + now.getMinutes();
  const xOf = (m: number): number => (m / 1440) * 264;
  const yOf = (v: number): number => 82 - (v / 45) * 74; // tavan 45 (decide.rs), eksen y=82

  // Eğri: her 10 dakikada bir örnekle (147 nokta, düzgün).
  const pts: string[] = [];
  for (let m = 0; m <= 1440; m += 10) {
    pts.push(`${xOf(m).toFixed(1)},${yOf(warmAt(m)).toFixed(1)}`);
  }
  document.getElementById("hc-warm-path")?.setAttribute("d", `M${pts.join(" L")}`);

  // "Şu an" çizgisi + nokta gerçek konumda.
  const x = xOf(minute).toFixed(1);
  const warm = S.warmMode === "off" ? 0 : warmAt(minute);
  const nowLine = document.getElementById("hc-now-line");
  if (nowLine) {
    nowLine.setAttribute("x1", x);
    nowLine.setAttribute("x2", x);
  }
  const dot = document.getElementById("hc-warm");
  if (dot) {
    dot.setAttribute("cx", x);
    dot.setAttribute("cy", yOf(warm).toFixed(1));
  }
  svg.dataset.now = String(minute);
  svg.dataset.warm = String(Math.round(warm));
}

function renderCards(): void {
  // Ölçüm gelmeden "-" göstermek kartı bozuk gibi gösteriyordu (v2.4.1).
  el("st-light").textContent = S.light.text === "-" ? "Henüz ölçülmedi" : S.light.text;
  el("st-light").title = S.light.title;
  el("sub-light").textContent = S.light.sub === "-" ? "kamera ilk turda okur" : S.light.sub;
  setDot("dot-light", S.light.dot);

  const [themeName, themeMode] = splitKey(S.appliedKey);
  const noTheme = !themeName || themeName === "-";
  el("st-theme").textContent = noTheme ? "Henüz uygulanmadı" : themeName;
  el("st-theme").title = noTheme ? "İlk ölçümden sonra tema uygulanır" : `${themeName} (${themeMode ?? "-"})`;
  el("sub-theme").textContent = noTheme
    ? "ilk ölçümde seçilir"
    : `biçim: ${themeMode ?? "-"}` + (S.pendingKey ? " • değişecek (ikinci ölçüm bekleniyor)" : "");
  setDot("dot-theme", S.risk ? "bad" : S.pendingKey ? "warn" : "accent");

  const frozen = S.freezeReason;
  el("st-frozen").textContent = frozen
    ? "Ayar yapılmıyor"
    : S.locked
      ? "Kilitli"
      : pausedNow()
        ? "Duraklatıldı"
        : "Otomatik çalışıyor";
  el("sub-frozen").textContent = frozen
    ? frozen.startsWith("uygulama: ")
      ? `${frozen.slice("uygulama: ".length)} önde`
      : frozen
    : S.locked
      ? "otomatik ayar kilitlendi"
      : pausedNow()
        ? `duraklatıldı • ${pauseRemainingText()} kaldı`
        : "ölçümlere göre akıyor";
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
  if (parts.length === 0) parts.push("Otomatik çalışıyor");
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
  // duzeltme v2.2 (madde 4): mola bandının metni duruma göre güncellenir
  // (eskiden hiç yazılmıyordu, statik HTML kalıyordu).
  el("break-text").textContent =
    S.breakState === "alerting"
      ? "20 dakika doldu — 20 saniye uzaklara bak."
      : "Mola zamanı geldi.";
  const leftMin = Math.max(0, Math.ceil((S.breakDueAt - Date.now()) / 60000));
  const leftSec = Math.max(0, Math.ceil((S.breakDueAt - Date.now()) / 1000));
  el("break-countdown").textContent = !S.breakEnabled
    ? "mola hatırlatıcısı kapalı"
    : S.breakState === "alerting"
      ? "Mola zamanı"
      : `mola: ${leftMin} dk`;
  el("break-pill").textContent = !S.breakEnabled
    ? "kapalı"
    : S.breakState === "alerting"
      ? "mola"
      : `${leftMin} dk`;
  el("break-pill").className = "badge " + (S.breakState === "alerting" ? "warn" : S.breakEnabled ? "muted" : "info");
  el("break-next").textContent = !S.breakEnabled
    ? "sonraki mola: kapalı"
    : S.breakState === "alerting"
      ? "mola zamanı şimdi"
      : `sonraki mola: ${pad2(Math.floor(leftSec / 60))}:${pad2(leftSec % 60)}`;
}

function renderQuickbar(): void {
  // duzeltme v2.2 (madde 11): "1 saat" ve "Bugün" ayrı durumlardır; her düğme
  // yalnız kendi durumunu gösterir (aria-pressed + .active).
  const hourPaused = S.pauseKind === "hour" && pausedNow();
  const dayPaused = S.pauseKind === "day" && pausedNow();
  const autoOn = !pausedNow() && !S.locked;
  const onBtn = btnEl("auto-on");
  onBtn.classList.toggle("active", autoOn);
  onBtn.setAttribute("aria-pressed", autoOn ? "true" : "false");
  const hourBtn = btnEl("pause-btn");
  hourBtn.classList.toggle("active", hourPaused);
  hourBtn.setAttribute("aria-pressed", hourPaused ? "true" : "false");
  const dayBtn = btnEl("day-off-btn");
  dayBtn.classList.toggle("active", dayPaused);
  dayBtn.setAttribute("aria-pressed", dayPaused ? "true" : "false");
  const lockBtn = btnEl("lock-btn");
  lockBtn.classList.toggle("active", S.locked);
  lockBtn.setAttribute("aria-pressed", S.locked ? "true" : "false");
  btnEl("undo-btn").disabled = S.undoStack.length === 0;
  btnEl("read-btn").classList.toggle("active", S.readingMode);
  btnEl("read-btn").setAttribute("aria-pressed", S.readingMode ? "true" : "false");
  el("last-measure").textContent = S.lastMeasureAt
    ? hhmm(new Date(S.lastMeasureAt))
    : "-";
  el("clock").textContent = hhmm(new Date());
  // v2.6: dergi şablonunun masthead tarihi. Yalnız o şablonda görünür
  // (CSS `display`), ama içerik her şablonda doğru kalsın diye yazılır.
  el("mast-date").textContent = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

// ---------- sıcak ton bölümü ----------

const segSigs: Record<string, string> = { mode: "", source: "", warm: "" };

function renderWarm(): void {
  el("warm-val").textContent = String(S.warmPercent);
  const range = inputEl("warm-range");
  if (document.activeElement !== range) range.value = String(S.warmPercent);
  // v2.5: yüzde artık tavan değil ŞİDDET — otomatik eğri bununla çarpılır.
  el("warm-preview-note").textContent =
    `Hızlı sarılık şiddeti: %${S.warmPercent} — otomatik kipte saat/ışık eğrisiyle çarpılır, sabit kipte doğrudan uygulanır; kapalı kipte etkisizdir.`;
  el("calib-hint").textContent = S.calibHint;
  // HDR açık monitörde sıcak ton etkisiz: not görünür, kontrol soluk kalır.
  const hdr = S.hdrOn;
  el("warm-hdr-note").hidden = !hdr;
  // duzeltme v2.2 (E): HDR açıkken kontrol disabled ama görünür (soluk).
  inputEl("warm-kelvin").disabled = hdr;
  el("warm-presets").querySelectorAll<HTMLButtonElement>(".chip").forEach((c) => {
    c.disabled = hdr;
  });
  // duzeltme v2.2 (E): teknik not — harici monitör kendi ayarını destekliyor mu?
  const ext = S.monitors.find((m) => !m.info.is_internal) ?? null;
  const hw = ext?.ctSupported === true;
  const note = el("warm-tech-note");
  const noteText = note.lastChild;
  if (noteText) {
    noteText.textContent = hw
      ? " Monitörün kendi ayarı kullanılıyor."
      : " Programla yapılıyor.";
  }
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
  // duzeltme v2.2: #lic-mini-status SİLİNDİ — lisans yalnız Ayarlar'da (#lic-status).
  btnEl("lic-deactivate").hidden = !S.licensePro;
  el("lic-err").textContent = S.licenseError ?? "";
  el("lic-err").hidden = !S.licenseError;
}

// ---------- geçmiş ----------

function drawChart(stats: StatsSummary | null): void {
  const svg = el("chart");
  if (!stats || stats.buckets.length === 0) {
    // Boş grafik "bozuk" görünüyordu; neden boş olduğunu yaz (v2.4.1).
    svg.innerHTML =
      `<text x="360" y="94" fill="var(--text-4)" font-size="13" text-anchor="middle" font-family="inherit">` +
      `Henüz grafik verisi yok — birkaç dakika içinde dolar</text>`;
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
      const label = b.hoursAgo === 0 ? "şimdi" : `-${b.hoursAgo} sa`;
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

// ---------- geçmiş: ham log satırı → insan dili (duzeltme v2.2, madde 9 + B) ----------

interface ParsedTick {
  at: Date;
  note: string;
  theme: string;
  applied: number;
}

/** Göz konforu temalarının insan dilindeki adları (diğerleri "<ad> teması"). */
const THEME_TR: Record<string, string> = {
  "ss-paper": "gündüz teması",
  "ss-dusk": "akşam teması",
  "ss-night": "gece teması",
};

function themeTr(name: string): string {
  return THEME_TR[name] ?? `${name} teması`;
}

/**
 * `orchestr.ts`'in diskLog biçimi:
 * `<ISO> | source=… | level=… | tone=… | desired=… | applied=… | theme=… | note=…`
 * Çözülemeyen satır null döner ve gösterilmez (ham basılmaz).
 */
function parseTickLine(line: string): ParsedTick | null {
  const parts = line.split(" | ");
  if (parts.length < 2) return null;
  const at = new Date(parts[0].trim());
  if (Number.isNaN(at.getTime())) return null;
  const fields = new Map<string, string>();
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    if (eq > 0) fields.set(p.slice(0, eq).trim(), p.slice(eq + 1).trim());
  }
  const note = fields.get("note");
  if (note === undefined) return null;
  const applied = Number(fields.get("applied"));
  return {
    at,
    note,
    theme: fields.get("theme") ?? "",
    applied: Number.isFinite(applied) ? Math.round(applied) : Number.NaN,
  };
}

/** Tek satırın insan dilindeki karşılığı; null = satır atlanır. */
function humanizeTick(f: ParsedTick, prev: ParsedTick | null): string | null {
  const note = f.note;
  const pct = Number.isFinite(f.applied) ? `%${f.applied}` : "";
  if (note.startsWith("donduruldu uygulama ")) {
    return `${note.slice("donduruldu uygulama ".length)} açık — ayar yapılmadı`;
  }
  if (note.startsWith("donduruldu tam ekran")) {
    return "tam ekran açık — ayar yapılmadı";
  }
  if (note.startsWith("film otomatik kilit ")) {
    return `otomatik ayar kilitlendi (${note.slice("film otomatik kilit ".length)})`;
  }
  if (note.startsWith("kilitli/sabit")) {
    return "kilitli ya da sabit kipte — ayar yapılmadı";
  }
  if (note.startsWith("bağlı profil ")) {
    // "bağlı profil vlc.exe -> Film"
    const m = note.match(/^bağlı profil (.+) -> (.+)$/);
    return m ? `${m[2]} profili devraldı (${m[1]})` : "bağlı profil devraldı";
  }
  if (note.startsWith("reddedildi")) {
    return "tema otomatik seçimde uygulanmadı — okunaksız";
  }
  if (note.startsWith("bekliyor")) {
    return "tema değişecek (ikinci ölçüm bekleniyor)";
  }
  if (note === "pil modu") {
    return "pil modunda ayar kısıldı";
  }
  if (note === "ogrenilmis parlaklik" || note === "ogrenilmis tercih") {
    return "öğrenilen tercihe göre ayarlandı";
  }
  if (note.startsWith("profil ")) {
    return `${note.slice("profil ".length)} profili uygulandı`;
  }
  // Normal tur: önceki satıra göre ne değiştiyse onu anlat.
  const themeChanged = prev !== null && f.theme !== "" && f.theme !== prev.theme;
  if (themeChanged) {
    return `${themeTr(f.theme.split("/")[0])}na geçildi${pct ? ` · ${pct}` : ""}`;
  }
  const brightChanged = prev !== null && Number.isFinite(f.applied) && f.applied !== prev.applied;
  if (brightChanged) {
    return `parlaklık %${prev.applied} → ${pct}`;
  }
  return Number.isFinite(f.applied) ? `ölçüm yapıldı · ${pct}` : null;
}

function renderHistory(): void {
  const sig = `${S.histLines.length}|${S.histLines[0] ?? ""}|${S.stats ? S.stats.ticksToday : "-"}`;
  if (sig !== histSig) {
    histSig = sig;
    const host = el("hist-panel");
    host.replaceChildren();
    if (S.histLines.length === 0) {
      const row = document.createElement("div");
      row.textContent = "Henüz kayıt yok — birkaç dakika içinde ilk ölçüm gelir.";
      host.append(row);
    } else {
      // Değişim algılama kronolojik akış ister; satırlar yeniden eskiye gelir.
      const chrono = S.histLines.slice().reverse();
      const out: string[] = [];
      let prev: ParsedTick | null = null;
      for (const line of chrono) {
        const f = parseTickLine(line);
        if (!f) continue;
        const msg = humanizeTick(f, prev);
        if (msg !== null) out.push(`${hhmm(f.at)} · ${msg}`);
        prev = f;
      }
      for (const text of out.reverse()) {
        const row = document.createElement("div");
        row.textContent = text;
        host.append(row);
      }
    }
    drawChart(S.stats);
    // Veri yokken üç hücreye farklı metin ("—", "henüz yok") koymak tutarsız
    // duruyordu; artık üçü de "—" ve altında tek açıklama satırı var (v2.4.2).
    const ticks = S.stats?.ticksToday ?? 0;
    el("sum-changes").textContent = ticks > 0 ? String(S.stats?.themeChangesToday ?? 0) : "—";
    el("sum-avg").textContent = ticks > 0 ? `%${S.stats?.avgAppliedToday ?? 0}` : "—";
    el("sum-frozen").textContent = ticks > 0 ? String(S.stats?.frozenTicksToday ?? 0) : "—";
    el("sum-hint").hidden = ticks > 0;
  }
}

// ---------- ana render ----------

export function renderAll(): void {
  document.documentElement.dataset.anim = S.animations ? "on" : "off";
  // v2.4 (inceleme #1): animasyon anahtarı gerçek durumla eşitlenir.
  animSwitchRef?.set(S.animations);
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
  // duzeltme v2.2 (madde 8): taslak kirliyse "Kaydedilmedi" görünür.
  el("pf-dirty").hidden = !S.editorDirty;
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
  renderDesignThemes();
  initTemplate();
  renderTemplates();
  renderAudit();
  buildModeCards();
  syncThemeChips();

  tagBlock = buildTagEditor(el("block-editor"), S.blockItems, (items) => setBlockList(items));
  buildTagEditor(el("allow-editor"), S.allowItems, (items) => setAllowList(items));

  pfAutolock = bindSwitch(btnEl("pf-autolock"), S.draft.autoLock, (v) => updateDraft({ autoLock: v }));
  const animSwitch = bindSwitch(btnEl("anim-switch"), S.animations, (v) => void setAnimations(v));
  // duzeltme v2.4 (inceleme #1): anahtar bir kez bağlanıyordu, renderAll onu
  // tazelemiyordu → okuma profili kapanınca S.animations=false oluyor ama düğme
  // "açık" görünüyordu. Artık render döngüsünde gerçek durumla eşitleniyor.
  animSwitchRef = animSwitch;
  // duzeltme v2.2 (madde 6): mola hatırlatıcısı aç/kapa artık toast ile de görünür.
  bindSwitch(btnEl("break-switch"), S.breakEnabled, (v) => {
    setBreakEnabled(v);
    toast.info(v ? "Mola hatırlatıcısı açıldı" : "Mola hatırlatıcısı kapatıldı");
  });
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
  inputEl("pf-name").addEventListener("input", () => {
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

  // v2.4 (inceleme #3): setWarmPercent zaten applyWarmth çağırıyor; buradaki
  // ikinci çağrı her olayda gamma'yı iki kez yazıyordu.
  btnEl("warm-minus").addEventListener("click", () => {
    setWarmPercent(S.warmPercent - 5);
  });
  btnEl("warm-plus").addEventListener("click", () => {
    setWarmPercent(S.warmPercent + 5);
  });
  inputEl("warm-range").addEventListener("input", () => {
    setWarmPercent(Number(inputEl("warm-range").value));
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

  wireKelvin();
}

// ---------- Kelvin arayüzü (duzeltme v2.2, madde E) ----------

function kelvinName(k: number): string {
  if (k <= 2650) return "Mum";
  if (k <= 3050) return "Ampul";
  if (k <= 3800) return "Halojen";
  if (k <= 4800) return "Florasan";
  if (k <= 5800) return "Gündüz";
  return "Berrak";
}

function paintKelvin(k: number): void {
  inputEl("warm-kelvin").value = String(k);
  el("warm-kelvin-val").textContent = `${k} K`;
  el("warm-kelvin-name").textContent = kelvinName(k);
  el("warm-presets").querySelectorAll<HTMLButtonElement>(".chip").forEach((c) => {
    c.classList.toggle("active", c.dataset.k === String(k));
  });
}

let kelvinTimer = 0;
/** Sürükleme/ok tuşu oturumunun başlangıç değeri (Esc geri dönüşü için). */
let kelvinDragStart: number | null = null;

function commitKelvin(k: number): void {
  paintKelvin(k);
  void applyKelvin(k);
}

function wireKelvin(): void {
  const slider = inputEl("warm-kelvin");
  paintKelvin(S.warmKelvin);
  slider.addEventListener("pointerdown", () => {
    kelvinDragStart = Number(slider.value);
  });
  slider.addEventListener("keydown", (e) => {
    if (!(e as KeyboardEvent).key.startsWith("Arrow")) return;
    if (kelvinDragStart === null) kelvinDragStart = Number(slider.value);
  });
  slider.addEventListener("blur", () => {
    kelvinDragStart = null;
  });
  // input: etiket anında, uygulama 150 ms debounce ile.
  slider.addEventListener("input", () => {
    const k = Number(slider.value);
    paintKelvin(k);
    if (kelvinTimer) window.clearTimeout(kelvinTimer);
    kelvinTimer = window.setTimeout(() => {
      kelvinTimer = 0;
      void applyKelvin(k);
    }, 150);
  });
  // change: debounce beklenmeden kesinleşir.
  slider.addEventListener("change", () => {
    if (kelvinTimer) {
      window.clearTimeout(kelvinTimer);
      kelvinTimer = 0;
    }
    commitKelvin(Number(slider.value));
  });
  el("warm-presets").querySelectorAll<HTMLButtonElement>(".chip").forEach((c) => {
    c.addEventListener("click", () => {
      kelvinDragStart = null;
      commitKelvin(Number(c.dataset.k));
    });
  });
  el("warm-reset").addEventListener("click", () => {
    kelvinDragStart = null;
    commitKelvin(6500);
  });
  // Esc: sıcaklık kaydırıcısı odaktayken oturum başındaki değere döner.
  document.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key !== "Escape") return;
    if (document.activeElement !== slider || kelvinDragStart === null) return;
    const k = kelvinDragStart;
    kelvinDragStart = null;
    if (kelvinTimer) {
      window.clearTimeout(kelvinTimer);
      kelvinTimer = 0;
    }
    commitKelvin(k);
  });

  // v2.3 (reviewer #3): dock sekmeleri arasında ok tuşlarıyla gezinme
  // (roving tabindex'in tamamlayıcısı — WAI-ARIA tabs deseni).
  el("tab-panel").parentElement?.addEventListener("keydown", (e) => {
    const key = (e as KeyboardEvent).key;
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(key)) return;
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".dock .tab"));
    const idx = tabs.findIndex((t) => t.classList.contains("active"));
    if (idx < 0) return;
    let next = idx;
    if (key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (key === "Home") next = 0;
    else next = tabs.length - 1;
    const target = tabs[next];
    const name = target.dataset.tab;
    if (!name) return;
    e.preventDefault();
    switchTab(name);
    target.focus();
  });
}