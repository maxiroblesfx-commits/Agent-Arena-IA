const $ = (id) => document.getElementById(id);
function fmt(n) {
  const x = Number(n) || 0;
  const sign = x < 0 ? "-" : "";
  const a = Math.abs(x);
  if (a >= 1e12) return "JUNK";
  if (a >= 1e6) return sign + "$" + (a / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return sign + "$" + (a / 1e3).toFixed(1) + "K";
  return sign + "$" + a.toFixed(2);
}
function short(w) { return w ? w.slice(0, 4) + "…" + w.slice(-4) : ""; }
function ago(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m";
  return Math.floor(s / 3600) + "h";
}
function gClass(g) { return g === "B+" ? "g-Bp" : "g-" + (g || ""); }
function clsPnl(n) { return n > 0 ? "up" : n < 0 ? "dn" : ""; }

let lastAlert = null, pendingCard = null, lastState = null, audioOn = true, cfgDirty = false;

function beep() {
  if (!audioOn) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "triangle"; o.frequency.value = 740; g.gain.value = 0.04;
    o.connect(g); g.connect(ctx.destination); o.start();
    setTimeout(() => { o.frequency.value = 980; }, 90);
    setTimeout(() => { o.stop(); ctx.close(); }, 220);
  } catch {}
}
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 4200);
}

const DEFAULT_LAYOUT = { w1: 300, w3: 320, radar: 1.15, dock: 156, order: ["watch", "radar", "tape", "right"], collapsed: {} };
const layout = Object.assign({}, DEFAULT_LAYOUT, JSON.parse(localStorage.getItem("cx.layout") || "{}"));
if (!Array.isArray(layout.order) || layout.order.length !== 4) layout.order = DEFAULT_LAYOUT.order.slice();
if (!layout.collapsed) layout.collapsed = {};

function applyLayout() {
  const sh = $("shell");
  if (!sh) return;
  sh.style.setProperty("--w1", layout.w1 + "px");
  sh.style.setProperty("--w3", layout.w3 + "px");
  $("colCenter").style.setProperty("--radar", layout.radar + "fr");
  $("dock").style.setProperty("--dock", layout.dock + "px");
  document.documentElement.style.setProperty("--dock", layout.dock + "px");
}
function saveLayout() { localStorage.setItem("cx.layout", JSON.stringify(layout)); }
applyLayout();

const PANELS = {
  watch: () => $("colWatch"),
  radar: () => $("colRadar"),
  tape: () => $("colTape"),
  right: () => $("colRight"),
};
const SLOTS = ["slot-a", "slot-b", "slot-c", "slot-d"];

function mountOrder() {
  layout.order.forEach((id, i) => {
    const slot = $(SLOTS[i]);
    const panel = PANELS[id] && PANELS[id]();
    if (slot && panel && panel.parentElement !== slot) slot.appendChild(panel);
  });
  Object.keys(layout.collapsed).forEach((id) => {
    if (layout.collapsed[id] && $(id)) $(id).classList.add("collapsed");
  });
}
mountOrder();

function bindGutters() {
  document.querySelectorAll("[data-split]").forEach((g) => {
    g.onmousedown = (e) => {
      e.preventDefault();
      g.classList.add("drag");
      const kind = g.getAttribute("data-split");
      const startX = e.clientX, startY = e.clientY;
      const w1 = layout.w1, w3 = layout.w3, radar = layout.radar, dock = layout.dock;
      const move = (ev) => {
        if (kind === "lr") layout.w1 = Math.max(200, Math.min(560, w1 + (ev.clientX - startX)));
        if (kind === "rr") layout.w3 = Math.max(220, Math.min(580, w3 - (ev.clientX - startX)));
        if (kind === "tb") layout.radar = Math.max(0.35, Math.min(2.4, radar + (ev.clientY - startY) / 260));
        if (kind === "dock") layout.dock = Math.max(88, Math.min(280, dock - (ev.clientY - startY)));
        applyLayout();
      };
      const up = () => { g.classList.remove("drag"); window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); saveLayout(); };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    };
  });
}
bindGutters();

