/**
 * Snapshot builder: merges the two Steam schema layers into one versioned
 * artifact set.
 *
 * Layer 1 — items_game.txt (GetSchemaURL): STRUCTURE (prefab, craft_class,
 * attributes, capabilities). GetSchemaItems does not expose prefab, and
 * prefab inheritance is required for item categorization.
 * Layer 2 — GetSchemaItems/v0001: DISPLAY FACTS (market item_name, proper_name,
 * item_quality, icon_url). items_game.txt ships internal names ("Decoder
 * Ring") and localization tokens ("#TF_…") — never display names.
 *
 * Neither source is complete; the snapshot is the per-defindex merge.
 */

import { createHash } from "node:crypto";
import type { Tf2SchemaItem } from "./schema-items.js";
import { schemaSourceVersion } from "./schema-items.js";

export type SnapshotItem = Tf2SchemaItem;

export type SnapshotMeta = {
  /** Snapshot schema version tag (Steam schema version or content hash). */
  version: string;
  /** UTC ISO timestamp of the build. */
  builtAt: string;
  /** appid of the game the snapshot was built for. */
  appid: number;
  contextid: string;
  /** Content hash of the canonical item set (stable ordering). */
  contentHash: string;
  itemCount: number;
  /** Source: items_game.txt URL actually fetched. */
  itemsGameUrl: string | null;
  /** Source: GetSchemaItems schema version field when present. */
  steamSchemaVersion: string | null;
  languages: string[];
};

export type Snapshot = {
  meta: SnapshotMeta;
  /** Canonical EN item set (merged layers), defindex-unique. */
  items: SnapshotItem[];
  /** Localized item names per BCP-47 tag (EN excluded — it is the canon). */
  i18n: Record<string, I18nItemEntry[]>;
  /** Localized quality names per BCP-47 tag (EN included). */
  qualities: Record<string, QualityNameEntry[]>;
};

export type I18nItemEntry = {
  defindex: number;
  name: string;
  itemName?: string;
  marketHashName?: string;
  itemTypeName?: string;
  payload?: Record<string, unknown>;
};

export type QualityNameEntry = { quality: number; name: string };

export const SNAPSHOT_FORMAT_VERSION = 1;

/**
 * Serialize JSON data deterministically: object key order is irrelevant, while
 * array order is preserved. This makes the hash independent of insertion order
 * without hiding changes to any published item field.
 */
function stableJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function stableContentHash(content: {
  appid: number;
  contextid: string;
  itemCount: number;
  itemsGameUrl: string | null;
  steamSchemaVersion: string | null;
  languages: string[];
  items: SnapshotItem[];
  i18n: Record<string, I18nItemEntry[]>;
  qualities: Record<string, QualityNameEntry[]>;
}): string {
  const hash = createHash("sha256");
  // Hash every published data artifact and every non-volatile meta.json field.
  // builtAt is deliberately excluded so an unchanged daily build stays unchanged.
  hash.update(stableJson({
    appid: content.appid,
    contextid: content.contextid,
    itemCount: content.itemCount,
    itemsGameUrl: content.itemsGameUrl,
    steamSchemaVersion: content.steamSchemaVersion,
    languages: content.languages,
    items: content.items,
    i18n: content.i18n,
    qualities: content.qualities,
  }));
  return hash.digest("hex").slice(0, 32);
}

/**
 * Merges the structural layer (items_game) with the display layer
 * (GetSchemaItems) per item. Display fields that are missing in the
 * structure or internal there (names) are overridden by GetSchemaItems.
 */
export function mergeSchemaLayers(
  base: Tf2SchemaItem,
  display: Tf2SchemaItem | undefined,
): Tf2SchemaItem {
  if (!display) return base;
  const merged = {
    ...base,
    // Market name and quality come from GetSchemaItems (items_game carries
    // internal/token names). displayName at GetSchemaItems is the market name.
    name: display.name || base.name,
    itemName: display.itemName ?? base.itemName,
    marketHashName: display.marketHashName ?? base.marketHashName,
    itemQuality: display.itemQuality ?? base.itemQuality,
    itemTypeName: display.itemTypeName ?? base.itemTypeName,
    itemSlot: display.itemSlot ?? base.itemSlot,
    iconUrl: display.iconUrl ?? base.iconUrl,
    // craft_class from GetSchemaItems is prefab-resolved server-side; the
    // items_game one is raw — prefer the resolved one.
    craftClass: display.craftClass ?? base.craftClass,
    craftMaterialType: display.craftMaterialType ?? base.craftMaterialType,
    capabilities:
      Object.keys(display.capabilities ?? {}).length > 0
        ? display.capabilities
        : base.capabilities,
    usedByClasses:
      (display.usedByClasses ?? []).length > 0
        ? display.usedByClasses
        : base.usedByClasses,
    // schema_payload: the structural items_game payload (prefab!) enriched
    // with display fields — the mirror keeps BOTH prefab (for categories)
    // AND the market name (for the storefront).
    schemaData: {
      ...(base.schemaData ?? {}),
      ...(display.schemaData ?? {}),
      // prefab only exists in items_game — protect it from being overwritten.
      prefab:
        (base.schemaData as Record<string, unknown> | undefined)?.prefab ??
        (display.schemaData as Record<string, unknown> | undefined)?.prefab,
    },
  };
  return merged as Tf2SchemaItem;
}

