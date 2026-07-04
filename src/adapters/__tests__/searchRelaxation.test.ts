import { describe, expect, it } from 'vitest';
import { matchesLocalFilters, resolveSearchOutcome, tokenBoostRerank } from '../searchRelaxation.js';
import type { NormalizedProduct, NormalizedSearchResult } from '@/core/ports/commerce.port.js';

function makeProduct(id: string, name: string, price: number, in_stock = true): NormalizedProduct {
  return {
    id,
    name,
    price,
    currency: 'LKR',
    image_url: null,
    product_url: null,
    category: null,
    description: null,
    visual_description: null,
    vendor: null,
    weight: null,
    in_stock,
  };
}

function makeResult(products: NormalizedProduct[], query: string): NormalizedSearchResult {
  return { products, total: products.length, query, cursor: null };
}

// Real product names/prices captured live this session (scripts/probe-bathik-sarees.ts,
// scripts/probe-category-and-fuzzy-search.ts, scripts/probe-exact-original-combo.ts) —
// not synthetic fixtures.
const BATHIK_SINGLE_WORD_RESULT = [
  makeProduct('EF_PC_HOME0V5028POD00011', 'Bodu Bathi Gee Lp', 990),
  makeProduct('EF_PC_COSM0V173P00029', 'Baylis And Harding Gross Bathtime Bath Bubbles 5 Test Tube Gift', 4500),
  makeProduct('EF_PC_CLOT0V160POD00957FDP', 'Rain Batik Kaftan-brown', 9500),
  makeProduct('EF_PC_JEWE0V4625P00014', 'Emerald Cut Artificial Black Onyx Stone Earrings - KKY Batik - W', 3200),
  makeProduct('EF_PC_CLOT0V1216P00017', 'White Elephant In Black Background Batik Sarong', 1980),
];

const BATIK_SINGLE_WORD_RESULT = [
  makeProduct('EF_PC_CLOT0V160POD00957FDP', 'Rain Batik Kaftan-brown', 9500),
  makeProduct('EF_PC_CLOT0V1216P00017', 'White Elephant In Black Background Batik Sarong', 1980),
  makeProduct('EF_PC_SOFT0V157P00004', 'Gamer Mode On Batik Plush Pillow', 2500),
  makeProduct('EF_PC_CLOT0V4625P00031', 'Elegant Sri Lankan Handmade Batik Cotton Saree', 5500),
  makeProduct('COMBOCLFL7', 'Grace In Bloom Gift Pack With Batik Saree And Pink Rose Bouquet', 11180),
];

// The real 9-item bare-query result for "bathik sarees" (no filters) —
// scripts/probe-bathik-sarees.ts, case 1.
const BATHIK_SAREES_BARE_RESULT = [
  makeProduct('EF_PC_CLOT0V154POD00857', 'Pixcel Crush Silk Saree', 13690),
  makeProduct('CLOTHING07923', 'Traditional Kerala Kasavu Saree', 3750),
  makeProduct('CLOTHING07968', 'Maroon Batik Saree With White Floral Saree', 4950),
  makeProduct('EF_PC_CLOT0V154POD00852', 'Soft Net Saree', 18690),
  makeProduct('EF_PC_CLOT0V154POD00860', 'Rangoli Silk Saree', 11190),
  makeProduct('GIFTSET00572', 'Radiant Diya Saree Gift Box With Saree, Bangles, Earrings, Artif', 19000),
  makeProduct('COMBOCLFL7', 'Grace In Bloom Gift Pack With Batik Saree And Pink Rose Bouquet', 11180),
  makeProduct('CLOTHING07949', 'Sunset Bloom Batik Saree', 4950),
  makeProduct('CLOTHING07951', 'Ocean Wave Batik Saree', 4950),
];

