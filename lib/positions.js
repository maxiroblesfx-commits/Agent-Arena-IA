"use strict";

/** Foto de entrada de las posiciones abiertas, desde /v2/users/<id>/balances.
 *
 *  POR QUÉ EXISTE
 *  El tape da la característica exacta en el instante de comprar, pero exige
 *  capturar en vivo 24/7 — la PC prendida y la sesión abierta. Esto es la
 *  alternativa barata: un export cuando quieras, y de ahí sale la foto de
 *  entrada de TODO lo que el trader tiene abierto en ese momento.
 *
 *  CÓMO SE RECONSTRUYE EL MARKET CAP DE ENTRADA
 *  /balances trae el market cap y el precio de AHORA, más el precio promedio
 *  al que entró (`averageEntryPriceUsd`). Como market cap = precio × supply y
 *  el supply de estos tokens no cambia:
 *
 *      mcap_entrada ≈ mcap_ahora × (precio_entrada / precio_ahora)
 *
 *  Validado contra stablecoins en los datos reales: USDC da entrada
 *  $7.939,75M → ahora $7.938,51M (−0%), que es exactamente lo que tiene que
 *  dar algo que no se mueve. Si el supply cambió (quema, desbloqueo, mint),
 *  la reconstrucción se corre — por eso es aproximada y se marca como tal.
 *
 *  LO QUE ESTO NO ES
 *  El retorno que sale acá es **no realizado**: son posiciones abiertas. Es
 *  el número más autocomplaciente que existe en trading, porque una posición
 *  perdedora no cuenta como pérdida mientras no la cierres. Caso concreto de
 *  este mismo repo: econoar tiene el libro abierto 51 a 36 en ganancia, y sin
 *  embargo su resultado REALIZADO en la misma ventana fue −$43.689. No
 *  mezclar las dos cosas.
 */

/** Un registro de /balances → foto de entrada, o null si le falta algo. */
function entrada(item) {
  if (!item || typeof item !== "object") return null;
  const t = item.tokenFilterResult;
  const u = item.userToken;
  if (!t || !u) return null;

  const mcapAhora = Number(t.marketCap);
  const precioAhora = Number(t.priceUSD);
  const precioEntrada = Number(u.averageEntryPriceUsd);
  if (!(mcapAhora > 0) || !(precioAhora > 0) || !(precioEntrada > 0)) return null;

  const desde = Date.parse(u.holdingSince);
  const token = t.token || {};

  return {
    userId: userIdDeUrl(item.__url),
    mint: (item.balance && item.balance.tokenAddress) || token.address || null,
    ticker: token.symbol || null,
    nombre: token.name || null,
    networkId: token.networkId ?? null,
    mcapEntrada: mcapAhora * (precioEntrada / precioAhora),   // aproximado, ver cabecera
    mcapAhora,
    precioEntrada,
    precioAhora,
    retornoNoRealizado: precioAhora / precioEntrada - 1,
    costo: Number(u.currentCostBasisUsd) || 0,
    pnlRealizado: Number(u.totalRealizedPnlUsd) || 0,
    desde: Number.isFinite(desde) ? desde : null,
    holdMs: Number.isFinite(desde) ? Math.max(0, Date.now() - desde) : null,
    volumen24: Number(t.volume24) || null,
    cambio24: Number(t.change24) || null,
    creadoEn: Number(t.createdAt) ? Number(t.createdAt) * 1000 : null,
  };
}

function userIdDeUrl(url) {
  const m = /\/users\/([0-9a-f-]{36})\//i.exec(String(url || ""));
  return m ? m[1] : null;
}

/** Saca las fotos de entrada de un export, ignorando lo que no sea /balances. */
function snapshot(items) {
  const filas = [];
  let candidatos = 0;
  for (const it of items) {
    if (!it || !it.tokenFilterResult || !it.userToken) continue;
    candidatos++;
    const e = entrada(it);
    if (e) filas.push(e);
  }
  return { filas, candidatos, descartados: candidatos - filas.length };
}

module.exports = { entrada, snapshot, userIdDeUrl };
