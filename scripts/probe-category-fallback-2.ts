import { KaprukaSDK } from 'kapruka-mcp';

async function call(sdk: KaprukaSDK, label: string, args: Record<string, unknown>): Promise<void> {
  console.log(`\n=== ${label} ===`);
  console.log('args:', JSON.stringify(args));
  try {
    const raw = await sdk.callToolRaw('kapruka_search_products', args);
    console.log('RAW:', typeof raw === 'string' ? raw.slice(0, 800) : JSON.stringify(raw).slice(0, 800));
  } catch (e) {
    console.log('THREW:', e instanceof Error ? e.message : String(e));
  }
}

async function main(): Promise<void> {
  const sdk = new KaprukaSDK();
  await sdk.callToolRaw('kapruka_list_categories', {}).catch(() => undefined);
  await call(sdk, 'bathik + category="saree" (real depth-2 subcategory slug)', { q: 'bathik', category: 'saree' });
  await call(sdk, 'batik + category="saree" (correct spelling, control)', { q: 'batik', category: 'saree' });
  await call(sdk, 'bathik + category="Clothing" (exact-cased top-level, control)', { q: 'bathik', category: 'Clothing' });
  await sdk.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