describe('tokenBoostRerank', () => {
  it('is a no-op for a misspelled single-word query — "bathik" never literally matches "Batik"', () => {
    const reranked = tokenBoostRerank(BATHIK_SINGLE_WORD_RESULT, 'bathik');
    expect(reranked.map((p) => p.id)).toEqual(BATHIK_SINGLE_WORD_RESULT.map((p) => p.id));
  });

  it('is a no-op for the correctly-spelled query too, since every result already contains the token (all tie)', () => {
    const reranked = tokenBoostRerank(BATIK_SINGLE_WORD_RESULT, 'batik');
    expect(reranked.map((p) => p.id)).toEqual(BATIK_SINGLE_WORD_RESULT.map((p) => p.id));
  });

  it('is a no-op for the real compound "bathik sarees" bare result — plural "sarees" never matches singular "Saree"', () => {
    const reranked = tokenBoostRerank(BATHIK_SAREES_BARE_RESULT, 'bathik sarees');
    expect(reranked.map((p) => p.id)).toEqual(BATHIK_SAREES_BARE_RESULT.map((p) => p.id));
  });

  it('does boost when the literal token genuinely appears in some names but not others', () => {
    const mixed = [
      makeProduct('A', 'Blue Ceramic Vase', 1000),
      makeProduct('B', 'Red Rose Bouquet', 2000),
      makeProduct('C', 'Rose Scented Candle', 1500),
    ];
    const reranked = tokenBoostRerank(mixed, 'rose');
    expect(reranked.map((p) => p.id)).toEqual(['B', 'C', 'A']);
  });
});

describe('matchesLocalFilters', () => {
  it('enforces min_price and max_price against real captured prices', () => {
    expect(matchesLocalFilters(makeProduct('X', 'Item', 4950), { min_price: 0, max_price: 10000 })).toBe(true);
    expect(matchesLocalFilters(makeProduct('X', 'Item', 18690), { min_price: 0, max_price: 10000 })).toBe(false);
  });

  it('enforces in_stock_only', () => {
    expect(matchesLocalFilters(makeProduct('X', 'Item', 1000, false), { in_stock_only: true })).toBe(false);
    expect(matchesLocalFilters(makeProduct('X', 'Item', 1000, true), { in_stock_only: true })).toBe(true);
  });

  it('passes everything when no filters were requested', () => {
    expect(matchesLocalFilters(makeProduct('X', 'Item', 999999))).toBe(true);
  });
});

describe('resolveSearchOutcome — the real "bathik sarees" + max_price:10000 + min_price:0 case', () => {
  const query = 'bathik sarees';
  const filters = { max_price: 10000, min_price: 0 };
  // Confirmed live (scripts/probe-exact-original-combo.ts): the filtered call
  // itself returns zero for this exact combination.
  const filteredResult = makeResult([], query);
  const bareResult = makeResult(BATHIK_SAREES_BARE_RESULT, query);

  it('recovers exactly the 4 real items that satisfy max_price:10000 once the bare retry has run', () => {
    const outcome = resolveSearchOutcome(query, filteredResult, true, filters, bareResult);

    expect(outcome.matchOutcome).toBe('ok');
    expect(outcome.products.map((p) => p.id).sort()).toEqual(
      ['CLOTHING07923', 'CLOTHING07968', 'CLOTHING07949', 'CLOTHING07951'].sort(),
    );
    for (const p of outcome.products) {
      expect(p.price).not.toBeNull();
      expect((p.price as number) <= 10000).toBe(true);
    }
  });

  it('reports filtered-empty when the bare retry recovers results but none survive the local filter', () => {
    const stricterFilters = { max_price: 100 }; // real captured data has nothing this cheap
    const outcome = resolveSearchOutcome(query, filteredResult, true, stricterFilters, bareResult);
    expect(outcome.matchOutcome).toBe('filtered-empty');
    expect(outcome.products).toHaveLength(0);
  });

  it('reports no-match when even the bare retry comes back empty', () => {
    const outcome = resolveSearchOutcome('totally-nonexistent-item-xyz', filteredResult, true, filters, makeResult([], query));
    expect(outcome.matchOutcome).toBe('no-match');
    expect(outcome.products).toHaveLength(0);
  });

  it('skips the ladder entirely and reports ok when the filtered call already has results', () => {
    const nonEmptyFiltered = makeResult(BATIK_SINGLE_WORD_RESULT, 'batik');
    const outcome = resolveSearchOutcome('batik', nonEmptyFiltered, true, { max_price: 20000 }, null);
    expect(outcome.matchOutcome).toBe('ok');
    expect(outcome.products).toHaveLength(BATIK_SINGLE_WORD_RESULT.length);
  });

  it('reports no-match (not filtered-empty) when no filters were sent at all', () => {
    const outcome = resolveSearchOutcome('totally-nonexistent-item-xyz', makeResult([], 'totally-nonexistent-item-xyz'), false, undefined, null);
    expect(outcome.matchOutcome).toBe('no-match');
  });
});
