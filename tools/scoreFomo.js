#!/usr/bin/env node
"use strict";

/** Puntúa un trader de FOMO desde un export de tools/browser/export-swaps.js.
 *
 *  export-swaps.js intercepta TODO lo que la app llama mientras navegás, no
 *  solo swaps: el export suele traer también /balances (posiciones abiertas)
 *  mezclado en el mismo array. Por eso acá se queda solo con los registros
 *  que tienen forma de swap (inTokenAddress + outTokenAddress en la raíz) y
 *  se informa cuántos se descartaron por eso.
 *
 *  Uso:
 *    node tools/scoreFomo.js swaps.json
 */

const fs = require("fs");
const { normalize } = require("../lib/fomoSwaps");
const sc = require("./score");

function load(path) {
  const raw = JSON.parse(fs.readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) throw new Error("se esperaba un array (el export de exportar())");
  return raw;
}

/** Separa lo que tiene forma de swap de lo que no (p.ej. /balances mezclado). */
function soloSwaps(raw) {
  const swaps = [];
  const otros = [];
  for (const r of raw) {
    if (r && typeof r.inTokenAddress === "string" && typeof r.outTokenAddress === "string") swaps.push(r);
    else otros.push(r);
  }
  return { swaps, otros };
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.log("Uso: node tools/scoreFomo.js swaps.json");
    process.exit(1);
  }

  const raw = load(path);
  const { swaps, otros } = soloSwaps(raw);
  console.log(`${raw.length} registros en el archivo · ${swaps.length} con forma de swap · ${otros.length} de otro tipo (ignorados)`);

  const normalizados = swaps.map(normalize);
  const ok = normalizados.filter(Boolean);
  const rechazados = swaps.length - ok.length;
  console.log(`${ok.length} swaps clasificados (compra/venta contra una stable conocida)`);
  if (rechazados) {
    console.log(`${rechazados} swaps NO se pudieron clasificar (ninguna pata es una stable conocida, o las dos lo son) — no se adivinaron, quedaron afuera.`);
  }

  const mints = new Set(ok.map((s) => s.mint));
  const eps = sc.episodesFromSwaps(ok);
  console.log(`${mints.size} tokens distintos tocados · ${eps.length} operaciones CERRADAS (el resto sigue abierto, no cuenta)`);

  const s = sc.stats(eps);
  if (eps.length) {
    console.log(`\nDe lo cerrado hasta ahora:`);
    console.log(`  Resultado neto        $${s.totalNet.toFixed(2)}`);
    console.log(`  Aciertos              ${(s.winRate * 100).toFixed(0)}%`);
    console.log(`  Top-3 del PnL         ${(s.top3Share * 100).toFixed(0)}%${s.top3Share > 0.6 ? "   ← concentrado en pocas operaciones, cuidado con leer esto como habilidad" : ""}`);
  }

  if (eps.length < sc.MIN_TRADES) {
    console.log(`\nSIN PUNTAJE — muestra insuficiente: ${eps.length} operaciones cerradas, hace falta ${sc.MIN_TRADES}.`);
    console.log(`Bajá más historial (más días, o esperá a que se cierren más posiciones) y volvé a correr esto.`);
    return;
  }

  const edge = sc.edgeScore(s);
  const copy = sc.copyScore(s);
  console.log(`\nEDGE          ${edge.score} / 100`);
  edge.reasons.forEach((r) => console.log(`              · ${r}`));
  console.log(`COPIABILIDAD  ${copy.score} / 100`);
  copy.reasons.forEach((r) => console.log(`              · ${r}`));
  console.log(`PUNTAJE FINAL ${Math.round((edge.score * copy.score) / 100)} / 100`);
}

if (require.main === module) main();
module.exports = { load, soloSwaps };
