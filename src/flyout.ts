// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ════════════════════════════════════════════════════════════════════
   smart-screen — tray flyout kablosu (src/flyout.ts)
   ════════════════════════════════════════════════════════════════════
   BACKEND SÖZLEŞMESİ (backend ajanı bu komut/olayları sağlar):
   - invoke("brightness_get") -> number (0-100)
   - invoke("brightness_set", { value: number })
   - invoke("hdr_status") -> boolean (kendi cihazın HDR'ı; başarısızsa
     #fx-hdr kalıcı gizli, hata gösterilmez)
   - getVersion() -> string (opsiyonel; yoksa sabit "v3.0.0")
   - invoke("flyout_hide") -> pencereyi backend gizler (UI kendini gizlemez)
   - emit("ss:action", { action })  action ∈ measure | pause-1h |
     day-off | lock | open-main
   - listen("ss:state") -> { brightness, theme, mode, pausedUntil,
     licensed, hdr, locked?, dayOff?, target? | targetPct?,
     template?, designTheme? }
     v2.7: `template` (bento|sahne|dergi|konsol) ve `designTheme` (7 palet)
     flyout'un görünümünü ana pencereyle eşitler. Alan yoksa flyout
     diskteki `ss:template` / `ss:designTheme` değerini kullanır.
     pausedUntil epoch ms kabul edilir; saniye (≤1e12) ve ISO string de
     çözülür. locked/dayOff/target yoksa o alanlar güncellenmez.
   Slider sürüklenirken (document.activeElement === slider) ss:state
   yalnız yüzde metnini yazar; slider konumunu ezmez.
   ════════════════════════════════════════════════════════════════════ */

import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { emit, listen } from "@tauri-apps/api/event";
import { toast } from "./toast";
import { DEFAULT_DESIGN_THEME, DEFAULT_TEMPLATE, DESIGN_THEMES, TEMPLATES } from "./catalog";

type SsState = {
  brightness?: number | null;
  theme?: string | null;
  mode?: string | null;
  pausedUntil?: number | string | null;
  licensed?: boolean | null;
  hdr?: boolean | null;
  locked?: boolean | null;
  dayOff?: boolean | null;
  target?: number | null;
  targetPct?: number | null;
  /** v2.7: ana pencerenin görünüm eksenleri (`<html data-…>`). */
  template?: string | null;
  designTheme?: string | null;
};

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`eksik id: #${id}`);
  return node as T;
}

const brightEl = el<HTMLElement>("fx-bright");
const brightSub = el<HTMLElement>("fx-bright-sub");
const slider = el<HTMLInputElement>("fx-slider");
const modeBadge = el<HTMLElement>("fx-mode");
const dotEl = el<HTMLElement>("fx-dot");
const pauseBtn = el<HTMLButtonElement>("fx-pause");
const dayOffBtn = el<HTMLButtonElement>("fx-dayoff");
const lockBtn = el<HTMLButtonElement>("fx-lock");
const hdrEl = el<HTMLElement>("fx-hdr");
const versionEl = el<HTMLElement>("fx-version");

/* ═══════════════ Görünüm eksenleri (v2.7) ═══════════════
   Flyout, ana pencereyle AYNI ayarı giyer: `ss:template` + `ss:designTheme`.
   İki pencere aynı origin'de yaşadığı için localStorage ortaktır; yine de
   `ss:state` bu alanları taşır (ana pencere ayarı değiştirince anında). */

const TEMPLATE_IDS = new Set(TEMPLATES.map((t) => t.id));
const PALETTE_IDS = new Set(DESIGN_THEMES.map((t) => t.id));

function readSetting(key: string): string | null {
  try {
    return localStorage.getItem("ss:" + key);
  } catch {
    return null;
  }
}

function applyTemplate(id: string | null | undefined): void {
  document.documentElement.dataset.template = id && TEMPLATE_IDS.has(id) ? id : DEFAULT_TEMPLATE;
}

function applyPalette(id: string | null | undefined): void {
  document.documentElement.dataset.theme = id && PALETTE_IDS.has(id) ? id : DEFAULT_DESIGN_THEME;
}

