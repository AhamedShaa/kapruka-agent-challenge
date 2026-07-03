import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Product, SearchResult } from 'kapruka-mcp';
import { normalizeGetProductResult, normalizeSearchProduct } from '../product.js';

const FIXTURES_DIR = path.join(process.cwd(), 'fixtures', 'raw');

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8')) as T;
}

function loadText(filename: string): string {
  return readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8');
}

const searchResult = loadJson<SearchResult>('kapruka_search_products.parsed.json');
const searchRawText = loadText('kapruka_search_products.raw.txt');
const firstSearchProduct = searchResult.products[0]; // FLOWERS00T1875, "Rose Elegance Display Vase..."

const getProductResult = loadJson<Product>('kapruka_get_product.parsed.json');
const getProductRawText = loadText('kapruka_get_product.raw.txt');

describe('normalizeSearchProduct', () => {
  it('preserves id, name, price, in_stock, category as-is', () => {
    const result = normalizeSearchProduct(firstSearchProduct, searchRawText);
    expect(result.id).toBe('FLOWERS00T1875');
    expect(result.name).toBe('Rose Elegance Display Vase With 30 Red Roses');
    expect(result.price).toBe(18000);
    expect(result.in_stock).toBe(true);
    expect(result.category).toBe('flowers');
  });

  it('always sets currency to "LKR"', () => {
    const result = normalizeSearchProduct(firstSearchProduct);
    expect(result.currency).toBe('LKR');
  });

  it('nulls image_url unconditionally for search-derived products (Decision C)', () => {
    const result = normalizeSearchProduct(firstSearchProduct, searchRawText);
    expect(result.image_url).toBeNull();
  });

  it('nulls description (always "" from search)', () => {
    expect(firstSearchProduct.description).toBe('');
    const result = normalizeSearchProduct(firstSearchProduct, searchRawText);
    expect(result.description).toBeNull();
  });

  it('nulls visual_description unconditionally (Decision A)', () => {
    const result = normalizeSearchProduct(firstSearchProduct, searchRawText);
    expect(result.visual_description).toBeNull();
  });

  it('nulls vendor and weight for search-derived products (no labels exist in search blocks)', () => {
    const result = normalizeSearchProduct(firstSearchProduct, searchRawText);
    expect(result.vendor).toBeNull();
    expect(result.weight).toBeNull();
  });

  it('extracts product_url from the matching block when rawText is provided', () => {
    const result = normalizeSearchProduct(firstSearchProduct, searchRawText);
    expect(result.product_url).toBe(
      'https://www.kapruka.com/buyonline/rose-elegance-display-vase-wit/kid/flowers00t1875',
    );
  });

  it('nulls product_url when rawText is omitted', () => {
    const result = normalizeSearchProduct(firstSearchProduct);
    expect(result.product_url).toBeNull();
  });

  it('nulls price when the parsed value is 0 (Decision #1)', () => {
    const zeroPriceProduct: Product = { ...firstSearchProduct, price: 0 };
    const result = normalizeSearchProduct(zeroPriceProduct);
    expect(result.price).toBeNull();
  });

  it('nulls name when the parsed value is an empty string', () => {
    const noNameProduct: Product = { ...firstSearchProduct, name: '' };
    const result = normalizeSearchProduct(noNameProduct);
    expect(result.name).toBeNull();
  });
});

