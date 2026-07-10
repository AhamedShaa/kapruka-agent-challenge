import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import type { CommercePort, NormalizedProduct, SearchOutcome } from '@/core/ports/commerce.port.js';
import { CustomerMemoryStore } from '@/lib/customerMemory.js';
import { RenderEventEmitter } from '../events.js';
import { createTools } from '../tools.js';
import type { RenderEvent } from '../state.js';

function notImplemented(method: string): () => never {
  return () => {
    throw new Error(`stub: ${method} should not be called in this test`);
  };
}

function makeProduct(id: string, name: string, price: number): NormalizedProduct {
  return {
    id,
    name,
    price,
    currency: 'LKR',
    image_url: null,
    product_url: null,
    product_page_url: null,
    category: null,
    description: null,
    visual_description: null,
    vendor: null,
    weight: null,
    in_stock: 'in_stock',
    international_shipping: null,
  };
}

/** 8 products — enough to prove the narration isn't clipped to the old top-3 ceiling. */
const EIGHT_PRODUCTS = Array.from({ length: 8 }, (_, i) =>
  makeProduct(`PROD${i + 1}`, `Product ${i + 1}`, (i + 1) * 1000),
);

function stubAdapter(products: NormalizedProduct[]): CommercePort {
  const result: SearchOutcome = {
    products,
    total: products.length,
    query: 'test',
    cursor: null,
    matchOutcome: products.length > 0 ? 'ok' : 'no-match',
  };

  return {
    search: async () => result,
    getProduct: async (productId: string) => {
      const found = products.find((p) => p.id === productId);
      if (!found) throw new Error(`stub getProduct: unknown id ${productId}`);
      return found;
    },
    getAlternatives: notImplemented('getAlternatives'),
    getRecommendations: notImplemented('getRecommendations'),
    listCategories: notImplemented('listCategories'),
    listDeliveryCities: notImplemented('listDeliveryCities'),
    checkDelivery: notImplemented('checkDelivery'),
    validateShipping: notImplemented('validateShipping'),
    addToCart: notImplemented('addToCart'),
    getCart: notImplemented('getCart'),
    clearCart: notImplemented('clearCart'),
    removeFromCart: notImplemented('removeFromCart'),
    createOrder: notImplemented('createOrder'),
    trackOrder: notImplemented('trackOrder'),
    convertCurrency: notImplemented('convertCurrency'),
  };
}

async function setup(products: NormalizedProduct[]) {
  const adapter = stubAdapter(products);
  const memoryStore = await CustomerMemoryStore.create(':memory:');
  const emitter = new RenderEventEmitter();
  const renderEvents: RenderEvent[] = [];
  emitter.onRender((ev) => renderEvents.push(ev));
  const tools = createTools(adapter, emitter, memoryStore, 'test-browser');
  const searchProducts = tools.find((t) => t.name === 'searchProducts');
  if (!searchProducts) throw new Error('searchProducts tool not found');
  return { searchProducts, renderEvents };
}

describe('searchProducts narration', () => {
  it('names every product in the narration, not just the first 3', async () => {
    const { searchProducts, renderEvents } = await setup(EIGHT_PRODUCTS);
    const narration = (await searchProducts.invoke({ q: 'test' })) as string;

    for (const p of EIGHT_PRODUCTS) {
      expect(narration).toContain(p.name as string);
      expect(narration).toContain(`LKR ${p.price}`);
    }

    // Regression guard: the carousel's product count must match what the
    // narration claims — both come from the same readyProducts array.
    const productList = renderEvents.find((e) => e.type === 'PRODUCT_LIST');
    expect(productList?.type === 'PRODUCT_LIST' && productList.products).toHaveLength(8);
    expect(narration).toContain('Found 8 results');
  });

  it('still narrates correctly for a 2-product result (below the old ceiling)', async () => {
    const twoProducts = EIGHT_PRODUCTS.slice(0, 2);
    const { searchProducts } = await setup(twoProducts);
    const narration = (await searchProducts.invoke({ q: 'test' })) as string;

    expect(narration).toContain('Product 1');
    expect(narration).toContain('Product 2');
    expect(narration).toContain('Found 2 results');
  });
});

describe('searchProducts sort enum', () => {
  it('accepts every value confirmed live (scripts/probe-sort-values.ts): bestseller, newest, price_asc, price_desc, relevance', async () => {
    const { searchProducts } = await setup(EIGHT_PRODUCTS);
    for (const sort of ['bestseller', 'newest', 'price_asc', 'price_desc', 'relevance']) {
      const result = (searchProducts.schema as z.ZodTypeAny).safeParse({ q: 'test', sort });
      expect(result.success, `expected sort="${sort}" to be accepted`).toBe(true);
    }
  });

  it('rejects "name" — confirmed live to not be a real accepted value, despite the old assumption', async () => {
    const { searchProducts } = await setup(EIGHT_PRODUCTS);
    const result = (searchProducts.schema as z.ZodTypeAny).safeParse({ q: 'test', sort: 'name' });
    expect(result.success).toBe(false);
  });

  it('rejects other plausible-sounding guesses confirmed invalid live (popularity)', async () => {
    const { searchProducts } = await setup(EIGHT_PRODUCTS);
    const result = (searchProducts.schema as z.ZodTypeAny).safeParse({ q: 'test', sort: 'popularity' });
    expect(result.success).toBe(false);
  });
});
