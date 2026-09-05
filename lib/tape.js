"use strict";

/** Aprender del tape de FOMO (GET /feed/tradingActivity).
 *
 *  POR QUÉ EL TAPE Y NO LOS SWAPS DE UN PERFIL
 *  El export de un perfil (/swaps) trae el resultado pero NO cómo era el token
 *  cuando lo compró: esa metadata solo vive en /balances, y /balances solo
 *  devuelve lo que el trader tiene ABIERTO ahora. En cuanto cierra, la
 *  característica desaparece de la API para siempre. Se comprobó: de 39
 *  operaciones cerradas de econoar, 0 tenían metadata.
 *
 *  El tape no tiene ese problema. Forma real observada el 2026-09-04:
 *
 *    { type: "swap_buy"|"swap_sell", id, tradeId, createdAt, userId,
 *      userHandle, displayName, verified, usdAmount, marketCap, fdv, price,
 *      ticker, tokenAddress, networkId, equity, twitter, ... }
 *
 *  Cada item trae `marketCap`, `fdv` y `price` EN EL INSTANTE de la operación.
 *  O sea que una compra ya viene con su foto del token, y la venta posterior
 *  del mismo par (trader, token) da el resultado. Características y resultado
 *  en la misma fuente, para todos los traders de la plataforma.
 *
 *  LO QUE ESTO NO ES
 *  El tape muestra lo que muestra: si filtra por tamaño o por popularidad, la
 *  muestra queda sesgada y estas conclusiones valen solo dentro de ese sesgo.
 *  Y solo se ve lo que la gente COMPRÓ — nunca los tokens que ignoró y
 *  volaron. No se puede aprender "qué token va a subir", solo "entre lo que
 *  esta gente compra, qué termina peor". Es una distinción importante.
 */

/** Un item crudo del tape → operación normalizada, o null si no sirve.
 *  Solo swap_buy / swap_sell: es la ÚNICA pista del feed sin sesgo de
 *  supervivencia, porque muestra compras y ventas pasen bien o mal. */
function normalize(item) {
  if (!item || typeof item !== "object") return null;

  const side = item.type === "swap_buy" ? "buy" : item.type === "swap_sell" ? "sell" : null;
  if (!side) return null;                       // hay otros tipos de evento en el feed

  const ts = Date.parse(item.createdAt);
  const price = Number(item.price);
  const usd = Number(item.usdAmount);
  if (!Number.isFinite(ts) || !(price > 0) || !(usd > 0)) return null;

  return {
    ts,
    side,
    userId: item.userId || null,
    handle: item.userHandle || null,
    mint: item.tokenAddress || null,
    ticker: item.ticker || null,
    networkId: item.networkId ?? null,
    price,
    usd,
    marketCap: Number(item.marketCap) || null,
    fdv: Number(item.fdv) || null,
    equity: Number(item.equity) || null,
    id: item.id || null,
  };
}

/** user_trade_profit_milestone → ejemplo etiquetado, o null.
 *
 *  Trae todo junto y sin tener que emparejar nada: cuándo entró, cuánto puso,
 *  cuánto ganó, y cómo estaba el token en ese momento.
 *
 *  SESGO CRÍTICO: es un hito de GANANCIA. Solo dispara para los que ganaron.
 *  Un dataset hecho solo de esto enseña cómo se ven los ganadores sin haber
 *  visto jamás un perdedor — el error de supervivencia de manual. Sirve como
 *  descripción del lado bueno, NUNCA como base para decidir qué comprar.
 */
function milestone(item) {
  if (!item || item.type !== "user_trade_profit_milestone") return null;
  const b = item.body;
  if (!b) return null;

  const ts = Date.parse(item.createdAt);
  const entrada = Date.parse(b.entryTime);
  const costo = Number(b.totalCostBasis);
  const pnl = Number(b.totalPnlUsd);
  if (!Number.isFinite(ts) || !(costo > 0) || !Number.isFinite(pnl)) return null;

  return {
    tipo: "milestone",
    ts,
    entradaTs: Number.isFinite(entrada) ? entrada : null,
    holdMs: Number.isFinite(entrada) ? Math.max(0, ts - entrada) : null,
    userId: b.userId || item.userId || null,
    handle: b.userHandle || null,
    tag: b.tag || null,
    mint: item.tokenAddress || null,
    ticker: b.ticker || null,
    networkId: item.networkId ?? null,
    costo,
    pnl,
    retorno: Number(b.totalPercentagePnl) / 100,
    marketCap: Number(b.marketCap) || null,
    fdv: Number(b.fdv) || null,
    equity: Number(item.equity) || null,
    id: item.id || null,
  };
}

/** thesis → convicción pública + la posición real del autor, o null.
 *
 *  Es la señal que da sentido al desk: alguien dice en público que cree en un
 *  token, y el evento trae cuánto tiene puesto y cómo le va. `closedAt` dice
 *  si todavía la sostiene. Ojo: una tesis no es una compra — puede publicarse
 *  mucho después de haber entrado.
 */
