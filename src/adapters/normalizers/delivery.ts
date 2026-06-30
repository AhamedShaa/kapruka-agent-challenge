import type { DeliveryCity } from 'kapruka-mcp';
import type { NormalizedDeliveryCheck, NormalizedDeliveryCity, NormalizedDeliveryCityList } from './types.js';

/** The parsed DeliveryCheck shape from kapruka-mcp (`{ available, fee, estimated_days, city }`). */
interface RawDeliveryCheck {
  available: boolean;
  fee: number;
  estimated_days: number;
  city: string;
}

/**
 * Normalizes a single delivery city. No collision detection here — that only
 * happens at batch time, in normalizeDeliveryCityList, since a lone city has
 * no siblings to collide with. `aliases` is always null here too, since
 * extracting it requires the full raw list response text.
 */
export function normalizeDeliveryCity(raw: DeliveryCity): NormalizedDeliveryCity {
  const id = raw.id ? raw.id : null;

  return {
    id,
    name: raw.name,
    // delivery_fee/estimated_days are always null — 100% fabricated by the SDK parser (hardcoded 0/1), zero basis in the raw response.
    delivery_fee: null,
    estimated_days: null,
    aliases: null,
  };
}

/** `- **CityName**  _aliases: x y z_` — returns the alias list for one city, or null if that city has no aliases segment. */
function extractAliasesForCity(rawText: string, cityName: string): string[] | null {
  const escapedName = cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lineMatch = rawText.match(new RegExp(`-\\s+\\*\\*${escapedName}\\*\\*(?:\\s+_aliases:\\s*([^_]+)_)?`));
  if (!lineMatch || !lineMatch[1]) return null;
  return lineMatch[1].trim().split(/\s+/);
}

/** "## Kapruka delivery cities (25 of 332 total)" → 332. */
function extractTotalAvailable(rawText: string): number | null {
  const match = rawText.match(/\((\d+)\s+of\s+(\d+)\s+total\)/);
  return match ? Number(match[2]) : null;
}

/**
 * Normalizes a full delivery-city list. `rawText` (the full list_delivery_cities
 * markdown) is optional — without it, `aliases` and `totalAvailable` stay null,
 * but id-collision detection still runs (it only needs the cities array itself).
 */
export function normalizeDeliveryCityList(
  rawCities: DeliveryCity[],
  rawText?: string,
): NormalizedDeliveryCityList {
  const normalized = rawCities.map((raw) => {
    const city = normalizeDeliveryCity(raw);
    if (!rawText) return city;

    const aliases = extractAliasesForCity(rawText, raw.name);
    return aliases ? { ...city, aliases } : city;
  });

  // Decision #5 (LOCKED): id is derived as "first word of name, uppercased" —
  // not a real server code, so it can collide across different cities (e.g.
  // "Mount Lavinia" and "Mount Pleasant" would both derive "MOUNT"). Detect
  // every id that occurs more than once in this batch and null it everywhere
  // it occurs, leaving `name` as the only reliable key for those entries.
  const idCounts = new Map<string, number>();
  for (const city of normalized) {
    if (city.id) idCounts.set(city.id, (idCounts.get(city.id) ?? 0) + 1);
  }

  const cities = normalized.map((city) => {
    if (!city.id || (idCounts.get(city.id) ?? 0) <= 1) return city;
    return { ...city, id: null };
  });

  const totalAvailable = rawText ? extractTotalAvailable(rawText) : null;

  return {
    cities,
    totalAvailable,
    returnedCount: cities.length,
  };
}

/** "Delivery to Agalawatta on 2026-06-24" → "Agalawatta". */
function extractCityFromText(rawText: string): string | null {
  const match = rawText.match(/Delivery to\s+(.+?)(?:\s+on|\n)/);
  return match ? match[1].trim() : null;
}

/** "Next available: **2026-06-25**" → "2026-06-25". */
function extractNextAvailableDate(rawText: string): string | null {
  const match = rawText.match(/Next available:\s*\*\*([^*]+)\*\*/);
  return match ? match[1].trim() : null;
}

function extractFee(rawText: string): number | null {
  const match = rawText.match(/LKR\s*([\d,]+)/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  return value === 0 ? null : value; // Decision #1 (LOCKED): parsed 0 is treated as null everywhere
}

/**
 * Normalizes a check_delivery response. This is the type the audit called
 * "the most significant gap found in the whole audit" — the old parsed
 * `available: boolean` collapses "not available today, but available
 * tomorrow" into a flat false. The tri-state `availability` classification
 * (Decision #6, LOCKED) is derived from `rawText` directly, not from the
 * old parsed object's lossy `available` field.
 */
export function normalizeDeliveryCheck(raw: RawDeliveryCheck, rawText?: string): NormalizedDeliveryCheck {
  let city: string | null;
  let availability: NormalizedDeliveryCheck['availability'];
  let nextAvailableDate: string | null;
  let fee: number | null;

  if (!rawText) {
    // Degraded fallback with no raw text to classify against: we can tell
    // "available" apart from "not sure what's going on", but not
    // "available_later" apart from "unavailable" — that distinction only
    // exists in the raw text. Treat any non-available case as 'unknown'
    // rather than guessing which of the other two states applies.
    city = raw.city || null;
    availability = raw.available ? 'available' : 'unknown';
    nextAvailableDate = null;
    fee = raw.fee === 0 ? null : raw.fee;
  } else {
    city = extractCityFromText(rawText);
    const notAvailableText = /not available/i.test(rawText);
    nextAvailableDate = notAvailableText ? extractNextAvailableDate(rawText) : null;
    fee = extractFee(rawText);

    if (!city) {
      // The text didn't match the expected "Delivery to X on DATE" header at all.
      availability = 'unknown';
    } else if (!notAvailableText) {
      availability = 'available';
    } else if (nextAvailableDate) {
      availability = 'available_later';
    } else {
      availability = 'unavailable';
    }
  }

  return { city, availability, nextAvailableDate, fee };
}
