// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/**
 * main.ts — boot + kablolama.
 *
 * Katman düzeni: `panels → orchestr ← main`. Burada yalnız DOM olaylarını
 * `orchestr` işlevlerine bağlama, açılış sırası ve zamanlayıcılar var;
 * karar mantığı `orchestr.ts`, render `panels.ts` içindedir.
 */

import { invoke } from "@tauri-apps/api/core";
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
import { initScene } from "./scene";
import { toast } from "./toast";

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
    // duzeltme v2.2 (D): güncelleme kurulumu busy → ok/hata toast'uyla görünür.
    const busy = toast.busy("Güncelleme kuruluyor…");
    pendingUpdate
      .downloadAndInstall()
      .then(() => {
        busy.done("Güncelleme kuruldu — uygulama yeniden başlıyor");
        return relaunch();
      })
      .catch((e: unknown) => {
        // busy toast'unu ok'a çevirmeden kapat (Esc üstteki toast'u kapatır).
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        toast.err("Güncelleme kurulamadı", { detail: String(e) });
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
  O.setHooks({ log: P.appendLog, render: P.renderAll, renderEditor: P.paintEditor, syncLists: P.syncListEditors });

  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((t) => {
    t.addEventListener("click", () => P.switchTab(t.dataset.tab ?? "panel"));
  });

  P.bootWidgets();
  P.wireButtons();

  // v2.9: "Günün rengi" bağlaması ERKEN yapılır. Boot'un ileriki adımları
  // (güncelleme/flyout köprüsü) hata verirse bağlama ölmesin — bir kez
  // sessizce çalışmayan özellik, hiç olmayan özellikten kötüdür.
  O.bindAutoPalette((id) => P.setDesignTheme(id, { manual: false }));
  // Açılışta açıksa hemen uygula (kullanıcı sonucu ilk bakışta görsün).
  if (O.S.autoPalette) O.applyAutoPalette(true);

  // Boş log için yönlendirme (appendLog ilk satırda bu elemanı kaldırır).
  const logEmpty = document.createElement("div");
  logEmpty.className = "log-empty";
  logEmpty.textContent = "Birkaç dakika içinde ilk ölçüm gelir.";
  el("log").append(logEmpty);

  // ---------- hızlı eylem çubuğu ----------
  el("now-btn").addEventListener("click", () => void O.tick("manuel"));
  el("pause-btn").addEventListener("click", () => O.togglePauseHour());
  // duzeltme v2.2 (madde 11): "Açık" duraklatma VE kilidi kaldırır —
  // "otomatik"e alma toast ile görünür.
  el("auto-on").addEventListener("click", () => {
    let changed = false;
    if (O.S.pauseUntil !== null) {
      O.clearPause("otomatik moda dönüldü");
      changed = true;
    }
    if (O.S.locked) {
      O.toggleLock();
      changed = true;
    }
    if (changed) toast.info("Otomatik moda alındı");
  });
  el("night-btn").addEventListener("click", () => {
    openUrl("ms-settings:nightlight").catch((e: unknown) => {
      O.log("gece ışığı açılamadı: " + String(e), "bad");
    });
  });
  // duzeltme v2.2 (E): HDR notundaki bağlantı night-btn ile aynı ayar sayfasını açar.
  el("warm-hdr-link").addEventListener("click", (e) => {
    e.preventDefault();
    openUrl("ms-settings:nightlight").catch((err: unknown) => {
      O.log("HDR ayar sayfası açılamadı: " + String(err), "bad");
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
    // duzeltme v2.2 (D): uygulama bağlama toast ile de görünür.
    toast.ok(`${exe} → ${O.S.draft.name} profiline bağlandı`);
  });

  // ---------- Geçmiş ----------
  el("hist-refresh").addEventListener("click", () => void O.loadHistory());
  el("log-clear-btn").addEventListener("click", () => {
    // duzeltme v2.2 (madde 10): window.confirm YOK — temizle + Geri al'lı toast.
    // Satırlar önce bellekte tutulur; Geri al hepsini geri yazar.
    const saved = O.S.histLines.slice();
    void O.clearLogs().then(() => {
      toast.action("Kayıtlar temizlendi", {
        action: {
          label: "Geri al",
          onAct: () => {
            const chrono = saved.slice().reverse();
            void (async () => {
              for (const line of chrono) {
                await invoke("log_tick", { line }).catch(() => undefined);
              }
              await O.loadHistory();
            })();
          },
        },
      });
    });
  });

  // ---------- ilk çizim ----------
  // v2.3: render hatası pencereyi düşürmesin. el() bilinçli olarak throw eder;
  // bir renderX patlarsa kullanıcı boş pencereyle kalıyordu (v2.3.0'daki
  // "api is not defined" çökmesinin sınıfı). Sarmala + logla, uygulama ayakta kalsın.
  const safeRender = (): void => {
    try {
      P.renderAll();
    } catch (err) {
      console.error("[smart-screen] render hatası:", err);
      try {
        P.appendLog(`arayüz hatası: ${String(err)}`, "bad");
      } catch {
        /* log kutusu da bozuksa sessiz geç */
      }
    }
  };
  P.switchTab("panel");
  safeRender();

  // v3.0: sahne şablonunun WebGL ışık katmanı. Dekoratif — WebGL yoksa
  // sessizce hiçbir şey yapmaz, CSS degradesi görünür kalır.
  try {
    const canvas = document.getElementById("hero-webgl");
    if (canvas instanceof HTMLCanvasElement) initScene(canvas);
  } catch (e) {
    O.log("sahne katmanı kurulamadı: " + String(e), "warn");
  }

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
  // v2.9: bağlama yukarıda (boot başında) yapıldı; burada yalnız saat
  // dilimi tazelemesi var.
  window.setInterval(() => {
    O.applyAutoPalette();
  }, CLOCK_MS);
  window.setInterval(() => {
    O.tickBreak();
    void O.refreshMonitorList();
    void O.tick("izle");
  }, WATCH_MS);
  window.setInterval(() => safeRender(), CLOCK_MS);
  window.addEventListener("focus", () => {
    void O.refreshMonitorList();
    if (Date.now() - O.S.lastAct > WATCH_MS) void O.tick("odak");
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - O.S.lastAct > WATCH_MS) void O.tick("odak");
  });

  // ---------- 3B paralaks (hero katmanları) ----------
  // v2.3 (reviewer #8): --mx/--my CSS'te tanımlıydı ama hiç yazılmıyordu.
  // rAF + 30fps sınırı: sürekli açık uygulamada GPU'yu boşa yormayalım.
  // prefers-reduced-motion: reduce ise hiç bağlanmaz.
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let lastParallax = 0;
  let pending: { x: number; y: number } | null = null;
  const applyParallax = (): void => {
    pending = null;
    const now = performance.now();
    if (now - lastParallax < 33) return; // ~30fps
    lastParallax = now;
    if (!pointer) return;
    document.documentElement.style.setProperty("--mx", pointer.x.toFixed(3));
    document.documentElement.style.setProperty("--my", pointer.y.toFixed(3));
  };
  let pointer: { x: number; y: number } | null = null;
  const onMove = (e: PointerEvent): void => {
    if (reduceMotion.matches) return;
    // -1..1 normalize: sahne merkezine göre
    pointer = {
      x: (e.clientX / window.innerWidth) * 2 - 1,
      y: (e.clientY / window.innerHeight) * 2 - 1,
    };
    if (pending === null) {
      pending = pointer;
      requestAnimationFrame(applyParallax);
    }
  };
  const onLeave = (): void => {
    pointer = null;
    document.documentElement.style.setProperty("--mx", "0");
    document.documentElement.style.setProperty("--my", "0");
  };
  // Dinleyiciler bir kez bağlanır; reduced-motion durumu her olayda okunur
  // (v2.3.1: kullanıcı ayarı sonradan değiştirirse restart gerekmiyordu).
  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerleave", onLeave);
  reduceMotion.addEventListener("change", () => {
    if (reduceMotion.matches) onLeave();
  });
});