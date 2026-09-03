"use strict";

/** Resolver de handle → wallet contra la API real de FOMO.
 *
 *  Reemplaza al catálogo hardcodeado de lib/identity.js, cuyos datos se
 *  comprobaron falsos. El contrato salió de observar a la propia app:
 *
 *      GET <base>/userHandle/<handle>
 *      → { responseObject: { address, evmAddress, friendsFollowing[], ... } }
 *
 *  Regla: si no se puede resolver, se dice. Nunca se rellena.
 */

const BASE = process.env.FOMO_API_BASE || "https://prod-api.fomo.family";
const PREFIJOS = ["", "/v1", "/v2", "/api", "/users"];

function isSolana(v) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(v || "").trim()); }
function isEvm(v) { return /^0x[a-fA-F0-9]{40}$/.test(String(v || "").trim()); }

async function pedir(url, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, signal: ac.signal });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, body: await r.json() };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

/** Extrae las addresses del cuerpo, tolerando que la API mueva el envoltorio. */
function extraer(body) {
  const o = (body && body.responseObject) || body || {};
  const sol = [o.address, o.solanaAddress, o.walletAddress].find(isSolana) || null;
  const evm = [o.evmAddress, o.address, o.ethAddress].find(isEvm) || null;
  return { sol, evm, raw: o };
}

/** Devuelve { status, sol, evm, url } — nunca inventa una address. */
async function resolveHandle(handle, { timeoutMs = 8000, base = BASE } = {}) {
  const h = String(handle || "").replace(/^@/, "").trim();
  if (!h) return { status: "invalido", motivo: "handle vacío" };
  if (isSolana(h) || isEvm(h)) {
    return { status: "ya-es-address", sol: isSolana(h) ? h : null, evm: isEvm(h) ? h : null };
  }

  const intentos = [];
  for (const pre of PREFIJOS) {
    const url = `${base}${pre}/userHandle/${encodeURIComponent(h)}`;
    const r = await pedir(url, timeoutMs);
    intentos.push({ url, ok: r.ok, status: r.status || r.error });
    if (!r.ok) continue;
    const { sol, evm } = extraer(r.body);
    if (sol || evm) return { status: "resuelto", handle: h, sol, evm, url, fuente: "fomo:userHandle" };
    return { status: "sin-address", handle: h, url, motivo: "la API respondió pero no trae address pública" };
  }
  return { status: "no-resuelto", handle: h, intentos,
    motivo: "ningún prefijo respondió. Pegá la address a mano, o corré tools/browser/find-wallet.js en el perfil." };
}

module.exports = { resolveHandle, extraer, isSolana, isEvm, BASE };
