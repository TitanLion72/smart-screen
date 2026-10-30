#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
/* ═══════════════════════════════════════════════════════════════════
   smart-screen — WebView2 veri köprüsü (qa/cdp-localstorage.mjs)

   Çalışan uygulamanın WebView2 profiline DevTools protokolü ile bağlanıp
   localStorage'ı okur/yazar. Neden: kullanıcı verisi (profiller, palet,
   bağlı uygulamalar) leveldb içinde; elle düzenlemek bozar. Bu araç aynı
   origin'de `localStorage` API'sini kullanır, yani uygulamanın kendi yolu.

   Kullanım (uygulama `--remote-debugging-port` ile açık olmalı):

     set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223
     start smart-screen.exe

     node qa/cdp-localstorage.mjs --dump
     node qa/cdp-localstorage.mjs --get ss:profiles
     node qa/cdp-localstorage.mjs --set ss:profiles --value-file profiller.json
     node qa/cdp-localstorage.mjs --eval "document.documentElement.dataset.theme"

   Not: güvenlik — port yalnız 127.0.0.1'e açılır ve araç salt yerel çalışır.
   Yazma sonrası sayfa yenilenir; uygulama veriyi kendi okuyucusuyla alır.
   ═══════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const valueOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};

const port = valueOf("--port") ?? "9223";
const title = valueOf("--window") ?? "smart-screen";
const dump = flag("--dump");
const key = valueOf("--get");
const setKey = valueOf("--set");
const valueFile = valueOf("--value-file");
const valueLiteral = valueOf("--value");
const evalExpr = valueOf("--eval");
const reload = !flag("--no-reload");

if (!dump && !key && !setKey && !evalExpr) {
  console.error("kullanım: --dump | --get <anahtar> | --set <anahtar> --value-file <dosya> | --eval <ifade>");
  process.exit(2);
}

const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
// Ana pencere, başlığı tam "smart-screen" olan; flyout "… - hızlı panel".
const target =
  list.find((t) => t.type === "page" && t.title === title) ??
  list.find((t) => t.type === "page" && !t.title.includes("hızlı panel"));
if (!target) {
  console.error("hedef pencere bulunamadı. Uygulama --remote-debugging-port ile açık mı?");
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

const evaluate = async (expression) => {
  const res = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? "değerlendirme hatası");
  }
  return res.result.value;
};

try {
  if (dump) {
    const entries = await evaluate(`(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        out[k] = localStorage.getItem(k);
      }
      return out;
    })()`);
    console.log(JSON.stringify(entries, null, 2));
  }

  if (key) {
    const value = await evaluate(`localStorage.getItem(${JSON.stringify(key)})`);
    console.log(value === null ? "(yok)" : value);
  }

  if (setKey) {
    if (!valueFile && valueLiteral === null) {
      console.error("--set için --value-file ya da --value gerekli");
      process.exit(2);
    }
    const value = valueFile ? readFileSync(valueFile, "utf8") : valueLiteral;
    // Yalnız JSON gibi görünen değerleri doğrula: `ss:*` anahtarlarının çoğu düz
    // metin (virgüllü liste, "1"/"0"). Bozuk JSON yazıp uygulamayı kilitlemeyelim.
    const looksJson = /^\s*[[{]/.test(value);
    if (looksJson) {
      try {
        JSON.parse(value);
      } catch {
        console.error("değer geçerli JSON değil — yazma iptal");
        process.exit(2);
      }
    }
    await evaluate(
      `localStorage.setItem(${JSON.stringify(setKey)}, ${JSON.stringify(value)})`,
    );
    console.log(`yazıldı: ${setKey} (${value.length} bayt)`);
    if (reload) {
      await send("Page.reload", { ignoreCache: true });
      console.log("sayfa yenilendi");
    }
  }

  if (evalExpr) {
    console.log(JSON.stringify(await evaluate(evalExpr), null, 2));
  }
} finally {
  ws.close();
}
