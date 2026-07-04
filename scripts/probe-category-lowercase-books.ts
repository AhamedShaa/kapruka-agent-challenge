import { KaprukaSDK } from 'kapruka-mcp';
async function main(): Promise<void> {
  const sdk = new KaprukaSDK();
  await sdk.callToolRaw('kapruka_list_categories', {}).catch(() => undefined);
  const raw = await sdk.callToolRaw('kapruka_search_products', { q: 'books', category: 'books' });
  console.log('args: {"q":"books","category":"books"}');
  console.log('RAW (first 500 chars):', raw.slice(0, 500));
  await sdk.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
