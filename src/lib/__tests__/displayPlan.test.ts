import { describe, expect, it } from 'vitest';
import { buildDisplayPlan } from '../displayPlan.js';
import type { RenderEvent } from '@/agent/state.js';
import type { UIProduct } from '@/agent/state.js';

function makeUIProduct(id: string, name: string): UIProduct {
  return {
    id,
    name,
    price: 1000,
    image_url: '',
    category: '',
    description: '',
    visual_description: '',
    in_stock: true,
  };
}

function productList(query: string, names: string[]): Extract<RenderEvent, { type: 'PRODUCT_LIST' }> {
  return {
    type: 'PRODUCT_LIST',
    query,
    products: names.map((n, i) => makeUIProduct(`${query}-${i}`, n)),
  };
}

// Real captured trace: LangSmith run run-019f28c5-c07d-7227-a618-560d1bfe816b,
// input "show flowers and chocolates". Content and product data below are
// copied verbatim from that run's final AIMessage / tool ToolMessages —
// not synthetic.
const REAL_FLOWERS_AND_CHOCOLATES_CONTENT = `Here are some lovely options for flowers and chocolates available on Kapruka:

### Flowers
1. **Purple Passion Flower Ribbon Cake** — LKR 7640
2. **Kit Kat Silk Roses Bouquet** — LKR 5900
3. **Mosaic Flower Sculpture Ribbon Cake** — LKR 6500
4. **5 Red Roses Bouquet - Elegant Luxury Flower Gift For Her** — LKR 6880
5. **50 Red Roses Heart-shaped Bouquet - Romantic Luxury Flower Bouquet** — LKR 21120
6. **Love In Bloom Flower And Cake Combo** — LKR 7360
7. **Crimson Desire Flower Bouquet With 6 Pink Roses And 9 Red Roses** — LKR 8840

### Chocolates
1. **All Nuts Mix-12 Piece (java)** — LKR 3600
2. **Java Pistachio Kunafa Dubai Style Milk Chocolate 40g** — LKR 1070
3. **Java I Love Dad 10 Piece Chocolate Box** — LKR 3070
4. **Java I Love Thaththa 8 Pieces Slab Box** — LKR 4640
5. **Cadbury Milk Chocolate Chunks 135g N#226; 30 Minis** — LKR 2200
6. **Love Harmony Kitkat Chocolate Bouquet** — LKR 6000
7. **Chocolate Mixology Bouquet** — LKR 7400
8. **Kinder Girl Chocolate Bouquet** — LKR 5800

Let me know if any of these catch your eye, or if you'd like to check delivery options for a specific item!`;

describe('buildDisplayPlan — happy path (real "flowers and chocolates" trace)', () => {
  const flowers = productList('flowers', [
    'Purple Passion Flower Ribbon Cake',
    'Kit Kat Silk Roses Bouquet',
    'Mosaic Flower Sculpture Ribbon Cake',
    '5 Red Roses Bouquet - Elegant Luxury Flower Gift For Her',
    '50 Red Roses Heart-shaped Bouquet - Romantic Luxury Flower Bouquet',
    'Love In Bloom Flower And Cake Combo',
    'Crimson Desire Flower Bouquet With 6 Pink Roses And 9 Red Roses',
  ]);
  const chocolates = productList('chocolates', [
    'All Nuts Mix-12 Piece (java)',
    'Java Pistachio Kunafa Dubai Style Milk Chocolate 40g',
    'Java I Love Dad 10 Piece Chocolate Box',
    'Java I Love Thaththa 8 Pieces Slab Box',
    'Cadbury Milk Chocolate Chunks 135g N#226; 30 Minis',
    'Love Harmony Kitkat Chocolate Bouquet',
    'Chocolate Mixology Bouquet',
    'Kinder Girl Chocolate Bouquet',
  ]);

  it('splits into intro, [flowers section + event], [chocolates section + event]', () => {
    const plan = buildDisplayPlan(REAL_FLOWERS_AND_CHOCOLATES_CONTENT, [flowers, chocolates]);

    expect(plan).not.toBeNull();
    const segments = plan!;

    expect(segments[0]).toEqual({
      kind: 'text',
      content: 'Here are some lovely options for flowers and chocolates available on Kapruka:',
    });

    expect(segments[1].kind).toBe('text');
    expect((segments[1] as { kind: 'text'; content: string }).content).toContain('### Flowers');
    expect((segments[1] as { kind: 'text'; content: string }).content).toContain('Purple Passion Flower Ribbon Cake');

    expect(segments[2]).toEqual({ kind: 'render', event: flowers });

    expect(segments[3].kind).toBe('text');
    expect((segments[3] as { kind: 'text'; content: string }).content).toContain('### Chocolates');
    expect((segments[3] as { kind: 'text'; content: string }).content).toContain('All Nuts Mix-12 Piece (java)');
    // Known scope limitation, documented in displayPlan.ts: the trailing
    // wrap-up sentence has no header of its own, so it's absorbed into the
    // last section's text rather than split into a separate closing segment.
    expect((segments[3] as { kind: 'text'; content: string }).content).toContain('Let me know if any of these catch your eye');

    expect(segments[4]).toEqual({ kind: 'render', event: chocolates });
    expect(segments).toHaveLength(5);
  });

  it('passes through non-PRODUCT_LIST events at the end, in original order', () => {
    const cartEvent: RenderEvent = { type: 'CART', items: [], total: 0, itemCount: 0 };
    const plan = buildDisplayPlan(REAL_FLOWERS_AND_CHOCOLATES_CONTENT, [flowers, cartEvent, chocolates]);

    expect(plan).not.toBeNull();
    const last = plan![plan!.length - 1];
    expect(last).toEqual({ kind: 'render', event: cartEvent });
  });
});

describe('buildDisplayPlan — fallback safety net', () => {
  it('returns null for a single-topic query (only 1 PRODUCT_LIST event — nothing to split)', () => {
    const single = productList('roses', ['Red Rose Bouquet', 'White Rose Bouquet']);
    const content = 'Here are some lovely roses for you:\n\n**Roses**\nFresh-cut, same-day delivery available.';

    const plan = buildDisplayPlan(content, [single]);
    expect(plan).toBeNull();
  });

  it('returns null when header count does not match render-event count', () => {
    const flowers = productList('flowers', ['Rose Bouquet']);
    const chocolates = productList('chocolates', ['Belgian Truffles']);
    // Only one header present for two product lists.
    const content = '**Flowers**\nRoses and lilies.\n\nAnd here are some chocolates too, no header for this bit.';

    const plan = buildDisplayPlan(content, [flowers, chocolates]);
    expect(plan).toBeNull();
  });

  it('returns null for an oddly-phrased multi-topic reply where headers exist but do not align with the queries', () => {
    const flowers = productList('flowers', ['Rose Bouquet']);
    const chocolates = productList('chocolates', ['Belgian Truffles']);
    // Two headers, but their text has nothing to do with the actual queries —
    // e.g. the model used vague section titles instead of naming the topic.
    const content = '**Option One**\nSomething nice.\n\n**Option Two**\nSomething else nice.';

    const plan = buildDisplayPlan(content, [flowers, chocolates]);
    expect(plan).toBeNull();
  });

  it('returns null when there are no headers at all, even with 2 product lists', () => {
    const flowers = productList('flowers', ['Rose Bouquet']);
    const chocolates = productList('chocolates', ['Belgian Truffles']);
    const content = 'Here are some flowers and chocolates for you, all in one paragraph with no section breaks.';

    const plan = buildDisplayPlan(content, [flowers, chocolates]);
    expect(plan).toBeNull();
  });
});
