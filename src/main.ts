/**
 * main.ts — boot + kablolama.
 *
 * Katman düzeni: `panels → orchestr ← main`. Burada yalnız DOM olaylarını
 * `orchestr` işlevlerine bağlama, açılış sırası ve zamanlayıcılar var;
 * karar mantığı `orchestr.ts`, render `panels.ts` içindedir.
 */

import { getVersion } from "@tauri-apps/api/app";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { openUrl } from "@tauri-apps/plugin-opener";
import * as O from "./orchestr";
import * as P from "./panels";

const WATCH_MS = 60 * 1000;
/** Canlı saat + gün şeridi imleci: tur dışında hafif tazeleme. */
const CLOCK_MS = 30 * 1000;

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error("eksik element: " + id);
  return node;
}

function inputEl(id: string): HTMLInputElement {
  return el(id) as HTMLInputElement;
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
    })
    .catch(() => undefined);

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