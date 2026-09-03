"use strict";

/** Scout — grafo de identidad FOMO ↔ X ↔ ENS ↔ Solana ↔ EVM.
 *  Fuentes públicas: FomoScan (fomoscan.sh) + Solscan. Nada inventado.
 */

/* PURGADO 2026-09-03 — los datos de este catálogo eran inventados.
 *
 * Se comprobó contra el endpoint real de FOMO (userHandle/econoar) que las
 * addresses declaradas acá como "resolved" y con source "fomoscan.sh + solscan"
 * NO son las de econoar:
 *
 *     declaraba   7sQJttJLutWjHkxbusTgE4GpSj5z4fegouv2USHDFN2H
 *     real        HZrxCXCms81ryxwvYNycwcPmynXmPgcKV4C2FeDJA86e
 *     declaraba   0x1605b59dfe3c1742c815d604aab6a2faa3a5c91f
 *     real        0x0cc1c39dc0c5fae009f0a8468bd50025a27e3cbc
 *
 * Si la única entrada comprobable era falsa, ninguna es confiable. También
 * declaraba PnL de 128 a 192 millones de dólares en cuentas de 19 a 570
 * seguidores, con un umbral de veto (1e12) calibrado justo para dejarlos pasar.
 *
 * Ahora quedan solo los handles como semilla. Las wallets se resuelven contra
 * la API real (lib/resolve.js) o se pegan a mano. Nada se da por verificado
 * sin fuente.
 */

function semilla(handle, name) {
  return {
    handle, name: name || handle,
    followers: 0, pnl: 0,
    wallet: null, evm: null, tapeWallet: null,
    walletStatus: "unknown",
    identityLevel: "unverified",
    unverified: true,
    source: null,
    fomo: "https://fomo.family/profile/" + handle,
  };
}

const ECONOAR = { ...semilla("econoar", "eric.eth"), aliases: ["econoar", "eric.eth", "ericeth", "eric", "ericconner"] };

const VERIFIED = [
  ECONOAR,
  ...["TassoLago", "thomaz687", "voided", "nobsicle", "InspectorMNBL",
      "divinely_protected", "boumm", "hobo_hands", "zuggie", "greenbean",
      "firehand_eth", "TaobaoGCR", "ping999", "Minty1x", "bantuu",
      "vancute1112", "thejefeee"].map((h) => semilla(h)),
];

// Handles que el tape mostraba con PnL de 9e19: ruido evidente, no traders.
const JUNK = ["Thynnao3571", "cierknowhowtotrade", "diinoo"]
  .map((h) => ({ ...semilla(h), junk: true }));

const catalog = new Map();
function index(t) {
  catalog.set(t.handle.toLowerCase(), t);
  for (const a of t.aliases || []) catalog.set(String(a).toLowerCase(), t);
}
for (const t of [...VERIFIED, ...JUNK]) index(t);

/**
 * Accept the formats people actually copy from FOMO: @handle, a bare handle,
 * or a profile/share URL (with query strings, fragments and mobile URLs).
 * We deliberately return an empty string for arbitrary URLs: following a URL
 * as a handle makes a permanent, impossible-to-resolve watchlist entry.
 */
function parseHandle(raw) {
  let value = String(raw || "").trim();
  if (!value) return "";

  // Pasting from a browser often omits the protocol.
  const urlish = /^(?:https?:\/\/)?(?:www\.)?fomo\.family(?:\/|$)/i.test(value);
  if (urlish) {
    try {
      const withProtocol = /^https?:\/\//i.test(value) ? value : "https://" + value;
      const url = new URL(withProtocol);
      if (!/(^|\.)fomo\.family$/i.test(url.hostname)) return "";
      const parts = url.pathname.split("/").filter(Boolean);
      const marker = parts.findIndex((part) => /^(profile|r)$/i.test(part));
      value = marker >= 0 ? (parts[marker + 1] || "") : (parts[0] || "");
    } catch {
      return "";
    }
  }

  value = value.replace(/^@+/, "").trim().replace(/[/?#].*$/, "");
  // FOMO handles may use underscores, dots and hyphens. Do not accept wallet
  // addresses or HTML/URL fragments here: wallet linking has its own flow.
  if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(value)) return "";
  const known = catalog.get(value.toLowerCase());
  return known ? known.handle : value;
}

function resolve(raw) { return parseHandle(raw); }

function get(handle) {
  return catalog.get(String(handle || "").toLowerCase()) || null;
}

function isSolanaAddress(value) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value || "").trim());
}

function isEvmAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

module.exports = {
  ECONOAR,
  VERIFIED,
  JUNK,
  catalog,
  index,
  parseHandle,
  resolve,
  get,
  isSolanaAddress,
  isEvmAddress,
  SEED_WATCH: ["econoar", "TassoLago", "nobsicle", "InspectorMNBL", "divinely_protected", "voided", "thomaz687", "firehand_eth", "Minty1x", "ping999"],
};
