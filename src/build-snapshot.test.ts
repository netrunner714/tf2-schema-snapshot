import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSnapshot,
  diffSnapshots,
  mergeSchemaLayersAll,
} from "./build-snapshot.js";
import type { Tf2SchemaItem } from "./schema-items.js";

function structuralItem(
  defindex: number,
  overrides: Partial<Tf2SchemaItem> = {},
): Tf2SchemaItem {
  return {
    defindex,
    name: `TF2 item ${defindex}`,
    ...overrides,
  };
}

test("mergeSchemaLayersAll merges display facts over structural fields", () => {
  const structural = [
    structuralItem(5021, {
      name: "Decoder Ring",
      itemName: "#TF_Tool_DecoderRing",
      craftClass: "tool",
      schemaData: { prefab: "valve tool", name: "Decoder Ring" },
    }),
  ];
  const display = [
    structuralItem(5021, {
      name: "Mann Co. Supply Crate Key",
      marketHashName: "Mann Co. Supply Crate Key",
      iconUrl: "https://community.cloudflare.steamstatic.com/economy/image/key/256fx256f",
      craftClass: "tool",
      schemaData: { item_name: "Mann Co. Supply Crate Key" },
    }),
  ];

  const [merged] = mergeSchemaLayersAll(structural, display);
  assert.equal(merged?.name, "Mann Co. Supply Crate Key");
  assert.equal(merged?.marketHashName, "Mann Co. Supply Crate Key");
  assert.ok(merged?.iconUrl);
  // prefab from the structural layer survives the merge.
  assert.equal(
    (merged?.schemaData as Record<string, unknown>)?.prefab,
    "valve tool",
  );
});

test("mergeSchemaLayersAll keeps display-only items absent from items_game", () => {
  const structural = [structuralItem(1)];
  const display = [structuralItem(1), structuralItem(2, { name: "New item" })];
  const merged = mergeSchemaLayersAll(structural, display);
  assert.equal(merged.length, 2);
  assert.equal(merged[1]?.name, "New item");
});

test("mergeSchemaLayersAll rejects duplicate defindexes", () => {
  assert.throws(
    () =>
      mergeSchemaLayersAll(
        [structuralItem(5), structuralItem(5)],
        [],
      ),
    /SNAPSHOT_DUPLICATE_DEFINDEX:5/,
  );
});

test("mergeSchemaLayersAll rejects an empty merged set", () => {
  assert.throws(() => mergeSchemaLayersAll([], []), /TF2_SCHEMA_EMPTY/);
});

test("buildSnapshot produces stable content hash and metadata", () => {
  const items = [
    structuralItem(5021, {
      name: "Mann Co. Supply Crate Key",
      marketHashName: "Mann Co. Supply Crate Key",
    }),
    structuralItem(5000, { name: "Scrap Metal" }),
  ];
  const snapshot = buildSnapshot({
    itemsGameUrl: "https://example.test/items_game.1234.txt",
    structuralItems: items,
    displayItems: items,
    displayRaw: { result: { version: "2026-10-09", items: [] } },
    i18n: { ru: [{ defindex: 5000, name: "Металлолом" }] },
    qualities: { en: [{ quality: 6, name: "Unique" }] },
  });

  assert.equal(snapshot.meta.itemCount, 2);
  assert.equal(snapshot.meta.version, "v1-2026-10-09");
  assert.equal(snapshot.meta.steamSchemaVersion, "2026-10-09");
  assert.deepEqual(snapshot.meta.languages, ["ru"]);
  assert.match(snapshot.meta.contentHash, /^[0-9a-f]{32}$/);
  assert.equal(snapshot.items.length, 2);

  // Same items, same hash; different order, still the same hash.
  const reordered = buildSnapshot({
    itemsGameUrl: "https://example.test/items_game.1234.txt",
    structuralItems: [items[1]!, items[0]!],
    displayItems: [items[1]!, items[0]!],
    displayRaw: { result: { version: "2026-10-09", items: [] } },
    i18n: { ru: [{ defindex: 5000, name: "Металлолом" }] },
    qualities: { en: [{ quality: 6, name: "Unique" }] },
  });
  assert.equal(reordered.meta.contentHash, snapshot.meta.contentHash);
});

test("diffSnapshots detects additions, updates and removals", () => {
  const previous = buildSnapshot({
    itemsGameUrl: null,
    structuralItems: [
      structuralItem(1, { name: "A" }),
      structuralItem(2, { name: "B" }),
      structuralItem(3, { name: "C" }),
    ],
    displayItems: [],
    displayRaw: {},
    i18n: {},
    qualities: {},
  });
  const next = buildSnapshot({
    itemsGameUrl: null,
    structuralItems: [
      structuralItem(2, { name: "B2" }),
      structuralItem(3, { name: "C" }),
      structuralItem(4, { name: "D" }),
    ],
    displayItems: [],
    displayRaw: {},
    i18n: {},
    qualities: {},
  });

  const diff = diffSnapshots(previous, next);
  assert.equal(diff.newItems, 1);
  assert.equal(diff.updatedItems, 1);
  assert.equal(diff.removedItems, 1);
  assert.equal(diff.identical, false);

  const same = diffSnapshots(previous, previous);
  assert.equal(same.identical, true);
});
