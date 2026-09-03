"use strict";

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

module.exports = { rpc, signatures, transaction, parseSwap, deltas, RPC, WSOL, STABLES, MIN_SOL };
