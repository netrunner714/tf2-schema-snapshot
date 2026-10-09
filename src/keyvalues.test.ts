import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSchemaDocument,
  parseSchemaInput,
} from "./keyvalues.js";

test("reads Valve KeyValues items_game text without losing raw item fields", () => {
  const source = `
    "items_game" {
      "items" {
        "241" {
          "name" "Dueling Mini-Game"
          "item_name" "#TF_Usable_Duel"
          "item_quality" "6"
          "capabilities" { "tradable" "1" "marketable" "1" }
        }
      }
    }
  `;
  const raw = parseSchemaDocument(source);
  const itemsGame = raw as {
    items_game: { items: Record<string, Record<string, unknown>> };
  };
  const item = itemsGame.items_game.items["241"];
  assert.equal(item?.name, "Dueling Mini-Game");
  assert.equal(item?.item_name, "#TF_Usable_Duel");
  assert.deepEqual(item?.capabilities, { tradable: "1", marketable: "1" });
  assert.deepEqual(parseSchemaInput('{"items_game":{"items":{}}}'), {
    items_game: { items: {} },
  });
});

test("does not treat comment markers inside quoted KeyValues as comments", () => {
  const raw = parseSchemaDocument(`
    "items_game" { "items" {
      "1" { "name" "Item https://example.test//keep" }
    } }
  `) as { items_game: { items: Record<string, { name: string }> } };
  assert.equal(raw.items_game.items["1"]?.name, "Item https://example.test//keep");
});

test("rejects truncated KeyValues documents", () => {
  assert.throws(() => parseSchemaDocument('"items_game" { "items" {'), /KEYVALUES_INVALID/);
});
