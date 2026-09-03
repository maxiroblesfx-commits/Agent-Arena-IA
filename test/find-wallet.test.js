"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

/** Carga el snippet en un DOM falso con el contenido que le pasemos. */
function cargar(scripts, recursos = []) {
  const sandbox = {
    document: {
      querySelectorAll: () => scripts.map((s) => ({ id: s.id || "", textContent: s.text })),
    },
    window: {},
    XMLHttpRequest: function () {},
    console: { log() {}, table() {} },
    performance: { getEntriesByType: () => recursos },
  };
  sandbox.window.fetch = async () => ({});
  sandbox.XMLHttpRequest.prototype = { open() {}, addEventListener() {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../tools/browser/find-wallet.js"), "utf8"), sandbox);
  return sandbox.window.wallets();
}

function cargarSandbox(scripts, recursos = [], fetchStub) {
  const sandbox = {
    document: { querySelectorAll: () => scripts.map((x) => ({ id: x.id || "", textContent: x.text })) },
    window: {}, XMLHttpRequest: function () {},
    console: { log() {}, table() {} },
    performance: { getEntriesByType: () => recursos },
  };
  sandbox.window.fetch = fetchStub || (async () => ({}));
  sandbox.XMLHttpRequest.prototype = { open() {}, addEventListener() {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../tools/browser/find-wallet.js"), "utf8"), sandbox);
  return sandbox;
}

const WALLET = "7sQJttJLutWjHkxbusTgE4GpSj5z4fegouv2USHDFN2H";
const MINT = "CTPoyCwkjMvoJwU4xvZZqoD8tiYk6yDchySiN5gGpump";
const EVM = "0x1605b59dfe3c1742c815d604aab6a2faa3a5c91f";

test("encuentra la wallet dentro del JSON embebido de la página", () => {
  const rows = cargar([{ id: "__NEXT_DATA__", text: JSON.stringify({
    props: { profile: { handle: "econoar", walletAddress: WALLET } },
  })}]);
  const hit = rows.find((r) => r.address === WALLET);
  assert.ok(hit, "tiene que encontrarla");
  assert.match(hit.probable, /SÍ/);
  assert.equal(hit.tipo, "Solana");
});

test("distingue la wallet del mint de un token", () => {
  const rows = cargar([{ id: "__NEXT_DATA__", text: JSON.stringify({
    profile: { walletAddress: WALLET },
    swaps: [{ tokenMint: MINT, amount: 498.49 }],
  })}]);
  const w = rows.find((r) => r.address === WALLET);
  const m = rows.find((r) => r.address === MINT);
  assert.match(w.probable, /SÍ/, "la wallet se marca como probable");
  assert.match(m.probable, /no/, "el mint se descarta");
  assert.ok(rows.indexOf(w) < rows.indexOf(m), "la wallet va primero en el ranking");
});

test("también reconoce addresses EVM", () => {
  const rows = cargar([{ id: "d", text: JSON.stringify({ user: { evmAddress: EVM } }) }]);
  const hit = rows.find((r) => r.address === EVM);
  assert.ok(hit);
  assert.equal(hit.tipo, "EVM");
});

test("rescata addresses de un script que no es JSON puro", () => {
  const rows = cargar([{ id: "inline", text:
    `self.__data.push({"ownerAddress":"${WALLET}","x":1});// texto suelto` }]);
  assert.ok(rows.some((r) => r.address === WALLET), "sirve el fallback por regex");
});

test("no inventa nada si la página no trae addresses", () => {
  const rows = cargar([{ id: "x", text: JSON.stringify({ hola: "mundo", n: 12345 }) }]);
  assert.equal(rows.length, 0, "sin datos, ningún resultado");
});

test("sniff() recupera las peticiones anteriores al script", () => {
  const recursos = [
    { name: "https://api.fomo.family/v1/profile/econoar?full=1", initiatorType: "fetch" },
    { name: "https://api.fomo.family/v1/profile/econoar?full=1", initiatorType: "fetch" },
    { name: "https://cdn.fomo.family/app/index-abc.js", initiatorType: "script" },
    { name: "https://fomo-api.mobula.io/wallet/trades", initiatorType: "xmlhttprequest" },
    { name: "https://x.com/logo.png", initiatorType: "fetch" },
  ];
  const sandbox = cargarSandbox([], recursos);
  const rows = sandbox.window.sniff();
  const urls = rows.map((r) => r.url.split("?")[0]);
  assert.ok(urls.includes("https://api.fomo.family/v1/profile/econoar"), "encuentra la API del perfil");
  assert.ok(urls.includes("https://fomo-api.mobula.io/wallet/trades"), "y la de Mobula");
  assert.ok(!urls.some((u) => u.endsWith(".js")), "descarta los bundles de JS");
  assert.ok(!urls.some((u) => u.endsWith(".png")), "y las imágenes");
  assert.equal(rows[0].veces, 2, "agrupa por URL y cuenta repeticiones");
});

test("grab() lee las respuestas y encuentra la wallet ahí", async () => {
  const recursos = [{ name: "https://api.fomo.family/v1/profile/econoar", initiatorType: "fetch" }];
  const sandbox = cargarSandbox([], recursos, async () => ({
    headers: { get: () => "application/json" },
    json: async () => ({ profile: { handle: "econoar", walletAddress: WALLET } }),
  }));
  const rows = await sandbox.window.grab();
  const hit = rows.find((r) => r.address === WALLET);
  assert.ok(hit, "la wallet aparece tras releer la API");
  assert.match(hit.probable, /SÍ/);
});

test("prioriza el campo propio del perfil sobre uno de un feed masivo", () => {
  const perfil = "HZrxCXCms81ryxwvYNycwcPmynXmPgcKV4C2FeDJA86e";
  const ajeno = "aX8G1EVfWkRneHwWJN6RUecyGcXBYpz42yeKFa1rKiJ";
  const scripts = [{ id: "d", text: JSON.stringify({
    responseObject: { address: perfil },                       // el dueño: una sola vez
    swaps: Array.from({ length: 40 }, () => ({ address: ajeno })), // un feed: 40 veces
  })}];
  const rows = cargar(scripts);
  const p = rows.find((r) => r.address === perfil);
  const a = rows.find((r) => r.address === ajeno);
  assert.match(p.probable, /SÍ/, "el campo singular es el del perfil");
  assert.equal(a.probable, "de una lista", "el del feed se marca como ajeno");
  assert.ok(rows.indexOf(p) < rows.indexOf(a), "gana el singular, aunque aparezca 40 veces menos");
});
