// scripts/verify-get-product-live.ts
// Confirms getProduct now returns non-null vendor, weight, product_url
// after switching the adapter to callToolWithRaw.
// Run: npx tsx scripts/verify-get-product-live.ts

process.env.COMMERCE_MODE = 'live';

import { getAdapter } from '../src/adapters/index.js';

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ ${msg}`);
}

async function main(): Promise<void> {
  console.log('Initialising live adapter via getAdapter()…\n');
  const adapter = await getAdapter();

  const productId = 'CAKE00KA001685';
  console.log(`Calling getProduct('${productId}')…\n`);
  const product = await adapter.getProduct(productId);

  console.log('--- NormalizedProduct result ---');
  console.log(JSON.stringify(product, null, 2));
  console.log('');

  assert(product.id.toLowerCase() === productId.toLowerCase(), `id matches ${productId}`);
  assert(product.vendor !== null, `vendor is non-null (got: ${product.vendor ?? 'null'})`);
  assert(product.weight !== null, `weight is non-null (got: ${product.weight ?? 'null'})`);
  assert(product.product_url !== null, `product_url is non-null (got: ${product.product_url ?? 'null'})`);
  assert(product.image_url !== null, `image_url is non-null (got: ${product.image_url ?? 'null'})`);
  assert(product.price !== null && product.price > 0, `price > 0 (got: ${product.price ?? 'null'})`);

  console.log('\nAll assertions passed.');
}

main().catch((e) => {
  console.error('\n❌ Unexpected error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