/* drag panels between slots */
let dragPanel = null;
document.querySelectorAll("[data-drag]").forEach((hd) => {
  hd.addEventListener("dragstart", (e) => {
    dragPanel = hd.getAttribute("data-drag");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragPanel);
  });
});
document.querySelectorAll(".slot").forEach((slot) => {
  slot.addEventListener("dragover", (e) => { e.preventDefault(); slot.classList.add("drop"); });
  slot.addEventListener("dragleave", () => slot.classList.remove("drop"));
  slot.addEventListener("drop", (e) => {
    e.preventDefault();
    slot.classList.remove("drop");
    const id = e.dataTransfer.getData("text/plain") || dragPanel;
    const target = slot.querySelector("[data-panel]");
    const toId = target && target.getAttribute("data-panel");
    if (!id || !toId || id === toId) return;
    const a = layout.order.indexOf(id);
    const b = layout.order.indexOf(toId);
    if (a < 0 || b < 0) return;
    const next = layout.order.slice();
    next[a] = toId; next[b] = id;
    layout.order = next;
    mountOrder();
    saveLayout();
  });
});

$("resetLayout").onclick = () => {
  Object.assign(layout, JSON.parse(JSON.stringify(DEFAULT_LAYOUT)));
  ["colWatch", "colRadar", "colTape", "colRight"].forEach((id) => $(id).classList.remove("collapsed"));
  mountOrder(); applyLayout(); saveLayout();
  toast("Layout reseteado. Arrastrá ⋮⋮ en el título para mover paneles.");
};

document.body.addEventListener("click", (e) => {
  const col = e.target.getAttribute("data-collapse");
  if (col) {
    $(col).classList.toggle("collapsed");
    layout.collapsed[col] = $(col).classList.contains("collapsed");
    saveLayout();
  }
});

function setView(v) {
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("on", el.id === "view-" + v));
  document.querySelectorAll(".navb").forEach((b) => b.classList.toggle("on", b.getAttribute("data-view") === v));
  document.body.className = "view-" + v;
  localStorage.setItem("cx.view", v);
  if (v === "cfg" && lastState) fillCfg(lastState);
  if (lastState) render(lastState);
}
document.querySelectorAll("[data-view]").forEach((b) => {
  if (b.id === "resetLayout") return;
  b.addEventListener("click", (e) => {
    const v = b.getAttribute("data-view");
    if (v && (b.tagName === "BUTTON" || b.classList.contains("eq") || b.classList.contains("navb"))) {
      e.stopPropagation();
      setView(v);
    }
  });
});
const savedView = localStorage.getItem("cx.view");
if (savedView) setView(savedView);

async function post(url, body) {
  if (window.__cxLocal && window.CX) return window.CX.post(url, body);
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  return r.json();
}

function walletTag(t) {
  if (t.wallet) return `<span class="wallet-tag ok">${short(t.wallet)}</span>`;
  return `<span class="wallet-tag">sin wallet</span>`;
}

function legsHtml(q, title) {
  if (!q) return "";
  return `<div class="legs">
    ${title ? `<div class="leg"><span>${title}</span><b></b></div>` : ""}
    <div class="leg"><span>FOMO follow</span><b>${fmt(q.fomo)}</b></div>
    <div class="leg"><span>DEX / Jupiter</span><b>${fmt(q.dex)}</b></div>
    <div class="leg"><span>Priority</span><b>${fmt(q.priority)}</b></div>
    <div class="leg"><span>Token tax</span><b>${fmt(q.tax)}</b></div>
    <div class="leg"><span>Slippage</span><b>${fmt(q.slip)}</b></div>
    <div class="leg tot"><span>Total fees</span><b>${fmt(q.totalFees)}</b></div>
    <div class="leg"><span>Neto</span><b>${fmt(q.net)}</b></div>
  </div>`;
}

