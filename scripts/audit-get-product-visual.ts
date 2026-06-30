import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { KaprukaLocal } from 'kapruka-mcp/local';
import { MemoryStorage } from 'kapruka-mcp/storage';
import { TOOL_NAMES } from 'kapruka-mcp';
import type { SearchResult } from 'kapruka-mcp';

const TOOL_TIMEOUT_MS = 20_000;
const FIXTURES_DIR = path.join(process.cwd(), 'fixtures', 'raw');

// Same private-field workaround as audit-tool-outputs.ts / audit-final-gaps.ts —
// callToolRaw is marked private in KaprukaSDK's shipped .d.ts but is a plain
// property at runtime.
interface SdkRawAccess {
  callToolRaw(name: string, args: Record<string, unknown>): Promise<string>;
  searchProducts(q: string, category?: string): Promise<SearchResult>;
}

interface CategorySample {
  category: string;
  productId: string;
  rawText: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries on "Rate limit exceeded" with backoff — the live server's 60 req/min limit is shared across every audit script run today. */
async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delaysMs = [3_000, 8_000, 15_000];
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = errorMessage(err).toLowerCase().includes('rate limit');
      if (!isRateLimit || attempt === delaysMs.length) throw err;
      console.log(`    rate limited, retrying in ${delaysMs[attempt] / 1000}s...`);
      await delay(delaysMs[attempt]);
    }
  }
  throw new Error('unreachable');
}

async function createLiveClient(): Promise<{ client: Client; local: KaprukaLocal }> {
  const local = new KaprukaLocal({ mock: false, storage: new MemoryStorage() });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

  await local.getServer().connect(serverTransport);

  const client = new Client({ name: 'kapruka-visual-description-audit', version: '0.1.0' });
  await client.connect(clientTransport);

  return { client, local };
}

/** Every `**Label**:` or `**Label**` markdown field found, in order of appearance. */
function extractLabels(text: string): string[] {
  const matches = text.matchAll(/\*\*([A-Za-z][A-Za-z\s]*)\*\*:?/g);
  const labels: string[] = [];
  for (const m of matches) labels.push(m[1].trim());
  return labels;
}

/** The free-text paragraph between the metadata fields and the "**Image**" line, same boundary the real parser uses. */
function extractDescription(text: string): string | null {
  const match = text.match(/\n\n([^\n*]+)\n\n\*\*Image\*\*/);
  return match ? match[1].trim() : null;
}

/** Whatever markdown content exists AFTER the "**Image**" line — the parser never reads this far. */
function extractContentAfterImage(text: string): string | null {
  const imageLineMatch = text.match(/\*\*Image\*\*:\s*\S+/);
  if (!imageLineMatch) return null;
  const idx = text.indexOf(imageLineMatch[0]) + imageLineMatch[0].length;
  const rest = text.slice(idx).trim();
  return rest.length > 0 ? rest : null;
}

const VISUAL_KEYWORDS = [
  'colou?r', 'shade', 'texture', 'material', 'fabric', 'pattern', 'design',
  'shape', 'size', 'finish', 'glossy', 'matte', 'shiny', 'fragrance', 'scent',
  'presentation', 'packaging', 'wrap', 'ribbon', 'box', 'arrangement',
  'bouquet', 'display', 'style', 'elegant', 'vibrant', 'soft', 'smooth',
];
const visualKeywordRegex = new RegExp(`\\b(${VISUAL_KEYWORDS.join('|')})\\b`, 'gi');

function findVisualKeywordHits(text: string): string[] {
  const matches = text.matchAll(visualKeywordRegex);
  const hits = new Set<string>();
  for (const m of matches) hits.add(m[0].toLowerCase());
  return Array.from(hits);
}

async function findProductId(sdk: SdkRawAccess, query: string): Promise<string> {
  const result = await withRateLimitRetry(() => sdk.searchProducts(query));
  const id = result.products[0]?.id;
  if (!id) throw new Error(`no product ID found for search("${query}")`);
  return id;
}

