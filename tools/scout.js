#!/usr/bin/env node
"use strict";

/** Scout — puntúa traders reales desde su historial público de Hyperliquid.
 *
 *  Uso:
 *    node tools/scout.js 0xABC... 0xDEF...          puntúa esas addresses
 *    node tools/scout.js --days 180 0xABC...        ventana de historial
 *    node tools/scout.js --lag 0xABC...             mide el costo de llegar tarde
 *    node tools/scout.js --json out.json 0xABC...   vuelca todo a un archivo
 *
 *  Acepta addresses, no handles. La resolución handle → wallet es el bug F3
 *  y no se arregla adivinando: pegá la address y queda guardada.
 */

const fs = require("fs");
const hl = require("./hl");
const sc = require("./score");

const EVM = /^0x[a-fA-F0-9]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function parseArgs(argv) {
  const o = { days: 90, lag: false, json: null, targets: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--days") o.days = Number(argv[++i]) || 90;
    else if (a === "--lag") o.lag = true;
    else if (a === "--json") o.json = argv[++i];
    else if (a === "--help" || a === "-h") o.help = true;
    else o.targets.push(a);
  }
  return o;
}

function classify(t) {
  if (EVM.test(t)) return { kind: "evm", address: t.toLowerCase() };
  if (SOLANA.test(t)) return { kind: "solana", address: t };
  return { kind: "handle", handle: t.replace(/^@/, "") };
}

function fmtUsd(n) {
  const s = Math.abs(n) >= 1000 ? Math.round(n).toLocaleString("en-US") : n.toFixed(2);
  return (n < 0 ? "-$" : "$") + s.replace("-", "");
}
function fmtDur(ms) {
  const m = ms / 60000;
  if (m < 60) return m.toFixed(0) + " min";
  const h = m / 60;
  if (h < 48) return h.toFixed(1) + " h";
  return (h / 24).toFixed(1) + " d";
}

/** Costo de llegar un minuto tarde: precio del fill contra el cierre del
 *  minuto siguiente, en la dirección en que el trader entró.
 *  Es el proxy computable del "implementation shortfall" sin backend propio.
 */
async function measureLag(fills, sampleMax = 60) {
  const opens = fills.filter((f) => /open/i.test(String(f.dir || "")));
  if (!opens.length) return null;

  const step = Math.max(1, Math.floor(opens.length / sampleMax));
  const sample = opens.filter((_, i) => i % step === 0).slice(0, sampleMax);

  const costs = [];
  for (const f of sample) {
    try {
      const cs = await hl.candles(f.coin, f.time, f.time + 3 * 60000, "1m");
      if (!cs || cs.length < 2) continue;
      const entryPx = Number(f.px);
      const laterPx = Number(cs[1].c);   // cierre del minuto siguiente
      if (!entryPx || !laterPx) continue;
      const long = f.side === "B";
      // Positivo = te costó más caro por llegar tarde.
      const bps = ((laterPx - entryPx) / entryPx) * 10000 * (long ? 1 : -1);
      costs.push(bps);
    } catch { /* una vela que falta no invalida la muestra */ }
  }
  if (costs.length < 5) return null;
  return { medianBps: sc.median(costs), samples: costs.length };
}

async function scoutOne(target, opts) {
  const c = classify(target);

  if (c.kind === "handle") {
    return { target, status: "no-resuelto", note:
      "es un handle, no una address. FOMO no publica un resolver y este entorno no lo alcanza. " +
      "Abrí su perfil, copiá la address pública y volvé a correr con eso." };
  }
  if (c.kind === "solana") {
    return { target, status: "fuera-de-alcance", address: c.address, note:
      "address de Solana. El historial de swaps necesita un indexador con key (Helius o similar), " +
      "no la API pública de Hyperliquid. Queda para la pata Solana del adaptador." };
  }

  const since = Date.now() - opts.days * 86400000;
  let fills;
  try {
    fills = await hl.allFills(c.address, since);
  } catch (e) {
    return { target, status: "error", address: c.address, note: String(e.message || e) };
  }

  if (!fills.length) {
    return { target, status: "sin-actividad", address: c.address, note:
      `sin fills en Hyperliquid en los últimos ${opts.days} días. O no opera perpetuos ahí, ` +
      "o esta no es la address correcta." };
  }

  let lag = null;
  if (opts.lag) lag = await measureLag(fills);

  const res = sc.rate(fills, lag ? lag.medianBps : undefined);
  return { target, status: res.ok ? "ok" : "muestra-corta", address: c.address, fills: fills.length, lag, ...res };
}

