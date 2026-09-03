"use strict";

/** El puntaje que reemplaza a forensic().
 *
 *  forensic() medía popularidad: KOL, followers, wallet resuelta, holdings.
 *  Esto mide dos cosas distintas que se multiplican:
 *
 *    EDGE          ¿gana plata, o tuvo suerte?
 *    COPIABILIDAD  ¿te queda algo de ese edge después de la demora?
 *
 *  Se multiplican y no se suman: un trader excelente que entra y sale en
 *  40 segundos es incopiable, y su edge real no te sirve de nada.
 *
 *  Todo sale del historial de fills. Nada se escribe a mano.
 */

const MIN_TRADES = 30;   // debajo de esto no se puntúa: es ruido, no señal

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

/** Reconstruye operaciones cerradas ("episodios") a partir de fills sueltos.
 *  Un episodio va desde que la posición sale de cero hasta que vuelve a cero.
 *  Un giro de signo cuenta como cierre + apertura.
 */
function episodes(fills) {
  const byCoin = new Map();
  for (const f of fills) {
    if (!byCoin.has(f.coin)) byCoin.set(f.coin, []);
    byCoin.get(f.coin).push(f);
  }

  const out = [];
  for (const [coin, list] of byCoin) {
    list.sort((a, b) => a.time - b.time);
    let ep = null;

    for (const f of list) {
      const before = num(f.startPosition);
      const delta = f.side === "B" ? num(f.sz) : -num(f.sz);
      const after = before + delta;
      const liq = /liquidat/i.test(String(f.dir || ""));

      // Abre si veníamos de cero.
      if (!ep && before === 0 && after !== 0) {
        ep = newEpisode(coin, f);
      }

      if (ep) {
        ep.pnl += num(f.closedPnl);
        ep.fees += num(f.fee);
        ep.fills++;
        if (liq) ep.liquidated = true;
        // Fill que agranda la posición = entrada.
        if (Math.abs(after) > Math.abs(before)) {
          ep.entryFills++;
          ep.notional += num(f.px) * num(f.sz);
        }
        ep.closeTime = f.time;

        // Cierre total, o giro de signo.
        const flipped = before !== 0 && after !== 0 && Math.sign(before) !== Math.sign(after);
        if (after === 0 || flipped) {
          out.push(finish(ep));
          ep = flipped ? newEpisode(coin, f, after) : null;
          if (ep) { ep.notional += Math.abs(after) * num(f.px); ep.entryFills = 1; }
        }
      }
    }
    // Un episodio todavía abierto no se cuenta: no tiene resultado.
  }

  out.sort((a, b) => a.openTime - b.openTime);
  return out;
}

function newEpisode(coin, f, sizeOverride) {
  return {
    coin, openTime: f.time, closeTime: f.time,
    pnl: 0, fees: 0, fills: 0, entryFills: 0,
    notional: sizeOverride === undefined ? 0 : 0,
    liquidated: false,
  };
}

function finish(ep) {
  ep.net = ep.pnl - ep.fees;
  ep.holdMs = Math.max(0, ep.closeTime - ep.openTime);
  return ep;
}

/** Estadística cruda. Sin juicio todavía. */
function stats(eps) {
  const nets = eps.map((e) => e.net);
  const wins = nets.filter((x) => x > 0);
  const totalNet = nets.reduce((s, x) => s + x, 0);
  const grossWin = wins.reduce((s, x) => s + x, 0);

  // Concentración: cuánto del total ganado explican los 3 mejores.
  const top3 = [...wins].sort((a, b) => b - a).slice(0, 3).reduce((s, x) => s + x, 0);
  const top3Share = grossWin > 0 ? top3 / grossWin : 1;

  // Drawdown sobre la curva acumulada de resultado realizado.
  let peak = 0, cum = 0, maxDD = 0;
  for (const x of nets) {
    cum += x;
    if (cum > peak) peak = cum;
    if (peak - cum > maxDD) maxDD = peak - cum;
  }

  const notionals = eps.map((e) => e.notional).filter((x) => x > 0);

  return {
    n: eps.length,
    totalNet,
    expectancy: eps.length ? totalNet / eps.length : 0,
    winRate: eps.length ? wins.length / eps.length : 0,
    top3Share,
    maxDrawdown: maxDD,
    maxDDvsGain: grossWin > 0 ? maxDD / grossWin : 1,
    medianHoldMs: median(eps.map((e) => e.holdMs)),
    medianEntryFills: median(eps.map((e) => e.entryFills)),
    medianNotional: median(notionals),
    liquidations: eps.filter((e) => e.liquidated).length,
    totalFees: eps.reduce((s, e) => s + e.fees, 0),
    firstTrade: eps.length ? eps[0].openTime : null,
    lastTrade: eps.length ? eps[eps.length - 1].closeTime : null,
  };
}

