"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { extraer, isSolana, isEvm, resolveHandle } = require("../lib/resolve");

const SOL = "HZrxCXCms81ryxwvYNycwcPmynXmPgcKV4C2FeDJA86e";
const EVM = "0x0cc1c39dc0c5fae009f0a8468bd50025a27e3cbc";

test("extrae las dos addresses del envoltorio real de FOMO", () => {
  const r = extraer({ responseObject: { handle: "econoar", address: SOL, evmAddress: EVM } });
  assert.equal(r.sol, SOL);
  assert.equal(r.evm, EVM);
});

test("tolera que la API mueva el envoltorio", () => {
  const r = extraer({ walletAddress: SOL, ethAddress: EVM });
  assert.equal(r.sol, SOL);
  assert.equal(r.evm, EVM);
});

test("no inventa una address cuando no hay ninguna", () => {
  const r = extraer({ responseObject: { handle: "x", address: null } });
  assert.equal(r.sol, null);
  assert.equal(r.evm, null);
});

test("no confunde un mint de token con una wallet EVM", () => {
  assert.ok(isSolana("CTPoyCwkjMvoJwU4xvZZqoD8tiYk6yDchySiN5gGpump"), "un mint tiene forma de address");
  assert.ok(!isEvm("CTPoyCwkjMvoJwU4xvZZqoD8tiYk6yDchySiN5gGpump"));
});

test("si le pasás una address la devuelve sin llamar a la red", async () => {
  const r = await resolveHandle(SOL);
  assert.equal(r.status, "ya-es-address");
  assert.equal(r.sol, SOL);
});

test("un handle vacío se reporta, no se resuelve", async () => {
  assert.equal((await resolveHandle("  ")).status, "invalido");
});

test("si la red no responde lo dice en vez de inventar", async () => {
  const r = await resolveHandle("econoar", { base: "http://127.0.0.1:1", timeoutMs: 300 });
  assert.equal(r.status, "no-resuelto");
  assert.ok(r.motivo.includes("Pegá la address"), "sugiere el camino manual");
});
