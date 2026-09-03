/* Motor local para GitHub Pages (sin Node). Mismo paper FOMO+DEX+tax+slip. */
(function (w) {
  const JUNK = 1e12;
  const ECONOAR = {
    handle: "econoar", name: "eric.eth", followers: 48000, pnl: 0, kol: true,
    wallet: "7sQJttJLutWjHkxbusTgE4GpSj5z4fegouv2USHDFN2H",
    evm: "0x1605b59dfe3c1742c815d604aab6a2faa3a5c91f",
    walletStatus: "resolved", identityLevel: "linked", holdingsUsd: 84249,
    fomo: "https://fomo.family/profile/econoar",
    note: "48k follows FOMO. Solscan $84.2k · 1.92M $fone.",
  };
  const SEED = [
    ECONOAR,
    { handle: "TassoLago", name: "Tasso Lago", followers: 2146, pnl: 166308304, wallet: "8GYbQxSrjEL1jMhNrUkbw2fVcn46uZEuVrJYyFoueAFe", walletStatus: "resolved", identityLevel: "probable" },
    { handle: "nobsicle", name: "nobsicle", followers: 147, pnl: 187105972, wallet: "BsxBMwm5SNHngCJE9LhBqEXvn6tUffGKjTietEBwvNQi", evm: "0x6e5bd49aa75741e7e2a5256ff461e95cda700b01", walletStatus: "resolved" },
    { handle: "InspectorMNBL", name: "Inspector", followers: 145, pnl: 148633156, wallet: "4FRAr7TRyWGaZJq3Vp2tX2eJ9vQqmnjAEQb8vZX3yoM3", walletStatus: "resolved" },
    { handle: "divinely_protected", name: "divinely protected", followers: 93, pnl: 189398184, wallet: "5GZ4HEHcXcgHhVZnjS1J1reodspEgxFskWQoqXAun5hV", walletStatus: "resolved" },
    { handle: "voided", name: "voided", followers: 284, pnl: 128525515, wallet: "43Fa3fBFPC8XMBrv4y7pJzooiWymrq5jJVgSZkRX2T6G", evm: "0xb13ef80331edeb4cc1ceec32f911c570c53283f6", walletStatus: "resolved" },
    { handle: "thomaz687", name: "thomas", followers: 570, pnl: 135643425, wallet: "64V5ucEMnU3E6uHi3kUadU3PGGuMAHAFPWWmGc5nNHrG", walletStatus: "resolved" },
    { handle: "firehand_eth", name: "FireHand", followers: 38, pnl: 4200000, wallet: null, walletStatus: "unknown" },
    { handle: "Minty1x", name: "Minty", followers: 120, pnl: 5600000, wallet: null, walletStatus: "unknown" },
    { handle: "ping999", name: "ping999", followers: 44, pnl: 2100000, wallet: null, walletStatus: "unknown" },
  ];
  const CAT = new Map();
  SEED.forEach((t) => CAT.set(t.handle.toLowerCase(), t));
  const TOKENS = [
    { ticker: "fone", mint: "CTPoyCwkjMvoJwU4xvZZqoD8tiYk6yDchySiN5gGpump", mcap: 18700000, chain: "solana", risk: "MED", mintRevoked: true, freeze: false, lpLock: 72, tax: 0, pump: true },
    { ticker: "USELESS", mint: "Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk", mcap: 115000000, chain: "solana", risk: "LOW", mintRevoked: true, freeze: false, lpLock: 98, tax: 0 },
    { ticker: "CATE", mint: "Ai66LHZG9MCzg1WKdawwqduVAXpNDUuV8M3uyq5ppump", mcap: 34700000, chain: "solana", risk: "MED", mintRevoked: true, freeze: false, lpLock: 80, tax: 0, pump: true },
    { ticker: "CLOUD", mint: "CLoUDKc4Ane7HeQcPpE3YHnznRxhMimJ4MyaUqyHFzAu", mcap: 18900000, chain: "solana", risk: "LOW", mintRevoked: true, freeze: false, lpLock: 95, tax: 0 },
    { ticker: "Pumpcat", mint: "ANM35KbUcfKdEVBXzSjZBoT6ceSwYRs3fuc79fp7kRqP", mcap: 760000, chain: "solana", risk: "HIGH", mintRevoked: false, freeze: false, lpLock: 12, tax: 0, pump: true },
    { ticker: "RUGME", mint: "RugWatchVetoToken111111111111111111111111111", mcap: 18000, chain: "solana", risk: "VETO", mintRevoked: false, freeze: true, lpLock: 0, tax: 99, honeypot: true },
    { ticker: "Jimothy", mint: "Ge87EtsjwRQbHaqQmKRno69RFTwh9bfSsm99XNxTpump", mcap: 8200000, chain: "solana", risk: "MED", mintRevoked: true, freeze: false, lpLock: 55, tax: 0, pump: true },
  ];
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const round2 = (n) => Math.round(n * 100) / 100;
  const now = () => Date.now();
  const iso = (t) => new Date(t || now()).toISOString();
  const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 8);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const tokenBy = (t) => TOKENS.find((x) => x.ticker.toLowerCase() === String(t || "").toLowerCase());

  function quoteSide(s, notional, token, slipPct) {
    const taxPct = Number(token && token.tax || 0) / 100;
    const dex = notional * Number(s.dexFeePct || 0.0025);
    const fomo = s.fomoFeeMode === "pct" ? Math.max(Number(s.fomoFlatUsd || 1), notional * Number(s.fomoPct || 0.005)) : Number(s.fomoFlatUsd || 1);
    const prio = Number(s.priorityFeeUsd || 0.02);
    const tax = notional * taxPct;
    const slip = notional * (Number(slipPct || 0) / 100);
    const total = round2(fomo + dex + prio + tax + slip);
    return { notional: round2(notional), fomo: round2(fomo), dex: round2(dex), priority: round2(prio), tax: round2(tax), slip: round2(slip), totalFees: total, net: round2(notional - total), taxPct: taxPct * 100 };
  }
  function impactSlip(s, notional, token, lagMs) {
    const mcap = Number(token && token.mcap || 1e6);
    const impact = Math.min(8, (notional / mcap) * 4000);
    const lag = Math.min(4, Number(lagMs || 400) / 900);
    return +Math.min(Number(s.maxSlippagePct || 3), Number(s.minSlipPct || 0.15) + impact + lag).toFixed(2);
  }
  function forensic(t) {
    if (!t) return { grade: "?" };
    if (t.junk || t.pnl >= JUNK) return { grade: "F", score: 1, reasons: ["PnL imposible"] };
    let score = 40;
    if (t.kol) score += 14;
    if (t.identityLevel === "linked") score += 10;
    if ((t.followers || 0) >= 200) score += 18;
    else if ((t.followers || 0) >= 50) score += 10;
    if (t.wallet) score += 12; else score -= 8;
    score = clamp(score, 1, 99);
    const grade = score >= 78 ? "A" : score >= 64 ? "B+" : score >= 52 ? "B" : score >= 40 ? "C" : "D";
    return { grade, score, reasons: [] };
  }
  function rugwatch(token) {
    if (!token || token.honeypot || token.risk === "VETO" || token.freeze || (token.tax || 0) > 10)
      return { risk: "VETO", veto: true, notes: ["freeze/honeypot/tax"] };
    let risk = token.risk || "MED";
    const notes = [];
    if (!token.mintRevoked) { notes.push("mint open"); risk = "HIGH"; }
    if ((token.lpLock || 0) < 20) risk = "HIGH";
    return { risk, veto: false, notes };
  }
  function sizer(settings, risk) {
    let pct = settings.sizePct;
    if (risk === "HIGH") pct *= 0.4;
    if (risk === "MED") pct *= 0.7;
    return { usd: round2(settings.bankroll * pct), pct: +(pct * 100).toFixed(2), stopPct: risk === "HIGH" ? 25 : 35 };
  }

  const defaults = {
    bankroll: 1000, sizePct: 0.015, windowSec: 180, minN: 2, auto: false,
    chain: "solana", maxOpen: 4, maxDailyLossPct: 8,
    fomoFeeMode: "flat", fomoFlatUsd: 1, fomoPct: 0.005,
    dexFeePct: 0.0025, priorityFeeUsd: 0.02, minSlipPct: 0.15, maxSlippagePct: 3,
  };
  let store = { settings: { ...defaults }, watchlist: SEED.map((t) => t.handle), ledger: [] };
  try {
    const raw = JSON.parse(localStorage.getItem("cx.pages.store") || "null");
    if (raw) store = { settings: { ...defaults, ...(raw.settings || {}) }, watchlist: raw.watchlist || store.watchlist, ledger: raw.ledger || [] };
  } catch {}
  function save() { localStorage.setItem("cx.pages.store", JSON.stringify(store)); }

  const state = { feed: "sim", latencyMs: 180, tape: [], cards: [], agents: [], pocket: [], buys: [], marks: {}, invalidations: [] };
  const subs = [];
  function log(code, msg, level) {
    state.agents.unshift({ t: iso(), code, msg, level: level || "info" });
    if (state.agents.length > 40) state.agents.length = 40;
  }
  function pocket(kind, title, body, extra) {
    state.pocket.unshift({ id: uid("pk"), kind, title, body, extra: extra || {}, at: iso(), ts: now() });
  }
  function watchTraders() {
    return store.watchlist.map((h) => {
      const t = CAT.get(h.toLowerCase()) || { handle: h, name: h, followers: 0, pnl: 0, wallet: null };
      return { ...t, forensic: forensic(t) };
    });
  }
  function cash() {
    const closed = store.ledger.filter((x) => x.status === "closed").reduce((s, x) => s + (x.pnl || 0), 0);
    const locked = store.ledger.filter((x) => x.status === "open").reduce((s, x) => s + (x.usd || 0), 0);
    return round2(store.settings.bankroll + closed - locked);
  }
  function decorate(tr) {
    const mark = state.marks[tr.ticker] || tr.entryMark || 1;
    const entry = tr.entryMark || 1;
    if (tr.status !== "open") return { ...tr, mark, uPnl: tr.pnl || 0, uPnlPct: tr.pnlPct || 0 };
    const token = tokenBy(tr.ticker) || {};
    const qOut = quoteSide(store.settings, (tr.netIn || tr.usd) * (mark / entry), token, tr.slipPct || 0.4);
    const uPnl = round2(qOut.net - tr.usd);
    return { ...tr, mark, uPnl, uPnlPct: +((uPnl / tr.usd) * 100).toFixed(2), exitPreview: qOut };
  }
  function snapshot() {
    const open = store.ledger.filter((x) => x.status === "open").map(decorate);
    const closed = store.ledger.filter((x) => x.status === "closed").map(decorate);
    const realized = closed.reduce((s, x) => s + (x.pnl || 0), 0);
    const unrealized = open.reduce((s, x) => s + (x.uPnl || 0), 0);
    const feesPaid = store.ledger.reduce((s, x) => s + ((x.feesIn && x.feesIn.totalFees) || 0) + ((x.feesOut && x.feesOut.totalFees) || 0), 0);
    const lagAvg = store.ledger.length ? store.ledger.reduce((s, x) => s + (x.lagMs || 0), 0) / store.ledger.length : 0;
    const csh = cash();
    return {
      feed: "sim", latencyMs: state.latencyMs, settings: store.settings,
      watchlist: watchTraders(), tape: state.tape.slice(0, 50),
      cards: state.cards.slice(0, 18).map((c) => {
        if (!c.size) return c;
        const token = c.micro || tokenBy(c.ticker) || {};
        const slip = impactSlip(store.settings, c.size.usd, token, state.latencyMs);
        return { ...c, quote: quoteSide(store.settings, c.size.usd, token, slip), slipEst: slip };
      }),
      agents: state.agents.slice(0, 22), pocket: state.pocket.slice(0, 16),
      ledger: [...open, ...closed].slice(0, 80), positions: open, history: closed.slice(0, 60),
      invalidations: state.invalidations, marks: state.marks,
      bankroll: store.settings.bankroll, cash: csh,
      equity: round2(csh + open.reduce((s, x) => s + (x.netIn || x.usd) * ((x.mark || 1) / (x.entryMark || 1)), 0)),
      realized, unrealized, feesPaid: round2(feesPaid), openCount: open.length, lagAvg: Math.round(lagAvg),
      shipped: [], stats: { watch: store.watchlist.length, alerts: state.cards.filter((c) => c.action === "alert").length, blocked: state.cards.filter((c) => c.action === "block").length, walletsResolved: watchTraders().filter((t) => t.wallet).length },
      econoar: ECONOAR,
    };
  }
  function emit() { const s = snapshot(); subs.forEach((fn) => { try { fn(s); } catch {} }); return s; }

  function ingest(handle, ticker, usd, side) {
    const trader = CAT.get(handle.toLowerCase()) || { handle, name: handle, followers: 0, pnl: 0 };
    const token = tokenBy(ticker) || { ticker, mcap: 1e6, chain: "solana", risk: "MED" };
    const row = { id: uid("ev"), handle: trader.handle, name: trader.name || handle, ticker: token.ticker, mint: token.mint, chain: token.chain || "solana", usd, side, ts: now(), at: iso(), watch: true };
    if (!state.marks[row.ticker]) state.marks[row.ticker] = 1;
    const bump = Math.min(0.018, (usd / (token.mcap || 1e6)) * 6);
    if (side === "buy") state.marks[row.ticker] *= 1 + bump;
    if (side === "sell") state.marks[row.ticker] *= Math.max(0.2, 1 - bump);
    state.tape.unshift(row);
    if (state.tape.length > 80) state.tape.length = 80;
    if (side === "buy") {
      state.buys.push({ ...row, trader: { ...trader, forensic: forensic(trader) }, token });
      state.buys = state.buys.filter((b) => b.ts >= now() - store.settings.windowSec * 1000);
      detect();
    }
    log("SEN", side.toUpperCase() + " @" + handle + " $" + ticker, "info");
  }
  function detect() {
    const by = new Map();
    for (const b of state.buys) {
      if (!by.has(b.ticker)) by.set(b.ticker, []);
      by.get(b.ticker).push(b);
    }
    for (const [, list] of by) {
      const seen = new Set(); const uniq = [];
      for (const b of list.sort((a, b) => a.ts - b.ts)) {
        const h = b.handle.toLowerCase();
        if (seen.has(h)) continue; seen.add(h); uniq.push(b);
      }
      if (uniq.length < store.settings.minN) continue;
      const token = uniq[0].token;
      const rug = rugwatch(token);
      const traders = uniq.map((u) => u.trader);
      const key = token.ticker + ":" + traders.map((t) => t.handle).sort().join(",");
      if (state.cards.find((c) => c.key === key && now() - c.ts < 120000)) continue;
      const action = rug.veto ? "block" : "alert";
      const size = action === "alert" ? sizer(store.settings, rug.risk) : null;
      const card = {
        id: uid("crd"), key, ts: now(), at: iso(), ticker: token.ticker, mint: token.mint, mcap: token.mcap,
        chain: token.chain, micro: token, traders, n: traders.length,
        spanSec: Math.round((uniq[uniq.length - 1].ts - uniq[0].ts) / 1000),
        usd: uniq.reduce((s, u) => s + u.usd, 0), action, reason: action === "block" ? rug.notes.join(" · ") : "confluencia",
        rug, size, indep: 0.7, thesis: false, score: 70, status: action === "alert" ? "live" : action, playbook: false,
      };
      state.cards.unshift(card);
      if (action === "alert") pocket("alert", "CONFLUENCE $" + card.ticker, card.n + " wallets", { cardId: card.id });
      log("CEO", (action === "alert" ? "TARJETA $" : "VETO $") + card.ticker, action === "alert" ? "hot" : "warn");
    }
  }
  function tick() {
    state.latencyMs = 80 + Math.round(Math.random() * 220);
    const watch = store.watchlist;
    const pool = TOKENS.filter((t) => t.risk !== "VETO");
    const roll = Math.random();
    if (roll < 0.45) {
      const token = pick(pool);
      const n = Math.random() < 0.5 ? 3 : 2;
      const chosen = watch.slice().sort(() => Math.random() - 0.5).slice(0, n);
      chosen.forEach((h, i) => setTimeout(() => { ingest(h, token.ticker, 900 + Math.round(Math.random() * 16000), "buy"); emit(); }, i * 400));
      return;
    }
    if (roll < 0.55) {
      ingest(pick(watch), "RUGME", 2000, "buy");
      setTimeout(() => { ingest(pick(watch), "RUGME", 1600, "buy"); emit(); }, 500);
      return;
    }
    ingest(pick(watch), pick(pool).ticker, 800 + Math.round(Math.random() * 9000), Math.random() < 0.3 ? "sell" : "buy");
    emit();
  }

  function post(path, body) {
    body = body || {};
    if (path === "/api/follow") {
      const h = String(body.handle || "").replace(/^@/, "").replace(/^https?:\/\/fomo\.family\/(profile|r)\//i, "");
      if (h && !store.watchlist.some((x) => x.toLowerCase() === h.toLowerCase())) {
        if (!CAT.has(h.toLowerCase())) CAT.set(h.toLowerCase(), { handle: h, name: h, followers: 0, pnl: 0, wallet: null });
        store.watchlist.unshift(h); save();
      }
    }
    if (path === "/api/unfollow") {
      const h = String(body.handle || "").replace(/^@/, "").toLowerCase();
      store.watchlist = store.watchlist.filter((x) => x.toLowerCase() !== h); save();
    }
    if (path === "/api/chain") { store.settings.chain = body.chain || "solana"; save(); }
    if (path === "/api/settings") {
      const s = store.settings;
      const setN = (k, min, max) => { if (body[k] != null && Number.isFinite(Number(body[k]))) s[k] = clamp(Number(body[k]), min, max); };
      setN("bankroll", 50, 1e7); setN("sizePct", 0.002, 0.2); setN("windowSec", 30, 900);
      setN("minN", 2, 8); setN("maxOpen", 1, 20); setN("maxDailyLossPct", 1, 50);
      setN("fomoFlatUsd", 0, 20); setN("fomoPct", 0, 0.05); setN("dexFeePct", 0, 0.03);
      setN("priorityFeeUsd", 0, 2); setN("minSlipPct", 0, 5); setN("maxSlippagePct", 0.2, 15);
      if (body.fomoFeeMode === "flat" || body.fomoFeeMode === "pct") s.fomoFeeMode = body.fomoFeeMode;
      save();
    }
    if (path === "/api/quote") {
      const s = { ...store.settings, ...(body.settings || {}) };
      const usd = clamp(Number(body.usd) || s.bankroll * s.sizePct, 1, 1e7);
      const token = tokenBy(body.ticker) || TOKENS[0];
      const slip = impactSlip(s, usd, token, body.lagMs || 400);
      const buy = quoteSide(s, usd, token, slip);
      const sell = quoteSide(s, Math.max(0, buy.net), token, slip);
      return { ticker: token.ticker, usd, slip, taxPct: token.tax || 0, buy, sell, roundTripFees: round2(buy.totalFees + sell.totalFees), netIfFlat: round2(sell.net - usd) };
    }
    if (path === "/api/click") {
      const card = state.cards.find((c) => c.id === body.cardId);
      if (!card) return { error: "card gone" };
      if (body.action === "skip") { card.status = "skipped"; return emit(); }
      if (card.action !== "alert" || !card.size) return { error: "no se ejecuta" };
      const lagMs = 160 + Math.round(Math.random() * 1800);
      const token = tokenBy(card.ticker) || card.micro || {};
      const slip = impactSlip(store.settings, card.size.usd, token, lagMs);
      const q = quoteSide(store.settings, card.size.usd, token, slip);
      if (q.notional > cash()) return { error: "cash insuficiente", cash: cash() };
      if (!state.marks[card.ticker]) state.marks[card.ticker] = 1;
      store.ledger.unshift({
        id: uid("tr"), cardId: card.id, ticker: card.ticker, mint: card.mint, chain: card.chain,
        side: "buy", usd: q.notional, stopPct: card.size.stopPct, status: "open",
        at: iso(), via: "1-click", n: card.n, pnl: 0, lagMs, slipPct: slip,
        entryMark: state.marks[card.ticker], feesIn: q, netIn: q.net,
        followed: (card.traders || []).map((t) => t.handle),
      });
      card.status = "clicked"; save();
      pocket("fill", "Fill $" + card.ticker, "fees " + q.totalFees, { tradeId: store.ledger[0].id });
    }
    if (path === "/api/close") {
      const tr = store.ledger.find((x) => x.id === body.id);
      if (!tr) return { error: "gone" };
      const token = tokenBy(tr.ticker) || {};
      const mark = state.marks[tr.ticker] || tr.entryMark || 1;
      const grossOut = (tr.netIn || tr.usd) * (mark / (tr.entryMark || 1));
      const qOut = quoteSide(store.settings, grossOut, token, tr.slipPct || 0.4);
      tr.status = "closed"; tr.exitMark = mark; tr.feesOut = qOut; tr.grossOut = round2(grossOut);
      tr.netOut = qOut.net; tr.pnl = round2(qOut.net - tr.usd); tr.pnlPct = +((tr.pnl / tr.usd) * 100).toFixed(2);
      tr.closedAt = iso(); save();
    }
    return emit();
  }

  w.CX = {
    start(fn) {
      subs.push(fn);
      log("CEO", "GitHub Pages · paper en el navegador. Auto OFF.", "hot");
      pocket("sys", "Desk en Pages", "No hay Node. El paper vive en este browser.");
      ingest("econoar", "fone", 8400, "buy");
      tick();
      emit();
      setInterval(tick, 7000);
    },
    post,
  };
})(window);