function report(r) {
  const head = `\n${"─".repeat(72)}\n${r.target}${r.address && r.address !== r.target ? "  " + r.address : ""}`;
  if (r.status !== "ok" && r.status !== "muestra-corta") {
    return head + `\n  ${r.status.toUpperCase()} — ${r.note}`;
  }
  const s = r.stats;
  const L = [head];
  L.push(`  ${r.fills} fills · ${s.n} operaciones cerradas · ventana desde ${new Date(s.firstTrade).toISOString().slice(0, 10)}`);
  L.push("");
  L.push(`  Resultado neto        ${fmtUsd(s.totalNet)}   (fees pagados ${fmtUsd(s.totalFees)})`);
  L.push(`  Expectativa/op        ${fmtUsd(s.expectancy)}`);
  L.push(`  Aciertos              ${(s.winRate * 100).toFixed(0)}%`);
  L.push(`  Top-3 del PnL         ${(s.top3Share * 100).toFixed(0)}%${s.top3Share > 0.6 ? "   ← concentrado, ojo" : ""}`);
  L.push(`  Drawdown máx.         ${fmtUsd(s.maxDrawdown)}  (${(s.maxDDvsGain * 100).toFixed(0)}% de lo ganado)`);
  L.push(`  Tenencia mediana      ${fmtDur(s.medianHoldMs)}`);
  L.push(`  Fills por entrada     ${s.medianEntryFills.toFixed(1)}`);
  L.push(`  Liquidaciones         ${s.liquidations}`);
  if (r.lag) L.push(`  Costo de 1 min tarde  ${r.lag.medianBps.toFixed(0)} bps  (${r.lag.samples} muestras)`);

  if (!r.ok) {
    L.push("");
    L.push(`  SIN PUNTAJE — ${r.reason}`);
    return L.join("\n");
  }

  L.push("");
  L.push(`  EDGE          ${String(r.edge.score).padStart(3)} / 100`);
  r.edge.reasons.forEach((x) => L.push(`                · ${x}`));
  L.push(`  COPIABILIDAD  ${String(r.copy.score).padStart(3)} / 100`);
  r.copy.reasons.forEach((x) => L.push(`                · ${x}`));
  L.push(`  ─────────────────────────`);
  L.push(`  PUNTAJE       ${String(r.final).padStart(3)} / 100`);
  return L.join("\n");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.targets.length) {
    console.log(fs.readFileSync(__filename,"utf8").split("*/")[0].split("/**")[1].split("\n").map((l)=>l.replace(/^\s*\*ic?\s?/,"").replace(/^\s*\*\s?/,"")).join("\n").trim());
    process.exit(opts.help ? 0 : 1);
  }

  console.log(`Scout · ${hl.ENDPOINT} · ventana ${opts.days} días${opts.lag ? " · midiendo demora" : ""}`);

  const results = [];
  for (const t of opts.targets) {
    const r = await scoutOne(t, opts);
    results.push(r);
    console.log(report(r));
  }

  const scored = results.filter((r) => r.ok).sort((a, b) => b.final - a.final);
  if (scored.length > 1) {
    console.log(`\n${"═".repeat(72)}\nRANKING\n`);
    scored.forEach((r, i) => {
      console.log(`  ${i + 1}. ${String(r.final).padStart(3)}  ${r.target}   edge ${r.edge.score} × copia ${r.copy.score}`);
    });
  }
  const unscored = results.filter((r) => !r.ok);
  if (unscored.length) {
    console.log(`\nSin puntaje: ${unscored.map((r) => r.target + " (" + r.status + ")").join(", ")}`);
  }

  if (opts.json) {
    fs.writeFileSync(opts.json, JSON.stringify(results, null, 2));
    console.log(`\nDatos completos → ${opts.json}`);
  }
}

if (require.main === module) main().catch((e) => { console.error("\nError:", e.message); process.exit(1); });
module.exports = { classify, scoutOne, measureLag };