function thesis(item) {
  if (!item || item.type !== "thesis") return null;
  const ts = Date.parse(item.createdAt);
  if (!Number.isFinite(ts)) return null;

  const t = item.authorTrade || {};
  const c = item.comment || {};
  return {
    tipo: "thesis",
    ts,
    userId: item.userId || null,
    handle: item.userHandle || null,
    mint: item.tokenAddress || null,
    ticker: item.ticker || null,
    networkId: item.networkId ?? null,
    texto: typeof c.comment === "string" ? c.comment : null,
    likes: Number(c.numLikes) || 0,
    posicionUsd: Number(t.usdValue) || null,
    pnlNoRealizado: Number(t.unrealizedPnlUsd) || null,
    pnlRealizado: Number(t.realizedPnlUsd) || null,
    retornoNoRealizado: Number.isFinite(Number(t.percentageUnrealizedPnl)) ? Number(t.percentageUnrealizedPnl) / 100 : null,
    sigueAbierta: t.closedAt === null || t.closedAt === undefined,
    equity: Number(item.equity) || null,
    id: item.id || null,
  };
}

/** Reparte los items del feed en las tres pistas + lo que no se reconoce. */
function clasificar(items) {
  const swaps = [], milestones = [], theses = [], otros = [];
  for (const it of items) {
    const s = normalize(it);
    if (s) { swaps.push(s); continue; }
    const m = milestone(it);
    if (m) { milestones.push(m); continue; }
    const t = thesis(it);
    if (t) { theses.push(t); continue; }
    otros.push(it);
  }
  return { swaps, milestones, theses, otros };
}

/** Reconstruye viajes de ida y vuelta por (trader, token).
 *
 *  La cantidad de tokens no viene en el tape, pero sí `usdAmount` y `price`,
 *  así que se deduce: cantidad = usd / price. Una posición se considera
 *  cerrada cuando queda menos del 1% del máximo que llegó a tener — la misma
 *  regla que episodesFromSwaps() en tools/score.js, para que los números de
 *  las dos vías sean comparables.
 */
function roundTrips(obs) {
  const porPar = new Map();
  for (const o of obs) {
    if (!o.userId || !o.mint) continue;
    const k = o.userId + "|" + o.mint;
    if (!porPar.has(k)) porPar.set(k, []);
    porPar.get(k).push(o);
  }

  const cerrados = [];
  const abiertos = [];

  for (const lista of porPar.values()) {
    lista.sort((a, b) => a.ts - b.ts);
    let v = null, pos = 0, maxPos = 0;

    for (const o of lista) {
      const qty = o.usd / o.price;

      if (!v && o.side === "buy") {
        v = nuevoViaje(o);
        pos = 0; maxPos = 0;
      }
      if (!v) continue;                          // vender algo que no vimos comprar

      if (o.side === "buy") {
        pos += qty;
        v.gastado += o.usd;
        v.qtyComprada += qty;
        v.entryFills++;
        if (v.marketCapEntrada === null) v.marketCapEntrada = o.marketCap;
        if (v.fdvEntrada === null) v.fdvEntrada = o.fdv;
      } else {
        pos -= qty;
        v.cobrado += o.usd;
        v.qtyVendida += qty;
        v.exitFills++;
      }
      if (pos > maxPos) maxPos = pos;
      v.fills++;
      v.closeTime = o.ts;

      if (maxPos > 0 && pos <= maxPos * 0.01 && v.exitFills > 0) {
        cerrados.push(cerrar(v));
        v = null; pos = 0; maxPos = 0;
      }
    }
    if (v) abiertos.push(v);                     // sigue abierto: no tiene resultado
  }

  cerrados.sort((a, b) => a.openTime - b.openTime);
  return { cerrados, abiertos };
}

function nuevoViaje(o) {
  return {
    userId: o.userId, handle: o.handle, mint: o.mint, ticker: o.ticker,
    networkId: o.networkId,
    openTime: o.ts, closeTime: o.ts,
    precioEntrada: o.price,
    marketCapEntrada: null, fdvEntrada: null,
    gastado: 0, cobrado: 0,
    qtyComprada: 0, qtyVendida: 0,
    fills: 0, entryFills: 0, exitFills: 0,
  };
}

function cerrar(v) {
  v.net = v.cobrado - v.gastado;
  v.retorno = v.gastado > 0 ? v.net / v.gastado : null;
  v.holdMs = Math.max(0, v.closeTime - v.openTime);
  return v;
}

const BANDAS = [
  { nombre: "< $100k",      max: 1e5 },
  { nombre: "$100k – $1M",  max: 1e6 },
  { nombre: "$1M – $10M",   max: 1e7 },
  { nombre: "$10M – $100M", max: 1e8 },
  { nombre: "> $100M",      max: Infinity },
];

function banda(mcap) {
  if (!(mcap > 0)) return "sin market cap";
  return (BANDAS.find((b) => mcap < b.max) || BANDAS[BANDAS.length - 1]).nombre;
}

function mediana(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Agrupa los viajes cerrados por una característica y describe cada grupo.
 *  No saca conclusiones: devuelve n y las medidas. Quien lee decide si `n`
 *  alcanza — por eso `n` va siempre primero. */
function porGrupo(cerrados, clave) {
  const grupos = new Map();
  for (const v of cerrados) {
    const g = clave(v);
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(v);
  }

  return [...grupos.entries()].map(([nombre, vs]) => {
    const retornos = vs.map((v) => v.retorno).filter((r) => r !== null);
    return {
      nombre,
      n: vs.length,
      retornoMediano: mediana(retornos),
      aciertos: retornos.length ? retornos.filter((r) => r > 0).length / retornos.length : null,
      netoTotal: vs.reduce((s, v) => s + v.net, 0),
      holdMediano: mediana(vs.map((v) => v.holdMs)),
      tamanoMediano: mediana(vs.map((v) => v.gastado)),
    };
  }).sort((a, b) => b.n - a.n);
}

module.exports = { normalize, milestone, thesis, clasificar, roundTrips, porGrupo, banda, mediana, BANDAS };
