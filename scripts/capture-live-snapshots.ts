import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { KaprukaLocal } from 'kapruka-mcp/local';
import { MemoryStorage } from 'kapruka-mcp/storage';
import { TOOL_NAMES } from 'kapruka-mcp';
import type { Product } from 'kapruka-mcp';

const TOOL_TIMEOUT_MS = 20_000;
const FIXTURES_DIR = path.join(process.cwd(), 'fixtures');

interface SearchResult {
  products: Product[];
  total: number;
  query: string;
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

function throwIfErrorPayload(value: unknown): void {
  if (isRecord(value) && typeof value.error === 'string') {
    const suggestion = typeof value.suggestion === 'string' ? ` Suggestion: ${value.suggestion}` : '';
    throw new Error(`${value.error}${suggestion}`);
  }
}

async function createLiveClient(): Promise<Client> {
  const local = new KaprukaLocal({ mock: false, storage: new MemoryStorage() });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

  await local.getServer().connect(serverTransport);

  const client = new Client({ name: 'kapruka-live-snapshot-capture', version: '0.1.0' });
  await client.connect(clientTransport);

  return client;
}

async function saveFixture(filename: string, data: unknown): Promise<void> {
  const filePath = path.join(FIXTURES_DIR, filename);
  await writeFile(filePath, JSON.stringify(data, null, 2));

  const keyCount = isRecord(data) ? Object.keys(data).length : Array.isArray(data) ? data.length : 0;
  console.log(`Saved ${filename} (${keyCount} keys)`);
}

async function run(): Promise<void> {
  const client = await createLiveClient();

  async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await client.callTool(
      { name, arguments: args },
      undefined,
      { signal: AbortSignal.timeout(TOOL_TIMEOUT_MS) },
    );
    const text = extractToolText(result);
    const parsed: unknown = JSON.parse(text);

    throwIfErrorPayload(parsed);
    return parsed as T;
  }

  await mkdir(FIXTURES_DIR, { recursive: true });

  // The first tool call on a cold live connection always fails (the SDK's
  // isOfficialServer detection runs before connect() completes) — absorb
  // that failure here so it doesn't consume a real fixture capture.
  await callTool<SearchResult>(TOOL_NAMES.search_products, { q: 'cake' }).catch(() => undefined);

  const rosesSearch = await callTool<SearchResult>(TOOL_NAMES.search_products, { q: 'roses' });
  await saveFixture('live-search-roses.json', rosesSearch);

  const cakesSearch = await callTool<SearchResult>(TOOL_NAMES.search_products, { q: 'cakes' });
  await saveFixture('live-search-cakes.json', cakesSearch);

  const categories = await callTool<unknown>(TOOL_NAMES.list_categories, {});
  await saveFixture('live-categories.json', categories);

  const cities = await callTool<unknown>(TOOL_NAMES.list_delivery_cities, {});
  await saveFixture('live-cities.json', cities);

  const firstProductId = rosesSearch.products[0]?.id;
  if (!firstProductId) throw new Error('no product ID available from searchProducts("roses")');

  const product = await callTool<Product>(TOOL_NAMES.get_product, { product_id: firstProductId });
  await saveFixture('live-product.json', product);
}

run()
  .catch((err: unknown) => {
    console.error('Snapshot capture crashed:', errorMessage(err));
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
