// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — tanıtım sitesi şablonu (site/template.mjs)

   DOM yok, saf string. `tools/site-build.mjs` iki dil için çağırır.

   İskelet (spec §6.3): hero → 4 bölüm → sınırlar → özellikler →
   gerçekler → ücretsiz/Pro → SSS → kapanış → altlık.

   Sınıf adları CSS ve denetleyici ile SÖZLEŞMEDİR:
     .topbar .brand .nav .lang .btn
     .hero .eyebrow .display .lead .reading .curve-wrap .facts
     .chapter .chapter-num .chapter-body .shot .points
     .bounds .bound-col .bound-list
     .feature-list .feature
     .fact-table
     .plan-grid .plan
     .faq .qa
     .closing .foot
   Değiştirirsen `site/assets/site.css` ve `tools/site-check.mjs` de değişmeli.
   ═══════════════════════════════════════════════════════════════════ */

import { CONTENT, DOWNLOAD_URL, REPO_URL, RELEASES_URL } from "./content.mjs";
import { PHASES, PHASE_VARS } from "./phases.mjs";

const BASE = "https://titanlion72.github.io/smart-screen/";

/** HTML kaçışı — metinler dışarıdan geliyor gibi davran (tek kaynak olsa da). */
export function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Faz CSS'i: `:root[data-phase="dawn"]{--bg:#...;...}` — ayrı istek yok.
 *
 *  Seçici `:root[...]` olmalı, çıplak `[data-phase]` değil: bölümler de
 *  `data-phase` taşıyor (denetleyici ve JS için işaret). Renk yalnız sayfa
 *  düzeyinde (html) değişsin; yoksa her bölüm kendi renginde donar ve
 *  "kaydırdıkça ton değişir" fikri ölür.
 *  `:root` varsayılanı gece: JS yokken ilk boya koyu olur (beyaz patlama yok).
 */
export function phasesCss() {
  const vars = (p) =>
    Object.entries(PHASE_VARS(p))
      .map(([k, v]) => `${k}:${v}`)
      .join(";");
  const night = PHASES.find((p) => p.id === "night") ?? PHASES[PHASES.length - 1];
  return `:root{${vars(night)}}${PHASES.map((p) => `:root[data-phase="${p.id}"]{${vars(p)}}`).join("")}`;
}

/** Dile göre önek: tr kökte, en alt dizinde. */
function paths(lang) {
  return lang === "tr"
    ? { css: "./assets/site.css", js: "./assets/site.js", assets: "./assets/", self: "./", other: "./en/", og: "./og.png" }
    : { css: "../assets/site.css", js: "../assets/site.js", assets: "../assets/", self: "./", other: "../", og: "../og.png" };
}

const SITE_NAME = "smart-screen";

