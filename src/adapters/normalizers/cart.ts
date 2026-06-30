import { parseLkr } from '@/adapters/kapruka.adapter.js';
import type { NormalizedCartItem, NormalizedCartView } from './types.js';

/**
 * The raw kapruka_get_cart response shape (no formal TS interface exists in
 * kapruka-mcp's published types — this is the inline shape documented in
 * docs/tool-contracts.md's kapruka_get_cart section, also covering the
 * empty-cart variant's extra `message` field, which is not carried into
 * NormalizedCartView).
 */
export interface RawCartView {
  items: Array<{ productId: string; name: string; price: number; quantity: number; subtotal?: string }>;
  cartTotal: string;
  itemCount: number;
  message?: string;
}

/**
 * Normalizes a get_cart response. Cart logic is pure local logic that never
 * touches the live server (docs/tool-contracts.md: "N/A — local logic" on
 * every cart-related tool) — there is no fidelity gap to model here, every
 * field is confidence:"verified" unconditionally.
 */
export function normalizeCartView(raw: RawCartView): NormalizedCartView {
  const items: NormalizedCartItem[] = raw.items.map((item) => ({
    productId: item.productId,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    subtotal: item.price * item.quantity,
  }));

  return {
    items,
    total: parseLkr(raw.cartTotal),
    itemCount: raw.itemCount,
    isEmpty: raw.itemCount === 0,
  };
}
