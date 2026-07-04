import { KaprukaSDK } from 'kapruka-mcp';

async function call(sdk: KaprukaSDK, label: string, args: Record<string, unknown>): Promise<void> {
  console.log(`\n=== ${label} ===`);
  console.log('args:', JSON.stringify(args));
  try {
    const raw = await sdk.callToolRaw('kapruka_search_products', args);
    console.log('RAW (first 500 chars):', raw.slice(0, 500));
  } catch (e) {
    console.log('THREW:', e instanceof Error ? e.message : String(e));
  }
}

async function main(): Promise<void> {
  const sdk = new KaprukaSDK();
  await sdk.callToolRaw('kapruka_list_categories', {}).catch(() => undefined);

  // get_product reported "BOOKS" (all-caps) as this item's category.
  await call(sdk, 'q="books", category="BOOKS" (exact get_product-reported casing)', { q: 'books', category: 'BOOKS' });
  await call(sdk, 'q="books", category="Books" (title-case guess, control)', { q: 'books', category: 'Books' });

  // get_product reported "Clothing" (title-case) for the saree item — already
  // confirmed to work in an earlier round; re-confirming alongside for a
  // clean side-by-side comparison in one probe run.
  await call(sdk, 'q="saree", category="Clothing" (exact get_product-reported casing, control)', { q: 'saree', category: 'Clothing' });

  await sdk.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
