// scripts/probe-create-order-4.ts
// Tests the ADAPTER-IDENTICAL path: KaprukaLocal + InMemoryTransport + Client.
// Unlike probe-3 (which hits the live server directly via KaprukaSDK.callToolRaw),
// this probe shows what orderId/checkoutUrl look like when they arrive at the
// adapter layer — confirming whether raw markdown is preserved or lost.
//
// Run: npx tsx scripts/probe-create-order-4.ts

import { KaprukaLocal } from 'kapruka-mcp/local';
import { MemoryStorage } from 'kapruka-mcp/storage';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const ID = 'CAKE00KA001865';

async function makeClient(): Promise<Client> {
  const storage = new MemoryStorage();
  const local = new KaprukaLocal({ mock: false, storage });
  const [srvT, cliT] = InMemoryTransport.createLinkedPair();
  await local.getServer().connect(srvT);
  const client = new Client({ name: 'probe-4', version: '0.0.1' });
  await client.connect(cliT);
  return client;
}

async function call(client: Client, label: string, args: Record<string, unknown>): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== ${label}`);
  console.log('='.repeat(60));
  try {
    const result = await client.callTool({ name: 'kapruka_create_order', arguments: args });
    const content = result.content as Array<{ text?: string; type?: string }>;
    const text = content[0]?.text ?? '(no text content)';
    console.log('isError:', result.isError);
    console.log('RAW MCP TEXT (first 600 chars):');
    console.log(text.slice(0, 600));

    // Try to parse as JSON and highlight key fields
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      console.log('\nPARSED FIELDS:');
      console.log('  orderId:      ', JSON.stringify(parsed.orderId));
      console.log('  checkoutUrl:  ', JSON.stringify(parsed.checkoutUrl));
      console.log('  total:        ', JSON.stringify(parsed.total));
      console.log('  _rawMarkdown: ', parsed._rawMarkdown ? `(${String(parsed._rawMarkdown).length} chars)` : 'MISSING');
      if (parsed.error) {
        console.log('  error:        ', JSON.stringify(parsed.error));
      }
    } catch {
      console.log('(response is not JSON)');
    }
  } catch (e) {
    console.log('THREW:', e instanceof Error ? e.message : String(e));
  }
}

async function main(): Promise<void> {
  console.log('Probe 4: KaprukaLocal + InMemoryTransport (adapter-identical path)');
  console.log('Product ID:', ID);

  const client = await makeClient();

  // Format A: matches KaprukaLocal's Zod schema
  // (address/city under recipient, phone under sender)
  await call(client, 'A — KaprukaLocal schema format', {
    cart: [{ product_id: ID, quantity: 1 }],
    recipient: {
      name: 'Amara Perera',
      phone: '0771234567',
      address: '42 Galle Road',
      city: 'Colombo 03',
    },
    delivery: { date: '2026-07-10' },
    sender: { name: 'Rithik', phone: '0779999999' },
  });

  // Format B: what the adapter currently sends in live mode
  // (address/city rearranged to match live server — but fails KaprukaLocal Zod)
  await call(client, 'B — live-server rearranged format (current adapter code)', {
    cart: [{ product_id: ID, quantity: 1 }],
    recipient: { name: 'Amara Perera', phone: '0771234567' },
    delivery: { date: '2026-07-10', city: 'Colombo 03', address: '42 Galle Road' },
    sender: { name: 'Rithik' },
  });

  console.log('\n' + '='.repeat(60));
  console.log('PROBE COMPLETE');
  console.log('='.repeat(60));
  console.log('Expected:');
  console.log('  A: passes Zod, but orderId="" checkoutUrl="" (vendor parser fails silently)');
  console.log('  B: fails Zod, returns error JSON (never reaches live server)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
