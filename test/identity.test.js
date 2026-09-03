"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const identity = require("../lib/identity");

test("normalizes FOMO handles and full profile URLs", () => {
  assert.equal(identity.resolve("@econoar"), "econoar");
  assert.equal(identity.resolve("https://fomo.family/profile/econoar?ref=feed#top"), "econoar");
  assert.equal(identity.resolve("www.fomo.family/r/TassoLago?share=1"), "TassoLago");
  assert.equal(identity.resolve("fomo.family/profile/voided/"), "voided");
});

test("rejects arbitrary URLs and malformed handles", () => {
  assert.equal(identity.resolve("https://example.com/profile/econoar"), "");
  assert.equal(identity.resolve("not a handle"), "");
  assert.equal(identity.resolve("<script>"), "");
});

test("recognizes only public Solana and EVM address forms", () => {
  assert.equal(identity.isSolanaAddress("7sQJttJLutWjHkxbusTgE4GpSj5z4fegouv2USHDFN2H"), true);
  assert.equal(identity.isEvmAddress("0x1605b59dfe3c1742c815d604aab6a2faa3a5c91f"), true);
  assert.equal(identity.isSolanaAddress("not-a-wallet"), false);
  assert.equal(identity.isEvmAddress("0x123"), false);
});
