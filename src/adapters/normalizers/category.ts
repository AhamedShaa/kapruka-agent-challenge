import type { Category } from 'kapruka-mcp';
import type { NormalizedCategory } from './types.js';

/**
 * Normalizes a category as returned by list_categories. The live server's
 * `description` field is a duplicate of the category URL, not a real
 * description (Decision #4, LOCKED) — `description` is always null here,
 * and the real URL value is carried separately in `url`.
 */
export function normalizeCategory(raw: Category): NormalizedCategory {
  const id = raw.id ? raw.id : null;
  const url = raw.description ? raw.description : null;

  return {
    id,
    name: raw.name,
    description: null,
    url,
  };
}

export function normalizeCategoryList(raw: Category[]): NormalizedCategory[] {
  return raw.map(normalizeCategory);
}
