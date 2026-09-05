"use strict";
const test = require("node:test");
const assert = require("node:assert");
const tape = require("../lib/tape");

/** Items reales del feed, capturados el 2026-09-04. */
const COMPRA = {
  type: "swap_buy", id: "c1", tradeId: "t1", createdAt: "2026-09-04T04:06:35.603Z",
  userId: "36adb85a-c0fd-5fa8-916d-8fdc32fe4237", userHandle: "unipcs", displayName: "Unipcs",
  usdAmount: 9970.998094999999, marketCap: 17657566.4174717, fdv: 17657566.4174717,
  price: 0.0176575664174717, ticker: "CETS",
  tokenAddress: "0xb0c2ab5af4028461ace3f6e1c33a4ee1404e7777", networkId: 4663,
  equity: 20535738.497972053,
};

const VENTA = {
  type: "swap_sell", id: "v1", tradeId: "t2", createdAt: "2026-09-04T11:50:34.395Z",
  userId: "36adb85a-c0fd-5fa8-916d-8fdc32fe4237", userHandle: "unipcs",
  usdAmount: 5936.078878, marketCap: 67976315.1584738, fdv: 67976315.1584738,
  price: 148.73920465585869, ticker: "SPCXB",
  tokenAddress: "0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1", networkId: 56,
};

const HITO = {
  type: "user_trade_profit_milestone", id: "h1",
  userId: "36adb85a-c0fd-5fa8-916d-8fdc32fe4237",
  tokenAddress: "0x6b1d42927b1a84ec28fa88d4fc6fa7af404966be", networkId: 4663,
  createdAt: "2026-09-04T10:29:51.516Z", equity: 20535738.497972053,
  body: {
    fdv: 12750761.154299999, tag: "Top Trader", price: 0.0127507611543, ticker: "PAIR",
    userId: "36adb85a-c0fd-5fa8-916d-8fdc32fe4237", entryTime: "2026-08-29T23:08:44.238Z",
    marketCap: 11567338.668852337, userHandle: "unipcs", totalPnlUsd: 267379.0102361967,
    totalCostBasis: 43731.01786684016, totalPercentagePnl: 611.4173035037945,
  },
};

const TESIS = {
  type: "thesis", id: "te1", createdAt: "2026-09-04T11:48:09.214Z",
  userId: "9f1da880-2061-57ab-8a83-2c01d9fac3e6", userHandle: "himgajria",
  tokenAddress: "0x98096d17e191b3da1d5f99a6d7b3584351b11e18", networkId: 4663, ticker: "BONER",
  comment: { comment: "Mission: squeeze hims.", numLikes: 10 },
  authorTrade: {
    humanTokenAmount: 15371025.608470177, usdValue: 842015.1498225443,
    unrealizedPnlUsd: 827774.7386735443, realizedPnlUsd: 0,
    percentageUnrealizedPnl: 5812.857016643601, closedAt: null,
  },
  equity: 3139321.019188463,
};

test("una compra del tape trae la foto del token en ese instante", () => {
  const o = tape.normalize(COMPRA);
  assert.equal(o.side, "buy");
  assert.equal(o.handle, "unipcs");
  assert.equal(o.ticker, "CETS");
  assert.equal(o.usd, 9970.998094999999);
  assert.equal(o.marketCap, 17657566.4174717);
  assert.ok(o.price > 0);
});

test("normalize solo acepta compras y ventas: una tesis o un hito no son operaciones", () => {
  assert.equal(tape.normalize(TESIS), null);
  assert.equal(tape.normalize(HITO), null);
  assert.equal(tape.normalize({ type: "swap_buy", createdAt: "no es fecha" }), null);
  assert.equal(tape.normalize(null), null);
});

test("un hito de ganancia ya viene etiquetado: entrada, costo y resultado", () => {
  const m = tape.milestone(HITO);
  assert.equal(m.handle, "unipcs");
  assert.equal(m.ticker, "PAIR");
  assert.equal(m.costo, 43731.01786684016);
  assert.equal(m.pnl, 267379.0102361967);
  assert.ok(Math.abs(m.retorno - 6.114173035037945) < 1e-9, "611% expresado como 6.11");
  assert.ok(m.holdMs > 0, "se calcula la tenencia desde entryTime");
  assert.equal(m.marketCap, 11567338.668852337);
});

