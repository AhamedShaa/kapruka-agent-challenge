import { KaprukaSDK } from 'kapruka-mcp';

async function main(): Promise<void> {
  const sdk = new KaprukaSDK();
  await sdk.callToolRaw('kapruka_list_categories', {}).catch(() => undefined);

  console.log('=== Page 1: q="saree" (no cursor) ===');
  const raw1 = await sdk.callToolRaw('kapruka_search_products', { q: 'saree' });
  console.log('RAW:', raw1.slice(0, 2500));

  let parsed1: any;
  try { parsed1 = JSON.parse(raw1); } catch { parsed1 = null; }
  console.log('\nparsed as JSON?', parsed1 !== null);
  if (parsed1) {
    console.log('total:', parsed1.total, 'products.length:', parsed1.products?.length);
    console.log('cursor-like fields present:', Object.keys(parsed1));
  }
  const cursorMatch = raw1.match(/cursor="([^"]+)"/) ?? raw1.match(/"nextCursor"\s*:\s*"([^"]+)"/);
  console.log('cursor found in raw text:', cursorMatch ? cursorMatch[1] : '(none)');

  if (cursorMatch) {
    console.log('\n=== Page 2: q="saree" + cursor from page 1 ===');
    const raw2 = await sdk.callToolRaw('kapruka_search_products', { q: 'saree', cursor: cursorMatch[1] });
    console.log('RAW:', raw2.slice(0, 2500));
  } else {
    console.log('\n=== No cursor found — trying explicit limit + cursor="1" / "2" guesses anyway ===');
    for (const guess of ['1', '2', '10', 'page2']) {
      const rawGuess = await sdk.callToolRaw('kapruka_search_products', { q: 'saree', cursor: guess });
      console.log(`\ncursor="${guess}" ->`, rawGuess.slice(0, 400));
    }
  }

  await sdk.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
