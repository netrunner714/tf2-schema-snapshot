import test from "node:test";
import assert from "node:assert/strict";
import {
  readSchemaItems,
  schemaSourceVersion,
  marketHashNameFromSchemaItem,
  marketHashNameFromParts,
  SCHEMA_EVENT_KEY_OVERRIDES,
} from "./schema-items.js";
import { parseSchemaDocument } from "./keyvalues.js";

test("reads Steam Schema items from common response wrappers", () => {
  const items = readSchemaItems({
    result: {
      version: "2026-09-12",
      items: [
        {
          defindex: "5021",
          name: "Mann Co. Supply Crate Key",
          item_class: "supply_crate",
          item_quality: "6",
        },
      ],
    },
  });

  assert.deepEqual(items[0], {
    defindex: 5021,
    name: "Mann Co. Supply Crate Key",
    itemName: null,
    marketHashName: null,
    itemClass: "supply_crate",
    itemTypeName: null,
    itemSlot: null,
    itemQuality: 6,
    craftClass: null,
    craftMaterialType: null,
    iconUrl: null,
    capabilities: {},
    usedByClasses: [],
    schemaData: {
      defindex: "5021",
      name: "Mann Co. Supply Crate Key",
      item_class: "supply_crate",
      item_quality: "6",
    },
  });
  assert.equal(
    schemaSourceVersion({ result: { version: "2026-09-12", items: [] } }),
    "2026-09-12",
  );
});

test("accepts official Steam-style item_name payloads without dropping items", () => {
  const [item] = readSchemaItems({
    result: {
      items: [
        {
          defindex: 1101,
          item_name: "TF_WEAPON_FUTURE_ITEM",
          item_class: "tf_weapon_future",
          item_type_name: "Future Weapon",
          item_quality: 6,
          crafting_material: "weapon",
          used_by_classes: ["Scout"],
          capabilities: { tradable: true, marketable: true },
          attributes: [{ name: "unmodeled_schema_field", value: 1 }],
        },
      ],
    },
  });

  assert.equal(item?.defindex, 1101);
  assert.equal(item?.name, "TF_WEAPON_FUTURE_ITEM");
  assert.equal(item?.itemName, "TF_WEAPON_FUTURE_ITEM");
  assert.equal(item?.craftMaterialType, "weapon");
  assert.deepEqual(item?.capabilities, { tradable: true, marketable: true });
  assert.deepEqual(item?.schemaData?.attributes, [
    { name: "unmodeled_schema_field", value: 1 },
  ]);
});

test("reads the full items_game JSON object form, including numeric defindex keys", () => {
  const items = readSchemaItems({
    items_game: {
      items: {
        "5000": {
          name: "Craft Bar Level 1",
          item_name: "#CI_Bar_A",
          item_class: "craft_item",
          item_quality: "unique",
          used_by_classes: { soldier: "primary" },
        },
        default: { name: "not an item" },
      },
    },
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.defindex, 5000);
  assert.equal(items[0]?.itemQuality, 6);
  assert.deepEqual(items[0]?.usedByClasses, ["soldier"]);
});

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
  const [item] = readSchemaItems(raw);
  assert.equal(item?.defindex, 241);
  assert.equal(item?.itemName, "#TF_Usable_Duel");
  assert.equal(item?.itemQuality, 6);
  assert.deepEqual(item?.schemaData?.capabilities, {
    tradable: "1",
    marketable: "1",
  });
});

test("reads numeric item keys from a nested schema object", () => {
  const [item] = readSchemaItems({
    schema: {
      items: {
        "241": {
          name: "Dueling Mini-Game",
          item_name: "#TF_Usable_Duel",
          item_quality: 6,
        },
      },
    },
  });

  assert.equal(item?.defindex, 241);
  assert.equal(item?.itemName, "#TF_Usable_Duel");
});

test("items_game image_inventory paths never become icon URLs", () => {
  // The Steam economy CDN answers 404 for filesystem-style image_inventory
  // paths; only hashed economy paths are servable. The parser must never
  // turn them into icon URLs.
  const [item] = readSchemaItems(
    parseSchemaDocument(`
    "items_game" { "items" {
      "241" {
        "name" "Duel MiniGame"
        "image_inventory" "backpack/player/items/crafting/icon_dueling"
      }
    } }
  `),
  );
  assert.equal(item?.defindex, 241);
  assert.equal(item?.iconUrl, null);
});

test("marketHashNameFromSchemaItem builds Steam-style names with the proper prefix", () => {
  assert.equal(
    marketHashNameFromSchemaItem({ item_name: "Huntsman", proper_name: true }),
    "The Huntsman",
  );
  assert.equal(
    marketHashNameFromSchemaItem({
      item_name: "L'Étranger",
      proper_name: false,
    }),
    "L'Étranger",
  );
  assert.equal(
    marketHashNameFromSchemaItem({
      item_name: "Family Business",
      proper_name: "1",
    }),
    "The Family Business",
  );
  assert.equal(marketHashNameFromSchemaItem({ proper_name: true }), undefined);
  assert.equal(
    marketHashNameFromSchemaItem({
      defindex: 5067,
      item_name: "Mann Co. Supply Crate Key",
    }),
    "Refreshing Summer Cooler Key",
  );
  assert.equal(
    marketHashNameFromSchemaItem({
      defindex: 5021,
      item_name: "Mann Co. Supply Crate Key",
    }),
    "Mann Co. Supply Crate Key",
  );
});

test("marketHashNameFromParts returns null for localization tokens", () => {
  assert.equal(marketHashNameFromParts("#TF_Usable_Duel", false), null);
  assert.equal(marketHashNameFromParts(null, true), null);
});

test("event key overrides cover the known seasonal keys", () => {
  assert.equal(Object.keys(SCHEMA_EVENT_KEY_OVERRIDES).length, 15);
  assert.equal(SCHEMA_EVENT_KEY_OVERRIDES[5049], "Festive Winter Crate Key");
});