/** Diskten (ortak localStorage) tazele — pencere her açıldığında çağrılır. */
function syncLivery(): void {
  applyTemplate(readSetting("template") ?? DEFAULT_TEMPLATE);
  applyPalette(readSetting("designTheme") ?? DEFAULT_DESIGN_THEME);
}

let committed = 0; // son BAŞARILI brightness_set değeri (geri dönüş tabanı)
let pausedUntil = 0; // epoch ms; 0 = duraklatma yok
let lastErr = "";
let errTimer = 0;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

const pctText = (v: number): string => `%${Math.round(v)}`;

function setBrightText(v: number): void {
  brightEl.textContent = pctText(v);
}

/** duzeltme v2.2 (F): yazma hataları artık toast.err ile görünür; aynı hata
 *  3 sn içinde tekrar toast olmaz (spam koruması). */
function showError(msg: string): void {
  if (msg === lastErr && errTimer) return;
  lastErr = msg;
  if (errTimer) window.clearTimeout(errTimer);
  errTimer = window.setTimeout(() => {
    errTimer = 0;
  }, 3000);
  toast.err("Ayar yazılamadı", { detail: msg });
}

function modeLabel(mode: string | null | undefined): string {
  const m = (mode ?? "").trim().toLowerCase();
  if (m === "auto" || m === "smart" || m === "akıllı" || m === "akilli") return "Oto";
  if (m === "light" || m === "lux" || m === "ışık" || m === "isik") return "Işık";
  if (m === "time" || m === "clock" || m === "saat") return "Saat";
  if (m === "fixed" || m === "manual" || m === "sabit") return "Sabit";
  return m ? String(mode) : "Oto";
}