export function renderPage(lang, { version, phases = phasesCss(), shotSizes = {} } = {}) {
  const c = CONTENT[lang];
  const p = paths(lang);
  const other = lang === "tr" ? "en" : "tr";
  const dl = `${DOWNLOAD_URL}`;

  /** Gerçek piksel ölçüsü; manifesto yoksa 1280×720 varsayılanı. */
  const sizeOf = (file) => {
    const s = shotSizes[file];
    return s && s.w > 0 && s.h > 0 ? { w: s.w, h: s.h } : { w: 1280, h: 720 };
  };
  const navLinks = [
    { href: "#how", label: c.nav.how },
    { href: "#features", label: c.nav.features },
    { href: "#faq", label: c.nav.faq },
  ]
    .map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`)
    .join("\n          ");

  const chapters = c.chapters
    .map((ch, i) => {
      // Faz eşleşmesi spec §6.1: morning→dawn, noon→noon, evening→dusk, night→night
      const phase = ["dawn", "noon", "dusk", "night"][i];
      const points = ch.points.map((x) => `<li>${esc(x)}</li>`).join("\n            ");
      return `
      <section class="chapter" id="${esc(ch.id)}" data-phase="${phase}" aria-labelledby="h-${esc(ch.id)}">
        <div class="chapter-num" aria-hidden="true">${esc(ch.hour)}</div>
        <div class="chapter-body">
          <p class="eyebrow">${esc(ch.kicker)}</p>
          <h2 id="h-${esc(ch.id)}">${esc(ch.title)}</h2>
          <p class="lead">${esc(ch.body)}</p>
          <ul class="points">
            ${points}
          </ul>
          <figure class="shot">
            <img src="${p.assets}shots/${esc(ch.shot.file)}" alt="${esc(ch.shot.alt)}" width="${sizeOf(ch.shot.file).w}" height="${sizeOf(ch.shot.file).h}" loading="lazy" decoding="async">
            <figcaption>${esc(ch.shot.caption)}</figcaption>
          </figure>
        </div>
      </section>`;
    })
    .join("\n");

  const touch = c.boundaries.touch.map((x) => `<li>${esc(x)}</li>`).join("\n            ");
  const untouch = c.boundaries.untouch.map((x) => `<li>${esc(x)}</li>`).join("\n            ");

  const features = c.features.items
    .map(
      (f, i) => `<li class="feature">
            <span class="feature-num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
            <h3>${esc(f.name)}</h3>
            <p>${esc(f.body)}</p>
          </li>`,
    )
    .join("\n          ");

  const factRows = c.facts.rows
    .map((r) => `<div class="fact-row"><dt>${esc(r.k)}</dt><dd>${esc(r.v)}</dd></div>`)
    .join("\n            ");

  const free = c.plans.free.map((x) => `<li>${esc(x)}</li>`).join("\n              ");
  const pro = c.plans.pro.map((x) => `<li>${esc(x)}</li>`).join("\n              ");

  const faq = c.faq.items
    .map(
      (item) => `<details class="qa">
            <summary>${esc(item.q)}</summary>
            <p>${esc(item.a)}</p>
          </details>`,
    )
    .join("\n          ");

  const footLinks = c.footer.links
    .map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`)
    .join(" · ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Windows 10, Windows 11",
    softwareVersion: version,
    license: "https://www.gnu.org/licenses/gpl-3.0.html",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: `${BASE}${lang === "en" ? "en/" : ""}`,
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
<link rel="icon" href="${p.assets}icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${p.css}">
<style>${phases}</style>
</head>
<body>

<header class="topbar">
  <div class="topbar-in">
    <a class="brand" href="${p.self}"><span class="mark" aria-hidden="true"></span>${SITE_NAME}</a>
    <nav class="nav" aria-label="${lang === "tr" ? "Ana gezinme" : "Main navigation"}">
      ${navLinks}
    </nav>
    <div class="topbar-end">
      <a class="lang" href="${p.other}" hreflang="${other}" lang="${other}">${esc(c.nav.langSwitch)}</a>
      <a class="btn" href="${esc(dl)}">${esc(c.nav.download)} <span class="ver">${esc(version)}</span></a>
    </div>
  </div>
</header>

<main>
  <section class="hero" data-phase="night" aria-labelledby="h-hero">
    <div class="hero-in">
      <p class="eyebrow">${esc(c.hero.eyebrow)}</p>
      <h1 class="display" id="h-hero">${esc(c.hero.title)}</h1>
      <p class="lead">${esc(c.hero.lead)}</p>

      <div class="reading">
        <div class="reading-item">
          <span class="reading-k">${esc(c.hero.reading.nowPrefix)}</span>
          <span class="reading-v" id="now-time">--:--</span>
        </div>
        <div class="reading-item">
          <span class="reading-k">${esc(c.hero.reading.warmthLabel)}</span>
          <span class="reading-v" id="now-warmth">—</span>
        </div>
        <div class="reading-item">
          <span class="reading-k">${esc(c.hero.reading.kelvinLabel)}</span>
          <span class="reading-v" id="now-kelvin">—</span>
        </div>
      </div>

      <div class="curve-wrap">
        <svg id="day-curve" viewBox="0 0 960 220" preserveAspectRatio="none" role="img" aria-label="${esc(c.hero.reading.note)}">
          <line class="axis" x1="0" y1="210" x2="960" y2="210"></line>
          <line class="grid" x1="240" y1="10" x2="240" y2="210"></line>
          <line class="grid" x1="480" y1="10" x2="480" y2="210"></line>
          <line class="grid" x1="720" y1="10" x2="720" y2="210"></line>
          <path id="curve-path" class="curve-path" d=""></path>
          <line id="curve-now" class="curve-now" x1="0" y1="10" x2="0" y2="210" opacity="0"></line>
          <circle id="curve-dot" class="curve-dot" r="4" cx="0" cy="0" opacity="0"></circle>
        </svg>
        <div class="curve-ticks" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
        <p class="hint">${esc(c.hero.reading.note)}</p>
      </div>

      <div class="cta-row">
        <a class="btn btn-lg" href="${esc(dl)}">${esc(c.hero.ctaDownload)} · ${esc(version)}</a>
        <a class="btn btn-ghost" href="${esc(REPO_URL)}">${esc(c.hero.ctaSource)}</a>
      </div>
      <ul class="facts">
        ${c.hero.facts.map((f) => `<li>${esc(f)}</li>`).join("\n        ")}
      </ul>
    </div>
  </section>

  <div id="how" class="how">
${chapters}
  </div>

  <section class="bounds" data-phase="night" aria-labelledby="h-bounds">
    <h2 id="h-bounds">${esc(c.boundaries.title)}</h2>
    <p class="lead">${esc(c.boundaries.lead)}</p>
    <div class="bound-grid">
      <div class="bound-col">
        <h3>${lang === "tr" ? "Dokunur" : "Touches"}</h3>
        <ul class="bound-list touch">
            ${touch}
        </ul>
      </div>
      <div class="bound-col">
        <h3>${lang === "tr" ? "Dokunmaz" : "Leaves alone"}</h3>
        <ul class="bound-list untouch">
            ${untouch}
        </ul>
      </div>
    </div>
  </section>

  <section class="features" id="features" data-phase="dusk" aria-labelledby="h-features">
    <h2 id="h-features">${esc(c.features.title)}</h2>
    <p class="lead">${esc(c.features.lead)}</p>
    <ul class="feature-list">
          ${features}
    </ul>
  </section>

  <section class="facts-block" data-phase="dusk" aria-labelledby="h-facts">
    <h2 id="h-facts">${esc(c.facts.title)}</h2>
    <dl class="fact-table">
            ${factRows}
    </dl>
  </section>

  <section class="plans" id="plans" data-phase="dawn" aria-labelledby="h-plans">
    <h2 id="h-plans">${esc(c.plans.title)}</h2>
    <p class="lead">${esc(c.plans.lead)}</p>
    <div class="plan-grid">
      <div class="plan">
        <h3>${lang === "tr" ? "Ücretsiz" : "Free"}</h3>
        <ul>
              ${free}
        </ul>
      </div>
      <div class="plan plan-pro">
        <h3>Pro</h3>
        <ul>
              ${pro}
        </ul>
      </div>
    </div>
    <p class="plan-note">${esc(c.plans.note)}</p>
  </section>

  <section class="faq" id="faq" data-phase="noon" aria-labelledby="h-faq">
    <h2 id="h-faq">${esc(c.faq.title)}</h2>
          ${faq}
  </section>

  <section class="closing" id="download" data-phase="night" aria-labelledby="h-close">
    <h2 id="h-close">${esc(c.closing.title)}</h2>
    <p class="lead">${esc(c.closing.lead)}</p>
    <div class="cta-row">
      <a class="btn btn-lg" href="${esc(dl)}">${esc(c.closing.cta)} · ${esc(version)}</a>
      <a class="btn btn-ghost" href="${esc(RELEASES_URL)}">${esc(lang === "tr" ? "Tüm sürümler" : "All releases")}</a>
    </div>
  </section>
</main>

<footer class="foot">
  <p class="tagline">${esc(c.footer.tagline)}</p>
  <p class="license">${esc(c.footer.license)}</p>
  <nav class="foot-links" aria-label="${lang === "tr" ? "Alt bağlantılar" : "Footer links"}">
    ${footLinks}
  </nav>
</footer>

<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<script type="module" src="${p.js}"></script>
</body>
</html>
`;
}
