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
