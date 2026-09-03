#!/usr/bin/env node
"use strict";

/** Break-even — cuánto tiene que subir el token para que NO pierdas.
 *
 *  Usa el mismo motor de fees que el paper trading (lib/paper.js), así que
 *  este número y el blotter siempre dicen lo mismo.
 *
 *  Uso:
 *    node tools/breakeven.js --bankroll 500
 *    node tools/breakeven.js --bankroll 500 --mcap 400000 --lag 3000
 *    node tools/breakeven.js --bankroll 500 --target 5    ¿qué tamaño necesito?
 */

const paper = require("../lib/paper");

const DEFAULTS = {
  fomoFeeMode: "flat", fomoFlatUsd: 1, fomoPct: 0.005,
  dexFeePct: 0.0025, priorityFeeUsd: 0.02,
  minSlipPct: 0.15, maxSlippagePct: 3,
};

/** Resultado neto de una ida y vuelta completa, con una suba de precio r. */
function roundTrip(N, r, settings, token, lagMs) {
  const slipIn = paper.impactSlip(settings, N, token, lagMs);
  const inn = paper.quoteSide(settings, N, token, slipIn);
  const held = N - inn.totalFees;              // lo que realmente quedó posicionado
  const exitValue = held * (1 + r);
  const slipOut = paper.impactSlip(settings, exitValue, token, lagMs);
  const out = paper.quoteSide(settings, exitValue, token, slipOut);
  return {
    net: out.net - N,                           // contra lo que pusiste
    feesIn: inn.totalFees, feesOut: out.totalFees,
    totalFees: inn.totalFees + out.totalFees,
    slipIn, slipOut,
  };
}

/** La suba mínima que deja el neto en cero. Se resuelve numéricamente
 *  porque las fees de salida dependen del valor de salida. */
function breakEven(N, settings, token, lagMs) {
  let lo = 0, hi = 10;                          // hasta +1000%
  if (roundTrip(N, hi, settings, token, lagMs).net < 0) return null;  // ni con +1000%
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (roundTrip(N, mid, settings, token, lagMs).net < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Al revés: el tamaño mínimo para que el break-even no pase de `target`. */
function minNotional(target, settings, token, lagMs, cap = 100000) {
  let lo = 1, hi = cap;
  const be = (n) => breakEven(n, settings, token, lagMs);
  if (be(hi) === null || be(hi) > target) return null;   // ni con posición enorme
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const b = be(mid);
    if (b === null || b > target) lo = mid; else hi = mid;
  }
  return hi;
}

function pct(x) { return x === null ? "imposible" : (x * 100).toFixed(1) + "%"; }
function usd(x) { return "$" + (x >= 100 ? Math.round(x).toLocaleString("en-US") : x.toFixed(2)); }

function main() {
  const a = process.argv.slice(2);
  const get = (k, d) => { const i = a.indexOf(k); return i >= 0 ? Number(a[i + 1]) : d; };
  const bankroll = get("--bankroll", 500);
  const mcap = get("--mcap", 1600000);           // el MCap que ves en FOMO
  const lagMs = get("--lag", 2000);              // cuánto tardás en reaccionar
  const target = get("--target", null);
  const settings = { ...DEFAULTS, fomoFlatUsd: get("--fee", 1) };
  const token = { mcap, tax: get("--tax", 0) };

  console.log(`\nBankroll ${usd(bankroll)} · token de ${usd(mcap)} MC · reaccionás en ${lagMs} ms · fee FOMO ${usd(settings.fomoFlatUsd)} flat\n`);

  if (target !== null) {
    const n = minNotional(target / 100, settings, token, lagMs);
    console.log(`Para que el break-even no pase de ${target}%:`);
    if (n === null) { console.log(`  imposible con estas fees y este token.\n`); return; }
    console.log(`  posición mínima  ${usd(n)}`);
    console.log(`  = ${(n / bankroll * 100).toFixed(1)}% de tu bankroll` +
      (n / bankroll > 0.25 ? "   ← concentración imprudente" : ""));
    console.log("");
    return;
  }

  const rows = [1.5, 5, 10, 20].map((p) => {
    const N = bankroll * p / 100;
    const be = breakEven(N, settings, token, lagMs);
    const rt = roundTrip(N, be || 0, settings, token, lagMs);
    return { p, N, be, fees: rt.totalFees };
  });

  console.log("  % bankroll   posición    fricción    tenés que hacer");
  console.log("  " + "─".repeat(56));
  for (const r of rows) {
    const flag = r.be === null ? "  ← inviable" : r.be > 0.15 ? "  ← inviable" : r.be > 0.06 ? "  ← muy caro" : r.be > 0.03 ? "  ← justo" : "  ← sano";
    console.log(`  ${String(r.p).padStart(5)}%   ${usd(r.N).padStart(9)}   ${usd(r.fees).padStart(8)}   ${pct(r.be).padStart(9)}${flag}`);
  }

  console.log("\n  Umbrales de tamaño:");
  for (const t of [3, 5, 10]) {
    const n = minNotional(t / 100, settings, token, lagMs);
    const share = n === null ? null : n / bankroll * 100;
    console.log(`    break-even ≤ ${String(t).padStart(2)}%  →  posición ≥ ${n === null ? "imposible" : usd(n).padStart(7) + `   (${share.toFixed(0)}% del bankroll)`}`);
  }
  console.log("");
}

if (require.main === module) main();
module.exports = { roundTrip, breakEven, minNotional, DEFAULTS };
