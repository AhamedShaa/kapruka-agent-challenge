import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Category } from 'kapruka-mcp';
import { normalizeCategory, normalizeCategoryList } from '../category.js';

const FIXTURES_DIR = path.join(process.cwd(), 'fixtures', 'raw');

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8')) as T;
}

const categories = loadJson<Category[]>('kapruka_list_categories.parsed.json');
const automobile = categories.find((c) => c.id === 'automobile') as Category;

describe('normalizeCategory', () => {
  it('preserves name as-is', () => {
    const result = normalizeCategory(automobile);
    expect(result.name).toBe('Automobile');
  });

  it('preserves id as-is when it matches the URL slug', () => {
    expect(automobile.description).toBe('https://www.kapruka.com/online/automobile');
    const result = normalizeCategory(automobile);
    expect(result.id).toBe('automobile');
  });

  it('always nulls description, since the live server duplicates the URL into it (Decision #4)', () => {
    const result = normalizeCategory(automobile);
    expect(result.description).toBeNull();
  });

  it('carries the real URL value in the new url field instead', () => {
    const result = normalizeCategory(automobile);
    expect(result.url).toBe('https://www.kapruka.com/online/automobile');
  });

  it('nulls url when description is empty', () => {
    const noUrl: Category = { id: 'x', name: 'X', description: '' };
    const result = normalizeCategory(noUrl);
    expect(result.url).toBeNull();
  });
});

describe('normalizeCategoryList', () => {
  it('normalizes every category in the captured 65-category fixture', () => {
    const results = normalizeCategoryList(categories);
    expect(results).toHaveLength(65);
    expect(results.every((r) => r.description === null)).toBe(true);
    expect(results.every((r) => r.url !== null)).toBe(true);
  });
});
