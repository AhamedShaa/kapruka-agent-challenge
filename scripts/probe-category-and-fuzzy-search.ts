// scripts/probe-category-and-fuzzy-search.ts
// Read-only, three-part live probe:
//   1. kapruka_list_categories depth semantics (raw call — our own SDK/local
//      wrapper hardcodes {} args, so depth can only be tested by bypassing
//      both and hitting the raw remote tool directly, same pattern as
//      scripts/probe-search-raw-filters.ts).
//   2. search_products fuzzy-matching tolerance for "batik" vs "bathik" vs
//      case/plural variants, via the real getAdapter() path (no special args
//      needed here, so the real production path applies).
//   3. category-scoped fallback for the failing "bathik" query, via raw call
//      — our own KaprukaAdapter.search() DROPS category entirely in live mode
//      (R10 fix: "live server taxonomy differs — category filtering returns 0
//      results live"), so this can only be tested by bypassing that guard too.
//
// Run: npx tsx scripts/probe-category-and-fuzzy-search.ts

import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
process.env.COMMERCE_MODE = 'live';

import { KaprukaSDK } from 'kapruka-mcp';
import { getAdapter } from '../src/adapters/index.js';

async function rawCall(sdk: KaprukaSDK, label: string, tool: string, args: Record<string, unknown>): Promise<void> {
  console.log(`\n=== ${label} ===`);
  console.log('tool:', tool, 'args:', JSON.stringify(args));
  try {
    const raw = await sdk.callToolRaw(tool, args);
    console.log('RAW:', typeof raw === 'string' ? raw.slice(0, 1500) : JSON.stringify(raw).slice(0, 1500));
  } catch (e) {
    console.log('THREW:', e instanceof Error ? e.message : String(e));
  }
}

async function main(): Promise<void> {
  const sdk = new KaprukaSDK();
  await sdk.callToolRaw('kapruka_list_categories', {}).catch(() => undefined); // warm-up

  console.log('\n' + '#'.repeat(70));
  console.log('# PART 1 — kapruka_list_categories depth semantics (raw call)');
  console.log('#'.repeat(70));
  await rawCall(sdk, '1A — depth unset', 'kapruka_list_categories', {});
  await rawCall(sdk, '1B — depth: 1', 'kapruka_list_categories', { depth: 1 });
  await rawCall(sdk, '1C — depth: 2', 'kapruka_list_categories', { depth: 2 });
  await rawCall(sdk, '1D — depth: 3', 'kapruka_list_categories', { depth: 3 });

  console.log('\n' + '#'.repeat(70));
  console.log('# PART 2 — search matching tolerance (via real getAdapter() path)');
  console.log('#'.repeat(70));
  const adapter = await getAdapter();
  for (const q of ['batik', 'bathik', 'Batik', 'batiks']) {
    const result = await adapter.search(q);
    const hasKnownProduct = result.products.some((p) => p.id === 'CLOTHING07949' || (p.name ?? '').toLowerCase().includes('batik'));
    console.log(`\nq: "${q}" -> count=${result.products.length}, knownBatikProductPresent=${hasKnownProduct}`);
    for (const p of result.products.slice(0, 5)) {
      console.log(`  - ${p.id}: ${p.name}`);
    }
  }

  console.log('\n' + '#'.repeat(70));
  console.log('# PART 3 — category-scoped fallback for failing "bathik" query (raw call)');
  console.log('#'.repeat(70));
  // Category value chosen from whatever Part 1 reveals as closest to
  // sarees/fashion/clothing — logged above; also trying the raw string
  // "fashion" per the vendor tool description's own example format.
  await rawCall(sdk, '3A — bathik + category="fashion"', 'kapruka_search_products', { q: 'bathik', category: 'fashion' });
  await rawCall(sdk, '3B — bathik + category="clothing"', 'kapruka_search_products', { q: 'bathik', category: 'clothing' });

  await sdk.disconnect();
}

main()
  .catch((e: unknown) => { console.error(e); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
