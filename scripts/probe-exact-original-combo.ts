import { KaprukaSDK } from 'kapruka-mcp';

async function main(): Promise<void> {
  const sdk = new KaprukaSDK();
  await sdk.callToolRaw('kapruka_list_categories', {}).catch(() => undefined);
  const args = { q: 'bathik sarees', max_price: 10000, min_price: 0 };
  console.log('args:', JSON.stringify(args));
  const raw = await sdk.callToolRaw('kapruka_search_products', args);
  console.log('FULL LENGTH:', raw.length);
  console.log(raw);
  await sdk.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
