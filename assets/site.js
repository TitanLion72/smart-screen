// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — tanıtım sitesi tarayıcı kodu (site/assets/site.js)

   Yaptığı üç şey:
     1) Kaydırırken sayfanın faz rengini komşu bölümlere göre karıştır.
     2) Hero'daki eğriyi çiz ve ziyaretçinin saatinı işaretle.
     3) "Şu an" okumasını gerçek formülle yaz (curve.js = curve.mjs).

   Yapmadığı: ağ isteği, çerez, ölçüm, dış script. Hiçbiri yok.

   `prefers-reduced-motion: reduce` ise renk geçişi ve çizim YAPILMAZ:
   fazlar keskin kalır (CSS `data-phase` yeterli), eğri statik çizilir.
   ═══════════════════════════════════════════════════════════════════ */

import { curvePoints, nowReading, minuteOfDay } from "./curve.js";
import { parseHex, toHex, phaseWeights, nearestPhase, mixWeighted } from "./phase-math.js";

const CAP = 70;
const VARS = ["--bg", "--text", "--muted", "--accent", "--on-accent"];
const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Faz kimliği → renkler (faz CSS'i `:root[data-phase]` ile aynı kaynaktan). */
function phaseColors() {
  const sheet = Array.from(document.querySelectorAll("style")).find((s) =>
    (s.textContent || "").includes(":root[data-phase"),
  );
  const css = sheet ? sheet.textContent || "" : "";
  const out = {};
  const blockRe = /:root\[data-phase="([a-z]+)"\]\{([^}]*)\}/g;
  let m;
  while ((m = blockRe.exec(css))) {
    const [, id, body] = m;
    const colors = {};
    for (const pair of body.split(";")) {
      const [k, v] = pair.split(":");
      if (!k || !v) continue;
      if (VARS.includes(k.trim())) colors[k.trim()] = v.trim();
    }
    out[id] = colors;
  }
  return out;
}

const COLORS = phaseColors();
const PHASE_IDS = Object.keys(COLORS);

function setPhaseRoot(id) {
  if (!id) return;
  if (document.documentElement.dataset.phase !== id) {
    document.documentElement.dataset.phase = id;
  }
}

// ---------- 1) kaydırma ile faz geçişi ----------

let sections = [];
let rafPending = false;

function measureSections() {
  sections = Array.from(document.querySelectorAll("main [data-phase]")).map((el) => ({
    top: el.getBoundingClientRect().top + window.scrollY,
    phase: el.dataset.phase,
  }));
}

function applyScrollPhase() {
  rafPending = false;
  if (sections.length === 0) return;

  // Sayfa dibinde son bölümü ortalamak için yeterince kaydırılamaz; bu yüzden
  // kapanış bölümü sürekli bir önceki fazla karışıp griye dönüyordu. Dip
  // noktasında son fazı sabitle: footer her zaman gece renginde okunur.
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  if (maxScroll > 0 && window.scrollY >= maxScroll - 2) {
    const last = sections[sections.length - 1];
    const vars = last && COLORS[last.phase];
    if (vars) {
      for (const v of VARS) {
        if (vars[v]) document.documentElement.style.setProperty(v, vars[v]);
      }
      setPhaseRoot(last.phase);
      return;
    }
  }

  const tops = sections.map((s) => s.top);
  const w = phaseWeights(window.scrollY, tops, window.innerHeight);

  // Ağırlıklar bölüm bazında; aynı faz birden çok bölümde olabilir (ör. gece).
  const byPhase = new Map();
  for (let i = 0; i < sections.length; i++) {
    const p = sections[i].phase;
    byPhase.set(p, (byPhase.get(p) ?? 0) + (w[i] ?? 0));
  }

  // Renkleri karıştır (yoksa faz CSS'ine dokunma).
  const entries = [];
  for (const [phase, weight] of byPhase) {
    const vars = COLORS[phase];
    if (!vars || !vars["--bg"] || weight <= 0) continue;
    entries.push([{ bg: parseHex(vars["--bg"]) }, weight]);
  }
  if (entries.length > 0) {
    const mixed = mixWeighted(entries.map(([o, k]) => [o.bg, k]));
    document.documentElement.style.setProperty("--bg", toHex(mixed));
  }

  // Metin/vurgu için tek faz seçmek yeterli: karışık metin rengi kontrastı bozar.
  const dominant = nearestPhase(w);
  const domPhase = dominant >= 0 ? sections[dominant]?.phase : null;
  if (domPhase && COLORS[domPhase]) {
    for (const v of VARS) {
      if (v === "--bg") continue;
      const value = COLORS[domPhase][v];
      if (value) document.documentElement.style.setProperty(v, value);
    }
    setPhaseRoot(domPhase);
  }
}

