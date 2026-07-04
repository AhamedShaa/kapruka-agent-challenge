/**
 * Diagnostic probe — stock level survey. Read-only, no code changes.
 * Run: npx tsx scripts/probe-stock-survey.ts
 */
import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
process.env.COMMERCE_MODE = 'live';

import { KaprukaSDK } from '../node_modules/kapruka-mcp/dist/sdk/client.js';
import { getAdapter } from '../src/adapters/index.js';

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const sdk = new KaprukaSDK();
  await sdk.connect();
  const adapter = await getAdapter();

  // Warm-up
  try { await sdk.callToolRaw('kapruka_search_products', { q: 'cake' }); } catch { /* expected */ }
  await sleep(1000);

  // First: show one raw get_product response to understand the format
  console.log('=== RAW get_product RESPONSE (first product) ===');
  try {
    const result = await adapter.search('roses', undefined, { limit: 1 });
    if (result.products[0]) {
      const pid = result.products[0].id;
      const raw = await sdk.callToolRaw('kapruka_get_product', { product_id: pid });
      console.log(`Product ID: ${pid}`);
      console.log('--- full raw response ---');
      console.log(raw);
      console.log('--- end ---\n');
    }
  } catch (e) {
    console.log('preview failed:', e);
  }

  await sleep(2000);

  const SEARCHES: Array<{ q: string; category: string }> = [
    { q: 'roses',           category: 'Flowers'     },
    { q: 'chocolate cake',  category: 'Cakes'        },
    { q: 'samsung phone',   category: 'Electronics' },
    { q: 'rice',            category: 'Grocery'     },
    { q: 'gift hamper',     category: 'Gifts'        },
    { q: 'saree',           category: 'Fashion'      },
  ];

  const rows: Array<{ id: string; category: string; name: string; stockLine: string }> = [];

  for (const s of SEARCHES) {
    try {
      const result = await adapter.search(s.q, undefined, { limit: 3 });
      for (const p of result.products.slice(0, 3)) {
        await sleep(500);
        try {
          const raw = await sdk.callToolRaw('kapruka_get_product', { product_id: p.id });
          // Print all lines containing "stock" (case-insensitive) for discovery
          const stockLines = raw.split('\n').filter((line) => /stock/i.test(line));
          const stockLine = stockLines[0]?.trim() ?? '(no line containing "stock")';
          rows.push({ id: p.id, category: s.category, name: (p.name ?? p.id).slice(0, 38), stockLine });
        } catch (e) {
          rows.push({ id: p.id, category: s.category, name: p.name ?? p.id, stockLine: `ERROR: ${String(e).slice(0, 60)}` });
        }
      }
    } catch (e) {
      console.error(`Search failed for "${s.q}":`, e);
    }
    await sleep(1500);
  }

  console.log('\n## Part A — Stock line survey\n');
  console.log('| # | Product ID | Category | Name | Stock line (exact raw text) |');
  console.log('|---|---|---|---|---|');
  rows.forEach((r, i) => {
    console.log(`| ${i + 1} | \`${r.id}\` | ${r.category} | ${r.name} | \`${r.stockLine}\` |`);
  });

  const unique = [...new Set(rows.map((r) => r.stockLine))];
  console.log(`\nDistinct stock line values (${unique.length}):`);
  unique.forEach((v) => console.log(` - ${v}`));

  const allLow = rows.length > 0 && rows.every((r) => /in stock \(low\)/i.test(r.stockLine));
  if (allLow) {
    console.log('\n**CONCLUSION: Every product returned "In stock (low)". The (low) qualifier is noise, not signal.**');
  } else {
    console.log('\n**CONCLUSION: Mixed stock values — see distinct values above.**');
  }

  await sdk.disconnect();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
