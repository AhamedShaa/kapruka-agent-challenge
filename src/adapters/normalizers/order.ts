/**
 * NormalizedOrder is the LOWEST-CONFIDENCE TYPE in this design (Decisions
 * Log #7, LOCKED). create_order and track_order were never tested against a
 * real success response — every rule below is inferred from reading
 * kapruka-mcp's parseOrderResult/parseTrackOrder source, not confirmed
 * empirically. If checkoutUrl extraction (or any other field here) breaks
 * during a pre-demo integration test against a real order, that is the
 * trigger to revisit this file — not before. See docs/normalizer-design.md
 * Section 1/3 ("NormalizedOrder") for the full rationale.
 */
import type { Order } from 'kapruka-mcp';
import type { NormalizedOrder } from './types.js';

/** Decision #1 (LOCKED): a parsed 0 is indistinguishable from a regex-miss fallback — always null. */
function nonZero(value: number): number | null {
  return value === 0 ? null : value;
}

export function normalizeCreateOrderResult(raw: Order): NormalizedOrder {
  const id = raw.id ? raw.id : null;
  const total = nonZero(raw.total);
  const checkoutUrl = raw.checkout_url ? raw.checkout_url : null;

  return {
    id,
    // items: ALWAYS null — parseOrderResult hardcodes [] unconditionally, regardless of real response content.
    items: null,
    total,
    currency: 'LKR',
    checkoutUrl,
    // status: ALWAYS null for create_order — the parser defaults it to "pending" unconditionally, never really extracted.
    status: null,
    // createdAt/expiresAt: ALWAYS null — both fabricated client-side via Date.now() at parse time, never read from the server.
    createdAt: null,
    expiresAt: null,
  };
}

export function normalizeTrackOrderResult(raw: Order): NormalizedOrder {
  const id = raw.id ? raw.id : null;
  const status = raw.status ? raw.status : null;

  return {
    id,
    // items: ALWAYS null, same reasoning as create_order.
    items: null,
    // total: ALWAYS null for track_order — hardcoded 0, no extraction attempted at all (unlike create_order).
    total: null,
    currency: 'LKR',
    // checkoutUrl: ALWAYS null for track_order — hardcoded "".
    checkoutUrl: null,
    status,
    // createdAt/expiresAt: ALWAYS null, same reasoning as create_order.
    createdAt: null,
    expiresAt: null,
  };
}
