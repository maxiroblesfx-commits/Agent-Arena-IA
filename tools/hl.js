"use strict";

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

module.exports = { info, allFills, state, candles, HLError, ENDPOINT };
