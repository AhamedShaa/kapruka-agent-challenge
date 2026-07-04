import type { NormalizedOrder } from './types.js';

/** Fields extractable from the live server's real markdown response shape. */
export type OrderMarkdownFields = Pick<NormalizedOrder, 'id' | 'checkoutUrl' | 'total'>;

/**
 * Parses the live server's real markdown response for kapruka_create_order.
 * The vendor's parseOrderResult fails silently against the live server because:
 *   - ID regex looks for KAP-ORD-\d+ but live server emits ORD-YYYYMMDD-XXXX
 *   - URL regex requires "checkout" substring but the live .jsp URL has none
 * Returns null for unrecognized responses (error strings, empty input).
 */
export function normalizeOrderFromMarkdown(markdown: string): OrderMarkdownFields | null {
  if (!markdown || markdown.startsWith('Error')) return null;

  // Real order ID format: ORD-YYYYMMDD-XXXX (e.g. ORD-20260701-A3F2)
  const idMatch = markdown.match(/\bORD-\d{8}-[A-Z0-9]+\b/);

  // Checkout URL: any https link — live server uses a legacy .jsp route with no
  // "checkout" substring, so the vendor's regex misses it entirely.
  const urlMatch = markdown.match(/https?:\/\/[^\s)>\]]+/);

  if (!idMatch && !urlMatch) return null;

  // Total: first "LKR N,NNN" occurrence in the markdown
  const totalMatch = markdown.match(/LKR\s*([\d,]+)/);
  const total = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : null;

  return {
    id: idMatch ? idMatch[0] : null,
    checkoutUrl: urlMatch ? urlMatch[0] : null,
    total: total !== null && !isNaN(total) && total > 0 ? total : null,
  };
}
