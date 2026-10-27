// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/**
 * toast.ts — framework'süz bildirim katmanı.
 *
 * Kendi kendine mount olur: #toast-host yoksa oluşturur (index.html'de
 * vardır). Yeni toast her zaman ÜSTTE; ekranda en fazla 3 görünür, fazlası
 * kuyrukta sıraya girer. Süre: ok/info 4000 ms, err 6000 ms, action süresiz;
 * busy döner simgeyle bekler, done() ile ok'a döner.
 *
 * Erişilebilirlik: ok/info → role="status" aria-live="polite", err →
 * role="alert". Otomatik kapanış odak taşımaz. Hover/focus'ta sayaç durur,
 * kalan süreyle devam eder. × ve Esc kapatır. Aksiyon düğmesi Tab ile
 * erişilebilir. Hareket/renk tercihleri src/toast.css'te karşılanır.
 */

export type ToastOpts = {
  detail?: string;
  ms?: number;
  action?: { label: string; onAct: () => void };
};

const DEFAULT_MS: Record<"ok" | "info" | "err", number> = {
  ok: 4000,
  info: 4000,
  err: 6000,
};

// Küçük pencerede (800x600) üç toast, içeriğin ~%30'unu kapatıyordu →
// ikiden fazlası kuyruğa girer, ekran nefes alır.
const MAX_VISIBLE = 2;

/**
 * v2.6: DOM'u kilitleyen toast.
 *
 * Kural (HANDOFF v2.2): hover/focus sayacı durdurur (WCAG 2.2.1). Ama toast
 * kalıcı bir düğmenin üstüne denk gelirse kullanıcı fareyi oradan geçirmeden
 * tıklayamıyor, sayaç hiç işlemiyor → düğme süresiz kilitleniyordu (QA'da
 * `#pf-save` tam olarak böyle 30 sn boyunca tıklanamadı). Bu yüzden duraklama
 * artık SINIRSIZ değil: en fazla bu kadar sonra toast kapanır.
 */
const MAX_PAUSE_MS = 12_000;

type Tone = "ok" | "info" | "err" | "busy";

interface Live {
  root: HTMLDivElement;
  msgEl: HTMLElement;
  remain: number;
  deadline: number;
  timer: number | null;
  /** Hover/focus duraklatmasının sınırsız kalmaması için bekçi zamanlayıcı. */
  pauseGuard: number | null;
  paused: boolean;
  indefinite: boolean;
  mounted: boolean;
  closed: boolean;
}

const ICONS: Record<"ok" | "info" | "err", string> = {
  ok: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.4 8.2l1.8 1.8 3.4-3.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  info: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 7.2v3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="5" r="0.9" fill="currentColor"/></svg>',
  err: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.8v3.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.3" r="0.9" fill="currentColor"/></svg>',
};

const visible: Live[] = [];
const waiting: Live[] = [];
let host: HTMLElement | null = null;
let escBound = false;

function ensureHost(): HTMLElement {
  if (!host || !host.isConnected) {
    host = document.getElementById("toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "toast-host";
      document.body.append(host);
    }
  }
  return host;
}

function bindEsc(): void {
  if (escBound) return;
  escBound = true;
  document.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key !== "Escape") return;
    // En üstteki (en yeni) görünür toast'u kapat.
    for (const t of visible) {
      if (!t.closed) {
        close(t);
        return;
      }
    }
  });
}

function armTimer(t: Live): void {
  if (t.indefinite || t.closed || t.paused) return;
  if (t.timer !== null) window.clearTimeout(t.timer);
  t.deadline = Date.now() + t.remain;
  t.timer = window.setTimeout(() => close(t), t.remain);
}

function pauseTimer(t: Live): void {
  if (t.indefinite || t.paused || t.closed) return;
  if (t.timer !== null) window.clearTimeout(t.timer);
  t.timer = null;
  t.remain = Math.max(0, t.deadline - Date.now());
  t.paused = true;
  // Bekçi: fare toast'ın üstünde kalsa bile bir noktadan sonra kapanır.
  if (t.pauseGuard !== null) window.clearTimeout(t.pauseGuard);
  t.pauseGuard = window.setTimeout(() => {
    t.pauseGuard = null;
    if (!t.closed) close(t);
  }, MAX_PAUSE_MS);
}

function resumeTimer(t: Live): void {
  if (t.indefinite || !t.paused || t.closed) return;
  t.paused = false;
  if (t.pauseGuard !== null) {
    window.clearTimeout(t.pauseGuard);
    t.pauseGuard = null;
  }
  armTimer(t);
}

function mount(t: Live): void {
  if (t.mounted || t.closed) return;
  t.mounted = true;
  ensureHost();
  bindEsc();
  host!.prepend(t.root); // yeni her zaman üstte
  visible.unshift(t);
  // Fazla görünür varsa en alttaki (en eski) kuyruğa iner.
  while (visible.length > MAX_VISIBLE) {
    const evicted = visible.pop()!;
    evicted.mounted = false;
    evicted.root.remove();
    if (!evicted.closed) {
      pauseTimer(evicted);
      waiting.push(evicted);
    }
  }
}