function ticketHtml(t, mode) {
  const open = t.status === "open";
  const pnl = open ? t.uPnl : t.pnl;
  const pct = open ? t.uPnlPct : t.pnlPct;
  return `<article class="ticket">
    <div class="tk-hd">
      <div>
        <div class="tk-ticker">$${t.ticker}</div>
        <div class="fee-break">${(t.followed || []).map((h) => "@" + h).join(" ") || "—"} · ${t.chain || "sol"} · stop ${t.stopPct}%</div>
      </div>
      <div style="text-align:right">
        <div class="st ${open ? "open" : "closed"}">${open ? "ABIERTA" : "CERRADA"}</div>
        <div class="${clsPnl(pnl)}" style="font-family:IBM Plex Mono,monospace;margin-top:6px">${fmt(pnl)} (${pct || 0}%)</div>
      </div>
    </div>
    <div class="fee-break" style="margin-top:8px">bruto ${fmt(t.usd)} → neto in ${fmt(t.netIn)}${t.netOut != null ? " → neto out " + fmt(t.netOut) : ""} · lag ${t.lagMs || 0}ms · slip ${t.slipPct}%</div>
    ${legsHtml(t.feesIn, "Entrada")}
    ${t.feesOut ? legsHtml(t.feesOut, "Salida") : (t.exitPreview ? legsHtml(t.exitPreview, "Si cerrás ahora") : "")}
    ${open ? `<div class="actions" style="margin-top:12px"><button class="btn" data-close="${t.id}">cerrar paper</button></div>` : ""}
  </article>`;
}

