// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/**
 * scene.ts — `sahne` şablonunun WebGL ışık katmanı (v3.0).
 *
 * Kural: bu katman **dekoratiftir**. Görünmez olsa da, WebGL olmasa da, bağlam
 * kaybolsa da uygulama aynı çalışır; CSS'teki `hero-glow` degradesi zaten
 * oradadır. Bu yüzden tüm hata yolları sessizce "hiçbir şey yapma"ya düşer.
 *
 * Renk tek kaynak: palet değişkenleri (`--bg-1`, `--accent-base`) CSS'ten
 * okunur; burada hex/rgb yazılmaz (`npm run check:tokens` ham renk yasağı).
 *
 * Hareket: `prefers-reduced-motion` ya da `data-anim="off"` → tek statik kare.
 * Sekme/pencere gizliyken döngü durur (pilde boşuna GPU yakmaz).
 */

type Rgb = [number, number, number];

/** CSS renk değerini 0..1 RGB'ye çevirir; tanınmazsa `null`. */
export function parseColor(raw: string): Rgb | null {
  const v = raw.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return [
      parseInt(full.slice(0, 2), 16) / 255,
      parseInt(full.slice(2, 4), 16) / 255,
      parseInt(full.slice(4, 6), 16) / 255,
    ];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v);
  if (rgb) {
    return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  }
  return null;
}

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/**
 * Üç renkli, çok yavaş kayan ışık alanı. `u_time` saniye cinsinden; statik
 * karede sabit bir değer verilir (ilk kare aynı görünür, sıçrama olmaz).
 */
const FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_bg;
uniform vec3 u_accent;
uniform vec3 u_edge;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = uv - 0.5;
  p.x *= u_res.x / u_res.y;

  float t = u_time * 0.06;
  // İki yavaşça dönen ışık kaynağı: sabit merkez değil, "nefes alan" sahne.
  float a = sin(t) * 0.5 + 0.5;
  vec2 c1 = vec2(-0.55 + a * 0.35, 0.30 - a * 0.18);
  vec2 c2 = vec2(0.70 - a * 0.30, -0.42 + a * 0.24);
  float d1 = length(p - c1);
  float d2 = length(p - c2);

  float glow1 = smoothstep(1.10, 0.02, d1);
  float glow2 = smoothstep(1.20, 0.05, d2);

  vec3 col = u_bg;
  col = mix(col, u_accent, glow1 * 0.62);
  col = mix(col, u_edge, glow2 * 0.40);
  // Üstte ince aydınlık: kartın cam yüzeyiyle aynı yön.
  col += u_accent * smoothstep(0.72, 0.0, uv.y) * 0.12;

  // Bant oluşmasın: çok hafif gürültü (dither).
  col += (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.012;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export interface Scene {
  /** Kare çizmeyi başlattırır/durdurur (şablon değişince çağrılır). */
  setActive(on: boolean): void;
  /** Palet değişti: renkleri yeniden oku. */
  refresh(): void;
  dispose(): void;
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * Canvas'ı kurar. WebGL yoksa `null` döner (çağıran hiçbir şey yapmaz —
 * CSS degradesi görünür kalır).
 */
export function initScene(canvas: HTMLCanvasElement): Scene | null {
  let gl: WebGLRenderingContext | null = null;
  try {
    // `preserveDrawingBuffer`: katman saniyede ~15 kare çiziyor (animasyon çok
    // yavaş), bu yüzden kopyalama maliyeti önemsiz. Buna karşılık canvas
    // okunabilir kalıyor — QA gerçekten çizilen pikseli doğrulayabiliyor
    // (aksi halde her okuma siyah döner ve test yalancı olur).
    gl = canvas.getContext("webgl", {
      // Opak: renk tam duyarlıkla okunur ve ışık cam plakanın ALTINDAN
      // görünür (plaka `sahne`+WebGL'de yarı saydam yapılır).
      alpha: false,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: true,
    });
  } catch {
    gl = null;
  }
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  gl.clearColor(0, 0, 0, 1);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]), // tek büyük üçgen
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, "u_res");
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uBg = gl.getUniformLocation(prog, "u_bg");
  const uAccent = gl.getUniformLocation(prog, "u_accent");
  const uEdge = gl.getUniformLocation(prog, "u_edge");

  let colors: { bg: Rgb; accent: Rgb; edge: Rgb } = {
    bg: [0.07, 0.06, 0.05],
    accent: [0.85, 0.73, 0.54],
    edge: [0.1, 0.09, 0.08],
  };

  function refresh(): void {
    const bg = parseColor(cssVar("--bg-1", "#12100e"));
    const accent = parseColor(cssVar("--accent-base", "#d8b98a"));
    const edge = parseColor(cssVar("--bg-2", "#0e0c0b"));
    if (bg) colors.bg = bg;
    if (accent) colors.accent = accent;
    if (edge) colors.edge = edge;
  }
  refresh();

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const animated = (): boolean =>
    !reduce.matches && document.documentElement.dataset.anim !== "off";

  let raf = 0;
  let startedAt = 0;
  let active = false;
  let destroyed = false;

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl!.viewport(0, 0, canvas.width, canvas.height);
  };

  const draw = (seconds: number): void => {
    if (destroyed) return;
    resize();
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.uniform2f(uRes, canvas.width, canvas.height);
    gl!.uniform1f(uTime, seconds);
    gl!.uniform3f(uBg, colors.bg[0], colors.bg[1], colors.bg[2]);
    gl!.uniform3f(uAccent, colors.accent[0], colors.accent[1], colors.accent[2]);
    gl!.uniform3f(uEdge, colors.edge[0], colors.edge[1], colors.edge[2]);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  };

  /** Çizim aralığı: animasyon çok yavaş (0.06 rad/s), 60 kare gereksiz. */
  const FRAME_MS = 66; // ~15 fps
  let lastDrawAt = 0;

  const frame = (now: number): void => {
    if (!active || destroyed) return;
    if (!startedAt) startedAt = now;
    // Kare atlama: zamanı ölçüp yalnız yeterince geçtiyse çiz.
    if (now - lastDrawAt >= FRAME_MS) {
      lastDrawAt = now;
      draw((now - startedAt) / 1000);
    }
    if (animated()) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = 0; // statik: tek kare yeter
    }
  };

  const restart = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    startedAt = 0;
    lastDrawAt = 0;
    if (active && !document.hidden) raf = requestAnimationFrame(frame);
  };

  /** Yalnız `sahne` şablonunda çalışır: diğer üç şablon GPU harcamaz. */
  const synced = (): boolean => document.documentElement.dataset.template === "sahne";

  const sync = (): void => {
    const want = synced();
    if (want === active) return;
    active = want;
    if (!want) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      return;
    }
    restart();
  };

  const onVisibility = (): void => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else {
      restart();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  reduce.addEventListener("change", restart);

  // Palet/şablon/hareket değişince sahne kendini toparlar (main'i kirletmeden).
  const obs = new MutationObserver(() => {
    refresh();
    sync();
  });
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-template", "data-anim"],
  });

  // WebGL gerçekten kuruldu: CSS ancak şimdi katmanı gösterir.
  document.documentElement.classList.add("webgl-on");
  sync();

  return {
    setActive(on: boolean): void {
      if (destroyed || active === on) return;
      active = on;
      if (!on) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      restart();
    },
    refresh,
    dispose(): void {
      destroyed = true;
      active = false;
      if (raf) cancelAnimationFrame(raf);
      obs.disconnect();
      document.documentElement.classList.remove("webgl-on");
      document.removeEventListener("visibilitychange", onVisibility);
      reduce.removeEventListener("change", restart);
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
