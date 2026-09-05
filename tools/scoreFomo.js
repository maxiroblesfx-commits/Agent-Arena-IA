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
const { userIdDeUrl } = require("../lib/positions");
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
  if (!process.argv.slice(2).length) {
    console.log("Uso: node tools/scoreFomo.js swaps.json [otro.json ...]");
    process.exit(1);
  }

  const raw = [];
  for (const p of process.argv.slice(2)) raw.push(...load(p));
  const { swaps, otros } = soloSwaps(raw);
  console.log(`${raw.length} registros · ${swaps.length} con forma de swap · ${otros.length} de otro tipo (ignorados)`);

  const grupos = porTrader(swaps);
  console.log(`${grupos.size} trader(es) en el archivo\n`);

  const resultados = [];
  for (const [userId, delTrader] of grupos) {
    resultados.push(puntuarUno(userId, delTrader));
  }

  if (resultados.length > 1) ranking(resultados);
}

/** Agrupa por trader. Un export puede traer varios perfiles si se navegó
 *  entre ellos sin recargar, y sumarlos todos en un puntaje daría un promedio
 *  que no es de nadie.
 *
 *  El userId sale de la url (`/users/<id>/swaps`), pero no todos los swaps
 *  llegan por ahí: los que vienen de `/trades/<id>` no nombran al usuario.
 *  Para esos se usa la `address` que ejecutó, y el mapa address→trader se
 *  APRENDE de los swaps que sí están identificados — no se supone. En los
 *  datos reales eso recuperó 47 swaps de econoar que si no quedaban afuera.
 */
function porTrader(swaps) {
  const deAddress = new Map();
  for (const s of swaps) {
    const id = userIdDeUrl(s.__url);
    if (id && s.address) deAddress.set(s.address, id);
  }

  const grupos = new Map();
  for (const s of swaps) {
    const id = userIdDeUrl(s.__url) || deAddress.get(s.address) || "desconocido";
    if (!grupos.has(id)) grupos.set(id, []);
    grupos.get(id).push(s);
  }
  return grupos;
}

function puntuarUno(userId, swaps) {
  console.log("─".repeat(72));
  console.log(userId);

  const ok = swaps.map(normalize).filter(Boolean);
  const rechazados = swaps.length - ok.length;
  console.log(`  ${ok.length} swaps clasificados` +
    (rechazados ? ` · ${rechazados} sin clasificar (ninguna pata en una stable conocida) — quedaron afuera` : ""));

  const mints = new Set(ok.map((s) => s.mint));
  const eps = sc.episodesFromSwaps(ok);
  console.log(`  ${mints.size} tokens tocados · ${eps.length} operaciones CERRADAS (el resto sigue abierto)`);

  const s = sc.stats(eps);
  if (eps.length) {
    console.log(`  Resultado neto $${s.totalNet.toFixed(2)} · aciertos ${(s.winRate * 100).toFixed(0)}%` +
      ` · top-3 del PnL ${(s.top3Share * 100).toFixed(0)}%${s.top3Share > 0.6 ? " ←concentrado" : ""}`);
  }

  if (eps.length < sc.MIN_TRADES) {
    console.log(`  SIN PUNTAJE — ${eps.length} cerradas, hacen falta ${sc.MIN_TRADES}.\n`);
    return { userId, ok: false, cerradas: eps.length };
  }

  const edge = sc.edgeScore(s);
  const copy = sc.copyScore(s);
  const final = Math.round((edge.score * copy.score) / 100);
  console.log(`\n  EDGE          ${edge.score} / 100`);
  edge.reasons.forEach((r) => console.log(`                · ${r}`));
  console.log(`  COPIABILIDAD  ${copy.score} / 100`);
  copy.reasons.forEach((r) => console.log(`                · ${r}`));
  console.log(`  PUNTAJE FINAL ${final} / 100\n`);
  return { userId, ok: true, final, edge: edge.score, copy: copy.score, cerradas: eps.length, neto: s.totalNet };
}

function ranking(rs) {
  const puntuados = rs.filter((r) => r.ok).sort((a, b) => b.final - a.final);
  console.log("═".repeat(72));
  console.log("RANKING\n");
  puntuados.forEach((r, i) => {
    console.log(`  ${i + 1}. ${String(r.final).padStart(3)}/100  ${r.userId}   edge ${r.edge} × copia ${r.copy}  ·  ${r.cerradas} cerradas  ·  neto $${r.neto.toFixed(0)}`);
  });
  const sin = rs.filter((r) => !r.ok);
  if (sin.length) {
    console.log(`\n  Sin puntaje por muestra corta: ${sin.map((r) => `${r.userId} (${r.cerradas})`).join(", ")}`);
  }
}

if (require.main === module) main();
module.exports = { load, soloSwaps, porTrader };
