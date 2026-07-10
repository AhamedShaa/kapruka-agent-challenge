import type { Product } from 'kapruka-mcp';
import type { NormalizedProduct, StockStatus } from './types.js';

interface FieldResult<T> {
  value: T | null;
}

function present<T>(value: T): FieldResult<T> {
  return { value };
}

const absent: FieldResult<never> = { value: null };

/** "0 lbs" / "0 kg" etc. are a confirmed server-side stub (Decisions Log D/F) — null. A positive number + unit is preserved as-is. Unparseable → null. */
function parseWeight(matched: string | null): string | null {
  if (matched === null) return null;
  const trimmed = matched.trim();
  const m = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.+)$/);
  if (!m) return null;
  const numeric = Number(m[1]);
  if (!Number.isFinite(numeric) || numeric === 0) return null;
  return trimmed;
}

/**
 * Corrects a confirmed live-data corruption: an apostrophe (originally U+2019)
 * that got mis-decoded as UTF-8-read-as-Latin-1 ("â€™") and then had its "&"
 * stripped and numeric refs run together with a stray "n" between each — e.g.
 * "Menn#226;n#8364;n#8482;s Gift Box" instead of "Men's Gift Box". Confirmed
 * via live probe (scripts/probe-mojibake-raw.ts) on 6 SKUs in one product
 * line; pattern-matched here (not hardcoded to those SKUs) since the
 * corruption's full scope in the catalog is unconfirmed.
 */
const MOJIBAKE_APOSTROPHE = /(?:n#\d+;)+/g;

function sanitizeProductName(name: string): string {
  return name.replace(MOJIBAKE_APOSTROPHE, "'");
}

function extractVendor(rawText: string): string | null {
  const m = rawText.match(/\*\*Vendor\*\*:\s*(.+)/);
  return m ? m[1].trim() : null;
}

function extractWeight(rawText: string): string | null {
  const m = rawText.match(/\*\*Weight\*\*:\s*(.+)/);
  return parseWeight(m ? m[1] : null);
}

/**
 * Parses the **Stock** field from raw markdown. The SDK collapses
 * "In stock (low)" to boolean true, losing the low-stock qualifier —
 * so we must parse from rawText when available.
 * Audit confirmed: Kapruka never emits plain "In stock"; "(low)" is always present.
 */
function parseStockStatus(rawText: string | undefined | null, fallbackBool: boolean): StockStatus {
  if (rawText) {
    const m = rawText.match(/\*\*Stock\*\*:\s*(.+)/i);
    if (m) {
      const s = m[1].trim().toLowerCase();
      if (s.includes('out of stock')) return 'out_of_stock';
      if (s.includes('(low)')) return 'low_stock';
      if (s.includes('in stock')) return 'in_stock';
    }
  }
  return fallbackBool ? 'in_stock' : 'out_of_stock';
}

function parseInternationalShipping(rawText: string | undefined | null): boolean | null {
  if (!rawText) return null;
  const m = rawText.match(/\*\*International shipping\*\*:\s*(.+)/i);
  if (!m) return null;
  const val = m[1].trim().toLowerCase();
  if (val === 'yes' || val === 'true') return true;
  if (val === 'no' || val === 'false') return false;
  return null;
}

/** Single-product get_product responses have exactly one `[View on Kapruka]` link. */
function extractProductUrlSingle(rawText: string): string | null {
  const m = rawText.match(/\[View on Kapruka\]\((https?:\/\/[^)]+)\)/);
  return m ? m[1] : null;
}

