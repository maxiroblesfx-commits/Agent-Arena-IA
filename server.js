"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const ident = require("./lib/identity");
const paper = require("./lib/paper");

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
const FOMO_API = "https://api.fomoscope.xyz";
const FOMOSCAN_API = "https://api.fomoscan.sh";
// Demo traffic is opt-in. A failed provider must never look like a real trade.
const DEMO_MODE = process.env.DEMO_MODE === "true";
const STORE = path.join(__dirname, "data", "store.json");
const PUBLIC = path.join(__dirname, "docs");
const JUNK_PNL = 1e12;

const TOKENS = [
  { ticker: "fone", mint: "CTPoyCwkjMvoJwU4xvZZqoD8tiYk6yDchySiN5gGpump", mcap: 18700000, chain: "solana", risk: "MED", mintRevoked: true, freeze: false, lpLock: 72, top10: 38, ageHours: 96, tax: 0, pump: true },
  { ticker: "USELESS", mint: "Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk", mcap: 115000000, chain: "solana", risk: "LOW", mintRevoked: true, freeze: false, lpLock: 98, top10: 22, ageHours: 4000, tax: 0, pump: false },
  { ticker: "CATE", mint: "Ai66LHZG9MCzg1WKdawwqduVAXpNDUuV8M3uyq5ppump", mcap: 34700000, chain: "solana", risk: "MED", mintRevoked: true, freeze: false, lpLock: 80, top10: 41, ageHours: 180, tax: 0, pump: true },
  { ticker: "CLOUD", mint: "CLoUDKc4Ane7HeQcPpE3YHnznRxhMimJ4MyaUqyHFzAu", mcap: 18900000, chain: "solana", risk: "LOW", mintRevoked: true, freeze: false, lpLock: 95, top10: 28, ageHours: 800, tax: 0, pump: false },
  { ticker: "Pumpcat", mint: "ANM35KbUcfKdEVBXzSjZBoT6ceSwYRs3fuc79fp7kRqP", mcap: 760000, chain: "solana", risk: "HIGH", mintRevoked: false, freeze: false, lpLock: 12, top10: 61, ageHours: 14, tax: 0, pump: true },
  { ticker: "MARKET", mint: "DUZN7M6ezXez9UVrou4N8UEGRkwnbWmXqqZgEKiZCrnN", mcap: 616000, chain: "solana", risk: "HIGH", mintRevoked: false, freeze: true, lpLock: 8, top10: 70, ageHours: 9, tax: 0, pump: false },
  { ticker: "KITTY", mint: "4N4DnNo3qpPks9aQCkcWkzoir8tnvT6diS4TnnZibonk", mcap: 3200000, chain: "base", risk: "MED", mintRevoked: true, freeze: false, lpLock: 60, top10: 44, ageHours: 48, tax: 0, pump: false },
  { ticker: "Jimothy", mint: "Ge87EtsjwRQbHaqQmKRno69RFTwh9bfSsm99XNxTpump", mcap: 8200000, chain: "solana", risk: "MED", mintRevoked: true, freeze: false, lpLock: 55, top10: 36, ageHours: 70, tax: 0, pump: true },
  { ticker: "RUGME", mint: "RugWatchVetoToken111111111111111111111111111", mcap: 18000, chain: "solana", risk: "VETO", mintRevoked: false, freeze: true, lpLock: 0, top10: 92, ageHours: 1, tax: 99, pump: true, honeypot: true },
];

function now() { return Date.now(); }
function iso(t = now()) { return new Date(t).toISOString(); }
function uid(p = "id") { return p + "_" + Math.random().toString(36).slice(2, 8) + now().toString(36); }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function fmtUsd(n) {
  const x = Number(n) || 0;
  if (Math.abs(x) >= 1e12) return "JUNK";
  if (Math.abs(x) >= 1e6) return "$" + (x / 1e6).toFixed(1) + "M";
  if (Math.abs(x) >= 1e3) return "$" + (x / 1e3).toFixed(1) + "K";
  return "$" + x.toFixed(0);
}
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

function forensic(t) {
  if (!t) return { grade: "?", reasons: ["desconocido"] };
  if (t.junk || t.pnl >= JUNK_PNL) return { grade: "F", score: 1, reasons: ["PnL imposible — Forensic veta"] };
  const reasons = [];
  let score = 40;
  if (t.kol) { score += 14; reasons.push("KOL identidad linked"); }
  if (t.identityLevel === "linked") { score += 10; reasons.push("X vinculado"); }
  else if (t.identityLevel === "unverified") { score -= 8; reasons.push("identidad no probada"); }
  if ((t.followers || 0) >= 200) { score += 18; reasons.push("follow real"); }
  else if ((t.followers || 0) >= 50) { score += 10; }
  else if ((t.followers || 0) < 10) { score -= 10; reasons.push("pocos follows"); }
  if (t.wallet) { score += 12; reasons.push("wallet FOMO resuelta"); }
  else { score -= 8; reasons.push("sin wallet"); }
  if (t.tapeWallet && t.wallet && t.tapeWallet !== t.wallet) { score -= 6; reasons.push("Privy ≠ tape wallet — dos libros"); }
  if (t.holdingsUsd) { score += 6; reasons.push("Solscan $" + Math.round(t.holdingsUsd / 1000) + "k"); }
  score = clamp(score, 1, 99);
  const grade = score >= 78 ? "A" : score >= 64 ? "B+" : score >= 52 ? "B" : score >= 40 ? "C" : "D";
  return { grade, score, reasons };
}

