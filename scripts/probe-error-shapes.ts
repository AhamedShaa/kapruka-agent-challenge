// Probes the live server's raw error shapes for three failure cases, bypassing
// the adapter's own client-side normalization (normalizeDateToISO, etc.) so we
// see exactly what the live MCP tool returns, not what KaprukaAdapter turns it into.
// Run: npx tsx scripts/probe-error-shapes.ts

import { KaprukaLocal } from 'kapruka-mcp/local';
import { MemoryStorage } from 'kapruka-mcp/storage';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TOOL_NAMES } from 'kapruka-mcp';

const REAL_PRODUCT_ID = 'CAKE00KA001865';

async function makeClient(): Promise<Client> {
  const storage = new MemoryStorage();
  const local = new KaprukaLocal({ mock: false, storage });
  const [srvT, cliT] = InMemoryTransport.createLinkedPair();
  await local.getServer().connect(srvT);
  const client = new Client({ name: 'probe-error-shapes', version: '0.0.1' });
  await client.connect(cliT);
  return client;
}

async function call(client: Client, label: string, name: string, args: Record<string, unknown>): Promise<void> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`=== ${label}`);
  console.log('='.repeat(70));
  console.log('tool:', name);
  console.log('args:', JSON.stringify(args));
  try {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as Array<{ text?: string; type?: string }>;
    const text = content[0]?.text ?? '(no text content)';
    console.log('isError:', result.isError);
    console.log('RAW TEXT:');
    console.log(text);
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed.error) console.log('\nparsed.error:', JSON.stringify(parsed.error));
      if (parsed.suggestion) console.log('parsed.suggestion:', JSON.stringify(parsed.suggestion));
      if (parsed.code) console.log('parsed.code:', JSON.stringify(parsed.code));
    } catch {
      console.log('(response is not JSON)');
    }
  } catch (e) {
    console.log('THREW (client-level):', e instanceof Error ? e.message : String(e));
  }
}

async function main(): Promise<void> {
  const client = await makeClient();

  // Warm-up call — first call on a cold live connection always fails per
  // existing probes' documented pattern; absorb it here.
  await client.callTool({ name: TOOL_NAMES.search_products, arguments: { q: 'cake' } }).catch(() => undefined);

  // 1. Invalid city name via check_delivery.
  await call(client, '1 — checkDelivery with invalid city "Nowhereville"', TOOL_NAMES.check_delivery, {
    city: 'Nowhereville',
    product_id: REAL_PRODUCT_ID,
    date: '2026-07-10',
  });

  // 2. Malformed date via create_order (KaprukaLocal schema: recipient carries address+city).
  await call(client, '2 — createOrder with malformed date "2026-13-45"', TOOL_NAMES.create_order, {
    cart: [{ product_id: REAL_PRODUCT_ID, quantity: 1 }],
    recipient: {
      name: 'Amara Perera',
      phone: '0771234567',
      address: '42 Galle Road',
      city: 'Colombo 03',
    },
    delivery: { date: '2026-13-45' },
    sender: { name: 'Rithik', phone: '0779999999' },
  });

  // 3. Nonexistent product id via create_order.
  await call(client, '3 — createOrder with nonexistent product ID', TOOL_NAMES.create_order, {
    cart: [{ product_id: 'NONEXISTENT-PRODUCT-ID-XYZ', quantity: 1 }],
    recipient: {
      name: 'Amara Perera',
      phone: '0771234567',
      address: '42 Galle Road',
      city: 'Colombo 03',
    },
    delivery: { date: '2026-07-10' },
    sender: { name: 'Rithik', phone: '0779999999' },
  });

  console.log('\n' + '='.repeat(70));
  console.log('PROBE COMPLETE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