function onScroll() {
  if (REDUCE.matches) return;
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(applyScrollPhase);
}

// ---------- 2) hero eğrisi ----------

const W = 960;
const H = 220;
const PAD_BOTTOM = 10;
const Y_MAX = H - PAD_BOTTOM;

function drawCurve() {
  const path = document.getElementById("curve-path");
  if (!path) return;
  const pts = curvePoints(15).map((p) => ({
    minute: p.minute,
    // Uygulanan şiddet: hero'da kullanıcının gördüğü değer bu (tavan %70).
    value: Math.round((p.warmth * CAP) / 100),
  }));
  const all = [{ minute: 0, value: Math.round((88 * CAP) / 100) }, ...pts];
  const x = (m) => (m / 1440) * W;
  const y = (v) => Y_MAX - (v / 100) * (Y_MAX - 10);
  let d = `M ${x(all[0].minute).toFixed(1)} ${y(all[0].value).toFixed(1)}`;
  for (let i = 1; i < all.length; i++) {
    const p = all[i];
    const prev = all[i - 1];
    const cx = (x(prev.minute) + x(p.minute)) / 2;
    d += ` C ${cx.toFixed(1)} ${y(prev.value).toFixed(1)}, ${cx.toFixed(1)} ${y(p.value).toFixed(1)}, ${x(p.minute).toFixed(1)} ${y(p.value).toFixed(1)}`;
  }
  path.setAttribute("d", d);

  // Çizim animasyonu: yalnız hareket izinliyse ve tek sefer.
  if (!REDUCE.matches && path.animate) {
    const len = path.getTotalLength ? path.getTotalLength() : 0;
    if (len > 0) {
      path.style.strokeDasharray = String(len);
      path.style.strokeDashoffset = String(len);
      path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
        duration: 600,
        easing: "ease-out",
        fill: "forwards",
      });
    }
  }
}

function drawNow() {
  const now = new Date();
  const minute = minuteOfDay(now.getHours(), now.getMinutes());
  const r = nowReading(minute, CAP);

  const timeEl = document.getElementById("now-time");
  const warmEl = document.getElementById("now-warmth");
  const kelEl = document.getElementById("now-kelvin");
  const lang = document.documentElement.lang === "en" ? "en-GB" : "tr-TR";
  if (timeEl) {
    timeEl.textContent = now.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
  }
  if (warmEl) warmEl.textContent = `%${r.applied}`;
  if (kelEl) kelEl.textContent = `${r.kelvin} K`;

  const line = document.getElementById("curve-now");
  const dot = document.getElementById("curve-dot");
  const x = (minute / 1440) * W;
  const y = Y_MAX - (r.applied / 100) * (Y_MAX - 10);
  if (line) {
    line.setAttribute("x1", String(x));
    line.setAttribute("x2", String(x));
    line.setAttribute("opacity", "1");
  }
  if (dot) {
    dot.setAttribute("cx", String(x));
    dot.setAttribute("cy", String(y));
    dot.setAttribute("opacity", "1");
  }
}

// ---------- başlat ----------

function boot() {
  drawCurve();
  drawNow();
  measureSections();
  if (!REDUCE.matches) applyScrollPhase();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => {
    measureSections();
    onScroll();
  });

  // reduced-motion sonradan değişirse: renkleri sıfırla, keskin fazlara dön.
  const onPref = () => {
    if (REDUCE.matches) {
      for (const v of VARS) document.documentElement.style.removeProperty(v);
      delete document.documentElement.dataset.phase;
    } else {
      measureSections();
      applyScrollPhase();
    }
  };
  if (REDUCE.addEventListener) REDUCE.addEventListener("change", onPref);

  // Saat güncellensin (sayfa açık kalırsa okuma bayatlamasın).
  window.setInterval(drawNow, 60_000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
