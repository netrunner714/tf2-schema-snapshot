/**
 * Entry point of the daily snapshot run (GitHub Actions / CLI).
 *
 * Fetches both Steam schema layers plus localized overviews, builds the
 * merged snapshot and writes JSON artifacts to dist/. Failures abort with
 * a non-zero exit code — a broken Steam response must NEVER produce a
 * partial artifact (the abort-on-partial-data discipline).
 *
 * Environment:
 *   STEAM_API_KEY   (required) Steam Web API key
 *   SNAPSHOT_LANGUAGES (optional, default "ru") comma-separated BCP-47 tags
 *   SNAPSHOT_OUT_DIR   (optional, default "dist") artifact directory
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readSchemaItems } from "./schema-items.js";
import { parseSchemaInput } from "./keyvalues.js";
import {
  fetchSchemaItemsRaw,
  resolveSchemaDownloadUrl,
  fetchItemsGameText,
  fetchSteamQualityNames,
  i18nDescriptorsFromRaw,
} from "./steam-fetch.js";
import { buildSnapshot, type Snapshot } from "./build-snapshot.js";

/** Pause between language runs to stay inside Steam's burst budget. */
const LANGUAGE_DELAY_MS = 10_000;

async function main(): Promise<void> {
  const apiKey = process.env.STEAM_API_KEY?.trim();
  if (!apiKey)
    throw new Error("STEAM_API_KEY is required to build a snapshot");

  const languages = (process.env.SNAPSHOT_LANGUAGES ?? "ru")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const outDir = process.env.SNAPSHOT_OUT_DIR ?? "dist";

  console.log("→ Resolving items_game.txt URL via GetSchemaURL…");
  const itemsGameUrl = await resolveSchemaDownloadUrl(apiKey);
  console.log(`  ${itemsGameUrl}`);

  console.log("→ Fetching items_game.txt (structural layer)…");
  const itemsGameText = await fetchItemsGameText(itemsGameUrl);
  const itemsGameRaw = parseSchemaInput(itemsGameText);
  const structuralItems = readSchemaItems(itemsGameRaw);
  if (structuralItems.length === 0) throw new Error("TF2_SCHEMA_EMPTY");
  console.log(`  ${structuralItems.length} structural items`);

  console.log("→ Fetching GetSchemaItems en_us (display layer)…");
  const displayRaw = await fetchSchemaItemsRaw(apiKey, "en_us");
  const displayItems = readSchemaItems(displayRaw);
  console.log(`  ${displayItems.length} display items`);

  const i18n: Record<string, ReturnType<typeof i18nDescriptorsFromRaw>> = {};
  const qualities: Record<
    string,
    Awaited<ReturnType<typeof fetchSteamQualityNames>>
  > = {};

  console.log("→ Fetching localized quality names (en_us + languages)…");
  const enQualities = await fetchSteamQualityNames(apiKey, "en_us");
  qualities["en"] = enQualities;

  for (const language of languages) {
    if (language.toLowerCase() === "en" || language.toLowerCase() === "en_us")
      continue;
    // Inter-language pause: a full page-through of one language (12 requests)
    // sits at the edge of Steam's burst budget; backing off between languages
    // keeps the run inside the rate limit.
    await new Promise((resolve) => setTimeout(resolve, LANGUAGE_DELAY_MS));
    console.log(`→ Fetching GetSchemaItems ${language} (i18n layer)…`);
    const raw = await fetchSchemaItemsRaw(apiKey, language);
    i18n[language] = i18nDescriptorsFromRaw(raw);
    qualities[language] = await fetchSteamQualityNames(apiKey, language);
    console.log(
      `  ${i18n[language]?.length ?? 0} localized items, ${qualities[language]?.length ?? 0} quality names`,
    );
  }

  console.log("→ Building merged snapshot…");
  const snapshot = buildSnapshot({
    itemsGameUrl,
    structuralItems,
    displayItems,
    displayRaw,
    i18n,
    qualities,
  });

  await mkdir(outDir, { recursive: true });
  await writeArtifacts(snapshot, outDir);

  console.log(
    `✅ Snapshot built: ${snapshot.meta.itemCount} items, ` +
      `content hash ${snapshot.meta.contentHash}, ` +
      `i18n: [${snapshot.meta.languages.join(", ")}]`,
  );
}

async function writeArtifacts(
  snapshot: Snapshot,
  outDir: string,
): Promise<void> {
  const meta = snapshot.meta;
  const writeJson = async (name: string, value: unknown) => {
    const file = path.join(outDir, name);
    await writeFile(file, JSON.stringify(value), "utf8");
    console.log(`  wrote ${file}`);
  };

  await writeJson("meta.json", { ...meta, formatVersion: 1 });
  await writeJson("items.json", snapshot.items);
  for (const [language, entries] of Object.entries(snapshot.i18n)) {
    await mkdir(path.join(outDir, "i18n", language), { recursive: true });
    await writeJson(`i18n/${language}/items.json`, entries);
  }
  for (const [language, entries] of Object.entries(snapshot.qualities)) {
    await mkdir(path.join(outDir, "i18n", language), { recursive: true });
    await writeJson(`i18n/${language}/qualities.json`, entries);
  }
}

main().catch((error) => {
  console.error(
    "❌ Snapshot build failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
