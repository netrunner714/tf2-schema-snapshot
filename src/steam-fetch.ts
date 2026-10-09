/**
 * Steam Web API fetch layer for the snapshot builder:
 * pagination discipline, cursor validation, abort-on-partial-data rules.
 */

import { fetchSteamApiWithRetry } from "./steam-http.js";
import {
  type Tf2SchemaItem,
  marketHashNameFromSchemaItem,
} from "./schema-items.js";
import { normalizeSteamIconUrl } from "./icon-urls.js";

const SCHEMA_ITEMS_ENDPOINT =
  "https://api.steampowered.com/IEconItems_440/GetSchemaItems/v0001/";
const SCHEMA_URL_ENDPOINT =
  "https://api.steampowered.com/IEconItems_440/GetSchemaURL/v0001/";
const SCHEMA_OVERVIEW_ENDPOINT =
  "https://api.steampowered.com/IEconItems_440/GetSchemaOverview/v0001/";

/** Hard cap: TF2 has ~11.5k items at 1000/page; anything above is a broken cursor. */
const MAX_PAGES = 50;
const PAGE_DELAY_MS = 500;

export type SchemaIconFetchOptions = {
  fetchImpl?: typeof fetch;
  maxPages?: number;
  pageDelayMs?: number;
};

type SchemaItemsPage = {
  result?: {
    status?: number;
    next?: number;
    items?: Array<{
      defindex?: number | string;
      image_url?: string;
      icon_url?: string;
      item_name?: string;
      proper_name?: boolean | string | number;
      name?: string;
      craft_class?: string;
      item_type_name?: string;
    }>;
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pages through GetSchemaItems/v0001 for a GIVEN language and returns
 * the full raw item set (all pages merged). The terminal marker is the
 * ABSENCE of a `next` cursor while status === 1 — Steam's final page keeps
 * status=1 and omits `next` (verified against the live RU schema).
 *
 * Abort discipline: a non-200 page or malformed body aborts the whole run —
 * a partial item set would be indistinguishable from "Steam deleted items".
 */
export async function fetchSchemaItemsRaw(
  apiKey: string,
  language: string,
  options: SchemaIconFetchOptions = {},
): Promise<Record<string, unknown>> {
  const fetchImpl = options.fetchImpl ?? fetchSteamApiWithRetry;
  const maxPages = options.maxPages ?? MAX_PAGES;
  const pageDelayMs = options.pageDelayMs ?? PAGE_DELAY_MS;
  const key = apiKey.trim();
  if (!key) throw new Error("STEAM_API_KEY is required to fetch schema items");
  const lang = language.trim();
  if (!lang) throw new Error("SCHEMA_ITEMS_LANGUAGE_REQUIRED");

  const allItems: unknown[] = [];
  let start: number | undefined;
  let complete = false;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(SCHEMA_ITEMS_ENDPOINT);
    url.searchParams.set("key", key);
    url.searchParams.set("language", lang);
    if (start !== undefined) url.searchParams.set("start", String(start));

    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`SCHEMA_ITEMS_HTTP_${response.status}`);
    const body = (await response.json()) as SchemaItemsPage;
    const items = body?.result?.items;
    if (!Array.isArray(items))
      throw new Error("SCHEMA_ITEMS_MALFORMED_RESPONSE");
    allItems.push(...items);

    const next = body.result?.next;
    const status = body.result?.status;
    if (status !== 1 || next === undefined || next === null) {
      complete = true;
      break;
    }
    if (
      typeof next !== "number" ||
      !Number.isSafeInteger(next) ||
      next <= (start ?? 0)
    ) {
      throw new Error("SCHEMA_ITEMS_INVALID_NEXT_CURSOR");
    }
    if (page === maxPages - 1) break;
    start = next;
    if (pageDelayMs > 0) await sleep(pageDelayMs);
  }

  if (!complete) throw new Error("SCHEMA_ITEMS_PAGE_LIMIT_REACHED");
  if (allItems.length === 0) throw new Error("SCHEMA_ITEMS_NO_ITEMS");
  return { result: { items: allItems } };
}

/**
 * Resolves the official items_game.txt URL through GetSchemaURL.
 * Steam deprecated the old GetSchema endpoint — items_game.txt carries the
 * STRUCTURE of the schema (prefab, attributes, craft) which GetSchemaItems
 * lacks; both layers are merged per defindex by the snapshot builder.
 */
export async function resolveSchemaDownloadUrl(
  apiKey: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetchSteamApiWithRetry;
  const key = apiKey.trim();
  if (!key)
    throw new Error("STEAM_API_KEY is required to resolve the schema URL");

  const url = new URL(SCHEMA_URL_ENDPOINT);
  url.searchParams.set("key", key);
  const response = await fetchImpl(url);
  if (!response.ok)
    throw new Error(`SCHEMA_URL_RESOLVE_FAILED: HTTP ${response.status}`);
  const body = (await response.json()) as {
    result?: { items_game_url?: string };
  };
  const itemsGameUrl = body?.result?.items_game_url;
  if (!itemsGameUrl)
    throw new Error("SCHEMA_URL_RESOLVE_FAILED: no items_game_url in response");
  return itemsGameUrl;
}

export async function fetchItemsGameText(
  url: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetchSteamApiWithRetry;
  const response = await fetchImpl(url);
  if (!response.ok)
    throw new Error(`TF2_SCHEMA_HTTP_${response.status}`);
  return response.text();
}

