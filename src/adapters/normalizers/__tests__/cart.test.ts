import { describe, expect, it } from 'vitest';
import { normalizeCartView, type RawCartView } from '../cart.js';

// No fixture file exists for get_cart — cart logic is pure local logic and
// was never run live (docs/tool-contracts.md: "N/A — local logic"). These
// inputs are constructed to match the documented response shape exactly.

const populatedCart: RawCartView = {
  items: [
    { productId: 'FLOWERS00T1875', name: 'Rose Elegance Display Vase With 30 Red Roses', price: 18000, quantity: 1, subtotal: 'LKR 18,000' },
    { productId: 'CAKE00KA001990', name: 'Golden Celebration Chocolate Cake Indulgence', price: 6700, quantity: 2, subtotal: 'LKR 13,400' },
  ],
  cartTotal: 'LKR 31,400',
  itemCount: 2,
};

const emptyCart: RawCartView = {
  items: [],
  cartTotal: 'LKR 0',
  itemCount: 0,
  message: 'Your cart is empty. Use kapruka_search_products to find products.',
};

describe('normalizeCartView', () => {
  it('preserves productId, name, price, quantity as-is', () => {
    const result = normalizeCartView(populatedCart);
    expect(result.items[0]).toMatchObject({ productId: 'FLOWERS00T1875', name: 'Rose Elegance Display Vase With 30 Red Roses', price: 18000, quantity: 1 });
  });

  it('computes subtotal as price * quantity, not parsed from the raw subtotal string', () => {
    const result = normalizeCartView(populatedCart);
    expect(result.items[0].subtotal).toBe(18000);
    expect(result.items[1].subtotal).toBe(13400);
  });

  it('parses cartTotal from formatted string to number via parseLkr', () => {
    const result = normalizeCartView(populatedCart);
    expect(result.total).toBe(31400);
  });

  it('preserves itemCount as-is', () => {
    const result = normalizeCartView(populatedCart);
    expect(result.itemCount).toBe(2);
  });

  it('derives isEmpty as false when itemCount > 0', () => {
    const result = normalizeCartView(populatedCart);
    expect(result.isEmpty).toBe(false);
  });

  it('handles the empty-cart variant: empty items, total 0, isEmpty true', () => {
    const result = normalizeCartView(emptyCart);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.itemCount).toBe(0);
    expect(result.isEmpty).toBe(true);
  });

});
