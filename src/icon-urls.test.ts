import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSteamIconUrl,
  steamEconomyIconUrl,
  resolveSchemaIconUrl,
} from "./icon-urls.js";

test("normalizeSteamIconUrl upgrades http media URLs and passes https through", () => {
  assert.equal(
    normalizeSteamIconUrl(
      "http://media.steampowered.com/apps/440/icons/icon_dueling.beb67c53.png",
    ),
    "https://media.steampowered.com/apps/440/icons/icon_dueling.beb67c53.png",
  );
  assert.equal(
    normalizeSteamIconUrl(
      "https://media.steampowered.com/apps/440/icons/x.png",
    ),
    "https://media.steampowered.com/apps/440/icons/x.png",
  );
});

test("normalizeSteamIconUrl expands single-segment hashed economy paths", () => {
  assert.equal(
    normalizeSteamIconUrl("fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijV"),
    "https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijV/256fx256f",
  );
});

test("normalizeSteamIconUrl rejects image_inventory-style paths and junk", () => {
  // Filesystem paths 404 on the economy CDN.
  assert.equal(
    normalizeSteamIconUrl("backpack/player/items/crafting/icon_dueling"),
    undefined,
  );
  assert.equal(normalizeSteamIconUrl(""), undefined);
  assert.equal(normalizeSteamIconUrl("   "), undefined);
  assert.equal(normalizeSteamIconUrl(42), undefined);
  assert.equal(normalizeSteamIconUrl(undefined), undefined);
  assert.equal(
    normalizeSteamIconUrl("ftp://media.steampowered.com/x.png"),
    undefined,
  );
});

test("steamEconomyIconUrl only accepts single-segment hashed paths", () => {
  assert.equal(steamEconomyIconUrl(""), undefined);
  assert.equal(steamEconomyIconUrl("   "), undefined);
  assert.equal(
    steamEconomyIconUrl("backpack/player/items/crafting/icon_dueling"),
    undefined,
  );
  assert.equal(steamEconomyIconUrl("backpack/../secrets/token"), undefined);
  assert.equal(steamEconomyIconUrl("hash?query=1"), undefined);
  assert.equal(steamEconomyIconUrl("hash#fragment"), undefined);
  assert.equal(steamEconomyIconUrl(42), undefined);
  assert.equal(
    steamEconomyIconUrl("/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijV/"),
    "https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijV/256fx256f",
  );
});

test("resolveSchemaIconUrl passes full URLs through and expands hashed paths", () => {
  assert.equal(
    resolveSchemaIconUrl("https://cdn.example.test/full.png"),
    "https://cdn.example.test/full.png",
  );
  assert.equal(
    resolveSchemaIconUrl("fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijV"),
    "https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijV/256fx256f",
  );
  assert.equal(resolveSchemaIconUrl(undefined), undefined);
  assert.equal(resolveSchemaIconUrl(null), undefined);
  assert.equal(resolveSchemaIconUrl("   "), undefined);
});