/** Search responses contain many product blocks — find the one matching this product's id, then read its `[View product]` link. */
function extractProductUrlForId(rawText: string, productId: string): string | null {
  const blocks = rawText.split(/\*\*\d+\.\s/).slice(1);
  for (const block of blocks) {
    const idMatch = block.match(/`([^`]+)`/);
    if (idMatch && idMatch[1].toLowerCase() === productId.toLowerCase()) {
      const linkMatch = block.match(/\[View product\]\((https?:\/\/[^)]+)\)/);
      return linkMatch ? linkMatch[1] : null;
    }
  }
  return null;
}

function buildProduct(
  raw: Product,
  fields: Record<string, FieldResult<unknown>>,
  base: { id: string; in_stock: StockStatus; currency: string; international_shipping: boolean | null },
): NormalizedProduct {
  return {
    id: base.id,
    name: fields.name.value as string | null,
    price: fields.price.value as number | null,
    currency: base.currency,
    image_url: fields.image_url.value as string | null,
    product_url: fields.product_url.value as string | null,
    product_page_url: fields.product_page_url.value as string | null,
    category: fields.category.value as string | null,
    description: fields.description.value as string | null,
    visual_description: fields.visual_description.value as string | null,
    vendor: fields.vendor.value as string | null,
    weight: fields.weight.value as string | null,
    in_stock: base.in_stock,
    international_shipping: base.international_shipping,
  };
}

/**
 * Normalizes a product as returned by search_products. `rawText` (the full
 * search-response markdown) is optional — without it, vendor/weight/
 * product_url stay null, since search results never carry vendor/weight
 * labels, and product_url has no home on the parsed SearchResult/Product
 * type at all (Section 3, search table).
 */
export function normalizeSearchProduct(raw: Product, rawText?: string): NormalizedProduct {
  const productUrl = rawText ? extractProductUrlForId(rawText, raw.id) : null;

  return buildProduct(
    raw,
    {
      name: raw.name ? present(sanitizeProductName(raw.name)) : absent,
      // Decision #1 (LOCKED): a parsed 0 is indistinguishable from a real free item — always null.
      price: raw.price !== 0 ? present(raw.price) : absent,
      // Decision C: search results never carry a real image — hard rule, no heuristic.
      image_url: absent,
      product_url: productUrl !== null ? present(productUrl) : absent,
      // The raw SDK image_url IS this same page link (confirmed empirically,
      // docs/LIVE_SYSTEM_AUDIT.md) — captured here under its own name instead
      // of being discarded, so a get_product failure has a page to fall back
      // to for og:image resolution.
      product_page_url: raw.image_url ? present(raw.image_url) : absent,
      category: raw.category ? present(raw.category) : absent,
      // Decision A/B context: search responses hardcode description to "" — always null.
      description: absent,
      // Decision A (LOCKED): always null.
      visual_description: absent,
      // Search blocks never carry a Vendor label.
      vendor: absent,
      // Search blocks never carry a Weight label.
      weight: absent,
    },
    { id: raw.id, in_stock: raw.in_stock ? 'in_stock' : 'out_of_stock', currency: 'LKR', international_shipping: null },
  );
}

/**
 * Normalizes a product as returned by get_product. `rawText` (the full
 * get_product-response markdown) is optional — without it, vendor/weight/
 * product_url stay null (same reasoning as normalizeSearchProduct).
 */
export function normalizeGetProductResult(raw: Product, rawText?: string): NormalizedProduct {
  const vendor = rawText ? extractVendor(rawText) : null;
  const weight = rawText ? extractWeight(rawText) : null;
  const productUrl = rawText ? extractProductUrlSingle(rawText) : null;

  return buildProduct(
    raw,
    {
      name: raw.name ? present(sanitizeProductName(raw.name)) : absent,
      price: raw.price !== 0 ? present(raw.price) : absent,
      image_url: raw.image_url ? present(raw.image_url) : absent,
      product_url: productUrl !== null ? present(productUrl) : absent,
      // Not needed on this path (get_product already succeeded, so there's
      // no fallback to resolve) — populated for type consistency using the
      // same "[View on Kapruka]" link product_url already extracted.
      product_page_url: productUrl !== null ? present(productUrl) : absent,
      category: raw.category ? present(raw.category) : absent,
      // Decision B (LOCKED): preserve description exactly as the SDK parser returns it, truncation included.
      description: raw.description ? present(raw.description) : absent,
      // Decision A (LOCKED): always null, regardless of what the SDK synthesized into visual_description.
      visual_description: absent,
      vendor: vendor !== null ? present(vendor) : absent,
      weight: weight !== null ? present(weight) : absent,
    },
    { id: raw.id, in_stock: parseStockStatus(rawText, raw.in_stock), currency: 'LKR', international_shipping: parseInternationalShipping(rawText) },
  );
}