function rugwatch(token) {
  if (!token) return { risk: "HIGH", veto: true, notes: ["token desconocido"] };
  if (token.honeypot || token.risk === "VETO" || token.freeze || (token.tax || 0) > 10) {
    return { risk: "VETO", veto: true, notes: ["freeze/honeypot/tax — Rugwatch veta"] };
  }
  const notes = [];
  let risk = token.risk || "MED";
  if (!token.mintRevoked) { notes.push("mint NO revoked"); risk = "HIGH"; }
  if ((token.lpLock || 0) < 20) { notes.push("LP unlocked"); risk = "HIGH"; }
  else notes.push("LP " + token.lpLock + "%");
  if ((token.top10 || 0) > 55) { notes.push("top10 " + token.top10 + "%"); risk = risk === "LOW" ? "MED" : risk; }
  if ((token.ageHours || 0) < 12) { notes.push("age " + token.ageHours + "h"); risk = "HIGH"; }
  if (token.pump) notes.push("pump.fun");
  return { risk, veto: false, notes };
}

function sizer(settings, risk) {
  let pct = settings.sizePct;
  if (risk === "HIGH") pct *= 0.4;
  if (risk === "MED") pct *= 0.7;
  const usd = Math.round(settings.bankroll * pct * 100) / 100;
  return { usd, pct: +(pct * 100).toFixed(2), stopPct: risk === "HIGH" ? 25 : 35, invalidation: "dev vende · 2 de N dumpean · −stop" };
}

function defaultStore() {
  return {
    settings: {
      bankroll: 1000, sizePct: 0.015, windowSec: 180, minN: 2, auto: false,
      chain: "solana", maxOpen: 4, maxDailyLossPct: 8,
      fomoFeeMode: "flat", fomoFlatUsd: 1, fomoPct: 0.005,
      dexFeePct: 0.0025, priorityFeeUsd: 0.02,
      minSlipPct: 0.15, maxSlippagePct: 3,
      telegramBot: "", telegramChat: "",
    },
    watchlist: ident.SEED_WATCH.slice(),
    custom: [], wallets: {}, identities: {}, ledger: [], skipped: [], createdAt: iso(),
  };
}
function loadStore() {
  let s = defaultStore();
  try { s = { ...s, ...JSON.parse(fs.readFileSync(STORE, "utf8")) }; } catch {}
  s.settings = { ...defaultStore().settings, ...(s.settings || {}) };
  if (!s.wallets) s.wallets = {};
  if (!s.identities) s.identities = {};
  if (!s.watchlist.some((h) => String(h).toLowerCase() === "econoar")) s.watchlist.unshift("econoar");
  s.custom = (s.custom || []).filter((h) => String(h).toLowerCase() !== "econoar");
  return s;
}
function saveStore() {
  fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify({
    settings: store.settings, watchlist: store.watchlist, custom: store.custom,
    wallets: store.wallets, identities: store.identities, ledger: store.ledger,
    skipped: store.skipped, createdAt: store.createdAt,
  }, null, 2));
}

const state = {
  feed: "offline", latencyMs: 0, liveError: null,
  tape: [], cards: [], agents: [], pocket: [],
  clustersSeen: new Set(), buys: [], sells: [],
  coOccur: new Map(), invalidations: [], marks: {},
};
let store = loadStore();
// Custom identities survive a server restart while the curated identity graph
// remains the source of truth for known aliases.
Object.values(store.identities).forEach((t) => { if (t && t.handle) ident.index(t); });
const clients = new Set();
const traderCache = { fetchedAt: 0, items: [] };
const scanCache = new Map();

function applyWallet(t) {
  const saved = store.wallets[String(t.handle || "").toLowerCase()];
  if (!saved) return t;
  // Migration: prior builds stored a bare Solana address as the value.
  if (typeof saved === "string") return { ...t, wallet: saved, walletStatus: "manual", walletSource: "manual" };
  return {
    ...t,
    wallet: saved.solana || t.wallet || null,
    evm: saved.evm || t.evm || null,
    walletStatus: "manual",
    walletSource: "manual",
  };
}
function watchTraders() {
  return store.watchlist.map((h) => {
    const key = String(h || "").toLowerCase();
    const t = applyWallet(ident.get(h) || store.identities[key] || {
      handle: h, name: h, followers: 0, pnl: 0, wallet: null, walletStatus: "unknown",
    });
    return { ...t, forensic: forensic(t) };
  });
}

function toFomoScanTrader(row) {
  const handle = ident.parseHandle(row && row.handle);
  if (!handle) return null;
  const solana = ident.isSolanaAddress(row.solanaAddress) ? row.solanaAddress : null;
  const evm = ident.isEvmAddress(row.evmAddress) ? row.evmAddress : null;
  return {
    handle,
    name: row.name || handle,
    traderId: row.id || null,
    wallet: solana,
    evm,
    walletStatus: solana || evm ? "resolved" : "verified_no_wallet",
    walletSource: "FomoScan verified identity",
    identityLevel: "verified",
    source: "FomoScan /v2/user/handle",
    fomo: "https://fomo.family/profile/" + encodeURIComponent(handle),
    resolvedAt: iso(),
  };
}

async function fomoScanTrader(handle) {
  const key = process.env.FOMOSCAN_API_KEY;
  if (!key) return null;
  const cacheKey = String(handle).toLowerCase();
  const cached = scanCache.get(cacheKey);
  // Each FomoScan lookup consumes credits. Keep both hits and 404s warm so an
  // impatient retry cannot repeatedly spend the account's quota.
  if (cached && now() - cached.fetchedAt < 5 * 60 * 1000) return cached.trader;
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 5000);
  try {
    const r = await fetch(FOMOSCAN_API + "/v2/user/handle/" + encodeURIComponent(handle), {
      headers: { Authorization: "Bearer " + key }, signal: ac.signal,
    });
    if (r.status === 404) {
      scanCache.set(cacheKey, { fetchedAt: now(), trader: null });
      return null;
    }
    if (!r.ok) throw new Error("FomoScan http " + r.status);
    const trader = toFomoScanTrader(await r.json());
    scanCache.set(cacheKey, { fetchedAt: now(), trader });
    return trader;
  } finally {
    clearTimeout(timeout);
  }
}

