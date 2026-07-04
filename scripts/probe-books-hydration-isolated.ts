import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
process.env.COMMERCE_MODE = 'live';
import { getAdapter } from '../src/adapters/index.js';

async function main(): Promise<void> {
  const adapter = await getAdapter();
  const result = await adapter.search('books', undefined, { limit: 10 });
  console.log(`search returned ${result.products.length} products`);
  const ids = result.products.map((p) => p.id);
  console.log('ids:', JSON.stringify(ids));

  console.log('\n--- Sequential getProduct calls (one at a time) ---');
  for (const id of ids) {
    try {
      const p = await adapter.getProduct(id);
      console.log(`  ${id}: OK, image_url=${p.image_url ? 'present' : 'MISSING'}`);
    } catch (e) {
      console.log(`  ${id}: THREW: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log('\n--- Parallel getProduct calls (Promise.allSettled, same as hydrateAndEmitProducts) ---');
  const settled = await Promise.allSettled(ids.map((id) => adapter.getProduct(id)));
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') console.log(`  ${ids[i]}: OK, image_url=${r.value.image_url ? 'present' : 'MISSING'}`);
    else console.log(`  ${ids[i]}: REJECTED: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  });
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
