"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { roundTrip, breakEven, minNotional, DEFAULTS } = require("../tools/breakeven");

const TOK = { mcap: 1600000, tax: 0 };

test("el fee fijo domina en posiciones chicas", () => {
  const chica = breakEven(10, DEFAULTS, TOK, 500);
  const grande = breakEven(500, DEFAULTS, TOK, 500);
  assert.ok(chica > grande * 2, `chica ${chica} debe ser mucho peor que grande ${grande}`);
});

test("el fee fijo es la causa del castigo a las posiciones chicas", () => {
  const sinFlat = { ...DEFAULTS, fomoFlatUsd: 0, priorityFeeUsd: 0 };
  // Con fee fijo, una posición de $10 es catastrófica frente a una de $100.
  assert.ok(breakEven(10, DEFAULTS, TOK, 500) > 3 * breakEven(100, DEFAULTS, TOK, 500));
  // Sin fee fijo, esa penalización desaparece: lo chico pasa a ser lo barato.
  assert.ok(breakEven(10, sinFlat, TOK, 500) < breakEven(500, sinFlat, TOK, 500));
  assert.ok(breakEven(10, sinFlat, TOK, 500) < 0.03, "sin fee fijo, $10 rinde bien");
});

test("con fee fijo la curva es en U: existe un tamaño óptimo", () => {
  // El fee fijo empuja a agrandar; el impacto de mercado empuja a achicar.
  const chica = breakEven(10, DEFAULTS, TOK, 500);
  const media = breakEven(100, DEFAULTS, TOK, 500);
  const grande = breakEven(2000, DEFAULTS, TOK, 500);
  assert.ok(media < chica, "el medio le gana a lo muy chico");
  assert.ok(media < grande, "y también a lo muy grande");
});

test("más demora en reaccionar sube el break-even", () => {
  const rapido = breakEven(25, DEFAULTS, TOK, 200);
  const lento = breakEven(25, DEFAULTS, TOK, 3000);
  assert.ok(lento > rapido, "llegar tarde tiene que costar más");
});

test("en el break-even el resultado neto es cero", () => {
  const be = breakEven(100, DEFAULTS, TOK, 800);
  const r = roundTrip(100, be, DEFAULTS, TOK, 800);
  assert.ok(Math.abs(r.net) < 0.05, `neto ${r.net} debería ser ~0`);
});

test("debajo del break-even se pierde, encima se gana", () => {
  const be = breakEven(100, DEFAULTS, TOK, 800);
  assert.ok(roundTrip(100, be - 0.02, DEFAULTS, TOK, 800).net < 0);
  assert.ok(roundTrip(100, be + 0.02, DEFAULTS, TOK, 800).net > 0);
});

test("el tamaño mínimo para un objetivo es consistente con el break-even", () => {
  const n = minNotional(0.10, DEFAULTS, TOK, 800);
  assert.ok(n !== null, "10% debe ser alcanzable");
  assert.ok(breakEven(n, DEFAULTS, TOK, 800) <= 0.1005, "en el mínimo se cumple el objetivo");
  assert.ok(breakEven(n * 0.7, DEFAULTS, TOK, 800) > 0.10, "por debajo, no");
});

test("un objetivo imposible se reporta, no se fuerza", () => {
  assert.equal(minNotional(0.001, DEFAULTS, TOK, 2000), null, "0.1% no es alcanzable con estas fees");
});