function toPublicTrader(row) {
  const handle = ident.parseHandle(row && row.handle);
  if (!handle) return null;
  const address = String(row.walletAddress || row.wallet || "").trim();
  const solana = ident.isSolanaAddress(address) ? address : null;
  const evm = ident.isEvmAddress(address) ? address : null;
  return {
    handle,
    name: row.displayName || handle,
    followers: Number(row.followers) || 0,
    pnl: Number(row.netPnlUsd) || 0,
    rank: Number(row.rank) || null,
    traderId: row.traderId || null,
    wallet: solana,
    evm,
    walletStatus: solana || evm ? "resolved" : "not_found",
    walletSource: solana || evm ? "FomoScope public tape" : null,
    identityLevel: "tape",
    source: "FomoScope /traders public tape",
    fomo: "https://fomo.family/profile/" + encodeURIComponent(handle),
    resolvedAt: iso(),
  };
}

async function publicTraders(force = false) {
  // Avoid burning the shared free rate-limit bucket when a user clicks retry.
  if (!force && traderCache.items.length && now() - traderCache.fetchedAt < 5 * 60 * 1000) return traderCache.items;
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 5000);
  try {
    const headers = {};
    if (process.env.FOMOSCOPE_API_KEY) headers.Authorization = "Bearer " + process.env.FOMOSCOPE_API_KEY;
    const r = await fetch(FOMO_API + "/traders?window=7d&limit=100", { headers, signal: ac.signal });
    if (!r.ok) throw new Error("FomoScope http " + r.status);
    const body = await r.json();
    traderCache.items = Array.isArray(body.items) ? body.items : [];
    traderCache.fetchedAt = now();
    return traderCache.items;
  } finally {
    clearTimeout(timeout);
  }
}

function markResolution(handle, status) {
  const key = String(handle || "").toLowerCase();
  const existing = ident.get(handle) || store.identities[key];
  if (!existing) return;
  const next = { ...existing, handle, walletStatus: status };
  store.identities[key] = next;
  ident.index(next);
  saveStore();
}

function saveResolvedIdentity(canonical, remote) {
  const current = store.identities[canonical.toLowerCase()] || {};
  const merged = { ...current, ...remote, handle: canonical };
  store.identities[canonical.toLowerCase()] = merged;
  ident.index(merged);
  saveStore();
  return merged;
}

async function resolvePublicIdentity(handle, force = false) {
  const canonical = ident.resolve(handle);
  if (!canonical) return { status: "invalid", handle: "" };
  const known = ident.get(canonical);
  if (known && (known.wallet || known.evm)) return { status: "known", handle: known.handle, trader: known };

  // A configured FomoScan key resolves any indexed FOMO profile and returns
  // proof-verified Solana/EVM addresses. The FomoScope board remains a
  // keyless fallback for the top public tape.
  let scanError = null;
  if (process.env.FOMOSCAN_API_KEY) {
    try {
      const scanned = await fomoScanTrader(canonical);
      if (scanned) {
        const trader = saveResolvedIdentity(canonical, scanned);
        return { status: scanned.wallet || scanned.evm ? "resolved" : "verified_no_wallet", handle: canonical, trader };
      }
    } catch (error) {
      scanError = error;
    }
  }

  try {
    const rows = await publicTraders(force);
    const row = rows.find((item) => String(item && item.handle || "").toLowerCase() === canonical.toLowerCase());
    if (!row) {
      markResolution(canonical, "not_found");
      return { status: "not_found", handle: canonical };
    }
    const remote = toPublicTrader(row);
    if (!remote) {
      markResolution(canonical, "not_found");
      return { status: "not_found", handle: canonical };
    }
    const trader = saveResolvedIdentity(canonical, remote);
    return { status: remote.wallet || remote.evm ? "resolved" : "not_found", handle: canonical, trader };
  } catch (error) {
    markResolution(canonical, "unavailable");
    const message = scanError ? String(scanError.message || scanError) + " · " + String(error && error.message || error) : String(error && error.message || error);
    return { status: "unavailable", handle: canonical, error: message };
  }
}
function tokenByTicker(t) { return TOKENS.find((x) => x.ticker.toLowerCase() === String(t).toLowerCase()); }

function logAgent(code, msg, level = "info") {
  const row = { t: iso(), code, msg, level };
  state.agents.unshift(row);
  if (state.agents.length > 90) state.agents.length = 90;
  return row;
}

function pocketPush(kind, title, body, extra) {
  const msg = { id: uid("pk"), kind, title, body, extra: extra || {}, at: iso(), ts: now() };
  state.pocket.unshift(msg);
  if (state.pocket.length > 40) state.pocket.length = 40;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (token && chat) {
    fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: title + "\n" + body, disable_web_page_preview: true }),
    }).catch(() => {});
  }
  return msg;
}