function renderDesk(s) {
  const live = s.feed === "live";
  $("feedDot").className = "dot" + (live ? "" : " sim");
  $("feedChip").textContent = live ? "tape live FOMO" : "snapshot + sim";
  $("feedChip").className = "chip " + (live ? "on" : "warn");
  $("lagChip").textContent = (s.latencyMs || "—") + " ms";
  $("watchN").textContent = s.stats.watch;
  $("chSol").classList.toggle("on", s.settings.chain !== "base");
  $("chBase").classList.toggle("on", s.settings.chain === "base");
  if (s.econoar) {
    $("econoarNote").innerHTML = `<b>@econoar = eric.eth.</b> SOL <a href="https://solscan.io/account/${s.econoar.wallet}" target="_blank" rel="noopener">${short(s.econoar.wallet)}</a> · EVM ${short(s.econoar.evm)} · ${fmt(s.econoar.holdingsUsd)} on-chain.`;
  }

  $("watch").innerHTML = s.watchlist.map((t) => {
    const display = t.name && t.name !== t.handle ? t.name : "@" + t.handle;
    return `<article class="person ${t.kol ? "kol" : ""}">
      <div class="av">${(t.name || t.handle).slice(0, 2).toUpperCase()}</div>
      <div>
        <div class="name">${display}</div>
        <div class="handle">@${t.handle}${t.identityLevel ? " · " + t.identityLevel : ""}</div>
        <div class="meta">${t.followers || 0} follows · ${t.pnl ? fmt(t.pnl) : "PnL n/d"}</div>
        ${walletTag(t)} ${t.evm ? `<span class="wallet-tag">${short(t.evm)}</span>` : ""}
        ${t.note ? `<div class="meta">${t.note}</div>` : ""}
      </div>
      <div style="text-align:right">
        <div class="grade ${gClass(t.forensic.grade)}">${t.forensic.grade}</div>
        <button class="x" data-un="${t.handle}">×</button>
      </div>
      <div class="actions">
        ${t.wallet ? `<a class="btn ghost tiny" href="https://solscan.io/account/${t.wallet}" target="_blank" rel="noopener">solscan</a>` : ""}
        ${t.fomo ? `<a class="btn ghost tiny" href="${t.fomo}" target="_blank" rel="noopener">FOMO</a>` : ""}
      </div>
    </article>`;
  }).join("");

  const cards = s.cards.filter((c) => c.action === "alert" || c.action === "block").slice(0, 8);
  $("cards").innerHTML = cards.length ? cards.map((c) => {
    const hot = c.action === "alert" && c.status === "live";
    const cls = c.action === "block" ? "block" : c.status === "clicked" ? "clicked" : hot ? "hot" : "";
    const names = (c.traders || []).map((t) => (t.name && t.name !== t.handle ? t.name : "@" + t.handle)).join(" · ");
    const disabled = c.action !== "alert" || c.status === "clicked" || c.status === "skipped";
    const m = c.micro || {};
    const q = c.quote;
    return `<article class="card ${cls}">
      <div class="row">
        <div class="ticker">$${c.ticker}</div>
        <span class="pill ${c.action === "alert" ? "a" : "r"}">${c.action === "alert" ? "CONFLUENCE " + c.n : "VETO"}</span>
      </div>
      <div class="copy">${names}<br>${c.spanSec}s · score ${c.score} · indep ${(c.indep || 0).toFixed(2)} · ${c.thesis ? "tesis" : "ape mudo"}</div>
      <div class="pills">
        <span class="pill ${c.rug && c.rug.risk === "LOW" ? "g" : "w"}">${(c.rug && c.rug.risk) || "?"}</span>
        ${m.mintRevoked ? `<span class="pill g">mint rev</span>` : `<span class="pill r">mint open</span>`}
        ${m.freeze ? `<span class="pill r">freeze</span>` : ""}
        <span class="pill">LP ${m.lpLock || "?"}%</span>
        ${c.size ? `<span class="pill a">${c.size.pct}% · ${fmt(c.size.usd)}</span>` : ""}
        ${m.tax ? `<span class="pill r">tax ${m.tax}%</span>` : `<span class="pill g">tax 0</span>`}
      </div>
      ${q ? legsHtml(q, "Ticket paper si comprás ahora") : ""}
      <div class="actions">
        <button class="btn" data-buy="${c.id}" ${disabled ? "disabled" : ""}>PAPER BUY</button>
        <button class="btn ghost" data-skip="${c.id}" ${disabled ? "disabled" : ""}>snooze</button>
      </div>
    </article>`;
  }).join("") : `<div class="empty">Esperando cluster. Un ape solo no es señal.</div>`;

  $("tape").innerHTML = s.tape.slice(0, 22).map((e) => `
    <div class="tape-item">
      <div class="side ${e.side}">${(e.side || "buy").toUpperCase()}</div>
      <div><div class="who">${e.name && e.name !== e.handle ? e.name : "@" + e.handle} <span>$${e.ticker}</span></div></div>
      <div class="amt">${e.usd ? fmt(e.usd) : ""}<br>${ago(e.ts)}</div>
    </div>`).join("");

  $("pane-pocket").innerHTML = s.pocket.length ? s.pocket.map((p) => `
    <article class="pk ${p.kind}">
      <div class="when">bolsillo · ${ago(p.ts)}</div>
      <h3>${p.title}</h3><p>${p.body}</p>
      <div class="actions">
        ${p.extra && p.extra.cardId ? `<button class="btn tiny" data-buy="${p.extra.cardId}">buy</button>` : ""}
        ${p.extra && p.extra.tradeId ? `<button class="btn tiny" data-close="${p.extra.tradeId}">cerrar</button>` : ""}
      </div>
    </article>`).join("") : `<div class="empty">Sin pings.</div>`;

  $("pane-agents").innerHTML = s.agents.slice(0, 16).map((a) =>
    `<div class="agent ${a.level || ""}"><span class="c">${a.code}</span>${a.msg}</div>`).join("");

  const open = s.positions || [];
  $("dockBody").innerHTML = open.length
    ? open.map((t) => `<div class="dock-card">
        <b>$${t.ticker}</b>
        <div class="${clsPnl(t.uPnl)}" style="font-family:IBM Plex Mono,monospace">${fmt(t.uPnl)} · ${fmt(t.usd)}</div>
        <div class="fee-break">fees in ${fmt(t.feesIn && t.feesIn.totalFees)} · FOMO ${fmt(t.feesIn && t.feesIn.fomo)} · DEX ${fmt(t.feesIn && t.feesIn.dex)} · tax ${fmt(t.feesIn && t.feesIn.tax)}</div>
        <button class="btn tiny" style="margin-top:8px" data-close="${t.id}">cerrar</button>
      </div>`).join("")
    : `<div class="empty" style="padding:8px 0">Ningún paper abierto. PAPER BUY en el radar — el ticket con FOMO+DEX+tax aparece acá y en la pestaña Paper.</div>`;

  const newest = cards.find((c) => c.action === "alert" && c.status === "live");
  if (newest && newest.id !== lastAlert) {
    lastAlert = newest.id; beep(); toast("CONFLUENCE $" + newest.ticker);
  }
}

