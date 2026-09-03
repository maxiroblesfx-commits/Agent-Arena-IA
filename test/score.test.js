"use strict";
const test = require("node:test");
const assert = require("node:assert");
const sc = require("../tools/score");

const MIN = 60000;
/** Fill al estilo Hyperliquid. startPosition = posición ANTES del fill. */
function fill(coin, side, sz, px, startPosition, tMin, extra = {}) {
  return {
    coin, side, sz: String(sz), px: String(px),
    startPosition: String(startPosition),
    time: tMin * MIN, closedPnl: "0", fee: "0",
    dir: extra.dir || (Math.abs(startPosition + (side === "B" ? sz : -sz)) > Math.abs(startPosition) ? "Open Long" : "Close Long"),
    tid: extra.tid ?? Math.random(), ...extra,
  };
}

test("reconstruye una operación simple de apertura y cierre", () => {
  const eps = sc.episodes([
    fill("ETH", "B", 1, 100, 0, 0),
    fill("ETH", "A", 1, 110, 1, 30, { closedPnl: "10", fee: "0.2" }),
  ]);
  assert.equal(eps.length, 1);
  assert.equal(eps[0].net, 9.8);
  assert.equal(eps[0].holdMs, 30 * MIN);
  assert.equal(eps[0].entryFills, 1);
});

test("cuenta la entrada escalonada como una sola operación", () => {
  const eps = sc.episodes([
    fill("BTC", "B", 1, 100, 0, 0),
    fill("BTC", "B", 1, 102, 1, 2),
    fill("BTC", "A", 2, 110, 2, 60, { closedPnl: "18", fee: "0.5" }),
  ]);
  assert.equal(eps.length, 1, "una sola operación, no tres");
  assert.equal(eps[0].entryFills, 2, "dos fills de entrada");
  assert.equal(eps[0].net, 17.5);
});

test("un giro de signo cierra la operación y abre otra", () => {
  const eps = sc.episodes([
    fill("SOL", "B", 1, 100, 0, 0),
    fill("SOL", "A", 2, 110, 1, 10, { closedPnl: "10", fee: "0.1" }),
    fill("SOL", "B", 1, 105, -1, 20, { closedPnl: "5", fee: "0.1" }),
  ]);
  assert.equal(eps.length, 2, "largo cerrado + corto abierto y cerrado");
});

test("separa por moneda y no mezcla posiciones", () => {
  const eps = sc.episodes([
    fill("ETH", "B", 1, 100, 0, 0),
    fill("BTC", "B", 1, 200, 0, 1),
    fill("ETH", "A", 1, 110, 1, 10, { closedPnl: "10" }),
    fill("BTC", "A", 1, 190, 1, 20, { closedPnl: "-10" }),
  ]);
  assert.equal(eps.length, 2);
  assert.deepEqual(eps.map((e) => e.coin).sort(), ["BTC", "ETH"]);
});

test("una posición todavía abierta no se cuenta como operación", () => {
  const eps = sc.episodes([fill("ETH", "B", 1, 100, 0, 0)]);
  assert.equal(eps.length, 0, "sin cierre no hay resultado que medir");
});

test("se niega a puntuar con muestra insuficiente", () => {
  const fills = [];
  for (let i = 0; i < 5; i++) {
    fills.push(fill("ETH", "B", 1, 100, 0, i * 100));
    fills.push(fill("ETH", "A", 1, 110, 1, i * 100 + 30, { closedPnl: "10" }));
  }
  const r = sc.rate(fills);
  assert.equal(r.ok, false);
  assert.match(r.reason, /muestra insuficiente/);
  assert.equal(r.stats.n, 5);
});

test("detecta concentración de PnL: pocas operaciones explican todo", () => {
  const fills = [];
  for (let i = 0; i < 40; i++) {
    const pnl = i < 3 ? 1000 : 1;   // 3 aciertos gigantes, 37 migajas
    fills.push(fill("ETH", "B", 1, 100, 0, i * 100));
    fills.push(fill("ETH", "A", 1, 110, 1, i * 100 + 60, { closedPnl: String(pnl) }));
  }
  const s = sc.stats(sc.episodes(fills));
  assert.ok(s.top3Share > 0.9, `top3Share alto, fue ${s.top3Share}`);
  const e = sc.edgeScore(s);
  assert.ok(e.reasons.some((x) => /suerte/.test(x)), "debe avisar que puede ser suerte");
});

test("castiga al trader incopiable por tenencia demasiado corta", () => {
  const rapido = { medianHoldMs: 40000, medianEntryFills: 1 };      // 40 segundos
  const lento = { medianHoldMs: 4 * 3600000, medianEntryFills: 2 }; // 4 horas
  assert.ok(sc.copyScore(rapido).score < 20, "40 s es incopiable");
  assert.ok(sc.copyScore(lento).score > 80, "4 h es cómodo");
});

test("el costo de llegar tarde baja la copiabilidad", () => {
  const base = { medianHoldMs: 4 * 3600000, medianEntryFills: 2 };
  const sinLag = sc.copyScore(base).score;
  const conLag = sc.copyScore(base, 150).score;   // 150 bps de castigo
  assert.ok(conLag < sinLag, "medir la demora tiene que penalizar");
});

test("edge y copiabilidad se multiplican, no se suman", () => {
  const s = {
    n: 100, expectancy: 50, medianNotional: 1000, winRate: 0.6,
    top3Share: 0.3, maxDDvsGain: 0.2, liquidations: 0,
    medianHoldMs: 30000, medianEntryFills: 1,   // incopiable
  };
  const e = sc.edgeScore(s), c = sc.copyScore(s);
  assert.ok(e.score > 50, "buen edge");
  assert.ok(c.score < 20, "mala copiabilidad");
  assert.ok(Math.round((e.score * c.score) / 100) < 15, "un trader bueno pero incopiable no sirve");
});