function pump(): void {
  while (waiting.length > 0 && visible.length < MAX_VISIBLE) {
    const next = waiting.shift()!;
    if (next.closed) continue;
    mount(next);
    if (!next.paused) armTimer(next);
  }
}

function close(t: Live): void {
  if (t.closed) return;
  t.closed = true;
  if (t.timer !== null) window.clearTimeout(t.timer);
  if (t.pauseGuard !== null) window.clearTimeout(t.pauseGuard);
  const wasVisible = visible.includes(t);
  const idx = visible.indexOf(t);
  if (idx >= 0) visible.splice(idx, 1);
  const widx = waiting.indexOf(t);
  if (widx >= 0) waiting.splice(widx, 1);
  const finish = (): void => {
    t.root.remove();
    if (wasVisible) pump();
  };
  // Çıkış animasyonu: transform/opacity, 130 ms (toast.css).
  t.root.classList.add("toast-out");
  let done = false;
  t.root.addEventListener("animationend", () => {
    if (done) return;
    done = true;
    finish();
  }, { once: true });
  // Animasyon olayı gelmezse (reduced-motion / off) yedek zamanlayıcı.
  window.setTimeout(() => {
    if (done) return;
    done = true;
    finish();
  }, 200);
}

function build(tone: Tone, msg: string, opts?: ToastOpts): Live {
  const root = document.createElement("div");
  root.className = "toast toast-" + tone;
  if (tone === "err") {
    root.setAttribute("role", "alert");
  } else {
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
  }

  const ic = document.createElement("span");
  ic.className = "toast-ic";
  if (tone !== "busy") ic.innerHTML = ICONS[tone];

  const msgEl = document.createElement("div");
  msgEl.className = "toast-msg";
  msgEl.textContent = msg;
  if (opts?.detail) {
    const d = document.createElement("span");
    d.className = "toast-detail";
    d.textContent = opts.detail;
    msgEl.append(d);
  }
  // Tam metin title'da: 2 satırda kesilse bile okunur.
  root.title = opts?.detail ? `${msg} — ${opts.detail}` : msg;

  root.append(ic, msgEl);

  if (opts?.action) {
    const act = document.createElement("button");
    act.type = "button";
    act.className = "toast-act";
    act.textContent = opts.action.label;
    act.addEventListener("click", () => {
      try {
        opts.action!.onAct();
      } finally {
        close(live);
      }
    });
    root.append(act);
  }

  const x = document.createElement("button");
  x.type = "button";
  x.className = "toast-x";
  x.setAttribute("aria-label", "Bildirimi kapat");
  x.textContent = "×";
  x.addEventListener("click", () => close(live));
  root.append(x);

  const live: Live = {
    root,
    msgEl,
    remain: 0,
    deadline: 0,
    timer: null,
    pauseGuard: null,
    paused: false,
    indefinite: tone === "busy" || Boolean(opts?.action),
    mounted: false,
    closed: false,
  };

  // Hover/focus: sayaç durur, kalan süreyle devam eder.
  root.addEventListener("pointerenter", () => pauseTimer(live));
  root.addEventListener("pointerleave", () => resumeTimer(live));
  root.addEventListener("focusin", () => pauseTimer(live));
  root.addEventListener("focusout", () => resumeTimer(live));

  return live;
}

function show(tone: "ok" | "info" | "err", msg: string, opts?: ToastOpts): void {
  const live = build(tone, msg, opts);
  live.remain = opts?.ms ?? DEFAULT_MS[tone];
  mount(live);
  armTimer(live);
}

export const toast = {
  ok(msg: string, opts?: ToastOpts): void {
    show("ok", msg, opts);
  },
  info(msg: string, opts?: ToastOpts): void {
    show("info", msg, opts);
  },
  err(msg: string, opts?: ToastOpts): void {
    show("err", msg, opts);
  },
  action(msg: string, opts: ToastOpts & { action: { label: string; onAct: () => void } }): void {
    show("info", msg, opts);
  },
  busy(msg: string): { done(doneMsg?: string): void } {
    const live = build("busy", msg);
    mount(live); // süresiz: sayaç kurulmaz
    return {
      done(doneMsg?: string): void {
        if (live.closed) return;
        // busy → ok: sınıf, simge ve metin değişir, 4000 ms sayaç başlar.
        live.root.classList.remove("toast-busy");
        live.root.classList.add("toast-ok");
        const ic = live.root.querySelector(".toast-ic");
        if (ic) ic.innerHTML = ICONS.ok;
        if (doneMsg !== undefined) {
          live.msgEl.textContent = doneMsg;
          live.root.title = doneMsg;
        }
        live.indefinite = false;
        live.remain = DEFAULT_MS.ok;
        armTimer(live);
      },
    };
  },
};

export default toast;
