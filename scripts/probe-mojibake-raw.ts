import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { KaprukaLocal } from 'kapruka-mcp/local';
import { MemoryStorage } from 'kapruka-mcp/storage';
import { TOOL_NAMES } from 'kapruka-mcp';
import type { Product } from 'kapruka-mcp';

interface SearchResult { products: Product[]; total: number; query: string; }
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null; }
function extractToolText(result: unknown): string {
  if (isRecord(result) && Array.isArray(result.content) && result.content.length > 0 &&
      isRecord(result.content[0]) && typeof result.content[0].text === 'string') {
    return result.content[0].text;
  }
  return JSON.stringify(result);
}

async function createLiveClient(): Promise<Client> {
  const local = new KaprukaLocal({ mock: false, storage: new MemoryStorage() });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await local.getServer().connect(serverTransport);
  const client = new Client({ name: 'kapruka-mojibake-raw', version: '0.1.0' });
  await client.connect(clientTransport);
  return client;
}

async function run(): Promise<void> {
  const client = await createLiveClient();
  async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await client.callTool({ name, arguments: args }, undefined, { signal: AbortSignal.timeout(20000) });
    return JSON.parse(extractToolText(result)) as T;
  }
  await callTool<SearchResult>(TOOL_NAMES.search_products, { q: 'cake' }).catch(() => undefined);

  const result = await callTool<SearchResult>(TOOL_NAMES.search_products, { q: 'gift box' });
  const target = result.products.find((p) => /#\d+;/.test(p.name ?? ''));
  if (!target) {
    console.log('NOT_FOUND');
    return;
  }
  process.stdout.write('RAW_JSON_STRINGIFY:' + JSON.stringify(target.name) + '\n');
}

run().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
