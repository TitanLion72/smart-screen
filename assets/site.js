// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — site v2 tarayıcı kodu (site/v2/assets/site.js)

   Dört hareket, hepsi ürünün davranışını gösterir (süs değil):
     (a) açılış: ekran %100'den o anki parlaklığa iner
     (b) kaydırma: oda kararır (sabah → gece)
     (c) gün eğrisi çizilir, "şu an" noktası senin saatinle ilerler
     (d) geçmiş değerler bir kez sayar (62%, 4300 K)

   `prefers-reduced-motion: reduce` ise DÖRDÜ DE kapalı; içerik son hâlde
   görünür (animasyonun başlangıç karesinde donmak yok).

   Yapmadığı: ağ isteği, çerez, ölçüm, dış script. Hiçbiri yok.
   ═══════════════════════════════════════════════════════════════════ */

import { nowReading, minuteOfDay, appliedWarmth } from "./curve.js";

const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)");
const CAP = 70;

const root = document.documentElement;
const $ = (id) => document.getElementById(id);

// ── (a) açılış: ekran uyanır ────────────────────────────────────────
/**
 * Karanlık odada ekran yanar: parlaklık 0.15'ten tam değere çıkar.
 *
 * İlk sürüm tersini yapıyordu (1 → 0.38) ve ekran görüntüsü kalıcı olarak
 * gri kalıyordu: ürünün görüntüsünü "parlaklık kanıtı" uğruna boğuyordu.
 * Doğrusu: sahne karanlık başlar, ekran aydınlanır ve ORADA kalır.
 */
function openShutter() {
  const screen = $("hero-screen");
  if (!screen) return;
  const target = 1;
  const from = 0.15;
  if (REDUCE.matches) {
    screen.style.setProperty("--screen-bright", String(target));
    return;
  }
  screen.style.setProperty("--screen-bright", String(from));
  const start = performance.now();
  const dur = 900;
  const step = (t) => {
    const k = Math.min(1, (t - start) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    screen.style.setProperty("--screen-bright", String(from + (target - from) * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── (b) kaydırma: oda kararır ───────────────────────────────────────
let rafPending = false;
let maxScroll = 1;

function measure() {
  maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
}

function applyRoom() {
  rafPending = false;
  if (REDUCE.matches) {
    root.style.setProperty("--room", "1");
    return;
  }
  const k = Math.max(0, Math.min(1, window.scrollY / maxScroll));
  // Oda dibe doğru kararır; üstte sabah ışığı kalır.
  root.style.setProperty("--room", k.toFixed(3));
  const bar = $("topbar");
  if (bar) bar.classList.toggle("stuck", window.scrollY > 8);
}

function onScroll() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(applyRoom);
}

// ── (c) eğri: çizilir + "şu an" noktası ─────────────────────────────
function drawCurve() {
  const path = document.querySelector(".stops-path");
  const dot = $("stops-dot");
  if (!path || !dot) return;

  const now = new Date();
  const minute = minuteOfDay(now.getHours(), now.getMinutes());
  const value = appliedWarmth(minute, CAP);
  dot.setAttribute("cx", String((minute / 1440) * 1200));
  dot.setAttribute("cy", String(120 - (value / 100) * 112));
  dot.setAttribute("opacity", "1");

  if (REDUCE.matches || !path.getTotalLength) return;
  const len = path.getTotalLength();
  if (!len) return;
  path.style.strokeDasharray = String(len);
  path.style.strokeDashoffset = String(len);
  path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
    duration: 900,
    easing: "cubic-bezier(.22,.61,.36,1)",
    fill: "forwards",
  });
}

// ── (d) sayı sayması ────────────────────────────────────────────────
function countUp(el, to, suffix = "", dur = 700) {
  if (REDUCE.matches) {
    el.textContent = `${to.toLocaleString("tr-TR")}${suffix}`;
    return;
  }
  const start = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - start) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    const v = Math.round(to * e);
    el.textContent = `${v.toLocaleString("tr-TR")}${suffix}`;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function animateNumbers() {
  const items = Array.from(document.querySelectorAll("[data-count]"));
  if (items.length === 0) return;

  const finalText = (el) => {
    // JS'siz hâl zaten doğru metni taşıyor; son hâl = onun kopyası.
    if (!el.dataset.final) el.dataset.final = el.textContent.trim();
    return el.dataset.final;
  };

  if (REDUCE.matches || !("IntersectionObserver" in window)) {
    for (const el of items) el.textContent = finalText(el);
    return;
  }

  const run = (el) => {
    if (el.dataset.done === "1") return;
    el.dataset.done = "1";
    const to = Number(el.dataset.count);
    const final = finalText(el);
    const dec = Number(el.dataset.decimal || 0);
    const suffix = el.dataset.suffix || "";
    const space = el.dataset.space === "1" ? " " : "";
    const start = performance.now();
    const dur = 620;
    const step = (t) => {
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const v = to * e;
      el.textContent =
        dec > 0
          ? `${v.toFixed(dec).replace(".", ",")}${suffix}`
          : `${Math.round(v).toLocaleString("tr-TR")}${space}${suffix}`.trim();
      if (k < 1) requestAnimationFrame(step);
      else el.textContent = final;
    };
    requestAnimationFrame(step);
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const ent of entries) {
        if (ent.isIntersecting) {
          run(ent.target);
          io.unobserve(ent.target);
        }
      }
    },
    { threshold: 0.6 },
  );
  for (const el of items) io.observe(el);
}

// ── hero okuması: gerçek saat ───────────────────────────────────────
function paintReadout() {
  const now = new Date();
  const minute = minuteOfDay(now.getHours(), now.getMinutes());
  const r = nowReading(minute, CAP);
  const lang = root.lang === "en" ? "en-GB" : "tr-TR";

  const t = $("now-time");
  const w = $("now-warmth");
  const k = $("now-kelvin");
  if (t) t.textContent = now.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
  if (w) w.textContent = `%${r.applied}`;
  if (k) k.textContent = `${r.kelvin} K`;

  // "şu an" durağı gerçek saate taşınır: sayfa hangi saatte açılırsa açılsın
  // işaret doğru yerde durur.
  const stops = document.querySelectorAll(".stop-list .stop");
  const hours = [6, 12, 18, 23];
  let idx = 3;
  for (let i = 0; i < hours.length; i++) {
    if (now.getHours() >= hours[i]) idx = i;
  }
  stops.forEach((s, i) => s.classList.toggle("now", i === idx));
}

// ── başlat ──────────────────────────────────────────────────────────
function boot() {
  measure();
  openShutter();
  paintReadout();
  drawCurve();
  applyRoom();
  animateNumbers();

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => {
    measure();
    onScroll();
  });

  // Hareket tercihi sonradan değişirse son hâle geç.
  if (REDUCE.addEventListener) {
    REDUCE.addEventListener("change", () => {
      openShutter();
      applyRoom();
    });
  }

  // Saat ilerlesin (sayfa açık kalırsa okuma bayatlamasın).
  window.setInterval(paintReadout, 60_000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
