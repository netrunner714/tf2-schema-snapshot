/**
 * Schema item normalization: turns raw items_game.txt / GetSchemaItems
 * payloads into canonical Tf2SchemaItem records — the market_hash_name
 * reconstruction algorithm, the seasonal event-key name overrides and the
 * wrapper-shape detection.
 */

import { resolveSchemaIconUrl } from "./icon-urls.js";

export type Tf2SchemaItem = {
  appid?: number;
  contextid?: string;
  defindex: number;
  name: string;
  itemName?: string | null;
  marketHashName?: string | null;
  itemClass?: string | null;
  itemTypeName?: string | null;
  itemSlot?: string | null;
  itemQuality?: number | null;
  craftClass?: string | null;
  craftMaterialType?: string | null;
  iconUrl?: string | null;
  capabilities?: Record<string, unknown>;
  usedByClasses?: string[];
  schemaData?: Record<string, unknown>;
};

type RawSchemaItem = {
  appid?: number | string;
  contextid?: string;
  defindex?: number | string;
  name?: string;
  item_name?: string;
  itemName?: string;
  market_name?: string;
  marketName?: string;
  market_hash_name?: string;
  marketHashName?: string;
  item_class?: string;
  itemClass?: string;
  item_type_name?: string;
  itemTypeName?: string;
  item_slot?: string;
  itemSlot?: string;
  item_quality?: number | string;
  itemQuality?: number | string;
  craft_class?: string;
  craftClass?: string;
  crafting_material?: string;
  craftingMaterial?: string;
  craft_material_type?: string;
  craftMaterialType?: string;
  icon_url?: string;
  iconUrl?: string;
  icon_url_large?: string;
  image_url?: string;
  capabilities?: unknown;
  used_by_classes?: unknown;
  usedByClasses?: unknown;
  /** GetSchemaItems: flag of the "The " market name prefix (The Huntsman). */
  proper_name?: boolean | string | number;
  properName?: boolean | string | number;
};

/**
 * Canonical name overrides for Valve schema anomalies.
 * Steam's GetSchemaItems returns item_name: "Mann Co. Supply Crate Key"
 * for all 15 seasonal/event crate keys because they share a base prefab,
 * even though in-game and on SCM / backpack.tf each event key has its own
 * distinct name and item slug.
 */
export const SCHEMA_EVENT_KEY_OVERRIDES: Readonly<Record<number, string>> = {
  5049: "Festive Winter Crate Key",
  5067: "Refreshing Summer Cooler Key",
  5072: "Naughty Winter Crate Key",
  5073: "Nice Winter Crate Key",
  5079: "Scorched Key",
  5081: "Fall Key",
  5628: "Eerie Key",
  5631: "Naughty Winter Crate Key 2012",
  5632: "Nice Winter Crate Key 2012",
  5713: "Spooky Key",
  5716: "Naughty Winter Crate Key 2013",
  5717: "Nice Winter Crate Key 2013",
  5762: "Limited Late Summer Crate Key",
  5791: "Naughty Winter Crate Key 2014",
  5792: "Nice Winter Crate Key 2014",
};

/**
 * Restores market_hash_name the same way Steam does: item_name plus the
 * "The " prefix for proper_name. item_name may be a localization token
 * (#TF_...) — then there is no display name (null).
 */
export function marketHashNameFromParts(
  itemName: string | null,
  properName: unknown,
  defindex?: number,
): string | null {
  if (defindex !== undefined && SCHEMA_EVENT_KEY_OVERRIDES[defindex]) {
    return SCHEMA_EVENT_KEY_OVERRIDES[defindex];
  }
  if (!itemName || itemName.startsWith("#")) return null;
  const proper = properName === true || properName === "1" || properName === 1;
  return proper ? `The ${itemName}` : itemName;
}

export function marketHashNameFromSchemaItem(item: {
  defindex?: unknown;
  item_name?: unknown;
  proper_name?: unknown;
  name?: unknown;
}): string | undefined {
  const defindex = Number(item.defindex);
  if (Number.isSafeInteger(defindex) && SCHEMA_EVENT_KEY_OVERRIDES[defindex]) {
    return SCHEMA_EVENT_KEY_OVERRIDES[defindex];
  }
  const itemName =
    typeof item.item_name === "string" ? item.item_name.trim() : undefined;
  const fallback = typeof item.name === "string" ? item.name.trim() : undefined;
  const base = itemName || fallback;
  if (!base) return undefined;
  const proper =
    item.proper_name === true ||
    item.proper_name === "1" ||
    item.proper_name === 1;
  return proper ? `The ${base}` : base;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text) return text;
  }
  return null;
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function schemaItemsSource(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (Array.isArray(value.items)) return value.items;
  if (value.items && typeof value.items === "object") {
    return Object.entries(value.items as Record<string, unknown>)
      .filter(([defindex]) => /^\d+$/.test(defindex))
      .map(([defindex, item]) => ({
        ...(item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {}),
        defindex,
      }));
  }
  if (Array.isArray(value.gameItems)) return value.gameItems;
  if (value.result && typeof value.result === "object") {
    const result = value.result as Record<string, unknown>;
    if (Array.isArray(result.items)) return result.items;
    if (result.items && typeof result.items === "object") {
      return Object.entries(result.items as Record<string, unknown>)
        .filter(([defindex]) => /^\d+$/.test(defindex))
        .map(([defindex, item]) => ({
          ...(item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : {}),
          defindex,
        }));
    }
    if (Array.isArray(result.gameItems)) return result.gameItems;
  }
  if (value.schema && typeof value.schema === "object") {
    const schema = value.schema as Record<string, unknown>;
    if (Array.isArray(schema.items)) return schema.items;
    if (schema.items && typeof schema.items === "object") {
      return Object.entries(schema.items as Record<string, unknown>)
        .filter(([defindex]) => /^\d+$/.test(defindex))
        .map(([defindex, item]) => ({
          ...(item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : {}),
          defindex,
        }));
    }
  }
  if (value.items_game && typeof value.items_game === "object") {
    const itemsGame = value.items_game as Record<string, unknown>;
    if (itemsGame.items && typeof itemsGame.items === "object") {
      return Object.entries(itemsGame.items as Record<string, unknown>)
        .filter(([defindex]) => /^\d+$/.test(defindex))
        .map(([defindex, item]) => ({
          ...(item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : {}),
          defindex,
        }));
    }
  }
  return null;
}