function renderOps(s) {
  const u = s.unrealized || 0;
  $("kpis").innerHTML = [
    ["Equity", fmt(s.equity), ""],
    ["Cash libre", fmt(s.cash), ""],
    ["Abierto uPnL", fmt(u), clsPnl(u)],
    ["Realizado", fmt(s.realized), clsPnl(s.realized)],
    ["Fees pagados", fmt(s.feesPaid), ""],
    ["Lag medio", (s.lagAvg || 0) + " ms", ""],
  ].map(([l, v, c]) => `<div class="kpi"><div class="l">${l}</div><div class="v ${c}">${v}</div></div>`).join("");

  const open = s.positions || [];
  $("opsOpen").innerHTML = open.length
    ? open.map((t) => ticketHtml(t, "open")).join("")
    : `<div class="empty">No hay posiciones. En Desk, PAPER BUY. El ticket desglosa FOMO $1 + DEX + priority + tax + slip.</div>`;

  const hist = s.history || [];
  $("opsHist").innerHTML = hist.length
    ? hist.map((t) => ticketHtml(t, "closed")).join("")
    : `<div class="empty">Todavía no cerraste. El historial guarda el round-trip completo.</div>`;
}

function readCfgForm() {
  const f = $("cfgForm");
  const n = (name) => Number(f.elements[name].value);
  return {
    bankroll: n("bankroll"),
    sizePct: n("sizePctHuman") / 100,
    maxOpen: n("maxOpen"),
    maxDailyLossPct: n("maxDailyLossPct"),
    minN: n("minN"),
    windowSec: n("windowSec"),
    fomoFeeMode: f.elements.fomoFeeMode.value,
    fomoFlatUsd: n("fomoFlatUsd"),
    fomoPct: n("fomoPctHuman") / 100,
    dexFeePct: n("dexBps") / 10000,
    priorityFeeUsd: n("priorityFeeUsd"),
    minSlipPct: n("minSlipPct"),
    maxSlippagePct: n("maxSlippagePct"),
  };
}

function fillCfg(s) {
  if (cfgDirty) return;
  const st = s.settings;
  const f = $("cfgForm");
  f.elements.bankroll.value = st.bankroll;
  f.elements.sizePctHuman.value = +(st.sizePct * 100).toFixed(2);
  f.elements.maxOpen.value = st.maxOpen;
  f.elements.maxDailyLossPct.value = st.maxDailyLossPct;
  f.elements.minN.value = st.minN;
  f.elements.windowSec.value = st.windowSec;
  f.elements.fomoFeeMode.value = st.fomoFeeMode || "flat";
  f.elements.fomoFlatUsd.value = st.fomoFlatUsd;
  f.elements.fomoPctHuman.value = +((st.fomoPct || 0.005) * 100).toFixed(2);
  f.elements.dexBps.value = Math.round((st.dexFeePct || 0.0025) * 10000);
  f.elements.priorityFeeUsd.value = st.priorityFeeUsd;
  f.elements.minSlipPct.value = st.minSlipPct;
  f.elements.maxSlippagePct.value = st.maxSlippagePct;
  previewCfg();
}

async function previewCfg() {
  try {
    const settings = readCfgForm();
    const usd = settings.bankroll * settings.sizePct;
    const q = await post("/api/quote", { usd, ticker: "fone", settings, lagMs: 400 });
    $("cfgTicket").innerHTML = `<div class="ticket">
      <div class="tk-hd"><div class="tk-ticker">$${fmt(usd).replace("$", "")} de size</div><div class="st open">SIM</div></div>
      <div class="fee-break">Ejemplo $fone · slip ${q.slip}% · tax ${q.taxPct}%</div>
      ${legsHtml(q.buy, "Compra")}
      ${legsHtml(q.sell, "Venta (si el precio no se mueve)")}
      <div class="leg tot"><span>Round-trip fees</span><b>${fmt(q.roundTripFees)}</b></div>
      <div class="leg"><span>PnL si flat (solo fees)</span><b class="dn">${fmt(q.netIfFlat)}</b></div>
    </div>`;
  } catch {
    $("cfgTicket").innerHTML = `<p class="cfg-help">No pude cotizar. Guardá igual.</p>`;
  }
}

function render(s) {
  lastState = s;
  $("eq").textContent = fmt(s.equity);
  $("cash").textContent = fmt(s.cash);
  $("upnl").textContent = fmt(s.unrealized || 0);
  $("fees").textContent = fmt(s.feesPaid || 0);
  $("upnl").className = clsPnl(s.unrealized || 0);
  $("opsBadge").textContent = String(s.openCount || 0);
  const view = document.querySelector(".navb.on")?.getAttribute("data-view") || "desk";
  if (view === "desk") renderDesk(s);
  if (view === "ops") renderOps(s);
  if (view === "cfg") fillCfg(s);
}

