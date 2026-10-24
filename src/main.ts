// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/**
 * main.ts — boot + kablolama.
 *
 * Katman düzeni: `panels → orchestr ← main`. Burada yalnız DOM olaylarını
 * `orchestr` işlevlerine bağlama, açılış sırası ve zamanlayıcılar var;
 * karar mantığı `orchestr.ts`, render `panels.ts` içindedir.
 */

import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import type { Update } from "@tauri-apps/plugin-updater";
import * as O from "./orchestr";
import * as P from "./panels";

const WATCH_MS = 60 * 1000;
/** Canlı saat + gün şeridi imleci: tur dışında hafif tazeleme. */
const CLOCK_MS = 30 * 1000;
/** İlk güncelleme kontrolü açılıştan 10 sn sonra, sonra 24 saatte bir. */
const UPDATE_FIRST_MS = 10 * 1000;
const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_SNOOZE_KEY = "ss:updateSnoozeUntil";
const SOURCE_URL = "https://github.com/TitanLion72/smart-screen";

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

// ---------- güncelleme akışı ----------

function readSnooze(): number {
  try {
    return Number(localStorage.getItem(UPDATE_SNOOZE_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function writeSnooze(until: number): void {
  try {
    localStorage.setItem(UPDATE_SNOOZE_KEY, String(until));
  } catch {
    /* storage yoksa erteleme yalnız bu oturumda geçerli kalır */
  }
}

let pendingUpdate: Update | null = null;
let updateBusy = false;

/** check() QA stub'ında null döner: güncelleme yok sayılır. */
async function runUpdateCheck(): Promise<void> {
  try {
    // duzeltme (md.4): kontrol zamanlayıcısı ertelemeden bağımsızdır — her
    // 24 saatte bir kontrol EDİLİR; snooze yalnız bandın gösterilmesini
    // bastırır. Eskiden snooze 24 sn + kontrol 24 sn iç içe olduğundan bant
    // ~48 saat sonra dönüyordu.
    const snoozed = Date.now() < readSnooze();
    let update: Update | null = null;
    try {
      update = await check();
    } catch (e) {
      // Başarısız kontrol sessiz spam yapmaz: tek satır log.
      O.log("güncelleme kontrolü yapılamadı: " + String(e), "warn");
      return;
    }
    if (!update) return;
    if (snoozed) {
      // duzeltme (md.4): erteleme aktifken bant gösterilmez; sonraki
      // zamanlanmış kontrol snooze bitişinden sonraysa değeri gösterir.
      pendingUpdate = update;
      return;
    }
    pendingUpdate = update;
    el("update-text").textContent = `v${update.version} hazır — şimdi kur?`;
    el("update-band").hidden = false;
  } finally {
    window.setTimeout(() => void runUpdateCheck(), UPDATE_INTERVAL_MS);
  }
}

function wireUpdater(): void {
  btnEl("update-install").addEventListener("click", () => {
    if (!pendingUpdate || updateBusy) return;
    updateBusy = true;
    const btn = btnEl("update-install");
    btn.disabled = true;
    btn.textContent = "Kuruluyor…";
    pendingUpdate
      .downloadAndInstall()
      .then(() => relaunch())
      .catch((e: unknown) => {
        O.log("güncelleme kurulamadı: " + String(e), "bad");
        el("update-text").textContent = "Güncelleme kurulamadı — başka bir zaman tekrar denenecek.";
        btn.disabled = false;
        btn.textContent = "Şimdi kur";
        updateBusy = false;
      });
  });
  btnEl("update-later").addEventListener("click", () => {
    el("update-band").hidden = true;
    writeSnooze(Date.now() + UPDATE_INTERVAL_MS);
  });
  window.setTimeout(() => void runUpdateCheck(), UPDATE_FIRST_MS);
}

// ---------- flyout olay köprüsü ----------

function wireFlyoutBridge(): void {
  const mainWin = getCurrentWindow();
  void listen<{ action: string; value?: number }>("ss:action", (ev) => {
    const action = ev.payload?.action;
    if (action === "measure") {
      void O.tick("flyout");
    } else if (action === "pause-1h") {
      O.togglePauseHour();
    } else if (action === "day-off") {
      O.toggleDayOff();
    } else if (action === "lock") {
      O.toggleLock();
    } else if (action === "brightness-set") {
      // duzeltme (md.9): flyout slider'ının yazdığı değer ana duruma işlenir;
      // bir sonraki ss:state/ini render slider'ı eski değere geri çekmesin.
      if (typeof ev.payload?.value === "number") {
        O.noteExternalBrightness(ev.payload.value);
      }
    } else if (action === "open-main") {
      void mainWin
        .show()
        .then(() => mainWin.setFocus())
        .catch((e: unknown) => O.log("ana pencere açılamadı: " + String(e), "bad"));
    }
  }).catch((e: unknown) => {
    O.log("ss:action dinleyicisi kurulamadı: " + String(e), "warn");
  });
}

window.addEventListener("DOMContentLoaded", () => {
  // DOM'un tek yazıcısı panels; karar motoru yalnız bu kanallardan görünür.
  O.setHooks({ log: P.appendLog, render: P.renderAll, renderEditor: P.paintEditor });

  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((t) => {
    t.addEventListener("click", () => P.switchTab(t.dataset.tab ?? "panel"));
  });

  P.bootWidgets();
  P.wireButtons();

  // Boş log için yönlendirme (appendLog ilk satırda bu elemanı kaldırır).
  const logEmpty = document.createElement("div");
  logEmpty.className = "log-empty";
  logEmpty.textContent = "İlk ölçüm birkaç dakika içinde düşer.";
  el("log").append(logEmpty);

  // ---------- hızlı eylem çubuğu ----------
  el("now-btn").addEventListener("click", () => void O.tick("manuel"));
  el("pause-btn").addEventListener("click", () => O.togglePauseHour());
  el("night-btn").addEventListener("click", () => {
    openUrl("ms-settings:nightlight").catch((e: unknown) => {
      O.log("gece ışığı açılamadı: " + String(e), "bad");
    });
  });

  // ---------- Ritim: gece koruması ----------
  for (const [id, key] of [
    ["sleep-start", "sleepStart"],
    ["sleep-end", "sleepEnd"],
    ["sleep-cap", "sleepCap"],
  ] as const) {
    inputEl(id).addEventListener("change", (e) => {
      const v = Number((e.target as HTMLInputElement).value) || 0;
      O.setSleep(key, v);
    });
  }

  // ---------- uygulama listeleri ----------
  el("add-current-btn").addEventListener("click", async () => {
    const exe = await O.foregroundExe();
    if (!exe) {
      O.log("ön plandaki uygulama okunamadı", "warn");
      return;
    }
    P.addBlockedExe(exe);
    O.log(`eklendi: ${exe}`, "ok");
  });
  el("pf-bind-current").addEventListener("click", async () => {
    const exe = await O.foregroundExe();
    if (!exe) {
      O.log("ön plandaki uygulama okunamadı", "warn");
      return;
    }
    P.addAppExe(exe);
    O.log(`bağlandı: ${exe} → ${O.S.draft.name} (Kaydet ile kalıcı olur)`, "ok");
  });

  // ---------- Geçmiş ----------
  el("hist-refresh").addEventListener("click", () => void O.loadHistory());
  el("log-clear-btn").addEventListener("click", () => {
    if (!window.confirm("Kayıtlar temizlensin mi?")) return;
    void O.clearLogs();
  });

  // ---------- ilk çizim ----------
  P.switchTab("panel");
  P.renderAll();

  getVersion()
    .then((v) => {
      el("app-ver").textContent = v;
      el("about-version").textContent = v;
    })
    .catch(() => undefined);

  el("about-source").addEventListener("click", () => {
    openUrl(SOURCE_URL).catch((e: unknown) => {
      O.log("kaynak kodu sayfası açılamadı: " + String(e), "bad");
    });
  });

  wireUpdater();
  wireFlyoutBridge();

  isPermissionGranted()
    .then(async (granted) => granted || (await requestPermission()) === "granted")
    .then((ok) => {
      O.S.notifyReady = ok;
    })
    .catch(() => {
      O.S.notifyReady = false;
    });

  // ---------- açılış sırası ----------
  void O.loadAudit();
  void O.showCalibration();
  void O.applyWarmth();
  void O.initMonitors().then(() => {
    void O.refreshMonitorList();
  });
  void O.refreshLicense().finally(() => {
    // Ilk tur lisans durumundan SONRA kossun: Pro kullanicinin ilk turda
    // harici monitör yazmasi atlanmasin.
    void O.tick("açılış");
  });

  // ---------- zamanlayıcılar ----------
  window.setInterval(() => {
    O.tickBreak();
    void O.refreshMonitorList();
    void O.tick("izle");
  }, WATCH_MS);
  window.setInterval(() => P.renderAll(), CLOCK_MS);
  window.addEventListener("focus", () => {
    void O.refreshMonitorList();
    if (Date.now() - O.S.lastAct > WATCH_MS) void O.tick("odak");
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - O.S.lastAct > WATCH_MS) void O.tick("odak");
  });
});