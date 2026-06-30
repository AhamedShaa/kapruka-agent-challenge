import type { SearchResult } from 'kapruka-mcp';
import type { NormalizedSearchResult } from './types.js';
import { normalizeSearchProduct } from './product.js';

/**
 * `nextCursor` is an undocumented field the live server returns (confirmed
 * in fixtures/raw/kapruka_search_products.parsed.json) but the published
 * SearchResult type doesn't declare it — read it defensively.
 */
type SearchResultWithCursor = SearchResult & { nextCursor?: string };

/**
 * Normalizes a search_products response. `rawText` (the full search-response
 * markdown) is optional and passed through to each product so vendor/weight/
 * product_url can be extracted — see product.ts.
 */
export function normalizeSearchResult(raw: SearchResultWithCursor, rawText?: string): NormalizedSearchResult {
  const products = raw.products.map((product) => normalizeSearchProduct(product, rawText));

  return {
    products,
    total: raw.total,
    query: raw.query,
    cursor: raw.nextCursor ?? null,
  };
}

/** Normalizes a get_alternatives response — same product shape as search, different source tool. */
export function normalizeAlternativesResult(
  raw: { alternatives: import('kapruka-mcp').Product[]; total: number; query: string },
  rawText?: string,
): NormalizedSearchResult {
  const products = raw.alternatives.map((product) => normalizeSearchProduct(product, rawText));

  return { products, total: raw.total, query: raw.query, cursor: null };
}

/**
 * Normalizes a get_recommendations response — same product shape as search,
 * different source tool. The underlying tool derives recommendations from
 * cart context, not a query string, so `query` is passed through from the
 * caller rather than read off the raw response (which has no such field).
 */
export function normalizeRecommendationsResult(
  raw: { recommendations: import('kapruka-mcp').Product[] },
  query: string,
  rawText?: string,
): NormalizedSearchResult {
  const products = raw.recommendations.map((product) => normalizeSearchProduct(product, rawText));

  return { products, total: products.length, query, cursor: null };
}
