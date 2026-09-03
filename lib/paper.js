"use strict";

/** Paper trading — mismas fricciones que FOMO / Jupiter / AMM.
 *  FOMO: fee flat $1 (default) o % con mínimo.
 *  DEX: bps de pool. Priority: SOL. Tax: del token. Slippage: lag + impacto.
 */

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function fomoFee(settings, notional) {
  const mode = settings.fomoFeeMode || "flat";
  const flat = num(settings.fomoFlatUsd, 1);
  const pct = num(settings.fomoPct, 0.005);
  if (mode === "pct") return round2(Math.max(flat, notional * pct));
  return round2(flat);
}

function quoteSide(settings, notional, token, slipPct) {
  const taxPct = num(token && token.tax, 0) / 100;
  const dex = notional * num(settings.dexFeePct, 0.0025);
  const fomo = fomoFee(settings, notional);
  const prio = num(settings.priorityFeeUsd, 0.02);
  const tax = notional * taxPct;
  const slip = notional * (num(slipPct, 0) / 100);
  const total = round2(fomo + dex + prio + tax + slip);
  return {
    notional: round2(notional),
    fomo: round2(fomo),
    dex: round2(dex),
    priority: round2(prio),
    tax: round2(tax),
    slip: round2(slip),
    totalFees: total,
    net: round2(notional - total),
    taxPct: taxPct * 100,
  };
}

function impactSlip(settings, notional, token, lagMs) {
  const mcap = num(token && token.mcap, 1e6);
  const impact = Math.min(8, (notional / mcap) * 4000);
  const lag = Math.min(4, num(lagMs, 400) / 900);
  const floor = num(settings.minSlipPct, 0.15);
  const cap = num(settings.maxSlippagePct, 3);
  return +Math.min(cap, floor + impact + lag).toFixed(2);
}

module.exports = { quoteSide, impactSlip, fomoFee, round2 };
