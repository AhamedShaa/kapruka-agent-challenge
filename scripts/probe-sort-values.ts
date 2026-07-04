import { KaprukaSDK } from 'kapruka-mcp';

async function call(sdk: KaprukaSDK, label: string, args: Record<string, unknown>): Promise<void> {
  console.log(`\n=== ${label} ===`);
  console.log('args:', JSON.stringify(args));
  try {
    const raw = await sdk.callToolRaw('kapruka_search_products', args);
    console.log('RAW:', raw.slice(0, 900));
  } catch (e) {
    console.log('THREW:', e instanceof Error ? e.message : String(e));
  }
}

async function main(): Promise<void> {
  const sdk = new KaprukaSDK();
  await sdk.callToolRaw('kapruka_list_categories', {}).catch(() => undefined);

  await call(sdk, 'books + sort="name"', { q: 'books', sort: 'name' });
  await call(sdk, 'books + sort="newest"', { q: 'books', sort: 'newest' });
  await call(sdk, 'books + sort="popularity"', { q: 'books', sort: 'popularity' });
  await call(sdk, 'books + sort="price_asc" (control — known-good per SearchSchema description)', { q: 'books', sort: 'price_asc' });

  await sdk.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