function independence(handles) {
  if (handles.length < 2) return 1;
  let pair = 0, hits = 0;
  for (let i = 0; i < handles.length; i++) {
    for (let j = i + 1; j < handles.length; j++) {
      pair++;
      const k = [handles[i], handles[j]].map((x) => x.toLowerCase()).sort().join("|");
      hits += state.coOccur.get(k) || 0;
    }
  }
  const avg = hits / pair;
  return clamp(1 - avg / 8, 0.05, 1);
}
function rememberCluster(handles) {
  for (let i = 0; i < handles.length; i++) {
    for (let j = i + 1; j < handles.length; j++) {
      const k = [handles[i], handles[j]].map((x) => x.toLowerCase()).sort().join("|");
      state.coOccur.set(k, (state.coOccur.get(k) || 0) + 1);
    }
  }
}

function ceoDecide(cluster) {
  const rug = rugwatch(cluster.token);
  const votes = cluster.traders.filter((t) => t.forensic.grade !== "F" && t.forensic.grade !== "D");
  const indep = independence(votes.map((v) => v.handle));
  const effectiveN = Math.floor(votes.length * (indep < 0.35 ? 0.5 : 1) + 0.01);
  if (rug.veto) {
    logAgent("RUG", "Veto $" + cluster.token.ticker + ": " + rug.notes[0], "warn");
    return { action: "block", reason: rug.notes.join(" · "), rug, size: null, indep };
  }
  if (store.settings.chain !== "all" && cluster.token.chain && cluster.token.chain !== store.settings.chain && cluster.token.chain !== "solana" && store.settings.chain === "solana") {
    // allow solana default; base tokens only if chain is base/all
  }
  if (store.settings.chain === "base" && cluster.token.chain !== "base") {
    return { action: "silence", reason: "fuera de pista Base", rug, size: null, indep };
  }
  if (effectiveN < store.settings.minN) {
    logAgent("CNF", "Silencio $" + cluster.token.ticker + ": N efectivo " + effectiveN + " (indep " + indep.toFixed(2) + ")", "dim");
    return { action: "silence", reason: "N efectivo < umbral", rug, size: null, indep };
  }
  if (store.ledger.filter((x) => x.status === "open").length >= store.settings.maxOpen) {
    return { action: "block", reason: "max open", rug, size: null, indep };
  }
  const size = sizer(store.settings, rug.risk);
  const thesisBoost = cluster.thesis ? 12 : 0;
  logAgent("CEO", "TARJETA $" + cluster.token.ticker + " · " + votes.length + " · indep " + indep.toFixed(2) + (cluster.thesis ? " · tesis" : " · ape mudo"), "hot");
  return { action: "alert", reason: "confluencia", rug, size, votes, indep, thesisBoost };
}

function upsertCard(cluster, decision) {
  const key = cluster.token.ticker + ":" + cluster.traders.map((t) => t.handle).sort().join(",");
  if (state.cards.find((c) => c.key === key && now() - c.ts < 120000)) return;
  rememberCluster(cluster.traders.map((t) => t.handle));
  const grades = (decision.votes || cluster.traders).map((t) => t.forensic.grade);
  const playbook = decision.action === "alert" &&
    (decision.votes || []).length >= 3 &&
    grades.every((g) => g === "A" || g === "B+") &&
    decision.rug.risk === "LOW";
  const card = {
    id: uid("crd"), key, ts: now(), at: iso(),
    ticker: cluster.token.ticker, mint: cluster.token.mint, mcap: cluster.token.mcap,
    chain: cluster.token.chain, micro: cluster.token,
    traders: cluster.traders, n: cluster.traders.length,
    spanSec: Math.round(cluster.spanMs / 1000), usd: cluster.usd,
    action: decision.action, reason: decision.reason, rug: decision.rug, size: decision.size,
    indep: decision.indep, thesis: !!cluster.thesis,
    score: clamp(30 + cluster.traders.length * 16 + (decision.thesisBoost || 0) + Math.round((decision.indep || 0) * 20) - Math.round(cluster.spanMs / 2000), 1, 99),
    status: decision.action === "alert" ? "live" : decision.action,
    playbook,
  };
  state.cards.unshift(card);
  if (state.cards.length > 40) state.cards.length = 40;
  if (decision.action === "alert") {
    pocketPush("alert", "CONFLUENCE $" + card.ticker, card.n + " wallets · indep " + (card.indep || 0).toFixed(2) + " · " + (card.thesis ? "con tesis" : "ape mudo"), { cardId: card.id });
  }
  broadcast();
}

function ingestBuy(evt) {
  const trader = applyWallet(ident.get(evt.handle) || { handle: evt.handle, name: evt.handle, followers: 0, pnl: 0, wallet: null });
  const token = tokenByTicker(evt.ticker) || { ticker: evt.ticker, mint: evt.mint || "", mcap: 0, chain: evt.chain || "solana", risk: "MED" };
  const row = {
    id: evt.id || uid("ev"), type: evt.type || "buy",
    handle: trader.handle, name: trader.name || trader.handle,
    ticker: token.ticker, mint: token.mint, chain: token.chain || "solana",
    usd: Number(evt.usd) || 0, side: evt.side || "buy", thesis: evt.thesis || null,
    ts: evt.ts || now(), at: iso(evt.ts || now()),
    watch: store.watchlist.some((h) => h.toLowerCase() === trader.handle.toLowerCase()),
  };
  if (!state.marks[row.ticker]) state.marks[row.ticker] = 1;
  const bump = Math.min(0.018, (row.usd / (token.mcap || 1e6)) * 6);
  if (row.side === "buy") state.marks[row.ticker] *= 1 + bump;
  if (row.side === "sell") state.marks[row.ticker] *= Math.max(0.2, 1 - bump);
  state.tape.unshift(row);
  if (state.tape.length > 140) state.tape.length = 140;
  if (row.side === "buy") {
    state.buys.push({ ...row, trader: { ...trader, forensic: forensic(trader) }, token });
    state.buys = state.buys.filter((b) => b.ts >= now() - store.settings.windowSec * 1000);
    detect();
  }
  if (row.side === "sell") {
    state.sells.push(row);
    state.sells = state.sells.filter((b) => b.ts >= now() - store.settings.windowSec * 1000);
    checkInvalidation(row);
  }
  logAgent("SEN", row.side.toUpperCase() + " @" + row.handle + " $" + row.ticker + " " + fmtUsd(row.usd), row.watch ? "info" : "dim");
}

