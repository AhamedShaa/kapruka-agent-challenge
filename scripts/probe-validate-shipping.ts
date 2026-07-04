// scripts/probe-validate-shipping.ts
// Diagnostic probe: KaprukaLocal + InMemoryTransport in live mode, plus one
// direct SDK raw call to compare live-server validate_shipping behavior.
//
// Run: npx tsx scripts/probe-validate-shipping.ts

import { KaprukaSDK } from 'kapruka-mcp';
import { KaprukaLocal } from 'kapruka-mcp/local';
import { MemoryStorage } from 'kapruka-mcp/storage';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

interface ValidateArgs {
  name: string;
  phone: string;
  address: string;
  city: string;
  postal_code?: string;
}

function separator(): void {
  console.log('='.repeat(60));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function withRaw(sdk: KaprukaSDK): { callToolRaw(name: string, args: Record<string, unknown>): Promise<unknown> } {
  return sdk as unknown as { callToolRaw(name: string, args: Record<string, unknown>): Promise<unknown> };
}

async function makeClient(): Promise<Client> {
  const storage = new MemoryStorage();
  const local = new KaprukaLocal({ mock: false, storage });
  const [srvT, cliT] = InMemoryTransport.createLinkedPair();
  await local.getServer().connect(srvT);
  const client = new Client({ name: 'probe-validate-shipping', version: '0.0.1' });
  await client.connect(cliT);
  return client;
}

async function callLocal(client: Client, label: string, args: ValidateArgs): Promise<void> {
  separator();
  console.log(label);
  separator();
  console.log('Args sent:', JSON.stringify(args));

  try {
    const result = await client.callTool({ name: 'kapruka_validate_shipping', arguments: args });
    const content = result.content as Array<{ text?: string; type?: string }>;
    const text = content[0]?.text ?? '(no text content)';
    console.log('isError:', result.isError);
    console.log('RAW MCP TEXT:');
    console.log(text);
  } catch (err) {
    console.log('THREW:', errorMessage(err));
  }
}

async function callSdkRaw(label: string, args: ValidateArgs): Promise<void> {
  separator();
  console.log(label);
  separator();
  console.log('Args sent:', JSON.stringify(args));

  const sdk = new KaprukaSDK();

  try {
    const raw = await withRaw(sdk).callToolRaw('kapruka_validate_shipping', args);
    console.log('RAW SDK TEXT:');
    console.log(typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2));
  } catch (err) {
    console.log('THREW:', errorMessage(err));
  } finally {
    await sdk.disconnect();
  }
}

async function main(): Promise<void> {
  console.log('Validate shipping probe: KaprukaLocal + InMemoryTransport live mode, then SDK raw');

  const base: Omit<ValidateArgs, 'city'> = {
    name: 'Amara Perera',
    phone: '0771234567',
    address: '42 Galle Road',
    postal_code: '00300',
  };

  const client = await makeClient();

  await callLocal(client, 'Case A: local validate_shipping city = "Colombo 03"', {
    ...base,
    city: 'Colombo 03',
  });

  await callLocal(client, 'Case B: local validate_shipping city = "Akurana"', {
    ...base,
    city: 'Akurana',
  });

  await callLocal(client, 'Case C: local validate_shipping city = "Wellawatta"', {
    ...base,
    city: 'Wellawatta',
  });

  await callSdkRaw('Case D: SDK raw validate_shipping city = "Colombo 03"', {
    ...base,
    city: 'Colombo 03',
  });

  console.log('\n' + '='.repeat(60));
  console.log('PROBE COMPLETE');
  console.log('='.repeat(60));
}

main().catch((err: unknown) => {
  console.error('Probe script crashed:', errorMessage(err));
  process.exitCode = 1;
});