$("followForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const handle = e.target.handle.value.trim();
  if (!handle) return;
  await post("/api/follow", { handle });
  e.target.reset();
});

$("cfgForm").addEventListener("input", () => { cfgDirty = true; previewCfg(); });
$("cfgForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = readCfgForm();
  await post("/api/settings", body);
  cfgDirty = false;
  toast("Config guardada. El próximo PAPER BUY cobra con estas fees.");
  previewCfg();
});

const PRESETS = {
  safe: { bankroll: 1000, sizePctHuman: 0.6, maxOpen: 2, maxDailyLossPct: 5, minN: 3, windowSec: 180, fomoFeeMode: "flat", fomoFlatUsd: 1, fomoPctHuman: 0.5, dexBps: 25, priorityFeeUsd: 0.02, minSlipPct: 0.15, maxSlippagePct: 2 },
  fomo: { bankroll: 1000, sizePctHuman: 1.5, maxOpen: 4, maxDailyLossPct: 8, minN: 2, windowSec: 180, fomoFeeMode: "flat", fomoFlatUsd: 1, fomoPctHuman: 0.5, dexBps: 25, priorityFeeUsd: 0.02, minSlipPct: 0.15, maxSlippagePct: 3 },
  agg: { bankroll: 1000, sizePctHuman: 4, maxOpen: 8, maxDailyLossPct: 15, minN: 2, windowSec: 90, fomoFeeMode: "flat", fomoFlatUsd: 1, fomoPctHuman: 0.5, dexBps: 25, priorityFeeUsd: 0.05, minSlipPct: 0.3, maxSlippagePct: 5 },
};
document.querySelectorAll("[data-preset]").forEach((b) => {
  b.onclick = () => {
    const p = PRESETS[b.getAttribute("data-preset")];
    const f = $("cfgForm");
    Object.keys(p).forEach((k) => { if (f.elements[k]) f.elements[k].value = p[k]; });
    cfgDirty = true;
    previewCfg();
  };
});

async function doBuy(id, playbookOk) {
  const data = await post("/api/click", { cardId: id, action: "buy", playbookOk: !!playbookOk });
  if (data.needPlaybook) {
    pendingCard = data.card;
    $("playbookList").innerHTML = ["Independencia ok", "Size % bankroll", "Mint/freeze", "Fees visibles en el ticket", "Wallet de guerra"].map((x) => `<li>${x}</li>`).join("");
    $("playbookModal").classList.add("show");
    return;
  }
  if (data.error) { toast(data.error); return; }
  lastState = data;
  toast("Fill paper. Ticket con FOMO+DEX+tax+slip — te abro el blotter.");
  setView("ops");
}

document.body.addEventListener("click", async (e) => {
  const tab = e.target.getAttribute("data-tab");
  if (tab) {
    document.querySelectorAll("#colRight .tab").forEach((b) => b.classList.toggle("on", b.getAttribute("data-tab") === tab));
    $("pane-pocket").hidden = tab !== "pocket";
    $("pane-agents").hidden = tab !== "agents";
    return;
  }
  const chain = e.target.getAttribute("data-chain");
  if (chain) { await post("/api/chain", { chain }); return; }
  const un = e.target.getAttribute("data-un");
  const buy = e.target.getAttribute("data-buy");
  const skip = e.target.getAttribute("data-skip");
  const close = e.target.getAttribute("data-close");
  if (un) await post("/api/unfollow", { handle: un });
  if (skip) await post("/api/click", { cardId: skip, action: "skip" });
  if (close) {
    const cl = await post("/api/close", { id: close });
    if (!cl.error) lastState = cl;
    toast("Cerrado. Fees de salida en el ticket.");
    setView("ops");
  }
  if (buy) await doBuy(buy, false);
});

$("playbookNo").onclick = () => { $("playbookModal").classList.remove("show"); pendingCard = null; };
$("playbookGo").onclick = async () => {
  if (!pendingCard) return;
  $("playbookModal").classList.remove("show");
  const id = pendingCard.id; pendingCard = null;
  await doBuy(id, true);
};

function connect() {
  const es = new EventSource("/api/stream");
  es.onmessage = (ev) => { try { render(JSON.parse(ev.data)); } catch {} };
  es.onerror = () => { es.close(); setTimeout(connect, 1500); };
}
connect();