function detect() {
  const byToken = new Map();
  for (const b of state.buys) {
    if (!store.watchlist.some((h) => h.toLowerCase() === b.handle.toLowerCase())) continue;
    if (!byToken.has(b.ticker)) byToken.set(b.ticker, []);
    byToken.get(b.ticker).push(b);
  }
  for (const [, list] of byToken) {
    const uniq = []; const seen = new Set();
    for (const b of list.sort((a, b) => a.ts - b.ts)) {
      const h = b.handle.toLowerCase();
      if (seen.has(h)) continue;
      seen.add(h); uniq.push(b);
    }
    if (uniq.length < store.settings.minN) continue;
    const thesis = state.tape.some((e) => e.side === "thesis" && e.ticker === uniq[0].ticker && now() - e.ts < 600000);
    const cluster = {
      token: uniq[0].token,
      traders: uniq.map((u) => u.trader),
      spanMs: uniq[uniq.length - 1].ts - uniq[0].ts,
      usd: uniq.reduce((s, u) => s + u.usd, 0),
      thesis,
    };
    upsertCard(cluster, ceoDecide(cluster));
  }
}

function checkInvalidation(sell) {
  const open = store.ledger.filter((x) => x.status === "open" && x.ticker === sell.ticker);
  if (!open.length) return;
  const dumpers = new Set(state.sells.filter((s) => s.ticker === sell.ticker && s.watch).map((s) => s.handle.toLowerCase()));
  for (const tr of open) {
    const n = tr.n || 2;
    if (dumpers.size >= Math.max(2, Math.ceil(n * 0.66))) {
      tr.invalidated = true;
      tr.invalidWhy = dumpers.size + " de la confluencia están vendiendo $" + tr.ticker;
      state.invalidations.unshift({ id: tr.id, ticker: tr.ticker, why: tr.invalidWhy, at: iso() });
      pocketPush("invalid", "SALIR? $" + tr.ticker, tr.invalidWhy, { tradeId: tr.id });
      logAgent("AUD", "Invalidación $" + tr.ticker + " — " + tr.invalidWhy, "warn");
      saveStore();
    }
  }
}

function simTick() {
  const watch = store.watchlist;
  const chain = store.settings.chain === "base" ? "base" : "solana";
  const pool = TOKENS.filter((t) => t.risk !== "VETO" && (chain === "solana" ? t.chain !== "base" || Math.random() < 0.15 : t.chain === "base" || Math.random() < 0.3));
  const roll = Math.random();
  state.latencyMs = 80 + Math.round(Math.random() * 220);

  if (roll < 0.2) {
    const token = pick(pool.length ? pool : TOKENS.filter((t) => t.risk !== "VETO"));
    const n = Math.random() < 0.5 ? 3 : 2;
    const chosen = shuffle(watch).slice(0, n);
    chosen.forEach((h, i) => setTimeout(() => {
      ingestBuy({ handle: h, ticker: token.ticker, mint: token.mint, usd: 900 + Math.round(Math.random() * 16000), side: "buy" });
      broadcast();
    }, i * (350 + Math.random() * 1400)));
    logAgent("CNF", "Cluster $" + token.ticker + " · " + chosen.map((h) => "@" + h).join(" · "), "hot");
    return;
  }
  if (roll < 0.28) {
    const h = pick(watch);
    ingestBuy({ handle: h, ticker: "RUGME", usd: 2200, side: "buy" });
    setTimeout(() => { ingestBuy({ handle: pick(watch.filter((x) => x !== h).concat([h])), ticker: "RUGME", usd: 1600, side: "buy" }); broadcast(); }, 600);
    return;
  }
  if (roll < 0.4) {
    ingestBuy({ handle: pick(watch), ticker: pick(pool).ticker, usd: 1500 + Math.round(Math.random() * 8000), side: "sell" });
    return;
  }
  if (roll < 0.55) {
    const t = pick(["CATE", "CLOUD", "USELESS", "fone"]);
    state.tape.unshift({
      id: uid("th"), type: "thesis", handle: pick(["econoar", "Minty1x", "thejefeee", "TassoLago"]),
      name: "thesis", ticker: t, mint: (tokenByTicker(t) || {}).mint, usd: 0, side: "thesis",
      thesis: pick(["Acumulo. El tape está alineado.", "Cluster > primer tick.", "Mcap todavía da.", "No es el ape — espero N=2."]),
      ts: now(), at: iso(), watch: true, chain: "solana",
    });
    logAgent("DSK", "Tesis $" + t, "dim");
    return;
  }
  ingestBuy({ handle: pick(watch), ticker: pick(pool).ticker, usd: 700 + Math.round(Math.random() * 9000), side: "buy" });
}