test("una tesis trae la posición real del autor y si la sostiene", () => {
  const t = tape.thesis(TESIS);
  assert.equal(t.handle, "himgajria");
  assert.equal(t.posicionUsd, 842015.1498225443);
  assert.equal(t.likes, 10);
  assert.equal(t.sigueAbierta, true);
  assert.ok(Math.abs(t.retornoNoRealizado - 58.12857016643601) < 1e-9);
});

test("clasificar reparte cada evento en su pista", () => {
  const c = tape.clasificar([COMPRA, VENTA, HITO, TESIS, { type: "otra_cosa" }]);
  assert.equal(c.swaps.length, 2);
  assert.equal(c.milestones.length, 1);
  assert.equal(c.theses.length, 1);
  assert.equal(c.otros.length, 1);
});

/* Viajes de ida y vuelta. Fixtures sintéticos: hacen falta pares compra→venta
 * del mismo token, que la ventana real capturada todavía no tiene. */
const ev = (side, price, usd, minutos, mint = "TOK", userId = "u1") => ({
  type: "swap_" + side, id: `${side}${minutos}`, createdAt: new Date(minutos * 60000).toISOString(),
  userId, userHandle: "alguien", usdAmount: usd, price, marketCap: 5e6, fdv: 5e6,
  ticker: "TOK", tokenAddress: mint, networkId: 1,
});

test("compra y venta del mismo par cierra el viaje con su retorno", () => {
  const obs = [ev("buy", 1, 1000, 0), ev("sell", 2, 2000, 60)].map(tape.normalize);
  const { cerrados, abiertos } = tape.roundTrips(obs);
  assert.equal(cerrados.length, 1);
  assert.equal(abiertos.length, 0);
  const v = cerrados[0];
  assert.equal(v.gastado, 1000);
  assert.equal(v.cobrado, 2000);
  assert.equal(v.net, 1000);
  assert.equal(v.retorno, 1);              // duplicó
  assert.equal(v.holdMs, 3600000);
  assert.equal(v.marketCapEntrada, 5e6);
});

test("una compra sin venta queda abierta y no cuenta como resultado", () => {
  const { cerrados, abiertos } = tape.roundTrips([tape.normalize(ev("buy", 1, 500, 0))]);
  assert.equal(cerrados.length, 0);
  assert.equal(abiertos.length, 1);
});

test("vender algo que nunca vimos comprar se ignora, no se inventa la entrada", () => {
  const { cerrados, abiertos } = tape.roundTrips([tape.normalize(ev("sell", 3, 900, 10))]);
  assert.equal(cerrados.length, 0);
  assert.equal(abiertos.length, 0);
});

test("no mezcla dos traders que compraron el mismo token", () => {
  const obs = [
    ev("buy", 1, 1000, 0, "TOK", "u1"), ev("buy", 1, 1000, 5, "TOK", "u2"),
    ev("sell", 2, 2000, 60, "TOK", "u1"),
  ].map(tape.normalize);
  const { cerrados, abiertos } = tape.roundTrips(obs);
  assert.equal(cerrados.length, 1);
  assert.equal(cerrados[0].userId, "u1");
  assert.equal(abiertos.length, 1, "la de u2 sigue abierta");
});

test("una venta parcial no cierra el viaje: sigue habiendo posición", () => {
  const obs = [ev("buy", 1, 1000, 0), ev("sell", 1, 100, 30)].map(tape.normalize);
  const { cerrados, abiertos } = tape.roundTrips(obs);
  assert.equal(cerrados.length, 0, "vendió 10%, le queda 90%");
  assert.equal(abiertos.length, 1);
});

test("banda clasifica por market cap y avisa cuando no hay dato", () => {
  assert.equal(tape.banda(50000), "< $100k");
  assert.equal(tape.banda(5e6), "$1M – $10M");
  assert.equal(tape.banda(5e8), "> $100M");
  assert.equal(tape.banda(null), "sin market cap");
});
