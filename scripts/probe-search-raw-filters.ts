// scripts/probe-search-raw-filters.ts
// Question: does the REMOTE mcp.kapruka.com server actually filter correctly
// when min_price/max_price/in_stock_only are sent via a raw call, bypassing
// KaprukaSDK.searchProducts()'s narrow (q, category)-only wrapper?

import { KaprukaSDK } from 'kapruka-mcp';

async function probe(label: string, args: Record<string, unknown>): Promise<void> {
  const sdk = new KaprukaSDK();
  await sdk.callToolRaw('kapruka_list_categories', {}); // warmup, avoid cold-start race
  console.log(`\n=== ${label} ===`);
  const raw = await sdk.callToolRaw('kapruka_search_products', args);
  console.log('RAW:', typeof raw === 'string' ? raw.slice(0, 2000) : JSON.stringify(raw).slice(0, 2000));
  await sdk.disconnect();
}

async function main(): Promise<void> {
  await probe('A — baseline, no filter', { q: 'saree' });
  await probe('B — max_price via raw call', { q: 'saree', max_price: 5000 });
  await probe('C — min_price via raw call', { q: 'saree', min_price: 10000 });
  await probe('D — in_stock_only via raw call', { q: 'saree', in_stock_only: true });
}
main().catch((e) => { console.error(e); process.exit(1); });
