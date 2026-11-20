// site/phases.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { PHASES, contrast, AA_TEXT, PHASE_VARS } from "./phases.mjs";

test("dört faz, sıralı saatler", () => {
  assert.deepEqual(PHASES.map((p) => p.id), ["dawn", "noon", "dusk", "night"]);
  assert.deepEqual(PHASES.map((p) => p.hour), [6, 12, 18, 23]);
});

test("her fazda metin/ikincil/vurgu/düğme AA (>= 4.5)", () => {
  for (const p of PHASES) {
    const rows = {
      metin: contrast(p.text, p.bg),
      ikincil: contrast(p.muted, p.bg),
      vurgu: contrast(p.accent, p.bg),
      dugme: contrast(p.onAccent, p.accent),
    };
    for (const [name, ratio] of Object.entries(rows)) {
      assert.ok(ratio >= AA_TEXT, `${p.id}/${name} = ${ratio.toFixed(2)} < 4.5`);
    }
  }
});

test("kontrast simetrik ve bilinen çiftte sabit", () => {
  assert.equal(contrast("#ffffff", "#000000"), 21);
  assert.ok(Math.abs(contrast("#0e1014", "#ded9d0") - 13.55) < 0.05);
  assert.ok(Math.abs(contrast("#ded9d0", "#0e1014") - 13.55) < 0.05);
});

test("PHASE_VARS tüm değişkenleri verir", () => {
  const v = PHASE_VARS(PHASES[0]);
  assert.deepEqual(Object.keys(v).sort(), ["--accent", "--bg", "--muted", "--on-accent", "--text"]);
  assert.equal(v["--bg"], "#0e1014");
});

test("geçersiz hex sessizce 0 dönmez, hata verir", () => {
  assert.throws(() => contrast("red", "#000000"));
});
