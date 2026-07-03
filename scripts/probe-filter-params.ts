// scripts/probe-filter-params.ts
// Verifies the FULL production pipeline — getAdapter() -> KaprukaAdapter.search()
// -> patched KaprukaLocal search_products handler -> patched KaprukaSDK.searchProducts()
// -> live mcp.kapruka.com — actually respects min_price/max_price/in_stock_only now.
// (scripts/probe-search-raw-filters.ts already confirmed the remote server itself
// honors these when sent directly; this checks nothing drops them again on the way
// through our own adapter/vendor-wrapper stack.)
//
// Run: COMMERCE_MODE=live npx tsx scripts/probe-filter-params.ts

// Set before any module that reads COMMERCE_MODE is evaluated.
process.env.COMMERCE_MODE = 'live';

import { getAdapter } from '../src/adapters/index.js';
import type { NormalizedProduct } from '../src/core/ports/commerce.port.js';

function summarize(products: NormalizedProduct[]): string {
  const prices = products.map((p) => p.price).filter((p): p is number => p !== null);
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;
  const outOfStock = products.filter((p) => p.in_stock === false).length;
  return `count=${products.length} priceRange=[${min}, ${max}] outOfStockCount=${outOfStock}`;
}

async function run(): Promise<void> {
  console.log('Initialising adapter via getAdapter() (live mode)…');
  const adapter = await getAdapter();

  console.log('\n=== max_price / min_price through the real adapter (q: "saree") ===');
  const baseline = await adapter.search('saree');
  console.log('no filter:      ', summarize(baseline.products));

  const maxPriced = await adapter.search('saree', undefined, { max_price: 5000 });
  console.log('max_price=5000: ', summarize(maxPriced.products));
  const overCap = maxPriced.products.filter((p) => p.price !== null && p.price > 5000);
  console.log('  violations (should be empty):', JSON.stringify(overCap.map((p) => ({ name: p.name, price: p.price }))));

  const minPriced = await adapter.search('saree', undefined, { min_price: 10000 });
  console.log('min_price=10000:', summarize(minPriced.products));
  const underFloor = minPriced.products.filter((p) => p.price !== null && p.price < 10000);
  console.log('  violations (should be empty):', JSON.stringify(underFloor.map((p) => ({ name: p.name, price: p.price }))));

  console.log('\n=== in_stock_only — scanning a few category/query combos for mixed stock ===');
  const candidates = [
    'electronics', 'toys', 'grocery', 'fruits', 'fashion',
    'phone', 'laptop', 'shoes', 'watch', 'perfume', 'book',
    'furniture', 'jewellery', 'appliance', 'beauty', 'beverage',
  ];
  for (const q of candidates) {
    const all = await adapter.search(q);
    const outOfStock = all.products.filter((p) => p.in_stock === false).length;
    console.log(`"${q}": total=${all.products.length} outOfStock=${outOfStock}`);
    if (outOfStock > 0) {
      const filtered = await adapter.search(q, undefined, { in_stock_only: true });
      const expected = all.products.length - outOfStock;
      const stillOut = filtered.products.filter((p) => p.in_stock === false);
      console.log(`  in_stock_only=true -> count=${filtered.products.length} (expected ${expected})`);
      console.log('  out-of-stock leaked through (should be empty):', JSON.stringify(stillOut.map((p) => p.name)));
    }
  }
}

run()
  .catch((e: unknown) => { console.error(e); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
