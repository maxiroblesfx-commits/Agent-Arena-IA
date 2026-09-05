"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { soloSwaps } = require("../tools/scoreFomo");

test("separa lo que tiene forma de swap de lo que no (p.ej. /balances mezclado)", () => {
  const registros = [
    { __ruta: "responseObject.swaps", inTokenAddress: "A", outTokenAddress: "B" },
    { __ruta: "responseObject.balances", balance: { tokenAddress: "C" } },
    { __ruta: "responseObject.swaps", inTokenAddress: "D", outTokenAddress: "E" },
  ];
  const { swaps, otros } = soloSwaps(registros);
  assert.equal(swaps.length, 2);
  assert.equal(otros.length, 1);
  assert.equal(otros[0].balance.tokenAddress, "C");
});

test("registro vacío o sin las dos direcciones no cuenta como swap", () => {
  const { swaps, otros } = soloSwaps([{}, { inTokenAddress: "solo-in" }, null]);
  assert.equal(swaps.length, 0);
  assert.equal(otros.length, 3);
});

const { porTrader } = require("../tools/scoreFomo");

const sw = (id, url, address) => ({ id, __url: url, address, inTokenAddress: "A", outTokenAddress: "B" });
const PERFIL = "https://prod-api.fomo.family/v2/users/c573ebfa-5e98-580c-ae15-c8672f11c151/swaps";
const TRADE = "https://prod-api.fomo.family/trades/9f17b313-8f1c-455d-9ec3-f594059a1d1e";

test("agrupa por trader usando el userId de la url", () => {
  const otro = "https://prod-api.fomo.family/v2/users/11111111-2222-3333-4444-555555555555/swaps";
  const g = porTrader([sw("a", PERFIL, "W1"), sw("b", otro, "W2")]);
  assert.equal(g.size, 2);
  assert.equal(g.get("c573ebfa-5e98-580c-ae15-c8672f11c151").length, 1);
});

/* Los swaps que llegan por /trades/<id> no nombran al usuario. Atribuirlos por
 * la address de ejecución recuperó 47 swaps reales de econoar que si no
 * quedaban en "desconocido" y le bajaban el neto de -$43.689 a -$40.069. */
test("un swap sin userId en la url se atribuye por la address ya conocida", () => {
  const g = porTrader([sw("a", PERFIL, "W1"), sw("b", TRADE, "W1")]);
  assert.equal(g.size, 1);
  assert.equal(g.get("c573ebfa-5e98-580c-ae15-c8672f11c151").length, 2);
});

test("una address que nunca apareció identificada queda como desconocido, no se adivina", () => {
  const g = porTrader([sw("a", PERFIL, "W1"), sw("b", TRADE, "W_JAMAS_VISTA")]);
  assert.equal(g.get("desconocido").length, 1);
});