async function tryLive() {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 3500);
    const r = await fetch(FOMO_API + "/events?limit=20", { signal: ac.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error("http " + r.status);
    const json = await r.json();
    state.feed = "live"; state.liveError = null; state.latencyMs = 90;
    for (const it of (json.items || []).slice().reverse()) {
      const body = (it.payload && it.payload.body) || {};
      const handle = body.userHandle || it.handle;
      const ticker = body.ticker;
      if (!handle || !ticker || state.tape.some((e) => e.id === it.id)) continue;
      ingestBuy({
        id: it.id, handle, ticker,
        mint: body.outTokenAddress || body.tokenAddress,
        usd: Number(it.usdValue || body.inHumanAmount || 0),
        side: String(it.type || "").includes("sell") ? "sell" : String(it.type || "").includes("thesis") ? "thesis" : "buy",
        thesis: body.comment || null,
        ts: Date.parse(it.occurredAt || it.capturedAt) || now(),
      });
    }
    broadcast();
    return true;
  } catch (e) {
    state.feed = DEMO_MODE ? "sim" : "offline";
    state.latencyMs = 0;
    state.liveError = String(e.message || e);
    return false;
  }
}

function availableCash() {
  const closed = store.ledger.filter((x) => x.status === "closed").reduce((s, x) => s + (x.pnl || 0), 0);
  const locked = store.ledger.filter((x) => x.status === "open").reduce((s, x) => s + (x.usd || 0), 0);
  return paper.round2(store.settings.bankroll + closed - locked);
}

function decorateTrade(tr) {
  const mark = state.marks[tr.ticker] || tr.entryMark || 1;
  const entry = tr.entryMark || 1;
  if (tr.status !== "open") {
    return { ...tr, mark, uPnl: tr.pnl || 0, uPnlPct: tr.pnlPct || 0 };
  }
  const grossNow = (tr.netIn || tr.usd) * (mark / entry);
  const token = tokenByTicker(tr.ticker) || {};
  const qOut = paper.quoteSide(store.settings, grossNow, token, tr.slipPct || 0.4);
  const uPnl = paper.round2(qOut.net - tr.usd);
  return { ...tr, mark, uPnl, uPnlPct: +((uPnl / tr.usd) * 100).toFixed(2), exitPreview: qOut };
}

function snapshot() {
  const open = store.ledger.filter((x) => x.status === "open").map(decorateTrade);
  const closed = store.ledger.filter((x) => x.status === "closed").map(decorateTrade);
  const realized = closed.reduce((s, x) => s + (x.pnl || 0), 0);
  const unrealized = open.reduce((s, x) => s + (x.uPnl || 0), 0);
  const feesPaid = store.ledger.reduce((s, x) => s + ((x.feesIn && x.feesIn.totalFees) || 0) + ((x.feesOut && x.feesOut.totalFees) || 0), 0);
  const lagAvg = store.ledger.length ? store.ledger.reduce((s, x) => s + (x.lagMs || 0), 0) / store.ledger.length : 0;
  const cash = availableCash();
  return {
    feed: state.feed, latencyMs: state.latencyMs, liveError: state.liveError,
    verifiedAt: "2026-09-02T16:10:00Z",
    settings: store.settings,
    watchlist: watchTraders(),
    tape: state.tape.slice(0, 50),
    cards: state.cards.slice(0, 18).map((c) => {
      if (!c.size) return c;
      const token = c.micro || tokenByTicker(c.ticker) || {};
      const slip = paper.impactSlip(store.settings, c.size.usd, token, state.latencyMs);
      return { ...c, quote: paper.quoteSide(store.settings, c.size.usd, token, slip), slipEst: slip };
    }),
    agents: state.agents.slice(0, 22),
    pocket: state.pocket.slice(0, 16),
    ledger: [...open, ...closed].slice(0, 80),
    positions: open,
    history: closed.slice(0, 60),
    invalidations: state.invalidations.slice(0, 8),
    marks: state.marks,
    bankroll: store.settings.bankroll,
    cash,
    equity: paper.round2(cash + open.reduce((s, x) => s + (x.netIn || x.usd) * ((x.mark || 1) / (x.entryMark || 1)), 0)),
    realized, unrealized, feesPaid: paper.round2(feesPaid),
    openCount: open.length, lagAvg: Math.round(lagAvg),
    shipped: ["scout-graph", "stream-latency", "copy-lag", "independence", "pocket-telegram", "microstructure", "invalidation", "thesis-weight", "base-evm", "playbooks"],
    stats: {
      watch: store.watchlist.length,
      alerts: state.cards.filter((c) => c.action === "alert").length,
      blocked: state.cards.filter((c) => c.action === "block").length,
      walletsResolved: watchTraders().filter((t) => t.wallet).length,
    },
    econoar: ident.ECONOAR,
  };
}

