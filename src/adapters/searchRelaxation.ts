import type { NormalizedProduct, NormalizedSearchResult, SearchFilters } from '@/core/ports/commerce.port.js';

export type MatchOutcome = 'ok' | 'no-match' | 'filtered-empty';

export interface SearchOutcome extends NormalizedSearchResult {
  matchOutcome: MatchOutcome;
}

/**
 * Boosts products whose name contains literal query tokens (case-insensitive
 * substring match) above ones that don't — addresses the ranking degradation
 * confirmed this session for both correctly-spelled and misspelled "batik"
 * (irrelevant "Bathi"/"Bathtime" items outranking genuine matches). Stable:
 * ties keep the server's original relative order.
 *
 * Known limitation, confirmed against this session's real captured data (see
 * fixture tests): literal substring matching does not bridge a misspelling
 * ("bathik" never matches "Batik") or a singular/plural mismatch ("sarees"
 * never matches "Saree"). For those cases this is a no-op — the zero-result
 * relaxation ladder (resolveSearchOutcome below) is what actually recovers
 * results; re-ranking only helps once the right words are already present.
 */
export function tokenBoostRerank(products: NormalizedProduct[], query: string): NormalizedProduct[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return products;

  return products
    .map((p, i) => {
      const name = (p.name ?? '').toLowerCase();
      const score = tokens.reduce((acc, t) => acc + (name.includes(t) ? 1 : 0), 0);
      return { p, i, score };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((entry) => entry.p);
}

/**
 * Client-side re-check of the filters the caller originally asked for — used
 * only on the relaxation-recovery path below, once we've already dropped the
 * filters to see if anything matches the bare term at all.
 *
 * category is intentionally NOT checked here: NormalizedProduct.category
 * holds internal vendor codes (e.g. "ef", "cphamper"), not the user-facing
 * category names ("Clothing") the live search_products category param
 * actually expects — there's no reliable client-side equivalent.
 */
export function matchesLocalFilters(product: NormalizedProduct, filters?: SearchFilters): boolean {
  if (!filters) return true;
  if (filters.min_price !== undefined && (product.price === null || product.price < filters.min_price)) return false;
  if (filters.max_price !== undefined && (product.price === null || product.price > filters.max_price)) return false;
  if (filters.in_stock_only && product.in_stock === 'out_of_stock') return false;
  return true;
}

/**
 * Pure decision logic for the zero-result relaxation ladder, given two
 * ALREADY-FETCHED result sets — the originally filtered/categorized search,
 * and (only when the first came back empty and filters were actually sent) a
 * bare retry with category/min_price/max_price/in_stock_only stripped. Kept
 * pure and network-free so it's directly fixture-testable; see
 * KaprukaAdapter.search() for the orchestration that fetches both.
 *
 * Confirmed necessary this session: the exact combination of a misspelled
 * term + price filters together can return zero even though each piece works
 * in isolation (scripts/probe-exact-original-combo.ts) — this is what
 * distinguishes a genuine no-match from filters-too-narrow.
 */
export function resolveSearchOutcome(
  query: string,
  filteredResult: NormalizedSearchResult,
  filtersWereSent: boolean,
  filters: SearchFilters | undefined,
  bareResult: NormalizedSearchResult | null,
): SearchOutcome {
  if (filteredResult.products.length > 0) {
    return { ...filteredResult, products: tokenBoostRerank(filteredResult.products, query), matchOutcome: 'ok' };
  }

  if (!filtersWereSent || !bareResult) {
    return { ...filteredResult, products: [], matchOutcome: 'no-match' };
  }

  if (bareResult.products.length === 0) {
    return { ...bareResult, products: [], matchOutcome: 'no-match' };
  }

  const locallyFiltered = bareResult.products.filter((p) => matchesLocalFilters(p, filters));
  const reranked = tokenBoostRerank(locallyFiltered, query);

  return {
    ...bareResult,
    products: reranked,
    matchOutcome: reranked.length > 0 ? 'ok' : 'filtered-empty',
  };
}
