import { KaprukaSDK } from 'kapruka-mcp';

async function main(): Promise<void> {
  const sdk = new KaprukaSDK();
  await sdk.callToolRaw('kapruka_list_categories', {}).catch(() => undefined);
  const raw = await sdk.callToolRaw('kapruka_list_categories', { depth: 2 });
  console.log('FULL LENGTH:', raw.length);
  console.log(raw);
  await sdk.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