function broadcast() {
  const payload = "data: " + JSON.stringify(snapshot()) + "\n\n";
  for (const res of clients) { try { res.write(payload); } catch { clients.delete(res); } }
}
function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function serveStatic(req, res) {
  let file = req.url.split("?")[0];
  if (file === "/") file = "/index.html";
  const abs = path.normalize(path.join(PUBLIC, file));
  if (!abs.startsWith(PUBLIC)) { res.writeHead(403); res.end("no"); return; }
  fs.readFile(abs, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    const ext = path.extname(abs);
    const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
    res.writeHead(200, { "Content-Type": (types[ext] || "application/octet-stream") + "; charset=utf-8" });
    res.end(data);
  });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", (c) => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    res.end(); return;
  }
  try {
    if (url.pathname === "/api/state" && req.method === "GET") return json(res, 200, snapshot());
    if (url.pathname === "/api/stream" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "Access-Control-Allow-Origin": "*" });
      res.write("data: " + JSON.stringify(snapshot()) + "\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (url.pathname === "/api/follow" && req.method === "POST") {
      const body = await readBody(req);
      const handle = ident.resolve(body.handle);
      if (!handle) return json(res, 400, { error: "Pegá un @handle o una URL de perfil fomo.family válida." });
      if (!store.watchlist.some((h) => h.toLowerCase() === handle.toLowerCase())) {
        if (!ident.get(handle)) {
          const pending = { handle, name: handle, followers: 0, pnl: 0, wallet: null, walletStatus: "resolving", custom: true };
          ident.index(pending);
          store.identities[handle.toLowerCase()] = pending;
        }
        store.watchlist.unshift(handle);
        saveStore();
      }
      const resolution = await resolvePublicIdentity(handle);
      const trader = resolution.trader || ident.get(handle) || {};
      const suffix = trader.wallet || trader.evm ? " · wallet resuelta" : resolution.status === "verified_no_wallet" ? " · perfil verificado sin address" : resolution.status === "unavailable" ? " · lookup no disponible" : " · sin match público";
      logAgent("SCT", "Follow @" + handle + suffix, resolution.status === "resolved" || resolution.status === "known" ? "info" : "warn");
      broadcast(); return json(res, 200, { ...snapshot(), resolution });
    }
    if (url.pathname === "/api/unfollow" && req.method === "POST") {
      const body = await readBody(req);
      const handle = ident.resolve(body.handle);
      store.watchlist = store.watchlist.filter((h) => h.toLowerCase() !== handle.toLowerCase());
      saveStore(); broadcast(); return json(res, 200, snapshot());
    }
    if (url.pathname === "/api/resolve" && req.method === "POST") {
      const body = await readBody(req);
      const resolution = await resolvePublicIdentity(body.handle, true);
      if (resolution.status === "invalid") return json(res, 400, { error: "Handle o URL FOMO inválido." });
      const level = resolution.status === "resolved" || resolution.status === "known" ? "info" : "warn";
      logAgent("SCT", "Lookup @" + resolution.handle + " · " + resolution.status, level);
      broadcast(); return json(res, 200, { ...snapshot(), resolution });
    }
    if (url.pathname === "/api/wallet" && req.method === "POST") {
      const body = await readBody(req);
      const handle = ident.resolve(body.handle);
      const address = String(body.wallet || "").trim();
      if (!handle || (!ident.isSolanaAddress(address) && !ident.isEvmAddress(address))) {
        return json(res, 400, { error: "Pegá una wallet Solana base58 o una EVM 0x válida." });
      }
      const key = handle.toLowerCase();
      const prior = store.wallets[key];
      const saved = typeof prior === "string" ? { solana: prior } : { ...(prior || {}) };
      if (ident.isSolanaAddress(address)) saved.solana = address;
      else saved.evm = address;
      store.wallets[key] = saved;
      const t = ident.get(handle);
      if (t) {
        if (saved.solana) t.wallet = saved.solana;
        if (saved.evm) t.evm = saved.evm;
        t.walletStatus = "manual";
        t.walletSource = "manual";
      }
      saveStore();
      logAgent("SCT", "Wallet manual vinculada a @" + handle, "info");
      broadcast(); return json(res, 200, { ...snapshot(), resolution: { status: "manual", handle } });
    }
    if (url.pathname === "/api/settings" && req.method === "POST") {
      const body = await readBody(req);
      const s = store.settings;
      const setN = (k, min, max) => { if (body[k] != null && Number.isFinite(Number(body[k]))) s[k] = clamp(Number(body[k]), min, max); };
      setN("bankroll", 50, 1e7);
      setN("sizePct", 0.002, 0.2);
      setN("windowSec", 30, 900);
      setN("minN", 2, 8);
      setN("maxOpen", 1, 20);
      setN("maxDailyLossPct", 1, 50);
      setN("fomoFlatUsd", 0, 20);
      setN("fomoPct", 0, 0.05);
      setN("dexFeePct", 0, 0.03);
      setN("priorityFeeUsd", 0, 2);
      setN("minSlipPct", 0, 5);
      setN("maxSlippagePct", 0.2, 15);
      if (body.fomoFeeMode === "flat" || body.fomoFeeMode === "pct") s.fomoFeeMode = body.fomoFeeMode;
      if (body.chain && ["solana", "base", "all"].includes(body.chain)) s.chain = body.chain;
      saveStore();
      logAgent("CEO", "Config. Bankroll " + fmtUsd(s.bankroll) + " · FOMO " + (s.fomoFeeMode === "flat" ? "$" + s.fomoFlatUsd : (s.fomoPct * 100) + "%"), "info");
      broadcast();
      return json(res, 200, snapshot());
    }
    if (url.pathname === "/api/quote" && req.method === "POST") {
      const body = await readBody(req);
      const usd = clamp(Number(body.usd) || store.settings.bankroll * store.settings.sizePct, 1, 1e7);
      const token = tokenByTicker(body.ticker) || { ticker: body.ticker || "fone", mcap: 1e7, tax: Number(body.tax) || 0 };
      const s = { ...store.settings };
      if (body.settings) Object.assign(s, body.settings);
      const slip = paper.impactSlip(s, usd, token, Number(body.lagMs) || state.latencyMs);
      const qIn = paper.quoteSide(s, usd, token, slip);
      const qOut = paper.quoteSide(s, Math.max(0, qIn.net), token, slip);
      return json(res, 200, {
        ticker: token.ticker, usd, slip, taxPct: token.tax || 0,
        buy: qIn, sell: qOut,
        roundTripFees: paper.round2(qIn.totalFees + qOut.totalFees),
        netIfFlat: paper.round2(qOut.net - usd),
      });
    }
    if (url.pathname === "/api/chain" && req.method === "POST") {
      const body = await readBody(req);
      const c = String(body.chain || "solana");
      store.settings.chain = ["solana", "base", "all"].includes(c) ? c : "solana";
      saveStore(); logAgent("CEO", "Pista " + store.settings.chain, "info");
      broadcast(); return json(res, 200, snapshot());
    }
    if (url.pathname === "/api/click" && req.method === "POST") {
      const body = await readBody(req);
      const card = state.cards.find((c) => c.id === body.cardId);
      if (!card) return json(res, 404, { error: "card gone" });
      if (body.action === "skip") {
        card.status = "skipped"; store.skipped.push({ id: card.id, ticker: card.ticker, at: iso() }); saveStore();
        broadcast(); return json(res, 200, snapshot());
      }
      if (card.action !== "alert" || !card.size) return json(res, 400, { error: "no se ejecuta" });
      if (card.playbook && !body.playbookOk) {
        return json(res, 200, { needPlaybook: true, card, snapshot: snapshot() });
      }
      const lagMs = 160 + Math.round(Math.random() * 1800);
      const token = tokenByTicker(card.ticker) || card.micro || {};
      const slip = paper.impactSlip(store.settings, card.size.usd, token, lagMs);
      const q = paper.quoteSide(store.settings, card.size.usd, token, slip);
      const cash = availableCash();
      if (q.notional > cash) return json(res, 400, { error: "cash insuficiente", cash });
      if (!state.marks[card.ticker]) state.marks[card.ticker] = 1;
      const fill = {
        id: uid("tr"), cardId: card.id, ticker: card.ticker, mint: card.mint, chain: card.chain,
        side: "buy", usd: q.notional, stopPct: card.size.stopPct, status: "open",
        at: iso(), via: "1-click", n: card.n, pnl: 0, lagMs, slipPct: slip,
        theirUsd: card.usd / Math.max(1, card.n),
        entryMark: state.marks[card.ticker],
        feesIn: q, netIn: q.net, followed: (card.traders || []).map((t) => t.handle),
      };
      store.ledger.unshift(fill);
      card.status = "clicked";
      saveStore();
      logAgent("TRG", "PAPER BUY $" + card.ticker + " · " + fmtUsd(q.notional) + " · fees " + fmtUsd(q.totalFees) + " · neto " + fmtUsd(q.net), "hot");
      pocketPush("fill", "Fill $" + card.ticker, fmtUsd(q.notional) + " bruto · fees " + fmtUsd(q.totalFees) + " · lag " + lagMs + "ms", { tradeId: fill.id });
      broadcast();
      return json(res, 200, {
        ...snapshot(),
        links: {
          jupiter: "https://jup.ag/swap/USDC-" + card.mint,
          dexscreener: "https://dexscreener.com/" + (card.chain || "solana") + "/" + card.mint,
          fomo: "https://fomo.family/",
          solscan: card.traders[0] && card.traders[0].wallet ? "https://solscan.io/account/" + card.traders[0].wallet : null,
        },
      });
    }
    if (url.pathname === "/api/close" && req.method === "POST") {
      const body = await readBody(req);
      const tr = store.ledger.find((x) => x.id === body.id);
      if (!tr) return json(res, 404, { error: "gone" });
      const token = tokenByTicker(tr.ticker) || {};
      const mark = state.marks[tr.ticker] || tr.entryMark || 1;
      const entry = tr.entryMark || 1;
      const grossOut = (tr.netIn || tr.usd) * (mark / entry);
      const qOut = paper.quoteSide(store.settings, grossOut, token, tr.slipPct || 0.4);
      tr.status = "closed";
      tr.exitMark = mark;
      tr.feesOut = qOut;
      tr.grossOut = paper.round2(grossOut);
      tr.netOut = qOut.net;
      tr.pnl = paper.round2(qOut.net - tr.usd);
      tr.pnlPct = +((tr.pnl / tr.usd) * 100).toFixed(2);
      tr.closedAt = iso();
      saveStore();
      logAgent("AUD", "Cierre $" + tr.ticker + " " + fmtUsd(tr.pnl) + " · fees round-trip " + fmtUsd((tr.feesIn && tr.feesIn.totalFees || 0) + qOut.totalFees) + (tr.invalidated ? " · invalidado" : ""), tr.pnl >= 0 ? "info" : "warn");
      broadcast(); return json(res, 200, snapshot());
    }
    return serveStatic(req, res);
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, HOST, async () => {
  logAgent("CEO", "Desk v2. 10 mejoras en producción. Auto OFF.", "hot");
  logAgent("SCT", "econoar = eric.eth. SOL 7sQJ…FN2H · EVM 0x1605…c91f · Solscan $84.2k · 1.92M $fone. Fomo co-signer activo.", "hot");
  logAgent("FOR", "Privy FOMO ≠ tape wallet en Tasso/nobsicle/Inspector. Scout guarda ambos.", "warn");
  const live = await tryLive();
  if (!live && DEMO_MODE) {
    logAgent("SEN", "DEMO_MODE=true: tráfico sintético, nunca confundir con el tape real.", "warn");
    ingestBuy({ handle: "econoar", ticker: "fone", usd: 8400, side: "buy" });
    simTick();
  } else if (!live) {
    logAgent("SEN", "Tape externo no disponible. No se generan movimientos simulados; reintento en 45s.", "warn");
  }
  pocketPush("sys", "Desk en línea", live ? "Tape FOMO conectado." : "Tape sin conexión; no se muestran trades inventados.");
  broadcast();
  setInterval(() => {
    if (state.feed === "live") tryLive();
    else if (DEMO_MODE) simTick();
    broadcast();
  }, 7000);
  setInterval(() => { tryLive(); }, 45000);
  console.log("CONFLUENCE desk http://" + HOST + ":" + PORT);
});
