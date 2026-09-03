"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { RUTAS, cuerpo } = require("../lib/fomo");

test("las rutas coinciden con las URLs que llama la app", () => {
  // Observadas en endpoints(): no se inventó ninguna.
  assert.equal(RUTAS.perfil("econoar"), "/v2/users/userHandle/econoar");
  assert.equal(RUTAS.swaps("c573ebfa-5e98-580c-ae15-c8672f11c151"),
    "/v2/users/c573ebfa-5e98-580c-ae15-c8672f11c151/swaps");
  assert.equal(RUTAS.balances("abc"), "/v2/users/abc/balances");
  assert.equal(RUTAS.spotlight("abc"), "/v2/users/abc/spotlight");
  assert.equal(RUTAS.trade("t1"), "/trades/t1");
  assert.equal(RUTAS.feed(), "/feed/tradingActivity");
});

test("escapa un handle con caracteres raros en vez de romper la URL", () => {
  assert.equal(RUTAS.perfil("a/b?c"), "/v2/users/userHandle/a%2Fb%3Fc");
});

test("desenvuelve responseObject, y tolera que no esté", () => {
  assert.deepEqual(cuerpo({ responseObject: { a: 1 } }), { a: 1 });
  assert.deepEqual(cuerpo({ a: 1 }), { a: 1 });
  assert.equal(cuerpo(null), null);
});

test("responseObject nulo no se confunde con ausente", () => {
  assert.equal(cuerpo({ responseObject: null }), null, "la API respondió con null explícito");
});