// ── Quality names (GetSchemaOverview, localized) ───────────────────────────

export type SteamQualityName = { quality: number; name: string };

function schemaOverviewResult(raw: unknown): Record<string, unknown> {
  const result = (raw as { result?: Record<string, unknown> } | null)?.result;
  if (!result || typeof result !== "object") {
    throw new Error("SCHEMA_OVERVIEW_MALFORMED_RESPONSE");
  }
  return result;
}

/** Extract quality labels from Steam's localized schema overview. */
export function parseSteamQualityNames(raw: unknown): SteamQualityName[] {
  const result = schemaOverviewResult(raw);
  const qualities = result.qualities;
  const qualityNames = result.qualityNames;
  if (!qualities || typeof qualities !== "object" || Array.isArray(qualities)) {
    throw new Error("SCHEMA_OVERVIEW_QUALITIES_MISSING");
  }
  if (
    !qualityNames ||
    typeof qualityNames !== "object" ||
    Array.isArray(qualityNames)
  ) {
    throw new Error("SCHEMA_OVERVIEW_QUALITY_NAMES_MISSING");
  }

  const labels = qualityNames as Record<string, unknown>;
  const names: SteamQualityName[] = [];
  for (const [token, rawQuality] of Object.entries(qualities)) {
    const quality = Number(rawQuality);
    const name = labels[token];
    if (!Number.isSafeInteger(quality) || quality < 0) continue;
    if (typeof name !== "string" || !name.trim()) continue;
    names.push({ quality, name: name.trim() });
  }
  if (!names.length) throw new Error("SCHEMA_OVERVIEW_NO_QUALITY_NAMES");
  return names;
}

export async function fetchSteamQualityNames(
  apiKey: string,
  language: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<SteamQualityName[]> {
  const key = apiKey.trim();
  if (!key)
    throw new Error("STEAM_API_KEY is required to fetch schema overview");
  const lang = language.trim();
  if (!lang) throw new Error("SCHEMA_OVERVIEW_LANGUAGE_REQUIRED");
  const url = new URL(SCHEMA_OVERVIEW_ENDPOINT);
  url.searchParams.set("key", key);
  url.searchParams.set("language", lang);
  const fetchImpl = options.fetchImpl ?? fetchSteamApiWithRetry;
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`SCHEMA_OVERVIEW_HTTP_${response.status}`);
  return parseSteamQualityNames(await response.json());
}

// ── Descriptor projections (used by the snapshot builder) ──────────────────

export type SchemaItemDescriptor = {
  defindex: number;
  iconUrl?: string;
  marketHashName?: string;
  craftClass?: string;
};

export function descriptorsFromSchemaItems(
  items: Tf2SchemaItem[],
): SchemaItemDescriptor[] {
  return items
    .map((item) => {
      const descriptor: SchemaItemDescriptor = { defindex: item.defindex };
      if (item.iconUrl) descriptor.iconUrl = item.iconUrl;
      if (item.marketHashName) descriptor.marketHashName = item.marketHashName;
      if (item.craftClass) descriptor.craftClass = item.craftClass;
      return descriptor;
    })
    .filter(
      (descriptor) =>
        descriptor.iconUrl ||
        descriptor.marketHashName ||
        descriptor.craftClass,
    );
}

export type I18nSchemaItemDescriptor = {
  defindex: number;
  name: string;
  itemName?: string;
  marketHashName?: string;
  itemTypeName?: string;
  /** Raw localized GetSchemaItems row payload (descriptions etc.). */
  payload: Record<string, unknown>;
};

/**
 * Extracts an i18n descriptor from a raw GetSchemaItems row (same shape as
 * the canonical fetcher, but names only — no icons/craft_class).
 */
export function i18nDescriptorFromSchemaItem(item: {
  defindex?: number | string;
  item_name?: unknown;
  proper_name?: unknown;
  name?: unknown;
  item_type_name?: unknown;
}): I18nSchemaItemDescriptor | undefined {
  const defindex = Number(item?.defindex);
  if (!Number.isSafeInteger(defindex) || defindex < 0) return undefined;
  const marketHashName = marketHashNameFromSchemaItem(item);
  const name =
    typeof item.item_name === "string" && item.item_name.trim()
      ? item.item_name.trim()
      : typeof item.name === "string" && item.name.trim()
        ? item.name.trim()
        : marketHashName;
  if (!name) return undefined;
  const descriptor: I18nSchemaItemDescriptor = {
    defindex,
    name,
    payload: item as Record<string, unknown>,
  };
  if (typeof item.item_name === "string") descriptor.itemName = item.item_name;
  if (marketHashName) descriptor.marketHashName = marketHashName;
  if (typeof item.item_type_name === "string")
    descriptor.itemTypeName = item.item_type_name;
  return descriptor;
}

export function i18nDescriptorsFromRaw(
  raw: Record<string, unknown>,
): I18nSchemaItemDescriptor[] {
  const items = (raw as { result?: { items?: unknown[] } })?.result?.items;
  if (!Array.isArray(items))
    throw new Error("SCHEMA_ITEMS_MALFORMED_RESPONSE");
  const descriptors: I18nSchemaItemDescriptor[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const descriptor = i18nDescriptorFromSchemaItem(
      item as Parameters<typeof i18nDescriptorFromSchemaItem>[0],
    );
    if (descriptor) descriptors.push(descriptor);
  }
  return descriptors;
}

export { normalizeSteamIconUrl };