/** ¿Gana plata, o tuvo suerte? */
function edgeScore(s) {
  const reasons = [];
  let score = 0;

  const retPerTrade = s.medianNotional > 0 ? s.expectancy / s.medianNotional : 0;
  if (s.expectancy <= 0) {
    reasons.push("expectativa neta negativa");
  } else {
    const p = clamp(retPerTrade / 0.02, 0, 1) * 40;   // 2% por trade satura
    score += p;
    reasons.push(`expectativa +${(retPerTrade * 100).toFixed(2)}% por operación`);
  }

  const conc = clamp((0.75 - s.top3Share) / 0.45, 0, 1) * 20;
  score += conc;
  if (s.top3Share > 0.6) reasons.push(`${Math.round(s.top3Share * 100)}% del PnL en 3 operaciones — puede ser suerte`);

  const dd = clamp((1 - s.maxDDvsGain) / 0.8, 0, 1) * 20;
  score += dd;
  if (s.maxDDvsGain > 0.5) reasons.push(`drawdown ${Math.round(s.maxDDvsGain * 100)}% de lo ganado`);

  score += clamp((s.winRate - 0.3) / 0.35, 0, 1) * 10;
  score += clamp((s.n - MIN_TRADES) / 170, 0, 1) * 10;

  if (s.liquidations) {
    score -= Math.min(30, s.liquidations * 15);
    reasons.push(`${s.liquidations} liquidación(es) — revela cómo dimensiona bajo estrés`);
  }

  return { score: Math.round(clamp(score, 0, 100)), reasons };
}

/** ¿Te queda algo del edge después de la demora? */
function copyScore(s, lagBps) {
  const reasons = [];
  const mins = s.medianHoldMs / 60000;

  // Tiempo de tenencia: el filtro más duro y el menos discutible.
  let hold;
  if (mins < 2) { hold = 5; reasons.push(`tenencia mediana ${mins.toFixed(1)} min — incopiable`); }
  else if (mins < 15) { hold = 30; reasons.push(`tenencia ${mins.toFixed(0)} min — ventana muy corta`); }
  else if (mins < 60) hold = 60;
  else if (mins < 360) hold = 85;
  else hold = 95;

  let score = hold;

  // Entrada escalonada te regala una ventana; el golpe único no.
  if (s.medianEntryFills > 1.5) { score += 8; reasons.push("entra escalonado — te deja ventana"); }
  else reasons.push("entra de un golpe — sin ventana");

  // Costo medido de llegar tarde, si se calculó.
  if (typeof lagBps === "number" && Number.isFinite(lagBps)) {
    const penalty = clamp(lagBps / 120, 0, 1) * 45;
    score -= penalty;
    reasons.push(`llegar 1 min tarde cuesta ${lagBps.toFixed(0)} bps`);
  } else {
    reasons.push("costo de demora sin medir (correr con --lag)");
  }

  return { score: Math.round(clamp(score, 0, 100)), reasons };
}

function rate(fills, lagBps) {
  const eps = episodes(fills);
  const s = stats(eps);

  if (s.n < MIN_TRADES) {
    return {
      ok: false,
      reason: `muestra insuficiente: ${s.n} operaciones cerradas, mínimo ${MIN_TRADES}`,
      stats: s, episodes: eps,
    };
  }

  const edge = edgeScore(s);
  const copy = copyScore(s, lagBps);
  return {
    ok: true,
    stats: s,
    episodes: eps,
    edge, copy,
    final: Math.round((edge.score * copy.score) / 100),
  };
}

module.exports = { episodes, stats, edgeScore, copyScore, rate, median, MIN_TRADES };