export function mergeSchemaLayersAll(
  structuralItems: Tf2SchemaItem[],
  displayItems: Tf2SchemaItem[],
): Tf2SchemaItem[] {
  const displayByDefindex = new Map(
    displayItems.map((i) => [i.defindex, i]),
  );
  const merged = structuralItems.map((base) =>
    mergeSchemaLayers(base, displayByDefindex.get(base.defindex)),
  );
  // Items missing from items_game but present in GetSchemaItems (rare, but
  // happens for brand-new additions): the display layer is the only source.
  const structuralDefindexes = new Set(structuralItems.map((i) => i.defindex));
  for (const d of displayItems) {
    if (!structuralDefindexes.has(d.defindex)) merged.push(d);
  }
  // Duplicate defindex guard: the importer refuses duplicates upstream, and
  // the snapshot must never ship them (both layers keyed by defindex).
  const seen = new Set<number>();
  const unique: Tf2SchemaItem[] = [];
  for (const item of merged) {
    if (seen.has(item.defindex))
      throw new Error(`SNAPSHOT_DUPLICATE_DEFINDEX:${item.defindex}`);
    seen.add(item.defindex);
    unique.push(item);
  }
  if (unique.length === 0) throw new Error("TF2_SCHEMA_EMPTY");
  return unique;
}

export type BuildSnapshotInput = {
  appid?: number;
  contextid?: string;
  itemsGameUrl: string | null;
  structuralItems: Tf2SchemaItem[];
  displayItems: Tf2SchemaItem[];
  displayRaw: Record<string, unknown>;
  i18n: Record<string, I18nItemEntry[]>;
  qualities: Record<string, QualityNameEntry[]>;
};

export function buildSnapshot(input: BuildSnapshotInput): Snapshot {
  const items = mergeSchemaLayersAll(
    input.structuralItems,
    input.displayItems,
  ).sort((a, b) => a.defindex - b.defindex);
  const i18n = Object.fromEntries(
    Object.entries(input.i18n).map(([language, entries]) => [
      language,
      [...entries].sort((a, b) => a.defindex - b.defindex),
    ]),
  );
  const qualities = Object.fromEntries(
    Object.entries(input.qualities).map(([language, entries]) => [
      language,
      [...entries].sort((a, b) => a.quality - b.quality),
    ]),
  );
  const languages = Object.keys(i18n).sort();
  const appid = input.appid ?? 440;
  const contextid = input.contextid ?? "2";
  const itemsGameUrl = input.itemsGameUrl;
  const steamSchemaVersion = schemaSourceVersion(input.displayRaw) ?? null;
  const contentHash = stableContentHash({
    appid,
    contextid,
    itemCount: items.length,
    itemsGameUrl,
    steamSchemaVersion,
    languages,
    items,
    i18n,
    qualities,
  });
  const version = steamSchemaVersion ?? `sha-${contentHash}`;

  return {
    meta: {
      version: `v${SNAPSHOT_FORMAT_VERSION}-${version}`,
      builtAt: new Date().toISOString(),
      appid,
      contextid,
      contentHash,
      itemCount: items.length,
      itemsGameUrl,
      steamSchemaVersion,
      languages,
    },
    items,
    i18n,
    qualities,
  };
}

export type SnapshotDiff = {
  newItems: number;
  updatedItems: number;
  removedItems: number;
  identical: boolean;
};

/**
 * Compares a fresh snapshot against the previous released one so the
 * workflow can skip publishing when nothing changed (Steam's schema moves
 * rarely — TF2 gets a handful of updates per year).
 */
export function diffSnapshots(
  previous: Snapshot,
  next: Snapshot,
): SnapshotDiff {
  const prevByDefindex = new Map(
    previous.items.map((item) => [item.defindex, item]),
  );
  const nextByDefindex = new Map(
    next.items.map((item) => [item.defindex, item]),
  );
  let newItems = 0;
  let updatedItems = 0;
  for (const [defindex, item] of nextByDefindex) {
    const before = prevByDefindex.get(defindex);
    if (!before) newItems++;
    else if (JSON.stringify(before) !== JSON.stringify(item)) updatedItems++;
  }
  let removedItems = 0;
  for (const defindex of prevByDefindex.keys()) {
    if (!nextByDefindex.has(defindex)) removedItems++;
  }
  const identical =
    newItems === 0 && updatedItems === 0 && removedItems === 0;
  return { newItems, updatedItems, removedItems, identical };
}
