"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { normalize } = require("../lib/fomoSwaps");

/** Los dos ejemplos reales pegados desde la consola del navegador, en el
 *  perfil de econoar, el 2026-09-03. GET /v2/users/<id>/swaps → swaps[]. */
const EJEMPLO_1 = {
  id: "49e626f2-db45-4adf-8b3d-ba6131c33329",
  address: "aX8G1EVfWkRneHwWJN6RUecyGcXBYpz42yeKFa1rKiJ",
  networkId: 4663,
  inTokenAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  inAmount: 995000000,
  inHumanAmount: 993.204,
  outTokenAddress: "0x208092689248d96aa7f30aab09ff6a7e05b41e18",
  outAmount: 0,
  outHumanAmount: 1308076.34,
  humanUsdAmountIn: 998.06,
  humanUsdAmountOut: 966.498,
  createdAt: "2026-09-03T23:05:28.956Z",
  inTradeId: null,
  outTradeId: "d5d4928e-455d-4f2c-89bc-bfbe015d650d",
  isOffPlatform: false,
  isCrossmint: false,
  provider: "RELAY",
  inNetworkId: 1399811149,
  outNetworkId: 4663,
  recipient: "0x300b798feb4c06c6aea12bc5d37ab8d32ebeb429",
};

const EJEMPLO_2 = {
  id: "12abb949-0749-4016-abf5-335eee806924",
  address: "aX8G1EVfWkRneHwWJN6RUecyGcXBYpz42yeKFa1rKiJ",
  networkId: 4663,
  inTokenAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  inAmount: 1492500000,
  inHumanAmount: 1488.95,
  outTokenAddress: "0x0dbc9d99033b3615c27b3b70432524930f7c1e18",
  outAmount: 0,
  outHumanAmount: 3488411.58,
  humanUsdAmountIn: 1496.23,
  humanUsdAmountOut: 1318.03,
  createdAt: "2026-09-03T22:17:19.371Z",
  inTradeId: null,
  outTradeId: "568d445a-6f8b-40a1-b5df-6545102871d2",
  isOffPlatform: false,
  isCrossmint: false,
  provider: "RELAY",
  inNetworkId: 1399811149,
  outNetworkId: 4663,
  recipient: "0x300b798feb4c06c6aea12bc5d37ab8d32ebeb429",
};

test("financiado en USDC → compra del token de salida, por el monto en dólares que costó", () => {
  const s = normalize(EJEMPLO_1);
  assert.equal(s.side, "buy");
  assert.equal(s.mint, "0x208092689248d96aa7f30aab09ff6a7e05b41e18");
  assert.equal(s.tokenAmount, 1308076.34);
  assert.equal(s.sol, 998.06);      // "sol" = campo genérico de episodesFromSwaps, acá es USD
  assert.equal(s.id, "49e626f2-db45-4adf-8b3d-ba6131c33329");
  assert.ok(Number.isFinite(s.ts));
});

test("segundo ejemplo real: mismo patrón, otro token y otro monto", () => {
  const s = normalize(EJEMPLO_2);
  assert.equal(s.side, "buy");
  assert.equal(s.mint, "0x0dbc9d99033b3615c27b3b70432524930f7c1e18");
  assert.equal(s.tokenAmount, 3488411.58);
  assert.equal(s.sol, 1496.23);
});

test("las dos patas en stable, o ninguna: no clasifica, no adivina", () => {
  const ambasStable = { ...EJEMPLO_1, outTokenAddress: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" };
  assert.equal(normalize(ambasStable), null);

  const ningunaStable = { ...EJEMPLO_1, inTokenAddress: "0xotroTokenCualquiera" };
  assert.equal(normalize(ningunaStable), null);
});

test("sin createdAt parseable: no clasifica", () => {
  assert.equal(normalize({ ...EJEMPLO_1, createdAt: null }), null);
  assert.equal(normalize(null), null);
});
