/**
 * Audit probe — read-only, no code changes.
 * Shows: raw MCP markdown, normalized NormalizedProduct, reconstructed LLM tool-message
 * for 3 products across different categories.
 * Run from repo root: COMMERCE_MODE=live npx tsx <this-file>
 */
import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
process.env.COMMERCE_MODE = 'live';

import { KaprukaSDK } from '../node_modules/kapruka-mcp/dist/sdk/client.js';
import { getAdapter } from '../src/adapters/index.js';
import type { NormalizedProduct } from '../src/adapters/normalizers/types.js';

function formatPrice(p: number | null): string {
  return p !== null ? `LKR ${p}` : 'price unavailable';
}

/** Reconstruct what tools.ts#searchProducts puts in the tool-message for one product */
function makeLlmSearchMsg(p: NormalizedProduct, query: string): string {
  const summary = `${p.name ?? 'Unnamed item'} — ${formatPrice(p.price)} (id: ${p.id})`;
  return `Found 1 results for "${query}": ${summary}. Ask which one they'd like or offer to check delivery.`;
}

/** Reconstruct what tools.ts#getProduct puts in the tool-message */
function makeLlmGetProductMsg(p: NormalizedProduct): string {
  const description = p.description ? `${p.description.slice(0, 80)}. ` : '';
  const vendorPart  = p.vendor ? ` Vendor: ${p.vendor}.` : '';
  const weightPart  = p.weight ? ` Weight: ${p.weight}.` : '';
  const urlPart     = p.product_url ? ` View more details [here](${p.product_url}).` : '';
  return `${p.name ?? 'Unnamed item'} — ${formatPrice(p.price)}. ${description}In stock: ${p.in_stock ? 'yes' : 'no'}.${vendorPart}${weightPart}${urlPart}`;
}

/** Extract the first product ID from a search raw markdown response.
 *  The live API uses backtick IDs (`CAKE001`) but sometimes lowercase too. */
function firstId(raw: string): string | null {
  // Try backtick format first (most common)
  const m1 = raw.match(/`([A-Za-z0-9_]+)`/);   // IDs can contain underscores
  if (m1) return m1[1].toUpperCase();
  // Fallback: ID: XXXXX without backticks
  const m2 = raw.match(/\bID:\s+([A-Z0-9]+)/i);
  if (m2) return m2[1].toUpperCase();
  // Fallback: kid/ URL segment
  const m3 = raw.match(/\/kid\/([a-z0-9]+)/i);
  if (m3) return m3[1].toUpperCase();
  return null;
}

/** Pull the product block for a given id out of search markdown */
function searchBlock(raw: string, id: string): string {
  const blocks = raw.split(/\n(?=\*\*\d+\.)/);
  const hit = blocks.find(b => b.includes(id));
  return hit?.trim() ?? '(block not found)';
}

const SEP  = '═'.repeat(72);
const SUB  = '─'.repeat(60);

function pad(s: string, n: number): string { return String(s ?? '').slice(0, n - 1).padEnd(n); }

function printTable(rows: Array<{ field: string; raw: string; normalized: string; inLlm: string }>): void {
  const w = [22, 24, 24, 28];
  const hdr = ['Field', 'Raw markdown', 'Normalized', 'In LLM context'];
  console.log(hdr.map((h, i) => pad(h, w[i])).join(' | '));
  console.log(w.map(n => '-'.repeat(n)).join('-|-'));
  for (const r of rows) {
    console.log([pad(r.field, w[0]), pad(r.raw, w[1]), pad(r.normalized, w[2]), pad(r.inLlm, w[3])].join(' | '));
  }
}

