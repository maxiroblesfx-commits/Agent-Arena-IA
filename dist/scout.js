#!/usr/bin/env node
"use strict";
/* Scout — puntúa traders con su historial público, en Hyperliquid y en Solana.
 * Archivo único: no hay que instalar ni clonar nada. Node 18 o superior.
 *
 * Si Solana no devuelve nada, el RPC público puede ser el problema:
 *   SOLANA_RPC=<url-de-otro-rpc> node scout.js <address>
 */
const fs = require("fs");
const AYUDA = [
  "Scout — puntúa traders con su historial público.",
  "",
  "  node scout.js 0xAddressEVM        perpetuos en Hyperliquid",
  "  node scout.js AddressDeSolana     swaps en Solana",
  "  node scout.js --days 180 --max 600 <address>",
  "",
  "Variables: SOLANA_RPC para usar otro RPC · HL_API para Hyperliquid.",
].join("\n");

/** Cliente de la API pública de Hyperliquid.
 *  Sin API key: los endpoints /info de lectura no piden autenticación.
 *  Regla del proyecto: si algo no se puede traer, se reporta. Nunca se rellena.
 */

const ENDPOINT = process.env.HL_API || "https://api.hyperliquid.xyz/info";
const PAGE_LIMIT = 2000;      // tope que devuelve la API por request
const MAX_PAGES = 40;         // techo de seguridad: 80k fills

class HLError extends Error {
  constructor(msg, cause) { super(msg); this.name = "HLError"; this.cause = cause; }
}

