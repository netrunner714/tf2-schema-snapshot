/**
 * Canonical Steam economy-image URL construction.
 *
 * Two servable shapes exist:
 *  - absolute `https://media.steampowered.com/...` URLs from
 *    IEconItems GetSchemaItems (`image_url`);
 *  - hashed economy tokens (a single opaque `[A-Za-z0-9_-]` segment).
 *
 * Filesystem-style `image_inventory` paths are NOT servable by the economy
 * CDN — it answers 404 for them — so multi-segment values are rejected
 * everywhere.
 */

/** Public Steam CDN host used for hashed economy image tokens. */
export const STEAM_ECONOMY_IMAGE_HOST =
  "https://community.cloudflare.steamstatic.com/economy/image";

/** Default rendered size suffix; every consumer asks for the same size. */
export const DEFAULT_ECONOMY_IMAGE_SIZE = "256fx256f";

export function steamEconomyIconUrl(
  iconToken: unknown,
  size: string = DEFAULT_ECONOMY_IMAGE_SIZE,
): string | undefined {
  if (typeof iconToken !== "string") return undefined;
  const path = iconToken.trim().replace(/^\/+|\/+$/g, "");
  if (!path) return undefined;
  if (path.includes("/") || path.includes("..")) return undefined;
  if (!/^[A-Za-z0-9_-]+$/.test(path)) return undefined;
  return `${STEAM_ECONOMY_IMAGE_HOST}/${path}/${size}`;
}

export function normalizeSteamIconUrl(
  raw: unknown,
  size: string = DEFAULT_ECONOMY_IMAGE_SIZE,
): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  if (/^https:\/\//i.test(value)) return value;
  if (/^http:\/\//i.test(value))
    return `https://${value.slice("http://".length)}`;
  return steamEconomyIconUrl(value, size);
}

export function resolveSchemaIconUrl(
  rawIconUrl: unknown,
  size: string = DEFAULT_ECONOMY_IMAGE_SIZE,
): string | undefined {
  return normalizeSteamIconUrl(rawIconUrl, size);
}
