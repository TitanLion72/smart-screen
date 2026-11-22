// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — tanıtım sitesi v2 şablonu (site/v2/template.mjs)

   DOM yok, saf string. İki dil aynı iskeleti giyer.

   BİLİNÇLİ OLARAK YOK: eyebrow etiketi, mono veri etiketi, `·` meta
   satırı, numaralı işaret (01/02/03 — içerik sıra değil).

   Sınıf sözleşmesi (CSS + denetleyici ile):
     .topbar .brand .nav .lang .btn .ver
     .hero .hero-in .lead .hero-actions .trust .stage .screen .screen-note
     .stops .stops-head .stop-list .stop .now
     .gallery .shot-grid .shot .wide
     .bounds .bound-cols .touch .untouch
     .features .feature-list .feature
     .facts .fact-rows .fact-row
     .plans .plan-cols .plan .pro .plan-note
     .faq .qa
     .closing .foot .foot-in .foot-links
   ═══════════════════════════════════════════════════════════════════ */

import { CONTENT, DOWNLOAD_URL, REPO_URL } from "./content.mjs";
import { curvePath, nowReading, minuteOfDay } from "./curve.mjs";

const BASE = "https://titanlion72.github.io/smart-screen/";
const SITE = "smart-screen";

export function esc(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paths(lang) {
  return lang === "tr"
    ? { css: "./assets/site.css", js: "./assets/site.js", assets: "./assets/", self: "./", other: "./en/", og: "./og.png", icon: "./assets/icon.svg" }
    : { css: "../assets/site.css", js: "../assets/site.js", assets: "../assets/", self: "./", other: "../", og: "../og.png", icon: "../assets/icon.svg" };
}

/** Marka işareti: uygulamanın kendi ikonunun çizgi hâli (17px, ölçeklenir). */
const MARK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
<rect x="2.5" y="5.5" width="19" height="12.5" rx="2" stroke="currentColor" stroke-width="1.6"/>
<path d="M1 21h22" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".5"/>
<path d="M7.5 11.75h9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;

export function renderPage(lang, { version, shotSizes = {}, stopsHtml } = {}) {
  const c = CONTENT[lang];
  const p = paths(lang);
  const other = lang === "tr" ? "en" : "tr";

  const sizeOf = (file) => {
    const s = shotSizes[file];
    return s && s.w > 0 && s.h > 0 ? { w: s.w, h: s.h } : { w: 1600, h: 900 };
  };

  const navLinks = [
    { href: "#stops", label: c.nav.how },
    { href: "#features", label: c.nav.features },
    { href: "#faq", label: c.nav.faq },
  ]
    .map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`)
    .join("\n        ");

  const trust = c.hero.trust.map((t) => `<li>${esc(t)}</li>`).join("\n          ");

  const stops = (stopsHtml ??
    c.stops.items
      .map(
        (s, i) => `<li class="stop${i === 3 ? " now" : ""}">
          <time datetime="2026-01-01T${s.hour}:00">${esc(s.hour)}</time>
          <h3>${esc(s.title)}</h3>
          <p>${esc(s.body)}</p>
        </li>`,
      )
      .join("\n        "));

  const gallery = c.gallery.items
    .map((it) => {
      const d = sizeOf(it.file);
      // Geniş içerik (2:1'den yatık) iki sütunda minicik kalır; tam genişlik.
      // Karar içerikten değil GERÇEK piksel oranından gelir — elle işaretleme
      // unutulur, ölçüm unutulmaz.
      const isWide = it.wide || d.w / d.h >= 2;
      return `<figure class="shot${isWide ? " wide" : ""}">
        <img src="${p.assets}shots/${esc(it.file)}" alt="${esc(it.alt)}" width="${d.w}" height="${d.h}" loading="lazy" decoding="async">
        <figcaption>${esc(it.caption)}</figcaption>
      </figure>`;
    })
    .join("\n      ");

  const touch = c.bounds.touch.map((x) => `<li>${esc(x)}</li>`).join("\n          ");
  const untouch = c.bounds.untouch.map((x) => `<li>${esc(x)}</li>`).join("\n          ");

  const features = c.features.items
    .map(
      (f) => `<li class="feature">
        <h3>${esc(f.name)}</h3>
        <p>${esc(f.body)}</p>
      </li>`,
    )
    .join("\n      ");

  const factRows = c.facts.rows
    .map((r) => `<div class="fact-row"><dt>${esc(r.k)}</dt><dd>${esc(r.v)}</dd></div>`)
    .join("\n      ");

  const free = c.plans.free.map((x) => `<li>${esc(x)}</li>`).join("\n          ");
  const pro = c.plans.pro.map((x) => `<li>${esc(x)}</li>`).join("\n          ");

  const faq = c.faq.items
    .map(
      (q) => `<details class="qa">
        <summary>${esc(q.q)}</summary>
        <p>${esc(q.a)}</p>
      </details>`,
    )
    .join("\n    ");

  const footLinks = c.footer.links
    .map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`)
    .join("\n        ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Windows 10, Windows 11",
    softwareVersion: version,
    license: "https://www.gnu.org/licenses/gpl-3.0.html",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: `${BASE}${lang === "en" ? "en/" : ""}`,
  };

  // Hero okuması: JS varsa gerçek saate göre yenilenir; yoksa sabit ve doğru
  // bir örnek (21:04 → %55 · 4600 K) durur. Boş "—" göstermiyoruz: içerik
  // JS'e bağlı olmamalı (Review Focus 1).
  const sampleMinute = 21 * 60 + 4;
  const sample = nowReading(sampleMinute);
  const readout = {
    time: "21:04",
    warmth: `%${sample.applied}`,
    kelvin: `${sample.kelvin} K`,
  };

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.meta.title)}</title>
<meta name="description" content="${esc(c.meta.description)}">
<link rel="canonical" href="${BASE}${lang === "en" ? "en/" : ""}">
<link rel="alternate" hreflang="tr" href="${BASE}">
<link rel="alternate" hreflang="en" href="${BASE}en/">
<link rel="alternate" hreflang="x-default" href="${BASE}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(c.meta.title)}">
<meta property="og:description" content="${esc(c.meta.description)}">
<meta property="og:image" content="${BASE}og.png">
<meta property="og:image:alt" content="${esc(c.meta.ogAlt)}">
<meta property="og:url" content="${BASE}${lang === "en" ? "en/" : ""}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${p.icon}" type="image/svg+xml">
<link rel="preload" href="${p.assets}fonts/bricolage.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${p.css}">
</head>
<body>

