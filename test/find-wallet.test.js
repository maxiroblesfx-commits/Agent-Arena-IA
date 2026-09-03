"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

/** Carga el snippet en un DOM falso con el contenido que le pasemos. */
function cargar(scripts) {
  const sandbox = {
    document: {
      querySelectorAll: () => scripts.map((s) => ({ id: s.id || "", textContent: s.text })),
    },
    window: {},
    XMLHttpRequest: function () {},
    console: { log() {}, table() {} },
  };
  sandbox.window.fetch = async () => ({});
  sandbox.XMLHttpRequest.prototype = { open() {}, addEventListener() {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../tools/browser/find-wallet.js"), "utf8"), sandbox);
  return sandbox.window.wallets();
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
