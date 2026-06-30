import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SearchResult } from 'kapruka-mcp';
import { normalizeSearchResult } from '../search.js';

const FIXTURES_DIR = path.join(process.cwd(), 'fixtures', 'raw');

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8')) as T;
}

function loadText(filename: string): string {
  return readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8');
}

const searchResult = loadJson<SearchResult & { nextCursor?: string }>('kapruka_search_products.parsed.json');
const searchRawText = loadText('kapruka_search_products.raw.txt');

describe('normalizeSearchResult', () => {
  it('normalizes every product in the result', () => {
    const result = normalizeSearchResult(searchResult, searchRawText);
    expect(result.products).toHaveLength(searchResult.products.length);
    expect(result.products[0].id).toBe('FLOWERS00T1875');
  });

  it('preserves total and query as-is', () => {
    const result = normalizeSearchResult(searchResult);
    expect(result.total).toBe(9);
    expect(result.query).toBe('roses');
  });

  it('surfaces the undocumented nextCursor field as cursor', () => {
    expect(searchResult.nextCursor).toBeTruthy();
    const result = normalizeSearchResult(searchResult);
    expect(result.cursor).toBe(searchResult.nextCursor);
  });

  it('nulls cursor when nextCursor is absent', () => {
    const noCursorResult: SearchResult = { products: [], total: 0, query: 'xyzqwerty123abc' };
    const result = normalizeSearchResult(noCursorResult);
    expect(result.cursor).toBeNull();
  });

  it('passes rawText through so per-product enrichment (product_url) works', () => {
    const result = normalizeSearchResult(searchResult, searchRawText);
    expect(result.products[0].product_url).toBe(
      'https://www.kapruka.com/buyonline/rose-elegance-display-vase-wit/kid/flowers00t1875',
    );
  });
});
