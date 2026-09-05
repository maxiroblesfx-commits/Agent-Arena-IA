#!/usr/bin/env node
"use strict";

/** Aprender del tape: qué compras terminan mal y cuáles no.
 *
 *  Uso:
 *    node tools/learn.js tape1.json tape2.json ...
 *
 *  Acepta varios archivos y los une deduplicando por id, así el dataset
 *  crece export tras export. Cada corrida dice cuántas observaciones hay y
 *  cuántas llegaron a tener resultado — sin eso, cualquier conclusión es
 *  ruido con formato de tabla.
 */

const fs = require("fs");
const tape = require("../lib/tape");

const MIN_GRUPO = 10;    // debajo de esto un grupo no se describe: no alcanza

function cargar(paths) {
  const porId = new Map();
  let leidos = 0;

  for (const p of paths) {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!Array.isArray(raw)) throw new Error(`${p}: se esperaba un array`);
    for (const item of raw) {
      leidos++;
      const k = (item && item.id) || JSON.stringify(item).slice(0, 120);
      if (!porId.has(k)) porId.set(k, item);
    }
  }
  const { swaps, milestones, theses, otros } = tape.clasificar([...porId.values()]);
  return { obs: swaps, milestones, theses, leidos, sinForma: otros.length };
}

function pct(x) { return x === null ? "—" : (x * 100).toFixed(1) + "%"; }
function usd(x) { return (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(0); }
function dur(ms) {
  if (ms === null) return "—";
  const m = ms / 60000;
  if (m < 60) return m.toFixed(0) + " min";
  const h = m / 60;
  return h < 48 ? h.toFixed(1) + " h" : (h / 24).toFixed(1) + " d";
}

function tabla(titulo, filas) {
  console.log(`\n${titulo}`);
  console.log("  " + "─".repeat(74));
  console.log(`  ${"grupo".padEnd(18)} ${"n".padStart(5)}  ${"retorno med.".padStart(12)}  ${"aciertos".padStart(9)}  ${"neto".padStart(10)}  ${"tenencia".padStart(9)}`);
  for (const f of filas) {
    const flojo = f.n < MIN_GRUPO;
    const linea = `  ${String(f.nombre).padEnd(18)} ${String(f.n).padStart(5)}  ` +
      (flojo
        ? "     muestra insuficiente — no se describe"
        : `${pct(f.retornoMediano).padStart(12)}  ${pct(f.aciertos).padStart(9)}  ${usd(f.netoTotal).padStart(10)}  ${dur(f.holdMediano).padStart(9)}`);
    console.log(linea);
  }
}

/** Los hitos de ganancia. Se describen, pero con la advertencia adelante:
 *  son solo ganadores, así que no se puede concluir nada sobre qué comprar. */
function reportarMilestones(ms) {
  if (!ms.length) return;
  console.log(`\n${"═".repeat(76)}`);
  console.log(`HITOS DE GANANCIA (${ms.length}) — SOLO GANADORES, sesgo de supervivencia`);
  console.log(`Esto NO dice qué comprar: el feed nunca publica un hito de pérdida, así que`);
  console.log(`por construcción acá no hay un solo caso malo con el que comparar.`);

  const retornos = ms.map((m) => m.retorno).filter(Number.isFinite);
  if (retornos.length) {
    console.log(`\n  Retorno mediano de un ganador: ${pct(tape.mediana(retornos))}`);
    console.log(`  Costo mediano de entrada:      ${usd(tape.mediana(ms.map((m) => m.costo)))}`);
    const holds = ms.map((m) => m.holdMs).filter(Number.isFinite);
    if (holds.length) console.log(`  Tenencia mediana hasta el hito: ${dur(tape.mediana(holds))}`);
  }
  if (ms.length >= MIN_GRUPO) {
    tabla("  Ganadores por market cap al momento del hito:", tape.porGrupo(
      ms.map((m) => ({ ...m, net: m.pnl, marketCapEntrada: m.marketCap, gastado: m.costo })),
      (v) => tape.banda(v.marketCapEntrada)));
  }
}

/** Las tesis: convicción pública con la posición del autor adentro. */
function reportarTesis(ts) {
  if (!ts.length) return;
  console.log(`\n${"═".repeat(76)}`);
  console.log(`TESIS PÚBLICAS (${ts.length}) — convicción declarada, con la posición del autor`);

  const abiertas = ts.filter((t) => t.sigueAbierta).length;
  console.log(`  ${abiertas} siguen abiertas · ${ts.length - abiertas} ya cerradas`);

  const conRetorno = ts.filter((t) => Number.isFinite(t.retornoNoRealizado));
  if (conRetorno.length) {
    console.log(`  Retorno no realizado mediano: ${pct(tape.mediana(conRetorno.map((t) => t.retornoNoRealizado)))}`);
  }
  const porToken = new Map();
  for (const t of ts) {
    if (!t.mint) continue;
    if (!porToken.has(t.mint)) porToken.set(t.mint, new Set());
    porToken.get(t.mint).add(t.handle);
  }
  const coincidencias = [...porToken.entries()].filter(([, hs]) => hs.size > 1);
  console.log(`  Tokens con tesis de MÁS DE UN trader: ${coincidencias.length}` +
    (coincidencias.length ? "   ← esto es la confluencia que busca el desk" : "   (todavía ninguna coincidencia)"));
  for (const [mint, hs] of coincidencias.slice(0, 8)) {
    const tk = ts.find((t) => t.mint === mint);
    console.log(`     ${(tk && tk.ticker) || mint}: ${[...hs].join(", ")}`);
  }
}

function main() {
  const paths = process.argv.slice(2);
  if (!paths.length) {
    console.log("Uso: node tools/learn.js tape1.json [tape2.json ...]");
    process.exit(1);
  }

  const { obs, milestones, theses, leidos, sinForma } = cargar(paths);
  console.log(`${leidos} registros leídos de ${paths.length} archivo(s)`);
  console.log(`${obs.length} compras/ventas · ${milestones.length} hitos de ganancia · ${theses.length} tesis · ${sinForma} sin reconocer`);

  if (!obs.length && !milestones.length && !theses.length) {
    console.log("\nNo hay ni un evento del tape acá. ¿El export salió de tools/browser/watch-tape.js?");
    return;
  }

  reportarMilestones(milestones);
  reportarTesis(theses);

  if (!obs.length) {
    console.log(`\n${"═".repeat(76)}`);
    console.log(`Sin compras/ventas capturadas todavía — y esa es la única pista sin sesgo.`);
    console.log(`Dejá corriendo tools/browser/watch-tape.js para juntarlas.`);
    return;
  }

  console.log(`\n${"═".repeat(76)}`);
  console.log(`COMPRAS Y VENTAS — la única pista que ve lo malo además de lo bueno`);

  const compras = obs.filter((o) => o.side === "buy").length;
  const ventas = obs.length - compras;
  const traders = new Set(obs.map((o) => o.userId)).size;
  const tokens = new Set(obs.map((o) => o.mint)).size;
  const desde = new Date(Math.min(...obs.map((o) => o.ts))).toISOString().slice(0, 16);
  const hasta = new Date(Math.max(...obs.map((o) => o.ts))).toISOString().slice(0, 16);
  console.log(`${compras} compras · ${ventas} ventas · ${traders} traders · ${tokens} tokens · ${desde} → ${hasta}`);

  const { cerrados, abiertos } = tape.roundTrips(obs);
  console.log(`\n${cerrados.length} operaciones CERRADAS (con resultado) · ${abiertos.length} todavía abiertas (sin resultado, no cuentan)`);

  if (!cerrados.length) {
    console.log(`\nTodavía no hay ni una operación cerrada. Es lo normal al empezar: hace falta ver`);
    console.log(`la compra Y la venta del mismo par (trader, token) dentro de la ventana capturada.`);
    console.log(`Dejá corriendo tools/browser/watch-tape.js más tiempo y volvé a exportar.`);
    return;
  }

  const retornos = cerrados.map((v) => v.retorno).filter((r) => r !== null);
  const neto = cerrados.reduce((s, v) => s + v.net, 0);
  console.log(`Retorno mediano ${pct(tape.mediana(retornos))} · aciertos ${pct(retornos.filter((r) => r > 0).length / retornos.length)} · neto agregado ${usd(neto)}`);

  tabla("Por market cap al momento de comprar:", tape.porGrupo(cerrados, (v) => tape.banda(v.marketCapEntrada)));
  tabla("Por trader:", tape.porGrupo(cerrados, (v) => v.handle || v.userId).slice(0, 12));

  const bandaTamano = (v) => v.gastado < 100 ? "< $100" : v.gastado < 1000 ? "$100 – $1k" : v.gastado < 10000 ? "$1k – $10k" : "> $10k";
  tabla("Por tamaño de la posición:", tape.porGrupo(cerrados, bandaTamano));

  const bandaHold = (v) => v.holdMs < 3600e3 ? "< 1 h" : v.holdMs < 86400e3 ? "1 – 24 h" : v.holdMs < 7 * 86400e3 ? "1 – 7 d" : "> 7 d";
  tabla("Por tiempo de tenencia:", tape.porGrupo(cerrados, bandaHold));

  const flojos = cerrados.length < 30;
  console.log(`\n${flojos ? "OJO: " : ""}${cerrados.length} operaciones cerradas en total.` +
    (flojos ? " Con menos de 30 esto describe lo que pasó, NO predice nada.\n     Cualquier patrón acá puede ser ruido. Seguí acumulando antes de sacar reglas." : ""));
  console.log(`\nRecordá el sesgo de fondo: esto solo ve lo que la gente COMPRÓ. No hay contrafáctico`);
  console.log(`de los tokens que ignoraron y volaron, así que no enseña a elegir — solo a comparar`);
  console.log(`entre lo que este grupo ya elige.`);
}

if (require.main === module) main();
module.exports = { cargar, MIN_GRUPO };
