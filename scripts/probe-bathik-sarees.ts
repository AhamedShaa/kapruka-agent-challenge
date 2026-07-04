import { KaprukaSDK } from 'kapruka-mcp';

async function call(sdk: KaprukaSDK, label: string, args: Record<string, unknown>): Promise<void> {
  console.log(`\n=== ${label} ===`);
  console.log('args:', JSON.stringify(args));
  try {
    const raw = await sdk.callToolRaw('kapruka_search_products', args);
    console.log('RAW:', typeof raw === 'string' ? raw.slice(0, 1200) : JSON.stringify(raw).slice(0, 1200));
  } catch (e) {
    console.log('THREW:', e instanceof Error ? e.message : String(e));
  }
}

async function main(): Promise<void> {
  const sdk = new KaprukaSDK();
  await sdk.callToolRaw('kapruka_list_categories', {}).catch(() => undefined);

  await call(sdk, '1 — "bathik sarees" (exact original failing phrase, no filters)', { q: 'bathik sarees' });
  await call(sdk, '2 — "batik sarees" (correct spelling, still compound, no filters)', { q: 'batik sarees' });
  await call(sdk, '3 — "batik sarees" + max_price:10000 + min_price:0 (reintroduce trace filters)', { q: 'batik sarees', max_price: 10000, min_price: 0 });
  await call(sdk, '4 — "saree" + category:"Clothing" (reverse-direction sanity check)', { q: 'saree', category: 'Clothing' });

  await sdk.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