const QUALITY_BY_NAME: Record<string, number> = {
  normal: 0,
  genuine: 1,
  vintage: 3,
  unusual: 5,
  unique: 6,
  community: 7,
  valve: 8,
  self_made: 9,
  customized: 10,
  strange: 11,
  completed: 12,
  haunted: 13,
  collectors: 14,
  decorated_weapon: 15,
};

function qualityNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  if (Number.isSafeInteger(numeric)) return numeric;
  if (typeof value !== "string") return null;
  return (
    QUALITY_BY_NAME[
      value
        .trim()
        .toLowerCase()
        .replace(/[ '\-]+/g, "_")
    ] ?? null
  );
}

export function readSchemaItems(raw: unknown): Tf2SchemaItem[] {
  const source = schemaItemsSource(raw);
  if (!Array.isArray(source)) {
    throw new Error("Schema JSON must contain an items array");
  }

  return source.flatMap((value): Tf2SchemaItem[] => {
    if (!value || typeof value !== "object") return [];
    const item = value as RawSchemaItem;
    const defindex = Number(item.defindex);
    // Market name (identical to the inventory market_hash_name): item_name
    // plus the "The " prefix for proper_name. The `name` field is Valve's
    // INTERNAL name (defindex 5021 -> "Decoder Ring"), whereas inventory and
    // market operate on item_name ("Mann Co. Supply Crate Key").
    const itemName = firstText(item.item_name, item.itemName);
    const marketName = marketHashNameFromParts(
      itemName,
      item.proper_name ?? item.properName,
      defindex,
    );
    const name =
      Number.isSafeInteger(defindex) && SCHEMA_EVENT_KEY_OVERRIDES[defindex]
        ? SCHEMA_EVENT_KEY_OVERRIDES[defindex]
        : (marketName ??
          firstText(
            item.name,
            item.market_name,
            item.marketName,
            item.item_type_name,
            item.itemTypeName,
            item.item_class,
            item.itemClass,
          ) ??
          (Number.isSafeInteger(defindex) && defindex >= 0
            ? `TF2 item ${defindex}`
            : null));
    if (!Number.isSafeInteger(defindex) || defindex < 0 || !name) return [];

    const qualityValue = item.item_quality ?? item.itemQuality;
    const quality = qualityNumber(qualityValue);
    const appid = item.appid === undefined ? undefined : Number(item.appid);
    const contextid =
      item.contextid === undefined ? undefined : String(item.contextid);
    const itemRecord: Tf2SchemaItem = {
      defindex,
      name,
      itemName: firstText(item.item_name, item.itemName),
      marketHashName:
        Number.isSafeInteger(defindex) && SCHEMA_EVENT_KEY_OVERRIDES[defindex]
          ? SCHEMA_EVENT_KEY_OVERRIDES[defindex]
          : (firstText(
              item.market_hash_name,
              item.marketHashName,
              item.market_name,
              item.marketName,
            ) ??
            marketHashNameFromParts(
              firstText(item.item_name, item.itemName),
              item.proper_name ?? item.properName,
              defindex,
            ) ??
            null),
      itemClass: firstText(item.item_class, item.itemClass),
      itemTypeName: firstText(item.item_type_name, item.itemTypeName),
      itemSlot: firstText(item.item_slot, item.itemSlot),
      itemQuality: quality,
      craftClass: firstText(item.craft_class, item.craftClass),
      craftMaterialType: firstText(
        item.craft_material_type,
        item.craftMaterialType,
        item.crafting_material,
        item.craftingMaterial,
      ),
      iconUrl:
        resolveSchemaIconUrl(
          firstText(
            item.icon_url,
            item.iconUrl,
            item.icon_url_large,
            item.image_url,
          ),
        ) ?? null,
      capabilities: objectOrEmpty(item.capabilities),
      usedByClasses: Array.isArray(item.used_by_classes ?? item.usedByClasses)
        ? stringArray(item.used_by_classes ?? item.usedByClasses)
        : Object.keys(objectOrEmpty(item.used_by_classes ?? item.usedByClasses)),
      schemaData: value as Record<string, unknown>,
    };
    if (Number.isSafeInteger(appid) && (appid as number) > 0)
      itemRecord.appid = appid as number;
    if (contextid !== undefined) itemRecord.contextid = contextid;
    return [itemRecord];
  });
}

export function schemaSourceVersion(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const result =
    value.result && typeof value.result === "object"
      ? (value.result as Record<string, unknown>)
      : undefined;
  const version =
    value.version ??
    value.schema_version ??
    result?.version ??
    result?.schema_version;
  return typeof version === "string" || typeof version === "number"
    ? String(version)
    : undefined;
}
