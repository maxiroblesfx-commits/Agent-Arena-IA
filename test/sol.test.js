"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { parseSwap, deltas, WSOL, MIN_SOL } = require("../tools/sol");

const YO = "HZrxCXCms81ryxwvYNycwcPmynXmPgcKV4C2FeDJA86e";
const TOKEN = "CTPoyCwkjMvoJwU4xvZZqoD8tiYk6yDchySiN5gGpump";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** Arma una transacción con la forma que devuelve getTransaction jsonParsed. */
function tx({ solAntes, solDespues, pre = [], post = [], fee = 5000, blockTime = 1756900000 }) {
  return {
    blockTime, slot: 123,
    transaction: { signatures: ["sig1"], message: { accountKeys: [{ pubkey: YO }, { pubkey: "otro" }] } },
    meta: {
      fee,
      preBalances: [solAntes * 1e9, 0], postBalances: [solDespues * 1e9, 0],
      preTokenBalances: pre, postTokenBalances: post,
    },
  };
}
const saldo = (mint, uiAmount, owner = YO) => ({ owner, mint, uiTokenAmount: { uiAmount } });

test("una compra: baja el SOL, sube el token", () => {
  const s = parseSwap(tx({ solAntes: 2, solDespues: 1, post: [saldo(TOKEN, 1000)] }), YO);
  assert.equal(s.side, "buy");
  assert.equal(s.mint, TOKEN);
  assert.equal(s.tokenAmount, 1000);
  assert.ok(Math.abs(s.sol - 1) < 0.001, "gastó ~1 SOL");
});

test("una venta: baja el token, sube el SOL", () => {
  const s = parseSwap(tx({ solAntes: 1, solDespues: 3, pre: [saldo(TOKEN, 1000)], post: [saldo(TOKEN, 0)] }), YO);
  assert.equal(s.side, "sell");
  assert.equal(s.tokenAmount, 1000);
  assert.ok(Math.abs(s.sol - 2) < 0.001);
});

test("una transferencia no es un swap", () => {
  // Manda tokens a otro lado sin recibir SOL: no es una operación.
  const t = tx({ solAntes: 1, solDespues: 1, pre: [saldo(TOKEN, 1000)], post: [saldo(TOKEN, 0)] });
  assert.equal(parseSwap(t, YO), null);
});

test("WSOL cuenta como SOL, no como un token más", () => {
  const t = tx({ solAntes: 1, solDespues: 1, pre: [saldo(WSOL, 2)], post: [saldo(WSOL, 0), saldo(TOKEN, 500)] });
  const s = parseSwap(t, YO);
  assert.ok(s, "debe reconocerse como swap");
  assert.equal(s.side, "buy");
  assert.equal(s.mint, TOKEN, "el token es el memecoin, no WSOL");
  assert.ok(Math.abs(s.sol - 2) < 0.001, "los 2 WSOL son los 2 SOL pagados");
});

test("ignora los saldos de otras personas en la misma transacción", () => {
  const t = tx({ solAntes: 2, solDespues: 1, post: [saldo(TOKEN, 1000), saldo(TOKEN, 99999, "otroDueño")] });
  const s = parseSwap(t, YO);
  assert.equal(s.tokenAmount, 1000, "solo cuenta lo del dueño que seguimos");
});

test("la comisión no se cuenta como parte del swap", () => {
  const sinFee = parseSwap(tx({ solAntes: 2, solDespues: 1, post: [saldo(TOKEN, 1)], fee: 0 }), YO);
  const conFee = parseSwap(tx({ solAntes: 2, solDespues: 1, post: [saldo(TOKEN, 1)], fee: 1e7 }), YO);
  assert.ok(conFee.sol < sinFee.sol, "pagar más comisión no infla el tamaño de la operación");
});

test("un cambio entre stables no se cuenta como operación", () => {
  const t = tx({ solAntes: 2, solDespues: 1, post: [saldo(USDC, 100)] });
  assert.equal(parseSwap(t, YO), null);
});

test("un swap token→token se descarta: sin SOL no hay tamaño medible", () => {
  const t = tx({ solAntes: 1, solDespues: 1,
    pre: [saldo(TOKEN, 1000)], post: [saldo("OtroMint111111111111111111111111111111111", 50)] });
  assert.equal(parseSwap(t, YO), null);
});