async function run(): Promise<void> {
  const { client, local } = await createLiveClient();
  const sdk = (local as unknown as { sdk: SdkRawAccess }).sdk;

  await mkdir(FIXTURES_DIR, { recursive: true });

  // Absorb the documented cold-start failure before any real capture.
  await client
    .callTool(
      { name: TOOL_NAMES.search_products, arguments: { q: 'cake' } },
      undefined,
      { signal: AbortSignal.timeout(TOOL_TIMEOUT_MS) },
    )
    .catch(() => undefined);

  console.log('Finding product IDs for each category...');

  const categoryQueries: Array<{ category: string; query: string | null; productId?: string }> = [
    { category: 'flowers', query: null, productId: 'flowers00T1875' }, // already known from earlier audit
    { category: 'cakes', query: 'cake' },
    { category: 'electronics', query: 'phone' },
    { category: 'books', query: 'book' },
    { category: 'grocery', query: 'tea' },
  ];

  const targets: Array<{ category: string; productId: string }> = [];
  for (const c of categoryQueries) {
    const productId = c.productId ?? (await findProductId(sdk, c.query as string));
    targets.push({ category: c.category, productId });
    console.log(`  ${c.category}: ${productId}`);
    await delay(1_500); // pace requests against the 60 req/min live rate limit
  }

  const samples: CategorySample[] = [];

  console.log('\nCapturing raw get_product markdown for each...');
  for (const target of targets) {
    const rawText = await withRateLimitRetry(() =>
      sdk.callToolRaw(TOOL_NAMES.get_product, { product_id: target.productId }),
    );
    await writeFile(path.join(FIXTURES_DIR, `get-product-${target.category}.raw.txt`), rawText);
    samples.push({ category: target.category, productId: target.productId, rawText });
    console.log(`  saved get-product-${target.category}.raw.txt (${rawText.length} chars)`);
    await delay(1_500);
  }

  console.log('\nBuilding analysis...');

  const sections = samples.map((sample) => {
    const labels = extractLabels(sample.rawText);
    const description = extractDescription(sample.rawText);
    const afterImage = extractContentAfterImage(sample.rawText);
    const keywordHits = findVisualKeywordHits(sample.rawText);

    return `## ${sample.category} (\`${sample.productId}\`)

### Full raw markdown
\`\`\`
${sample.rawText}
\`\`\`

### Every distinct markdown label found
${labels.length > 0 ? labels.map((l) => `- **${l}**`).join('\n') : '(none found)'}

### Main description paragraph
${description ? description : '(no paragraph found between metadata and the **Image** line)'}

### Content after the **Image** line (parser never reads this far)
${afterImage ? `\`\`\`\n${afterImage}\n\`\`\`` : '(nothing — the Image line is the last content in the response)'}

### Visual-content keyword hits (color/material/texture/presentation words)
${keywordHits.length > 0 ? keywordHits.join(', ') : '(none found)'}
`;
  });

  const doc = `# Visual Description Analysis — get_product across 5 categories

> Captured by \`scripts/audit-get-product-visual.ts\` against the live server.
> Goal: determine whether any real visual-description content (colors, materials,
> textures, presentation) exists anywhere in \`kapruka_get_product\`'s raw response,
> in any field the current SDK parser (\`parseProductDetails\` in
> \`kapruka-mcp/dist/sdk/markdown-parser.js\`) might be discarding.

${sections.join('\n---\n\n')}

---

## Conclusion

TODO — fill in after reading the captures above. Pick one:
- "Visual description content exists in field X, parser ignores it" (name the field)
- "Visual description content is embedded in the main description field"
- "Live server doesn't return any visual description text in get_product"
`;

  await writeFile(path.join(FIXTURES_DIR, 'visual-description-analysis.md'), doc);
  console.log(`\nSaved fixtures/raw/visual-description-analysis.md (${samples.length} products analyzed)`);
}

run()
  .catch((err: unknown) => {
    console.error('Visual description audit crashed:', errorMessage(err));
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
