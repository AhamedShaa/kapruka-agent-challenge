import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { KaprukaLocal } from 'kapruka-mcp/local';
import { MemoryStorage } from 'kapruka-mcp/storage';
import { TOOL_NAMES } from 'kapruka-mcp';
import type { Product, SearchResult, Category, DeliveryCity, DeliveryCheck } from 'kapruka-mcp';

const TOOL_TIMEOUT_MS = 20_000;
const FIXTURES_DIR = path.join(process.cwd(), 'fixtures', 'raw');

// `callToolRaw` and the per-tool parser methods are marked `private` in
// KaprukaSDK's shipped .d.ts, but they're plain properties at runtime — this
// interface re-declares the subset we need as public so we can reach into the
// SDK instance that KaprukaLocal already created and connected. Fragile: tied
// to kapruka-mcp's internal implementation, not its public contract.
interface SdkRawAccess {
  callToolRaw(name: string, args: Record<string, unknown>): Promise<string>;
  searchProducts(q: string, category?: string): Promise<SearchResult>;
  getProduct(product_id: string): Promise<Product>;
  listCategories(): Promise<Category[]>;
  listDeliveryCities(query?: string): Promise<DeliveryCity[]>;
  checkDelivery(city: string, product_id: string, delivery_date?: string): Promise<DeliveryCheck>;
}

interface AuditRow {
  tool: string;
  status: 'ok' | 'skipped' | 'error';
  rawChars?: number;
  parsedKeyCount?: number;
  stubFields?: string[];
  detail?: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractToolText(result: unknown): string {
  if (
    isRecord(result) &&
    Array.isArray(result.content) &&
    result.content.length > 0 &&
    isRecord(result.content[0]) &&
    typeof result.content[0].text === 'string'
  ) {
    return result.content[0].text;
  }

  return JSON.stringify(result);
}

function topLevelKeyCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isRecord(value)) return Object.keys(value).length;
  return 0;
}

/** Looks at the value itself (or its first element, for arrays) for fields that are '' or 0 — likely stubs. */
function stubFields(value: unknown): string[] {
  const target = Array.isArray(value) ? value[0] : value;
  if (!isRecord(target)) return [];
  return Object.entries(target)
    .filter(([, v]) => v === '' || v === 0)
    .map(([k]) => k);
}

async function createLiveClient(): Promise<{ client: Client; local: KaprukaLocal }> {
  const local = new KaprukaLocal({ mock: false, storage: new MemoryStorage() });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

  await local.getServer().connect(serverTransport);

  const client = new Client({ name: 'kapruka-output-audit', version: '0.1.0' });
  await client.connect(clientTransport);

  return { client, local };
}

async function saveFixture(name: string, rawText: string, parsed: unknown): Promise<void> {
  await writeFile(path.join(FIXTURES_DIR, `${name}.raw.txt`), rawText);
  await writeFile(path.join(FIXTURES_DIR, `${name}.parsed.json`), JSON.stringify(parsed, null, 2));
}

async function run(): Promise<void> {
  const { client, local } = await createLiveClient();
  const sdk = (local as unknown as { sdk: SdkRawAccess }).sdk;

  await mkdir(FIXTURES_DIR, { recursive: true });

  // The first tool call on a cold live connection always fails (the SDK's
  // isOfficialServer detection runs before connect() completes) — absorb
  // that failure here, through the same MCP path used elsewhere, before any
  // of the real audit calls below.
  await client
    .callTool(
      { name: TOOL_NAMES.search_products, arguments: { q: 'cake' } },
      undefined,
      { signal: AbortSignal.timeout(TOOL_TIMEOUT_MS) },
    )
    .catch(() => undefined);

  const rows: AuditRow[] = [];

  async function audit(
    tool: string,
    fixtureName: string,
    args: Record<string, unknown>,
    parse: () => Promise<unknown>,
  ): Promise<unknown> {
    try {
      const rawText = await sdk.callToolRaw(tool, args);
      const parsed = await parse();

      await saveFixture(fixtureName, rawText, parsed);

      rows.push({
        tool,
        status: 'ok',
        rawChars: rawText.length,
        parsedKeyCount: topLevelKeyCount(parsed),
        stubFields: stubFields(parsed),
      });

      return parsed;
    } catch (err) {
      rows.push({ tool, status: 'error', detail: errorMessage(err) });
      return undefined;
    }
  }

  const search = (await audit(
    TOOL_NAMES.search_products,
    'kapruka_search_products',
    { q: 'roses' },
    () => sdk.searchProducts('roses'),
  )) as SearchResult | undefined;

  const firstProductId = search?.products[0]?.id;

  if (firstProductId) {
    await audit(
      TOOL_NAMES.get_product,
      'kapruka_get_product',
      { product_id: firstProductId },
      () => sdk.getProduct(firstProductId),
    );
  } else {
    rows.push({ tool: TOOL_NAMES.get_product, status: 'error', detail: 'no product ID available from search("roses")' });
  }

  await audit(
    TOOL_NAMES.list_categories,
    'kapruka_list_categories',
    {},
    () => sdk.listCategories(),
  );

  await audit(
    TOOL_NAMES.list_delivery_cities,
    'kapruka_list_delivery_cities',
    {},
    () => sdk.listDeliveryCities(),
  );

  if (firstProductId) {
    await audit(
      TOOL_NAMES.check_delivery,
      'kapruka_check_delivery',
      { city: 'Agalawatta', product_id: firstProductId },
      () => sdk.checkDelivery('Agalawatta', firstProductId),
    );
  } else {
    rows.push({ tool: TOOL_NAMES.check_delivery, status: 'error', detail: 'no product ID available from search("roses")' });
  }

  rows.push({ tool: TOOL_NAMES.create_order, status: 'skipped', detail: 'would create a real live order' });
  rows.push({ tool: TOOL_NAMES.track_order, status: 'skipped', detail: 'no real order to track' });

  console.log('\n=== RAW vs PARSED OUTPUT AUDIT ===\n');
  console.log(
    `${'Tool'.padEnd(28)} ${'Status'.padEnd(8)} ${'Raw chars'.padEnd(10)} ${'Parsed keys'.padEnd(12)} Stub fields`,
  );
  for (const row of rows) {
    if (row.status === 'ok') {
      console.log(
        `${row.tool.padEnd(28)} ${row.status.padEnd(8)} ${String(row.rawChars).padEnd(10)} ${String(row.parsedKeyCount).padEnd(12)} ${row.stubFields && row.stubFields.length > 0 ? row.stubFields.join(', ') : '(none)'}`,
      );
    } else {
      console.log(`${row.tool.padEnd(28)} ${row.status.padEnd(8)} ${'-'.padEnd(10)} ${'-'.padEnd(12)} ${row.detail ?? ''}`);
    }
  }
}

run()
  .catch((err: unknown) => {
    console.error('Output audit crashed:', errorMessage(err));
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