test("una transacción sin meta no rompe nada", () => {
  assert.equal(parseSwap({}, YO), null);
  assert.equal(deltas({}, YO), null);
});

test("el polvo de la comisión no se confunde con plata cobrada", () => {
  // Transferencia pura: el SOL no se mueve, pero devolver el fee deja un residuo.
  const t = tx({ solAntes: 1, solDespues: 1, pre: [saldo(TOKEN, 1000)], post: [saldo(TOKEN, 0)], fee: 5000 });
  assert.equal(parseSwap(t, YO), null, "5000 lamports no son una venta");
  // Justo por encima del piso sí es una operación real.
  const real = tx({ solAntes: 1, solDespues: 1 + MIN_SOL * 3, pre: [saldo(TOKEN, 1000)], post: [saldo(TOKEN, 0)] });
  assert.equal(parseSwap(real, YO).side, "sell");
});

const sc = require("../tools/score");

test("reconstruye una operación de Solana: compra escalonada y venta total", () => {
  const M = 60000;
  const eps = sc.episodesFromSwaps([
    { mint: TOKEN, side: "buy",  tokenAmount: 500, sol: 1, ts: 0 },
    { mint: TOKEN, side: "buy",  tokenAmount: 500, sol: 1, ts: 5 * M },
    { mint: TOKEN, side: "sell", tokenAmount: 1000, sol: 3, ts: 120 * M },
  ]);
  assert.equal(eps.length, 1, "una operación, no tres");
  assert.equal(eps[0].entryFills, 2);
  assert.equal(eps[0].net, 1, "gastó 2 SOL y cobró 3");
  assert.equal(eps[0].holdMs, 120 * M);
});

test("cierra la posición aunque quede polvo sin vender", () => {
  const eps = sc.episodesFromSwaps([
    { mint: TOKEN, side: "buy",  tokenAmount: 1000, sol: 2, ts: 0 },
    { mint: TOKEN, side: "sell", tokenAmount: 995,  sol: 3, ts: 60000 },  // queda 0.5%
  ]);
  assert.equal(eps.length, 1, "el polvo no deja la operación abierta para siempre");
});

test("una posición todavía abierta no se cuenta", () => {
  const eps = sc.episodesFromSwaps([{ mint: TOKEN, side: "buy", tokenAmount: 1000, sol: 2, ts: 0 }]);
  assert.equal(eps.length, 0);
});

test("no mezcla dos tokens distintos", () => {
  const eps = sc.episodesFromSwaps([
    { mint: TOKEN, side: "buy",  tokenAmount: 100, sol: 1, ts: 0 },
    { mint: "Otro1111111111111111111111111111111111111", side: "buy", tokenAmount: 100, sol: 1, ts: 1000 },
    { mint: TOKEN, side: "sell", tokenAmount: 100, sol: 2, ts: 2000 },
  ]);
  assert.equal(eps.length, 1, "solo cerró uno");
  assert.equal(eps[0].coin, TOKEN);
});

const { scoutOne } = require("../tools/scout");
const solmod = require("../tools/sol");

/** Sustituye signatures() por una respuesta fija, sin tocar la red. */
async function conFirmas(firmas, opts = {}) {
  const orig = solmod.signatures;
  solmod.signatures = async () => firmas;
  try { return await scoutOne("HZrxCXCms81ryxwvYNycwcPmynXmPgcKV4C2FeDJA86e", { days: 90, ...opts }); }
  finally { solmod.signatures = orig; }
}

test("cero firmas: avisa que puede ser el RPC o la address equivocada", async () => {
  const r = await conFirmas([]);
  assert.equal(r.status, "sin-historial");
  assert.match(r.note, /solscan/, "da el modo de comprobarlo");
  assert.match(r.note, /Privy/, "menciona la otra causa posible");
});

test("firmas sin fecha: culpa al RPC, no a la address", async () => {
  const r = await conFirmas([{ signature: "a" }, { signature: "b" }]);
  assert.equal(r.status, "rpc-sin-fechas");
  assert.equal(r.firmas, 2);
});

test("firmas viejas: dice cuándo fue la última en vez de decir que no hay nada", async () => {
  const hace200dias = Math.floor((Date.now() - 200 * 86400000) / 1000);
  const r = await conFirmas([{ signature: "a", blockTime: hace200dias }]);
  assert.equal(r.status, "sin-actividad-reciente");
  assert.match(r.note, /--days/, "sugiere ampliar la ventana");
});