function toEpochMs(raw: number | string | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return raw > 1e12 ? raw : raw * 1000; // ≤1e12 → saniye kabul edilir
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setToggle(btn: HTMLButtonElement, on: boolean): void {
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.classList.toggle("active", on);
}

function updatePauseButton(): void {
  const leftMs = pausedUntil - Date.now();
  if (leftMs > 0) {
    const mins = Math.max(1, Math.ceil(leftMs / 60000));
    // duzeltme v2.2 (F): etkinken "Devam et", değilken "Duraklat (1 saat)".
    pauseBtn.textContent = `Devam et (${mins} dk)`;
    setToggle(pauseBtn, true);
  } else {
    pauseBtn.textContent = "Duraklat (1 saat)";
    setToggle(pauseBtn, false);
  }
}

/** Tek yazma yolu: görsel anında güncellenir, hata olursa eski değere dönülür. */
async function commitBrightness(value: number): Promise<void> {
  const prev = committed;
  const next = clamp(Math.round(value), 0, 100);
  slider.value = String(next);
  setBrightText(next);
  try {
    await invoke("brightness_set", { value: next });
    committed = next;
    // duzeltme (md.9): ana pencereye de haber ver — sonraki ss:state/ini
    // render slider'ı (hem flyout hem ana durum) eski değere çekmesin.
    sendAction("brightness-set", next);
  } catch (err) {
    slider.value = String(prev);
    setBrightText(prev);
    showError(String(err));
  }
}

function sendAction(action: string, value?: number): void {
  const payload =
    typeof value === "number" ? { action, value: Math.round(value) } : { action };
  void emit("ss:action", payload).catch((err) => showError(String(err)));
}

function hideFlyout(): void {
  void invoke("flyout_hide").catch((err) => showError(String(err)));
}

function applyState(s: SsState): void {
  if (typeof s.brightness === "number" && Number.isFinite(s.brightness)) {
    const v = clamp(Math.round(s.brightness), 0, 100);
    if (document.activeElement === slider) {
      // kullanıcı sürüklerken yalnız yüzde metni; slider konumu ezilmez
      setBrightText(v);
    } else {
      slider.value = String(v);
      committed = v;
      setBrightText(v);
    }
  }
  if (s.theme !== undefined) dotEl.title = s.theme ?? "";
  if (s.mode !== undefined && s.mode !== null) {
    modeBadge.textContent = modeLabel(s.mode);
  }
  if (s.pausedUntil !== undefined) {
    pausedUntil = toEpochMs(s.pausedUntil);
    updatePauseButton();
  }
  if (typeof s.locked === "boolean") setToggle(lockBtn, s.locked);
  if (typeof s.dayOff === "boolean") setToggle(dayOffBtn, s.dayOff);
  if (typeof s.hdr === "boolean") hdrEl.hidden = !s.hdr;
  // Görünüm: alan varsa uygula (yoksa diskteki değer korunur).
  if (s.template !== undefined && s.template !== null) applyTemplate(s.template);
  if (s.designTheme !== undefined && s.designTheme !== null) applyPalette(s.designTheme);

  const target =
    typeof s.target === "number"
      ? s.target
      : typeof s.targetPct === "number"
        ? s.targetPct
        : null;
  brightSub.textContent =
    target === null ? "ulaşılmak istenen değer yok" : `ulaşılmak istenen ${pctText(target)}`;

  if (typeof s.licensed === "boolean") {
    document.documentElement.dataset.licensed = s.licensed ? "1" : "0";
  }
}

/* ═══════════════ Kablolama ═══════════════ */

slider.addEventListener("input", () => setBrightText(Number(slider.value)));
slider.addEventListener("change", () => void commitBrightness(Number(slider.value)));

el<HTMLButtonElement>("fx-minus").addEventListener("click", () =>
  void commitBrightness(Number(slider.value) - 10),
);
el<HTMLButtonElement>("fx-plus").addEventListener("click", () =>
  void commitBrightness(Number(slider.value) + 10),
);

el<HTMLButtonElement>("fx-measure").addEventListener("click", () => {
  sendAction("measure");
  hideFlyout();
});
pauseBtn.addEventListener("click", () => sendAction("pause-1h"));
dayOffBtn.addEventListener("click", () => sendAction("day-off"));
lockBtn.addEventListener("click", () => sendAction("lock"));

el<HTMLButtonElement>("fx-settings").addEventListener("click", () => {
  sendAction("open-main");
  hideFlyout();
});
el<HTMLButtonElement>("fx-close").addEventListener("click", hideFlyout);

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    ev.preventDefault();
    hideFlyout();
  }
});

/* ═══════════════ Açılış ═══════════════ */

async function boot(): Promise<void> {
  try {
    const v = await invoke<number>("brightness_get");
    if (typeof v === "number" && Number.isFinite(v)) {
      committed = clamp(Math.round(v), 0, 100);
      slider.value = String(committed);
      setBrightText(committed);
    }
  } catch (err) {
    showError(String(err));
  }
}

// HDR: başarısızsa sessizce gizli kalır (sözleşme gereği hata gösterilmez)
void invoke<boolean>("hdr_status")
  .then((on) => {
    hdrEl.hidden = on !== true;
  })
  .catch(() => {
    hdrEl.hidden = true;
  });

// Sürüm: getVersion() yoksa sabit yedek
void getVersion()
  .then((v) => {
    const s = String(v ?? "").trim();
    versionEl.textContent = s ? (s.startsWith("v") ? s : `v${s}`) : "v3.0.0";
  })
  .catch(() => {
    versionEl.textContent = "v3.0.0";
  });

void listen<SsState>("ss:state", (ev) => applyState(ev.payload)).catch((err) =>
  showError(String(err)),
);

/* Pencere her gösterildiğinde ayarları tazele: kullanıcı ana pencerede
   şablonu değiştirip flyout'u açtığında eski görünüm kalmasın. `focus`
   flyout gösterilirken backend tarafından odaklanınca tetiklenir. */
window.addEventListener("focus", syncLivery);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncLivery();
});
syncLivery();

brightSub.textContent = "ulaşılmak istenen değer yok";
updatePauseButton();
void boot();
window.setInterval(updatePauseButton, 30_000); // kalan dakika etiketi tazelenir