<header class="topbar" id="topbar">
  <div class="wrap topbar-in">
    <a class="brand" href="${p.self}">${MARK}${SITE}</a>
    <nav class="nav" aria-label="${esc(lang === "tr" ? "Ana gezinme" : "Main navigation")}">
      ${navLinks}
    </nav>
    <div class="topbar-end">
      <a class="lang" href="${p.other}" hreflang="${other}" lang="${other}">${esc(c.nav.langSwitch)}</a>
      <a class="btn" href="${esc(DOWNLOAD_URL)}">${esc(c.nav.download)} <span class="ver">${esc(version)}</span></a>
    </div>
  </div>
</header>

<main>
  <section class="hero">
    <div class="wrap hero-in">
      <h1>${esc(c.hero.title)}</h1>
      <p class="lead">${esc(c.hero.lead)}</p>

      <div class="hero-actions">
        <a class="btn btn-lg" href="${esc(DOWNLOAD_URL)}">${esc(c.hero.ctaDownload)} · ${esc(version)}</a>
        <a class="btn btn-quiet btn-lg" href="${esc(REPO_URL)}">${esc(c.hero.ctaSource)}</a>
      </div>

      <ul class="trust">
          ${trust}
      </ul>

      <div class="stage">
        <div class="screen" id="hero-screen" data-brightness="${sample.applied}">
          <img src="${p.assets}shots/hero.webp" alt="${esc(c.hero.screenAlt)}" width="${sizeOf("hero.webp").w}" height="${sizeOf("hero.webp").h}" fetchpriority="high" decoding="async">
        </div>
        <p class="screen-note">${esc(c.hero.screenNote)}</p>
      </div>

      <dl class="readout" id="readout">
        <div><dt>${esc(c.hero.readoutNow)}</dt><dd id="now-time">${readout.time}</dd></div>
        <div><dt>${esc(c.hero.readoutWarmth)}</dt><dd id="now-warmth">${readout.warmth}</dd></div>
        <div><dt>${esc(c.hero.readoutKelvin)}</dt><dd id="now-kelvin">${readout.kelvin}</dd></div>
      </dl>
    </div>
  </section>

  <section class="wrap stops" id="stops" aria-labelledby="h-stops">
    <div class="section-head">
      <h2 id="h-stops">${esc(c.stops.title)}</h2>
      <p class="lead">${esc(c.stops.lead)}</p>
    </div>
    <div class="stops-curve" aria-hidden="true">
      <svg viewBox="0 0 1200 120" preserveAspectRatio="none">
        <path class="stops-path" d="${curvePath(1200, 120)}" fill="none"></path>
        <circle class="stops-dot" id="stops-dot" r="4.5" cx="0" cy="0" opacity="0"></circle>
      </svg>
    </div>    <ol class="stop-list">
        ${stops}
    </ol>
    <dl class="stats">
      <div><dt>${esc(c.stops.statCapLabel)}</dt><dd data-count="62" data-suffix="%">%62</dd></div>
      <div><dt>${esc(c.stops.statKelvinLabel)}</dt><dd data-count="4300" data-space="1">4300 K</dd></div>
      <div><dt>${esc(c.stops.statReturnLabel)}</dt><dd data-count="3.5" data-decimal="1" data-suffix=" sn">3,5 sn</dd></div>
    </dl>
  </section>

  <section class="wrap gallery" id="gallery" aria-labelledby="h-gallery">
    <div class="section-head">
      <h2 id="h-gallery">${esc(c.gallery.title)}</h2>
      <p class="lead">${esc(c.gallery.lead)}</p>
    </div>
    <div class="shot-grid">
      ${gallery}
    </div>
  </section>

  <section class="wrap bounds" id="bounds" aria-labelledby="h-bounds">
    <div class="section-head">
      <h2 id="h-bounds">${esc(c.bounds.title)}</h2>
      <p class="lead">${esc(c.bounds.lead)}</p>
    </div>
    <div class="bound-cols">
      <div>
        <h3>${esc(c.bounds.touchTitle)}</h3>
        <ul class="touch">
          ${touch}
        </ul>
      </div>
      <div>
        <h3>${esc(c.bounds.untouchTitle)}</h3>
        <ul class="untouch">
          ${untouch}
        </ul>
      </div>
    </div>
  </section>

  <section class="wrap features" id="features" aria-labelledby="h-features">
    <div class="section-head">
      <h2 id="h-features">${esc(c.features.title)}</h2>
      <p class="lead">${esc(c.features.lead)}</p>
    </div>
    <ul class="feature-list">
      ${features}
    </ul>
  </section>

  <section class="wrap facts" id="facts" aria-labelledby="h-facts">
    <div class="section-head">
      <h2 id="h-facts">${esc(c.facts.title)}</h2>
    </div>
    <dl class="fact-rows">
      ${factRows}
    </dl>
  </section>

  <section class="wrap plans" id="plans" aria-labelledby="h-plans">
    <div class="section-head">
      <h2 id="h-plans">${esc(c.plans.title)}</h2>
      <p class="lead">${esc(c.plans.lead)}</p>
    </div>
    <div class="plan-cols">
      <div class="plan">
        <h3>${esc(c.plans.freeTitle)}</h3>
        <ul>
          ${free}
        </ul>
      </div>
      <div class="plan pro">
        <h3>${esc(c.plans.proTitle)}</h3>
        <ul>
          ${pro}
        </ul>
      </div>
    </div>
    <p class="plan-note">${esc(c.plans.note)}</p>
  </section>

  <section class="wrap faq" id="faq" aria-labelledby="h-faq">
    <div class="section-head">
      <h2 id="h-faq">${esc(c.faq.title)}</h2>
    </div>
    ${faq}
  </section>

  <section class="wrap closing" id="download" aria-labelledby="h-closing">
    <h2 id="h-closing">${esc(c.closing.title)}</h2>
    <p class="lead">${esc(c.closing.lead)}</p>
    <div class="hero-actions">
      <a class="btn btn-lg" href="${esc(DOWNLOAD_URL)}">${esc(c.closing.cta)} · ${esc(version)}</a>
      <a class="btn btn-quiet btn-lg" href="${esc(REPO_URL + "/releases")}">${esc(c.closing.secondary)}</a>
    </div>
  </section>
</main>

<footer class="foot">
  <div class="wrap foot-in">
    <span>${esc(c.footer.tagline)}</span>
    <span>${esc(c.footer.license)}</span>
    <nav class="foot-links" aria-label="${esc(lang === "tr" ? "Alt bağlantılar" : "Footer links")}">
        ${footLinks}
    </nav>
  </div>
</footer>

<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<script type="module" src="${p.js}"></script>
</body>
</html>
`;
}

export { curvePath, minuteOfDay };