async function info(body, { timeoutMs = 15000, retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep(400 * 2 ** (attempt - 1));
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (r.status === 429) { lastErr = new HLError("rate limit (429)"); continue; }
      if (!r.ok) throw new HLError("http " + r.status + " en " + body.type);
      return await r.json();
    } catch (e) {
      lastErr = e;
      // Abortar temprano si es un error de forma, no de red.
      if (e instanceof HLError && !/rate limit/.test(e.message)) throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new HLError("no se pudo consultar " + body.type + ": " + (lastErr && lastErr.message), lastErr);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Trae TODOS los fills desde startTime paginando hacia adelante.
 *  userFillsByTime devuelve hasta 2000 por página, ordenados por tiempo.
 */
async function allFills(user, startTime) {
  const out = [];
  const seen = new Set();
  let cursor = startTime;

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await info({ type: "userFillsByTime", user, startTime: cursor });
    if (!Array.isArray(batch)) {
      throw new HLError("userFillsByTime devolvió algo que no es un array — la API cambió de forma");
    }
    if (!batch.length) break;

    let added = 0;
    let maxTime = cursor;
    for (const f of batch) {
      // tid identifica el fill; hash+oid como respaldo si faltara.
      const key = f.tid != null ? String(f.tid) : `${f.hash}:${f.oid}:${f.time}:${f.sz}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f);
      added++;
      if (f.time > maxTime) maxTime = f.time;
    }

    // Sin fills nuevos, o la página no avanzó en el tiempo: cortamos.
    if (!added || maxTime <= cursor) break;
    cursor = maxTime + 1;
    if (batch.length < PAGE_LIMIT) break;
    await sleep(120); // cortesía con el rate limit compartido
  }

  out.sort((a, b) => a.time - b.time);
  return out;
}

async function state(user) {
  return info({ type: "clearinghouseState", user });
}

/** Velas de 1 minuto en una ventana. Se usa para medir el costo de llegar tarde. */
async function candles(coin, startTime, endTime, interval = "1m") {
  const res = await info({ type: "candleSnapshot", req: { coin, interval, startTime, endTime } });
  return Array.isArray(res) ? res : [];
}

/** Lector de swaps en Solana desde un RPC público. Sin API key.
 *
 *  No intenta entender cada DEX (Jupiter, Raydium, pump.fun, Meteora...).
 *  Lee lo único que no depende del programa usado: cómo cambiaron los saldos
 *  del dueño en la transacción. Si un token subió y el SOL bajó, fue compra.
 *  Eso funciona igual con cualquier DEX, presente o futuro.
 */

const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const WSOL = "So11111111111111111111111111111111111111112";
const LAMPORTS = 1e9;

/* Piso de polvo. Sumar de vuelta la comisión deja un saldo de SOL diminuto
 * (unos 5000 lamports) que NO es plata cobrada: sin este piso, una simple
 * transferencia de tokens se leía como una venta. 0.001 SOL está muy por
 * encima del ruido de comisiones y muy por debajo de cualquier operación real. */
const MIN_SOL = 0.001;

const STABLES = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function rpc(method, params, { retries = 4, timeoutMs = 20000 } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    if (i) await sleep(500 * 2 ** (i - 1));
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: ac.signal,
      });
      if (r.status === 429) { last = new Error("rate limit del RPC público"); continue; }
      if (!r.ok) throw new Error("http " + r.status);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      return j.result;
    } catch (e) {
      last = e;
    } finally { clearTimeout(t); }
  }
  throw new Error(method + ": " + (last && last.message));
}

/** Firmas más recientes primero. Pagina hasta `max`. */
async function signatures(address, max = 300) {
  const out = [];
  let before;
  while (out.length < max) {
    const lote = await rpc("getSignaturesForAddress",
      [address, { limit: Math.min(1000, max - out.length), ...(before ? { before } : {}) }]);
    if (!Array.isArray(lote) || !lote.length) break;
    out.push(...lote);
    before = lote[lote.length - 1].signature;
    if (lote.length < 2) break;
    await sleep(120);
  }
  return out.filter((s) => !s.err);      // las fallidas no son operaciones
}

function transaction(sig) {
  return rpc("getTransaction", [sig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]);
}

/** Deltas de saldo del dueño. Pura: se puede testear sin red. */
function deltas(tx, owner) {
  const m = tx && tx.meta;
  if (!m) return null;
  const porMint = new Map();

  const sumar = (lista, signo) => {
    for (const b of lista || []) {
      if (b.owner !== owner) continue;
      const v = Number((b.uiTokenAmount && b.uiTokenAmount.uiAmount) || 0);
      porMint.set(b.mint, (porMint.get(b.mint) || 0) + signo * v);
    }
  };
  sumar(m.preTokenBalances, -1);
  sumar(m.postTokenBalances, +1);

  // SOL nativo del dueño, descontando la comisión si él la pagó.
  const claves = ((tx.transaction || {}).message || {}).accountKeys || [];
  const i = claves.findIndex((k) => (typeof k === "string" ? k : k.pubkey) === owner);
  let sol = 0;
  if (i >= 0 && m.preBalances && m.postBalances) {
    sol = (m.postBalances[i] - m.preBalances[i]) / LAMPORTS;
    if (i === 0) sol += (m.fee || 0) / LAMPORTS;     // el fee no es parte del swap
  }
  // WSOL se comporta como SOL.
  if (porMint.has(WSOL)) { sol += porMint.get(WSOL); porMint.delete(WSOL); }

  return { sol, tokens: porMint };
}

/** Convierte una transacción en un swap normalizado, o null si no lo es. */
function parseSwap(tx, owner) {
  const d = deltas(tx, owner);
  if (!d) return null;

  const movidos = [...d.tokens.entries()].filter(([, v]) => Math.abs(v) > 1e-9);
  if (movidos.length !== 1) return null;          // ni swap simple, ni transferencia

  const [mint, delta] = movidos[0];
  const pagoStable = STABLES[mint] ? true : false;
  if (pagoStable) return null;                     // moverse entre stables no es una operación

  // Lo que se pagó o cobró en SOL debe ir en sentido contrario al token.
  if (Math.abs(d.sol) < MIN_SOL) return null;
  if (Math.sign(delta) === Math.sign(d.sol)) return null;

  const ts = (tx.blockTime || 0) * 1000;
  return {
    ts,
    at: ts ? new Date(ts).toISOString() : null,
    mint,
    side: delta > 0 ? "buy" : "sell",
    tokenAmount: Math.abs(delta),
    sol: Math.abs(d.sol),
    sig: (tx.transaction && tx.transaction.signatures && tx.transaction.signatures[0]) || null,
    slot: tx.slot || null,
  };
}

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

/** Lo mismo que episodes(), pero desde swaps de Solana.
 *  Acá no hay closedPnl: el resultado es lo que entró en SOL menos lo que
 *  salió. Una posición se considera cerrada cuando queda menos del 1% del
 *  máximo que llegó a tener — en Solana casi siempre queda polvo sin vender. */
function episodesFromSwaps(swaps) {
  const porMint = new Map();
  for (const s of swaps) {
    if (!porMint.has(s.mint)) porMint.set(s.mint, []);
    porMint.get(s.mint).push(s);
  }

  const out = [];
  for (const [mint, lista] of porMint) {
    lista.sort((a, b) => a.ts - b.ts);
    let ep = null, pos = 0, maxPos = 0;

    for (const s of lista) {
      const delta = s.side === "buy" ? s.tokenAmount : -s.tokenAmount;
      if (!ep && delta > 0) {
        ep = { coin: mint, openTime: s.ts, closeTime: s.ts, gastado: 0, cobrado: 0,
               fills: 0, entryFills: 0, liquidated: false };
        pos = 0; maxPos = 0;
      }
      if (!ep) continue;                       // vender algo que no vimos comprar

      pos += delta;
      if (pos > maxPos) maxPos = pos;
      ep.fills++;
      ep.closeTime = s.ts;
      if (s.side === "buy") { ep.entryFills++; ep.gastado += s.sol; }
      else ep.cobrado += s.sol;

      if (maxPos > 0 && pos <= maxPos * 0.01) {
        ep.net = ep.cobrado - ep.gastado;      // resultado en SOL
        ep.notional = ep.gastado;
        ep.pnl = ep.net; ep.fees = 0;          // las fees ya están dentro del precio
        ep.holdMs = Math.max(0, ep.closeTime - ep.openTime);
        out.push(ep);
        ep = null; pos = 0; maxPos = 0;
      }
    }
    // Una posición todavía abierta no se cuenta: no tiene resultado.
  }
  out.sort((a, b) => a.openTime - b.openTime);
  return out;
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
    // Positivo = el precio se movió en contra tuya mientras reaccionabas.
    // Negativo = se movió a favor: esperar un minuto te salía más barato.
    const penalty = clamp(lagBps / 120, 0, 1) * 45;
    score -= penalty;
    reasons.push(lagBps > 0
      ? `llegar 1 min tarde te cuesta ${lagBps.toFixed(0)} bps`
      : `esperar 1 min te favorece ${Math.abs(lagBps).toFixed(0)} bps — su entrada no mueve el precio en contra`);
  } else {
    reasons.push("costo de demora sin medir (correr con --lag)");
  }

  return { score: Math.round(clamp(score, 0, 100)), reasons };
}

function evaluar(eps, lagBps) {
  const s = stats(eps);
  if (s.n < MIN_TRADES) {
    return { ok: false, reason: `muestra insuficiente: ${s.n} operaciones cerradas, mínimo ${MIN_TRADES}`, stats: s, episodes: eps };
  }
  const edge = edgeScore(s), copy = copyScore(s, lagBps);
  return { ok: true, stats: s, episodes: eps, edge, copy, final: Math.round((edge.score * copy.score) / 100) };
}

/** Puntúa desde swaps de Solana (resultado en SOL, no en dólares). */
function rateSwaps(swaps, lagBps) {
  return { ...evaluar(episodesFromSwaps(swaps), lagBps), unidad: "SOL" };
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





const EVM = /^0x[a-fA-F0-9]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function parseArgs(argv) {
  const o = { days: 90, lag: false, json: null, targets: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--days") o.days = Number(argv[++i]) || 90;
    else if (a === "--lag") o.lag = true;
    else if (a === "--json") o.json = argv[++i];
    else if (a === "--max") o.max = Number(argv[++i]) || 400;
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
      const cs = await candles(f.coin, f.time, f.time + 3 * 60000, "1m");
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
  return { medianBps: median(costs), samples: costs.length };
}

async function scoutOne(target, opts) {
  const c = classify(target);

  if (c.kind === "handle") {
    return { target, status: "no-resuelto", note:
      "es un handle, no una address. FOMO no publica un resolver y este entorno no lo alcanza. " +
      "Abrí su perfil, copiá la address pública y volvé a correr con eso." };
  }
  if (c.kind === "solana") return scoutSolana(c.address, target, opts);

  const since = Date.now() - opts.days * 86400000;
  let fills;
  try {
    fills = await allFills(c.address, since);
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

  const res = rate(fills, lag ? lag.medianBps : undefined);
  return { target, status: res.ok ? "ok" : "muestra-corta", address: c.address, fills: fills.length, lag, ...res };
}

/** Solana: lee los swaps desde un RPC público y puntúa igual que Hyperliquid,
 *  pero con el resultado medido en SOL. */
async function scoutSolana(address, target, opts) {
  const desde = Date.now() - opts.days * 86400000;
  let firmas;
  try {
    firmas = await signatures(address, opts.max || 400);
  } catch (e) {
    return { target, status: "error", address, note: "RPC de Solana: " + e.message };
  }
  // Tres situaciones distintas que antes se informaban igual. Distinguirlas
  // es lo que dice si el problema es la address, la ventana, o el RPC.
  if (!firmas.length) {
    return { target, status: "sin-historial", address, note:
      "el RPC no devolvió NINGUNA transacción para esta address.\n" +
      "    Dos causas posibles, y se distinguen en 10 segundos:\n" +
      `    1. abrí https://solscan.io/account/${address}\n` +
      "       si el explorador SÍ muestra actividad, el problema es el RPC:\n" +
      "       el público (api.mainnet-beta.solana.com) no indexa historial completo.\n" +
      "       Probá con otro:  SOLANA_RPC=<url> node scout.js …\n" +
      "    2. si el explorador tampoco muestra nada, esta no es su wallet de trading.\n" +
      "       FOMO usa wallets embebidas de Privy: la address del perfil puede ser\n" +
      "       la de identidad y no desde la que se firman los swaps." };
  }

  const sinFecha = firmas.filter((f) => !f.blockTime).length;
  if (sinFecha === firmas.length) {
    return { target, status: "rpc-sin-fechas", address, firmas: firmas.length, note:
      `el RPC devolvió ${firmas.length} transacciones pero ninguna con fecha, así que no se\n` +
      "    puede filtrar por ventana. Es una limitación de ese RPC — probá con otro:\n" +
      "    SOLANA_RPC=<url> node scout.js …" };
  }

  const enVentana = firmas.filter((f) => (f.blockTime || 0) * 1000 >= desde);
  if (!enVentana.length) {
    const masVieja = Math.max(...firmas.map((f) => f.blockTime || 0)) * 1000;
    return { target, status: "sin-actividad-reciente", address, firmas: firmas.length, note:
      `hay ${firmas.length} transacciones, pero ninguna en los últimos ${opts.days} días.\n` +
      `    La más reciente es del ${masVieja ? new Date(masVieja).toISOString().slice(0, 10) : "?"}.\n` +
      "    Ampliá la ventana con --days." };
  }

  process.stdout.write(`  leyendo ${enVentana.length} transacciones de Solana`);
  const swaps = [];
  let leidas = 0;
  for (const f of enVentana) {
    try {
      const tx = await transaction(f.signature);
      const sw = tx && parseSwap(tx, address);
      if (sw) swaps.push(sw);
    } catch { /* una transacción ilegible no invalida el resto */ }
    if (++leidas % 25 === 0) process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 90));   // el RPC público es compartido
  }
  process.stdout.write("\n");

  if (!swaps.length) {
    return { target, status: "sin-swaps", address, txs: enVentana.length,
      note: "hubo actividad pero ningún swap contra SOL legible. Puede operar par token→token." };
  }
  const res = rateSwaps(swaps);
  return { target, status: res.ok ? "ok" : "muestra-corta", address,
    fills: swaps.length, txs: enVentana.length, chain: "solana", ...res };
}

