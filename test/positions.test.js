"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { entrada, snapshot } = require("../lib/positions");
const { clave } = require("../tools/learn");

/** Registro real de /balances (recortado), capturado el 2026-09-04. */
const BALANCE = {
  __ruta: "responseObject.balances",
  __url: "https://prod-api.fomo.family/v2/users/c573ebfa-5e98-580c-ae15-c8672f11c151/balances",
  balance: { shiftedBalance: 33315823.86, tokenAddress: "0x98096d17e191b3da1d5f99a6d7b3584351b11e18" },
  tokenFilterResult: {
    change24: "0.3838472441462979", createdAt: 1788194566, marketCap: "58528072",
    priceUSD: "0.0585280719711", volume24: "8042258",
    token: { address: "0x98096d17e191b3da1d5f99a6d7b3584351b11e18", networkId: 4663, name: "Boner Coin", symbol: "BONER" },
  },
  userToken: {
    averageEntryPriceUsd: 0.00183674, currentCostBasisUsd: 61192.5,
    totalRealizedPnlUsd: 0, holdingSince: "2026-08-28T00:59:34.710Z",
  },
};

test("reconstruye el market cap al entrar desde el precio de entrada", () => {
  const e = entrada(BALANCE);
  assert.equal(e.ticker, "BONER");
  assert.equal(e.mcapAhora, 58528072);
  // mcap_entrada = 58528072 × (0.00183674 / 0.0585280719711) ≈ 1.836.759
  assert.ok(Math.abs(e.mcapEntrada - 1836759) < 1000, `dio ${e.mcapEntrada}`);
  assert.ok(e.mcapEntrada < e.mcapAhora, "entró mucho más abajo de donde está hoy");
  assert.equal(e.costo, 61192.5);
  assert.equal(e.userId, "c573ebfa-5e98-580c-ae15-c8672f11c151", "saca el userId de la url");
});

test("una stable no se mueve: el mcap de entrada tiene que dar casi igual al de ahora", () => {
  const usdc = {
    ...BALANCE,
    tokenFilterResult: { ...BALANCE.tokenFilterResult, marketCap: "7938510000", priceUSD: "0.99984" },
    userToken: { ...BALANCE.userToken, averageEntryPriceUsd: 1.0 },
  };
  const e = entrada(usdc);
  const desvio = Math.abs(e.mcapEntrada / e.mcapAhora - 1);
  assert.ok(desvio < 0.01, `una stable no debería moverse 1%, se movió ${(desvio * 100).toFixed(2)}%`);
});

test("sin precio de entrada no se inventa una foto", () => {
  assert.equal(entrada({ ...BALANCE, userToken: { ...BALANCE.userToken, averageEntryPriceUsd: 0 } }), null);
  assert.equal(entrada({ ...BALANCE, tokenFilterResult: null }), null);
  assert.equal(entrada(null), null);
});

test("snapshot cuenta lo que descartó en vez de esconderlo", () => {
  const sinPrecio = { ...BALANCE, userToken: { ...BALANCE.userToken, averageEntryPriceUsd: 0 } };
  const s = snapshot([BALANCE, sinPrecio, { cualquier: "cosa" }]);
  assert.equal(s.filas.length, 1);
  assert.equal(s.candidatos, 2);
  assert.equal(s.descartados, 1);
});

/* Este test existe por un bug real: los registros de /balances no traen `id`
 * y empiezan todos igual, así que una clave hecha con los primeros caracteres
 * del JSON los colapsaba en uno — 87 posiciones se leían como 1. */
test("dos posiciones distintas del mismo usuario no comparten clave", () => {
  const otra = { ...BALANCE, balance: { ...BALANCE.balance, tokenAddress: "0xOTRO" } };
  assert.notEqual(clave(BALANCE), clave(otra));
});

test("el mismo evento del tape en dos exports comparte clave y se deduplica", () => {
  assert.equal(clave({ id: "abc", type: "swap_buy" }), clave({ id: "abc", type: "swap_buy", extra: 1 }));
});
