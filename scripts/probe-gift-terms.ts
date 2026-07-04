import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { KaprukaLocal } from 'kapruka-mcp/local';
import { MemoryStorage } from 'kapruka-mcp/storage';
import { TOOL_NAMES } from 'kapruka-mcp';
import type { Product } from 'kapruka-mcp';

const TOOL_TIMEOUT_MS = 20_000;

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
  const client = new Client({ name: 'kapruka-gift-probe', version: '0.1.0' });
  await client.connect(clientTransport);
  return client;
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

  // Cold-connection warm-up call absorbed, matching test-live-search.ts pattern.
  await callTool<SearchResult>(TOOL_NAMES.search_products, { q: 'cake' }).catch(() => undefined);

  const queries = ['gifts', 'gift', 'gift box', 'hamper', 'gift hamper'];

  for (const query of queries) {
    try {
      const result = await callTool<SearchResult>(TOOL_NAMES.search_products, { q: query });
      console.log(`"${query}" -> ${result.products.length} result(s)`);
      for (const p of result.products.slice(0, 5)) {
        console.log(`    - ${p.name} [${p.category}]`);
      }
    } catch (err) {
      console.log(`"${query}" -> ERROR: ${errorMessage(err)}`);
    }
  }
}

run()
  .catch((err: unknown) => {
    console.error('Probe crashed:', errorMessage(err));
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