function report(r) {
  const head = `\n${"─".repeat(72)}\n${r.target}${r.address && r.address !== r.target ? "  " + r.address : ""}`;
  if (r.status !== "ok" && r.status !== "muestra-corta") {
    return head + `\n  ${r.status.toUpperCase()} — ${r.note}`;
  }
  const s = r.stats;
  const sol = r.unidad === "SOL";
  const m = (n) => (sol ? (n >= 0 ? "" : "-") + Math.abs(n).toFixed(3) + " SOL" : fmtUsd(n));
  const L = [head];
  L.push(`  ${r.fills} ${sol ? "swaps" : "fills"} · ${s.n} operaciones cerradas · desde ${new Date(s.firstTrade).toISOString().slice(0, 10)}`);
  L.push("");
  L.push(`  Resultado neto        ${m(s.totalNet)}${sol ? "   (fees ya dentro del precio)" : "   (fees pagados " + fmtUsd(s.totalFees) + ")"}`);
  L.push(`  Expectativa/op        ${m(s.expectancy)}`);
  L.push(`  Aciertos              ${(s.winRate * 100).toFixed(0)}%`);
  L.push(`  Top-3 del PnL         ${(s.top3Share * 100).toFixed(0)}%${s.top3Share > 0.6 ? "   ← concentrado, ojo" : ""}`);
  L.push(`  Drawdown máx.         ${m(s.maxDrawdown)}  (${(s.maxDDvsGain * 100).toFixed(0)}% de lo ganado)`);
  L.push(`  Tenencia mediana      ${fmtDur(s.medianHoldMs)}`);
  L.push(`  Compras por entrada   ${s.medianEntryFills.toFixed(1)}`);
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
    console.log(AYUDA);
    process.exit(opts.help ? 0 : 1);
  }

  const clases = opts.targets.map(classify);
  const fuentes = [];
  if (clases.some((c) => c.kind === "evm")) fuentes.push(ENDPOINT);
  if (clases.some((c) => c.kind === "solana")) fuentes.push(RPC);
  console.log(`Scout · ${fuentes.join(" + ") || "sin fuente"} · ventana ${opts.days} días${opts.lag ? " · midiendo demora" : ""}`);

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

main().catch((e) => { console.error("\nError:", e.message); process.exit(1); });
