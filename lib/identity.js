"use strict";

/** Scout — grafo de identidad FOMO ↔ X ↔ ENS ↔ Solana ↔ EVM.
 *  Fuentes públicas: FomoScan (fomoscan.sh) + Solscan. Nada inventado.
 */

const ECONOAR = {
  handle: "econoar",
  name: "eric.eth",
  aliases: ["econoar", "eric.eth", "ericeth", "eric", "ericconner"],
  fomoFollowers: 48000,
  twitterFollowers: 195600,
  followers: 48000,
  pnl: 0,
  wallet: "7sQJttJLutWjHkxbusTgE4GpSj5z4fegouv2USHDFN2H",
  evm: "0x1605b59dfe3c1742c815d604aab6a2faa3a5c91f",
  walletStatus: "resolved",
  identityLevel: "linked",
  source: "fomoscan.sh/econoar + solscan",
  twitter: "https://x.com/econoar",
  fomo: "https://fomo.family/profile/econoar",
  holdingsUsd: 84249,
  note: "48k follows FOMO. Solscan $84.2k · 1.92M $fone. Swaps vía Fomo Co-signer hace minutos.",
  kol: true,
  tape: true,
  chain: "solana",
};

const VERIFIED = [
  ECONOAR,
  { handle: "TassoLago", name: "Tasso Lago", followers: 2146, pnl: 166308304, wallet: "8GYbQxSrjEL1jMhNrUkbw2fVcn46uZEuVrJYyFoueAFe", tapeWallet: "DLDehvQPR4a6PF3Zr2ySyThMbWizXCErrjkxP4uG2CQ4", walletStatus: "resolved", identityLevel: "probable", rank: 9, fomo: "https://fomo.family/profile/TassoLago", source: "fomoscan", note: "FOMO Privy ≠ wallet del tape fomoscope. Scout guarda las dos." },
  { handle: "thomaz687", name: "thomas", followers: 570, pnl: 135643425, wallet: "64V5ucEMnU3E6uHi3kUadU3PGGuMAHAFPWWmGc5nNHrG", rank: 21, walletStatus: "resolved", identityLevel: "probable" },
  { handle: "voided", name: "voided", followers: 284, pnl: 128525515, wallet: "43Fa3fBFPC8XMBrv4y7pJzooiWymrq5jJVgSZkRX2T6G", tapeWallet: "HG8E8bDxWY1wJbMJ1UV6egQmotKGdVXexwPcA5etBsSC", evm: "0xb13ef80331edeb4cc1ceec32f911c570c53283f6", rank: 25, walletStatus: "resolved", identityLevel: "unverified", note: "0 follows en fomoscan vs 284 en tape — posible squat." },
  { handle: "nobsicle", name: "nobsicle", followers: 147, pnl: 187105972, wallet: "BsxBMwm5SNHngCJE9LhBqEXvn6tUffGKjTietEBwvNQi", tapeWallet: "7b6Bwb7dKHE14YuRsNswkhxW1Ltnpmh9CqnaVRS59t6Q", evm: "0x6e5bd49aa75741e7e2a5256ff461e95cda700b01", rank: 6, walletStatus: "resolved", identityLevel: "probable" },
  { handle: "InspectorMNBL", name: "Inspector", followers: 145, pnl: 148633156, wallet: "4FRAr7TRyWGaZJq3Vp2tX2eJ9vQqmnjAEQb8vZX3yoM3", tapeWallet: "JAupMYv4CSF77LtTc9xb6JDWv3EoPFnNY8FChbrApUUD", evm: "0x46dd4f8d8567cfdf2f8fafc50628ad7c73d4dcb5", rank: 15, walletStatus: "resolved", identityLevel: "probable" },
  { handle: "divinely_protected", name: "divinely protected", followers: 93, pnl: 189398184, wallet: "5GZ4HEHcXcgHhVZnjS1J1reodspEgxFskWQoqXAun5hV", rank: 5, walletStatus: "resolved", identityLevel: "probable", note: "FomoScan 404. Queda wallet del tape, no Privy." },
  { handle: "boumm", name: "boumm", followers: 51, pnl: 163778579, wallet: "3AY3CnQhVYegouKYE5bN9L44x3Gt65SSnbaWEYUzVC4i", rank: 11, walletStatus: "resolved", identityLevel: "probable" },
  { handle: "hobo_hands", name: "hobo_hands", followers: 26, pnl: 191802665, wallet: "7YzyxrehpD3zuxqEBq7zC5WeBxuxjU4FRS2EHpTEqDQG", rank: 4, walletStatus: "resolved", identityLevel: "probable" },
  { handle: "zuggie", name: "zuggie", followers: 28, pnl: 161447323, wallet: "9iSSYwP2r4PGKxBNLqotKwLCYWpYaXz2iohwbc7yZprg", rank: 12, walletStatus: "resolved" },
  { handle: "greenbean", name: "zincent", followers: 31, pnl: 147681005, wallet: "4rzVZHjTA4MEDQ21ekoUMhWzWEBeS1Uqn2LW2G87TdbN", rank: 16, walletStatus: "resolved" },
  { handle: "firehand_eth", name: "FireHand", followers: 38, pnl: 4200000, wallet: null, walletStatus: "unknown", identityLevel: "unverified", tape: true, note: "Activo en tape FOMO. FomoScan sin wallet." },
  { handle: "TaobaoGCR", name: "TaobaoGCR", followers: 62, pnl: 8100000, wallet: null, walletStatus: "unknown", tape: true },
  { handle: "ping999", name: "ping999", followers: 44, pnl: 2100000, wallet: null, walletStatus: "unknown", tape: true },
  { handle: "Minty1x", name: "Minty", followers: 120, pnl: 5600000, wallet: null, walletStatus: "unknown", tape: true },
  { handle: "bantuu", name: "bantuu", followers: 19, pnl: 900000, wallet: null, walletStatus: "unknown", tape: true },
  { handle: "vancute1112", name: "vancute1112", followers: 11, pnl: 640000, wallet: null, walletStatus: "unknown", tape: true },
  { handle: "thejefeee", name: "JT", followers: 88, pnl: 12300000, wallet: null, walletStatus: "unknown", tape: true },
];

