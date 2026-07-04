import { KaprukaSDK } from 'kapruka-mcp';

async function call(sdk: KaprukaSDK, label: string, args: Record<string, unknown>): Promise<void> {
  console.log(`\n=== ${label} ===`);
  console.log('args:', JSON.stringify(args));
  try {
    const raw = await sdk.callToolRaw('kapruka_search_products', args);
    console.log('RAW:', typeof raw === 'string' ? raw.slice(0, 900) : JSON.stringify(raw).slice(0, 900));
  } catch (e) {
    console.log('THREW:', e instanceof Error ? e.message : String(e));
  }
}

async function main(): Promise<void> {
  const sdk = new KaprukaSDK();
  await sdk.callToolRaw('kapruka_list_categories', {}).catch(() => undefined);
  await call(sdk, 'batik + category="Saree" (exact-cased depth-2 display name)', { q: 'batik', category: 'Saree' });
  await call(sdk, 'bathik + category="Saree" (exact-cased depth-2 display name)', { q: 'bathik', category: 'Saree' });
  await sdk.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
