"use strict";

/** Normaliza un swap crudo de la API de FOMO (GET /v2/users/<id>/swaps) a la
 *  forma que espera el motor de puntaje (tools/score.js).
 *
 *  Forma real observada el 2026-09-03, pegada desde la consola del navegador
 *  en el perfil de econoar (userId c573ebfa-5e98-580c-ae15-c8672f11c151):
 *
 *    { id, address, networkId, inTokenAddress, inAmount, inHumanAmount,
 *      outTokenAddress, outAmount, outHumanAmount, humanUsdAmountIn,
 *      humanUsdAmountOut, createdAt, inTradeId, outTradeId, isOffPlatform,
 *      isCrossmint, provider, inNetworkId, outNetworkId, recipient }
 *
 *  Los dos ejemplos vistos: financiados en USDC de Solana (mint
 *  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v), ejecutados por
 *  provider "RELAY", contra un token identificado con una address estilo
 *  "0x..." y networkId=4663 — que NO es ningún chain id EVM real conocido.
 *  Es probablemente un id interno de FOMO/Relay para ese destino, no una
 *  address on-chain verificable. No se puede confirmar con solo 2 ejemplos:
 *  queda anotado como no verificado, no se asume nada más sobre esa pata.
 *
 *  Por qué esto reemplaza a tools/sol.js para este trader: la wallet de
 *  ejecución (aX8G1EVfWkRneHwWJN6RUecyGcXBYpz42yeKFa1rKiJ) tiene CERO
 *  transacciones en Solscan (comprobado 2026-09-03). Confirma el hallazgo 5
 *  del HANDOFF — estos swaps no son transacciones Solana visibles on-chain
 *  de la forma en que tools/sol.js sabe leer. La API de FOMO es la única
 *  fuente posible para esta pata.
 */

const STABLES = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC (Solana)
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT (Solana)
]);

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Un swap crudo → { ts, mint, side, tokenAmount, sol, id } o null si no se
 *  puede clasificar (ninguna pata es una stable conocida, o las dos lo son).
 *
 *  El campo se llama `sol` por compatibilidad con episodesFromSwaps() de
 *  tools/score.js, que trata cualquier moneda de financiamiento por igual:
 *  acá son dólares (humanUsdAmount*), no SOL nativo.
 */
function normalize(raw) {
  const ts = Date.parse(raw && raw.createdAt);
  if (!Number.isFinite(ts)) return null;

  const inStable = STABLES.has(raw.inTokenAddress);
  const outStable = STABLES.has(raw.outTokenAddress);

  if (inStable && !outStable) {
    const tokenAmount = num(raw.outHumanAmount);
    const usd = num(raw.humanUsdAmountIn);          // lo que costó
    if (tokenAmount === null || usd === null) return null;
    return { ts, mint: raw.outTokenAddress, side: "buy", tokenAmount, sol: usd, id: raw.id || null };
  }
  if (outStable && !inStable) {
    const tokenAmount = num(raw.inHumanAmount);
    const usd = num(raw.humanUsdAmountOut);         // lo que se cobró
    if (tokenAmount === null || usd === null) return null;
    return { ts, mint: raw.inTokenAddress, side: "sell", tokenAmount, sol: usd, id: raw.id || null };
  }
  return null; // token↔token o ninguna pata en stable: no se puede clasificar sin más datos
}

module.exports = { normalize, STABLES };