const JUNK = [
  { handle: "Thynnao3571", name: "Thynnao", followers: 11, pnl: 9e19, wallet: "BZf9CqcvbQ7idoxvsV1m5GWnZLju3U6ZgiRTGEQCTNTh", rank: 1, junk: true, walletStatus: "resolved" },
  { handle: "cierknowhowtotrade", name: "cierknowhowtotrade", followers: 4, pnl: 9e19, wallet: "FRkKNp146o24MVQHeq5TSVruVKPjZNeMgjQbJAfi2JoP", rank: 2, junk: true, walletStatus: "resolved" },
  { handle: "diinoo", name: "diinoo", followers: 1, pnl: 9e19, wallet: "B5bkVPXHBVM6YdnLyN57ayWb51q5swtWP45E4V5i3HTh", rank: 3, junk: true, walletStatus: "resolved" },
];

const catalog = new Map();
function index(t) {
  catalog.set(t.handle.toLowerCase(), t);
  for (const a of t.aliases || []) catalog.set(String(a).toLowerCase(), t);
}
for (const t of [...VERIFIED, ...JUNK]) index(t);

function resolve(raw) {
  const h = String(raw || "").trim().replace(/^@/, "").replace(/^https?:\/\/fomo\.family\/(profile|r)\//i, "");
  const known = catalog.get(h.toLowerCase());
  return known ? known.handle : h;
}

function get(handle) {
  return catalog.get(String(handle || "").toLowerCase()) || null;
}

module.exports = {
  ECONOAR,
  VERIFIED,
  JUNK,
  catalog,
  index,
  resolve,
  get,
  SEED_WATCH: ["econoar", "TassoLago", "nobsicle", "InspectorMNBL", "divinely_protected", "voided", "thomaz687", "firehand_eth", "Minty1x", "ping999"],
};
