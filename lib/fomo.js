"use strict";

/** Cliente de la API de FOMO.
 *
 *  Los endpoints NO están adivinados: salieron de observar qué llama la propia
 *  app (tools/browser/find-wallet.js → endpoints()). Cada uno está anotado con
 *  la forma de respuesta que se vio realmente.
 *
 *  Por qué esta API y no la cadena: la address del perfil (identidad, Privy)
 *  no tiene actividad on-chain. Los swaps se ejecutan desde otra address y se
 *  atribuyen a cada trader solo acá.
 */

const BASE = process.env.FOMO_API_BASE || "https://prod-api.fomo.family";
const MOBULA = process.env.MOBULA_API_BASE || "https://fomo-api.mobula.io";

/** Rutas confirmadas, con la forma de respuesta observada. */
const RUTAS = {
  perfil:      (handle) => `/v2/users/userHandle/${encodeURIComponent(handle)}`,
  //           → responseObject: { address, evmAddress, friendsFollowing[] }
  swaps:       (userId) => `/v2/users/${userId}/swaps`,
  //           → responseObject.swaps[]: { id, address, networkId, inTokenAddress, inAmount,
  //             inHumanAmount, outTokenAddress, outAmount, outHumanAmount, humanUsdAmountIn,
  //             humanUsdAmountOut, createdAt, inTradeId, outTradeId, isOffPlatform, isCrossmint,
  //             provider, inNetworkId, outNetworkId, recipient }
  //             Confirmado 2026-09-03 con econoar: financiado en USDC de Solana, provider "RELAY",
  //             el token de salida usa una address estilo "0x..." con networkId=4663 que no es
  //             ningún chain EVM real conocido — sin confirmar qué es. Ver lib/fomoSwaps.js.
  balances:    (userId) => `/v2/users/${userId}/balances`,
  //           → responseObject.balances[]: { balance:{tokenAddress}, tokenFilterResult:{token}, userToken }
  spotlight:   (userId) => `/v2/users/${userId}/spotlight`,
  //           → responseObject.bestTrades[]: { trade: { userAddress, ... } }
  transferencias: (userId) => `/v2/transfers/with/${userId}`,
  trade:       (tradeId) => `/trades/${tradeId}`,
  //           → responseObject: { transfers[]: { fromAddress }, swaps[] }
  comentarios: (tradeId) => `/trades/${tradeId}/comments`,
  feed:        () => `/feed/tradingActivity`,
  //           → responseObject.items[]: { tokenAddress, comment:{tokenAddress}, ... }
  usuarios:    () => `/v2/users`,
  watchlist:   () => `/watchlist`,
  tokens:      () => `/tokenAllowList/detailed`,
  config:      () => `/config`,
};

class FomoError extends Error {
  constructor(msg, status) { super(msg); this.name = "FomoError"; this.status = status; }
}

async function pedir(url, { timeoutMs = 15000, headers = {} } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: ac.signal,
    });
    if (!r.ok) throw new FomoError(`http ${r.status} en ${url}`, r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** Desenvuelve responseObject sin asumir que siempre está. */
function cuerpo(json) {
  return (json && json.responseObject !== undefined) ? json.responseObject : json;
}

async function get(ruta, opts) {
  return cuerpo(await pedir(BASE + ruta, opts));
}

/** handle → { userId, address, evmAddress, siguiendo[] } */
async function perfil(handle, opts) {
  const o = await get(RUTAS.perfil(String(handle).replace(/^@/, "")), opts);
  return {
    userId: o.id || o.userId || null,
    handle: o.handle || handle,
    address: o.address || null,
    evmAddress: o.evmAddress || null,
    siguiendo: Array.isArray(o.friendsFollowing) ? o.friendsFollowing : [],
    crudo: o,
  };
}

/** Historial de operaciones. La paginación no está documentada: se prueban
 *  los parámetros habituales y se reporta cuál funcionó, en vez de asumir. */
async function swaps(userId, { max = 2000, ...opts } = {}) {
  const out = [];
  const vistos = new Set();
  let esquema = null;

  for (const armar of [
    (n, tam) => `?limit=${tam}&offset=${n * tam}`,
    (n, tam) => `?limit=${tam}&page=${n + 1}`,
    (n, tam) => (n === 0 ? "" : null),        // sin paginación: una sola página
  ]) {
    const tam = 100;
    let paginas = 0;
    for (let n = 0; n < Math.ceil(max / tam); n++) {
      const q = armar(n, tam);
      if (q === null) break;
      let o;
      try { o = await get(RUTAS.swaps(userId) + q, opts); } catch (e) { break; }
      const lista = Array.isArray(o) ? o : (o && o.swaps) || [];
      if (!lista.length) break;
      let nuevos = 0;
      for (const s of lista) {
        const k = s.id || s.txHash || s.signature || JSON.stringify(s).slice(0, 120);
        if (vistos.has(k)) continue;
        vistos.add(k); out.push(s); nuevos++;
      }
      paginas++;
      if (!nuevos) break;                     // la página repite: no pagina así
      if (lista.length < tam) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    if (out.length) { esquema = armar(0, tam) === "" ? "sin-paginacion" : armar(1, tam); break; }
  }
  return { swaps: out, paginacion: esquema };
}

const balances  = (userId, o) => get(RUTAS.balances(userId), o);
const spotlight = (userId, o) => get(RUTAS.spotlight(userId), o);
const trade     = (tradeId, o) => get(RUTAS.trade(tradeId), o);
const feed      = (o) => get(RUTAS.feed(), o);

/** Historial de precios, para medir el costo de llegar tarde. */
async function precios(tokenAddress, { desde, hasta, ...opts } = {}) {
  const q = new URLSearchParams({ asset: tokenAddress });
  if (desde) q.set("from", String(desde));
  if (hasta) q.set("to", String(hasta));
  return cuerpo(await pedir(`${MOBULA}/api/2/token/ohlcv-history?${q}`, opts));
}

module.exports = { BASE, MOBULA, RUTAS, get, perfil, swaps, balances, spotlight, trade, feed, precios, cuerpo, FomoError };
