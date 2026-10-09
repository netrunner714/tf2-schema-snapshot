import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchSchemaItemsRaw,
  fetchSteamQualityNames,
  i18nDescriptorFromSchemaItem,
  i18nDescriptorsFromRaw,
  parseSteamQualityNames,
} from "./steam-fetch.js";

function pageResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

test("fetchSchemaItemsRaw pages through the cursor and aborts on truncation flags", async () => {
  const requested: string[] = [];
  const fetchImpl = (async (input: URL | Request | string) => {
    const url = new URL(String(input));
    requested.push(url.searchParams.get("start") ?? "initial");
    if (!url.searchParams.has("start")) {
      return pageResponse({
        result: {
          status: 1,
          next: 2,
          items: [{ defindex: 1, item_name: "First" }],
        },
      });
    }
    // Final page: status=1, no `next` — the normal terminal marker.
    return pageResponse({
      result: {
        status: 1,
        items: [{ defindex: 2, item_name: "Second" }],
      },
    });
  }) as typeof fetch;

  const raw = await fetchSchemaItemsRaw("test-key", "en_us", {
    fetchImpl,
    pageDelayMs: 0,
  });
  assert.deepEqual(requested, ["initial", "2"]);
  const items = (raw as { result: { items: unknown[] } }).result.items;
  assert.equal(items.length, 2);
});

test("fetchSchemaItemsRaw aborts on HTTP errors instead of writing partial data", async () => {
  const fetchImpl = (async () =>
    ({ ok: false, status: 403 }) as Response) as typeof fetch;
  await assert.rejects(
    fetchSchemaItemsRaw("k", "en_us", { fetchImpl, pageDelayMs: 0 }),
    /SCHEMA_ITEMS_HTTP_403/,
  );
});

test("fetchSchemaItemsRaw rejects a malformed response body", async () => {
  const fetchImpl = (async () => pageResponse({ result: {} })) as typeof fetch;
  await assert.rejects(
    fetchSchemaItemsRaw("k", "en_us", { fetchImpl, pageDelayMs: 0 }),
    /SCHEMA_ITEMS_MALFORMED_RESPONSE/,
  );
});

test("fetchSchemaItemsRaw rejects an invalid next cursor", async () => {
  const fetchImpl = (async () =>
    pageResponse({
      result: { status: 1, next: 0, items: [{ defindex: 1 }] },
    })) as typeof fetch;
  await assert.rejects(
    fetchSchemaItemsRaw("k", "en_us", { fetchImpl, pageDelayMs: 0 }),
    /SCHEMA_ITEMS_INVALID_NEXT_CURSOR/,
  );
});

test("fetchSchemaItemsRaw requires an API key and language", async () => {
  await assert.rejects(fetchSchemaItemsRaw("  ", "en_us"), /STEAM_API_KEY/);
  await assert.rejects(fetchSchemaItemsRaw("k", "  "), /LANGUAGE_REQUIRED/);
});

test("parseSteamQualityNames extracts localized quality labels", () => {
  const names = parseSteamQualityNames({
    result: {
      qualities: { Normal: 0, Unique: 6, Unusual: 5 },
      qualityNames: {
        Normal: "Normal",
        Unique: "Unique",
        Unusual: "Unusual",
      },
    },
  });
  assert.deepEqual(names, [
    { quality: 0, name: "Normal" },
    { quality: 6, name: "Unique" },
    { quality: 5, name: "Unusual" },
  ]);
});

test("parseSteamQualityNames fails fast on missing sections", () => {
  assert.throws(
    () => parseSteamQualityNames({ result: {} }),
    /SCHEMA_OVERVIEW_QUALITIES_MISSING/,
  );
  assert.throws(
    () => parseSteamQualityNames({ result: { qualities: { Unique: 6 } } }),
    /SCHEMA_OVERVIEW_QUALITY_NAMES_MISSING/,
  );
});

test("fetchSteamQualityNames requires an API key", async () => {
  await assert.rejects(fetchSteamQualityNames("", "en_us"), /STEAM_API_KEY/);
});

test("i18nDescriptorFromSchemaItem maps localized descriptors", () => {
  assert.deepEqual(
    i18nDescriptorFromSchemaItem({
      defindex: 5021,
      name: "Schlüssel",
      item_name: "Schlüssel",
      item_type_name: "Werkzeug",
    }),
    {
      defindex: 5021,
      name: "Schlüssel",
      itemName: "Schlüssel",
      marketHashName: "Schlüssel",
      itemTypeName: "Werkzeug",
      payload: {
        defindex: 5021,
        name: "Schlüssel",
        item_name: "Schlüssel",
        item_type_name: "Werkzeug",
      },
    },
  );
  assert.equal(
    i18nDescriptorFromSchemaItem({ defindex: "abc" }),
    undefined,
  );
});

test("i18nDescriptorsFromRaw collects descriptors from a raw page set", () => {
  const descriptors = i18nDescriptorsFromRaw({
    result: {
      items: [
        { defindex: 1, item_name: "Первый" },
        { defindex: "nope" },
        { defindex: 2, item_name: "Второй", item_type_name: "Инструмент" },
      ],
    },
  });
  assert.equal(descriptors.length, 2);
  assert.equal(descriptors[1]?.itemTypeName, "Инструмент");
  assert.throws(
    () => i18nDescriptorsFromRaw({ result: {} }),
    /SCHEMA_ITEMS_MALFORMED_RESPONSE/,
  );
});