async function main(): Promise<void> {
  const sdk = new KaprukaSDK();
  await sdk.connect();
  const adapter = await getAdapter();

  // warm-up
  try { await sdk.callToolRaw('kapruka_search_products', { q: 'cake' }); } catch {}

  // Second warm-up attempt — first always fails on cold connect
  try { await sdk.callToolRaw('kapruka_search_products', { q: 'flowers' }); } catch {}

  const queries: Array<[string, string]> = [
    ['chocolate cake',     'Cake'],
    ['chocolate gift box', 'Gift pack'],
    ['bluetooth speaker',  'Electronics'],
  ];

  for (const [query, label] of queries) {
    console.log(`\n${SEP}`);
    console.log(`PRODUCT CATEGORY: ${label}   query="${query}"`);
    console.log(SEP);

    // ── LAYER 1: Raw MCP responses ──────────────────────────────────────
    console.log('\n── LAYER 1A: RAW kapruka_search_products ──\n');
    let rawSearch: string;
    try {
      rawSearch = await sdk.callToolRaw('kapruka_search_products', { q: query, limit: 3 });
    } catch (e) {
      console.log('FAILED:', e); continue;
    }

    const id = firstId(rawSearch);
    if (!id) {
      console.log('No product ID found in search response. Full raw search text:');
      console.log(rawSearch);
      continue;
    }
    console.log(`First product ID extracted: ${id}`);
    console.log('\nRelevant search block:');
    console.log(searchBlock(rawSearch, id));

    console.log(`\n── LAYER 1B: RAW kapruka_get_product (id: ${id}) ──\n`);
    let rawGetProduct: string;
    try {
      rawGetProduct = await sdk.callToolRaw('kapruka_get_product', { product_id: id });
    } catch (e) {
      console.log('FAILED:', e); continue;
    }
    console.log(rawGetProduct);

    // ── LAYER 2: Normalized output ──────────────────────────────────────
    console.log(`\n── LAYER 2A: NORMALIZED via adapter.search() (search path) ──\n`);
    let searchNormalized: NormalizedProduct | null = null;
    try {
      const searchResult = await adapter.search(query, undefined, { limit: 3 });
      searchNormalized = searchResult.products.find(p => p.id === id) ?? searchResult.products[0] ?? null;
      console.log(JSON.stringify(searchNormalized, null, 2));
    } catch (e) {
      console.log('FAILED:', e);
    }

    console.log(`\n── LAYER 2B: NORMALIZED via adapter.getProduct() (get_product path) ──\n`);
    let gpNormalized: NormalizedProduct | null = null;
    try {
      gpNormalized = await adapter.getProduct(id);
      console.log(JSON.stringify(gpNormalized, null, 2));
    } catch (e) {
      console.log('FAILED:', e);
    }

    // ── LAYER 3: LLM context strings ───────────────────────────────────
    console.log('\n── LAYER 3A: LLM tool-message content (searchProducts) ──\n');
    if (searchNormalized) {
      const msg = makeLlmSearchMsg(searchNormalized, query);
      console.log(msg);
    } else {
      console.log('(no search normalized data)');
    }

    console.log('\n── LAYER 3B: LLM tool-message content (getProduct) ──\n');
    if (gpNormalized) {
      const msg = makeLlmGetProductMsg(gpNormalized);
      console.log(msg);
    } else {
      console.log('(no get_product normalized data)');
    }

    // ── LAYER 4: Field comparison table ────────────────────────────────
    console.log(`\n── LAYER 4: FIELD COMPARISON TABLE ──\n`);
    if (!gpNormalized) { console.log('(skipped — no normalized data)'); continue; }

    // Extract specific fields from raw markdown for comparison
    const rawVendorLine  = rawGetProduct.match(/\*\*Vendor\*\*:\s*(.+)/)?.[1]?.trim()  ?? '(not in markdown)';
    const rawWeightLine  = rawGetProduct.match(/\*\*Weight\*\*:\s*(.+)/)?.[1]?.trim()  ?? '(not in markdown)';
    const rawImgLine     = rawGetProduct.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/)?.[1]?.slice(0, 30) + '…' ?? '(none)';
    const rawNameLine    = rawGetProduct.match(/\*\*(.+?)\*\*/)?.[1]?.trim() ?? '(not found)';
    const rawPriceLine   = rawGetProduct.match(/LKR\s*([\d,]+)/)?.[0] ?? '(not found)';
    const rawDescLine    = rawGetProduct.match(/\*\*Description\*\*:\s*(.+)/)?.[1]?.slice(0, 20) + '…' ?? '(not found)';
    const rawCatLine     = rawGetProduct.match(/\*\*Category\*\*:\s*(.+)/)?.[1]?.trim() ?? '(not in markdown)';
    const rawStockLine   = rawGetProduct.match(/\*\*In Stock\*\*:\s*(.+)/)?.[1]?.trim()
                         ?? rawGetProduct.match(/in.stock[:\s]+(\w+)/i)?.[1] ?? '(check raw)';
    const rawUrlLine     = rawGetProduct.match(/\[View on Kapruka\]\((https?:\/\/[^)]+)\)/)?.[1]?.slice(0, 25) + '…' ?? '(not found)';
    const rawVisualLine  = rawGetProduct.match(/\*\*Visual Description\*\*:\s*(.+)/)?.[1]?.slice(0, 20) + '…'
                         ?? '(not a labeled field)';

    // Check LLM messages
    const llmGP = gpNormalized ? makeLlmGetProductMsg(gpNormalized) : '';
    const inLlm = (val: string | null | undefined, key: string): string => {
      if (!val) return 'null → absent';
      return llmGP.includes(val) ? `✓ "${val.slice(0, 18)}…"` : `✗ (value not in msg)`;
    };

    printTable([
      { field: 'name',
        raw: rawNameLine.slice(0, 22),
        normalized: (gpNormalized.name ?? 'null').slice(0, 22),
        inLlm: gpNormalized.name ? '✓ first token in msg' : '✗ absent' },
      { field: 'price',
        raw: rawPriceLine,
        normalized: `${gpNormalized.price ?? 'null'}`,
        inLlm: gpNormalized.price ? '✓ present' : '✗ absent' },
      { field: 'image_url',
        raw: rawImgLine,
        normalized: gpNormalized.image_url ? gpNormalized.image_url.slice(0, 22) + '…' : 'null',
        inLlm: '✗ UI-only, not in LLM msg' },
      { field: 'category',
        raw: rawCatLine,
        normalized: gpNormalized.category ?? 'null',
        inLlm: '✗ not included in getProduct msg' },
      { field: 'description',
        raw: rawDescLine,
        normalized: gpNormalized.description ? gpNormalized.description.slice(0, 22) + '…' : 'null',
        inLlm: gpNormalized.description ? '✓ first 80 chars' : 'null → absent' },
      { field: 'visual_description',
        raw: rawVisualLine,
        normalized: 'null (Decision A: always dropped)',
        inLlm: '✗ always dropped' },
      { field: 'vendor',
        raw: rawVendorLine,
        normalized: gpNormalized.vendor ?? 'null',
        inLlm: gpNormalized.vendor ? '✓ "Vendor: X"' : 'null → absent' },
      { field: 'weight',
        raw: rawWeightLine,
        normalized: gpNormalized.weight ?? 'null',
        inLlm: gpNormalized.weight ? '✓ "Weight: X"' : 'null → absent' },
      { field: 'in_stock',
        raw: rawStockLine,
        normalized: String(gpNormalized.in_stock),
        inLlm: '✓ "In stock: yes/no"' },
      { field: 'product_url',
        raw: rawUrlLine,
        normalized: gpNormalized.product_url ? gpNormalized.product_url.slice(0, 22) + '…' : 'null',
        inLlm: gpNormalized.product_url ? '✓ markdown link' : 'null → absent' },
    ]);

    // Fields present in raw but missing from normalized
    console.log('\n── LAYER 5: FIELDS PRESENT IN RAW MARKDOWN but NOT in NormalizedProduct ──\n');
    // Scan for **Bold**: patterns that aren't mapped
    const allLabels = [...rawGetProduct.matchAll(/\*\*([^*]+)\*\*:/g)].map(m => m[1].trim());
    const mappedLabels = new Set(['Vendor', 'Weight', 'Category', 'In Stock', 'Description', 'Visual Description']);
    // Name and Price aren't labeled with ** in the markdown — they're structural
    const unmapped = allLabels.filter(l => !mappedLabels.has(l));
    if (unmapped.length === 0) {
      console.log('All **Label**: fields are either mapped or intentionally dropped.');
    } else {
      console.log('Unmapped **Label**: fields found in raw:');
      for (const l of unmapped) {
        const lineMatch = rawGetProduct.match(new RegExp(`\\*\\*${l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*:\\s*(.+)`));
        console.log(`  • **${l}**: ${lineMatch?.[1]?.trim().slice(0, 60) ?? '(value not captured)'}`);
      }
    }
  }

  await sdk.disconnect();
  console.log('\n\n══ AUDIT COMPLETE ══\n');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
