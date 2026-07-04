import { KaprukaSDK } from 'kapruka-mcp';

async function getProduct(sdk: KaprukaSDK, productId: string): Promise<void> {
  console.log(`\n--- get_product(${productId}) ---`);
  const raw = await sdk.callToolRaw('kapruka_get_product', { product_id: productId });
  console.log('RAW (first 1200 chars):', raw.slice(0, 1200));
  try {
    const parsed = JSON.parse(raw);
    console.log('parsed.category:', JSON.stringify(parsed.category));
  } catch {
    const m = raw.match(/\*\*Category\*\*:\s*(.+)/i);
    console.log('category (from markdown, if present):', m ? JSON.stringify(m[1].trim()) : '(no Category field in markdown)');
  }
}

async function searchWithCategory(sdk: KaprukaSDK, label: string, category: string, q?: string): Promise<void> {
  console.log(`\n--- search: category="${category}"${q ? `, q="${q}"` : ' (no q)'} — ${label} ---`);
  const args: Record<string, unknown> = { category };
  if (q) args.q = q;
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

  console.log('='.repeat(70));
  console.log('STEP 1+2: Sarees');
  console.log('='.repeat(70));
  await getProduct(sdk, 'CLOTHING07968'); // Maroon Batik Saree With White Floral Saree
  await searchWithCategory(sdk, 'no q, isolate the filter', 'ef'); // guess based on raw.category seen earlier ("ef")
  await searchWithCategory(sdk, 'broad q', 'ef', 'saree');

  console.log('\n' + '='.repeat(70));
  console.log('STEP 3: Breadth check — Mens Clothing');
  console.log('='.repeat(70));
  // Need a real product id first — search then pick one.
  const mensSearchRaw = await sdk.callToolRaw('kapruka_search_products', { q: 'mens clothing' });
  console.log('\nmens clothing search RAW (first 700 chars):', mensSearchRaw.slice(0, 700));
  const idMatch = mensSearchRaw.match(/ID: `([^`]+)`/);
  if (idMatch) {
    const productId = idMatch[1];
    await getProduct(sdk, productId);
  }

  console.log('\n' + '='.repeat(70));
  console.log('STEP 3b: Breadth check — Books');
  console.log('='.repeat(70));
  const booksSearchRaw = await sdk.callToolRaw('kapruka_search_products', { q: 'books' });
  const idMatch2 = booksSearchRaw.match(/ID: `([^`]+)`/);
  if (idMatch2) {
    await getProduct(sdk, idMatch2[1]);
  }

  await sdk.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
