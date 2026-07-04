// scripts/probe-get-product-images.ts
// Reads raw kapruka_get_product responses for 3 live product IDs to inspect
// image structure: singular vs array, markdown syntax, gallery patterns.
// Run: npx tsx scripts/probe-get-product-images.ts

process.env.COMMERCE_MODE = 'live';

import { KaprukaSDK } from '../node_modules/kapruka-mcp/dist/sdk/client.js';

async function searchForIds(sdk: KaprukaSDK, query: string): Promise<string[]> {
  const raw = await sdk.callToolRaw('kapruka_search_products', { q: query });
  // Extract product IDs from markdown — they appear inside backticks after "ID:"
  const ids: string[] = [];
  for (const m of raw.matchAll(/`([A-Z0-9]+)`/g)) {
    ids.push(m[1]);
  }
  return ids.slice(0, 2);
}

async function probeProduct(sdk: KaprukaSDK, productId: string, label: string): Promise<void> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`PRODUCT: ${label} (id: ${productId})`);
  console.log('='.repeat(70));

  const raw = await sdk.callToolRaw('kapruka_get_product', { product_id: productId });

  // Print full raw response
  console.log('\n--- FULL RAW TEXT ---\n');
  console.log(raw);

  // Highlight image-related lines
  const imageLines = raw.split('\n').filter(
    (l) => l.match(/!\[|image|img|photo|gallery|thumbnail|cdn|jpeg|jpg|png|webp/i)
  );
  console.log('\n--- IMAGE-RELATED LINES ---');
  if (imageLines.length === 0) {
    console.log('(none found)');
  } else {
    imageLines.forEach((l) => console.log(l));
  }

  // Count markdown image patterns
  const mdImages = [...raw.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
  console.log(`\n--- MARKDOWN IMAGE COUNT: ${mdImages.length} ---`);
  mdImages.forEach((m, i) => console.log(`  [${i}] alt="${m[1]}" url="${m[2]}"`));

  // Count raw https image URLs
  const rawUrls = [...raw.matchAll(/https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif)[^\s)]*/gi)];
  console.log(`\n--- RAW IMAGE URLS: ${rawUrls.length} ---`);
  rawUrls.forEach((m, i) => console.log(`  [${i}] ${m[0]}`));
}

async function main(): Promise<void> {
  const sdk = new KaprukaSDK();
  await sdk.connect();

  // Warm-up (isOfficialServer needs connect() to have run)
  try { await sdk.callToolRaw('kapruka_search_products', { q: 'cake' }); } catch {}

  // Get IDs from 3 different categories
  console.log('Fetching live product IDs from search…');
  const cakeIds    = await searchForIds(sdk, 'birthday cake');
  const flowerIds  = await searchForIds(sdk, 'red rose bouquet');
  const electroIds = await searchForIds(sdk, 'bluetooth speaker');

  const probes: Array<[string, string]> = [
    [cakeIds[0]    ?? 'CAKE00KA001865', 'Cake (category: cakes)'],
    [flowerIds[0]  ?? 'FLOW00KA000123', 'Flowers (category: flowers)'],
    [electroIds[0] ?? 'ELEC00KA000456', 'Electronics (category: electronics)'],
  ];

  for (const [id, label] of probes) {
    await probeProduct(sdk, id, label);
  }

  await sdk.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