describe('normalizeGetProductResult', () => {
  it('preserves id, name, price, category, image_url as-is', () => {
    const result = normalizeGetProductResult(getProductResult, getProductRawText);
    expect(result.id).toBe('flowers00T1875');
    expect(result.name).toBe('Rose Elegance Display Vase With 30 Red Roses');
    expect(result.price).toBe(18000);
    expect(result.category).toBe('flowers');
    expect(result.image_url).toBe(
      'https://www.kapruka.com/shops/flowershop/flowerImages/zooms/1750164720138_dsc03892.jpg',
    );
  });

  it('preserves description exactly as returned, including trailing "..." (Decision B)', () => {
    const result = normalizeGetProductResult(getProductResult, getProductRawText);
    expect(result.description).toBe(getProductResult.description);
    expect(result.description?.endsWith('...')).toBe(true);
  });

  it('nulls visual_description unconditionally regardless of the SDK-synthesized value (Decision A)', () => {
    expect(getProductResult.visual_description).toBe('Vendor: Flowers. Weight: 0 lbs.');
    const result = normalizeGetProductResult(getProductResult, getProductRawText);
    expect(result.visual_description).toBeNull();
  });

  it('extracts vendor as-is from the raw **Vendor** label', () => {
    const result = normalizeGetProductResult(getProductResult, getProductRawText);
    expect(result.vendor).toBe('Flowers');
  });

  it('nulls weight when the raw value is the "0 lbs" stub', () => {
    const result = normalizeGetProductResult(getProductResult, getProductRawText);
    expect(result.weight).toBeNull();
  });

  describe('cakes fixture (cake00KA001990, get-product-cakes.raw.txt)', () => {
    const cakeRawText = loadText('get-product-cakes.raw.txt');
    // No .parsed.json fixture exists — constructing from known-real values
    // captured in the get-product audit (scripts/probe-get-product-images.ts).
    const cakeProduct: Product = {
      id: 'cake00KA001990',
      name: 'Golden Celebration Chocolate Cake Indulgence',
      price: 6700,
      currency: 'LKR',
      image_url: 'https://www.kapruka.com/shops/cakes/productImages/zoom/1759206062516_dsc09157.jpg',
      category: 'cakes',
      description: cakeRawText.split('\n\n')[1],
      visual_description: 'Vendor: Kapruka Cakes Cake. Weight: 3 lbs.',
      in_stock: true,
    };

    it('extracts vendor from **Vendor** label when rawText is provided', () => {
      const result = normalizeGetProductResult(cakeProduct, cakeRawText);
      expect(result.vendor).toBe('Kapruka Cakes Cake');
    });

    it('extracts weight from **Weight** label, rejecting 0-value stubs', () => {
      const result = normalizeGetProductResult(cakeProduct, cakeRawText);
      expect(result.weight).toBe('3 lbs');
    });

    it('extracts product_url from [View on Kapruka] markdown link when rawText is provided', () => {
      const result = normalizeGetProductResult(cakeProduct, cakeRawText);
      expect(result.product_url).toBe(
        'https://www.kapruka.com/buyonline/golden-celebration-chocolate-c/kid/cake00ka001990',
      );
    });

    it('returns null for vendor/weight/product_url when rawText is omitted', () => {
      const result = normalizeGetProductResult(cakeProduct);
      expect(result.vendor).toBeNull();
      expect(result.weight).toBeNull();
      expect(result.product_url).toBeNull();
    });

    it('getProduct LLM return string includes vendor, weight, and product_url when present', () => {
      const product = normalizeGetProductResult(cakeProduct, cakeRawText);

      // Mirror the exact format template from src/agent/tools.ts getProduct func.
      const description = product.description ? `${product.description.slice(0, 80)}. ` : '';
      const vendorPart = product.vendor ? ` Vendor: ${product.vendor}.` : '';
      const weightPart = product.weight ? ` Weight: ${product.weight}.` : '';
      const urlPart = product.product_url ? ` URL: ${product.product_url}.` : '';
      const str = `${product.name ?? 'Unnamed item'} — LKR ${product.price}. ${description}In stock: ${product.in_stock ? 'yes' : 'no'}.${vendorPart}${weightPart}${urlPart}`;

      expect(str).toContain('Vendor: Kapruka Cakes Cake');
      expect(str).toContain('Weight: 3 lbs');
      expect(str).toContain('URL: https://www.kapruka.com/buyonline/golden-celebration-chocolate-c/kid/cake00ka001990');
      expect(str).toMatch(/^Golden Celebration Chocolate Cake Indulgence — LKR 6700\./);
    });
  });

  it('extracts product_url from the single [View on Kapruka] link', () => {
    const result = normalizeGetProductResult(getProductResult, getProductRawText);
    expect(result.product_url).toBe(
      'https://www.kapruka.com/buyonline/rose-elegance-display-vase-wit/kid/flowers00t1875',
    );
  });

  it('nulls vendor/weight/product_url when rawText is omitted', () => {
    const result = normalizeGetProductResult(getProductResult);
    expect(result.vendor).toBeNull();
    expect(result.weight).toBeNull();
    expect(result.product_url).toBeNull();
  });
});
