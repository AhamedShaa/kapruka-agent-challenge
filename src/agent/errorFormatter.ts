import { KaprukaError } from '@/core/ports/commerce.port.js';
import { logger } from '@/lib/logger.js';

function toRawMessage(err: unknown): string {
  return err instanceof KaprukaError ? err.message : err instanceof Error ? err.message : String(err);
}

/**
 * Live server validation errors surface as raw Pydantic prose (see
 * docs/AGENT_BRIEFING.md, createOrder/checkDelivery date probes) — not a
 * stable, parseable shape. Detect the category by these markers rather than
 * regex-extracting specifics out of a format we don't control.
 */
const PYDANTIC_MARKERS = ['validation error for', 'Value error,', 'Field required'];

/** Confirmed live `Error (code): message` occurrences — see docs/AGENT_BRIEFING.md. */
const CODE_MESSAGES: Record<string, string> = {
  product_not_found: "That item isn't available anymore — let's find something else.",
};

/** Confirmed live shape with no code at all (docs/AGENT_BRIEFING.md, probe case 1). */
const CITY_FAILURE_MARKER = 'Delivery check failed for city';

const GENERIC_FALLBACK = "Couldn't complete that just now — let's try again in a moment.";
const DELIVERY_DETAILS_FALLBACK =
  'There was an issue with the delivery details — could you double check the date and try again?';
const CITY_FALLBACK =
  "I couldn't find that delivery city — could you double check the spelling or try a nearby city?";
const SEARCH_FILTERS_FALLBACK =
  'There was an issue with your search filters — could you double check them and try again?';

/**
 * Pydantic validation errors come from different tools (bad delivery dates,
 * bad search filter values) but all look identical from the marker check
 * above — the generic copy needs to say something the caller can actually
 * act on, per tool family. checkDelivery and createOrder share the existing
 * delivery-details copy (both confirmed to throw it for the same reason —
 * malformed dates); anything else falls back to that too, since it's the
 * only confirmed Pydantic-error case pre-dating searchProducts.
 */
const PYDANTIC_FALLBACK_BY_TOOL: Record<string, string> = {
  searchProducts: SEARCH_FILTERS_FALLBACK,
  checkDelivery: DELIVERY_DETAILS_FALLBACK,
  createOrder: DELIVERY_DETAILS_FALLBACK,
};

/**
 * Turns any tool failure into a friendly, complete sentence safe to show the
 * user (and feed back to the LLM as a tool result) — the raw error never
 * leaves this function. Logs the raw error server-side unconditionally.
 */
export function toUserSafeMessage(err: unknown, toolName: string): string {
  const raw = toRawMessage(err);
  logger.error({ tool: toolName, err: raw }, 'agent tool failed');

  if (PYDANTIC_MARKERS.some((marker) => raw.includes(marker))) {
    return PYDANTIC_FALLBACK_BY_TOOL[toolName] ?? DELIVERY_DETAILS_FALLBACK;
  }

  const codeMatch = raw.match(/Error \(([a-z_]+)\):/i);
  if (codeMatch && CODE_MESSAGES[codeMatch[1]]) {
    return CODE_MESSAGES[codeMatch[1]];
  }

  if (raw.includes(CITY_FAILURE_MARKER)) {
    return CITY_FALLBACK;
  }

  return GENERIC_FALLBACK;
}
