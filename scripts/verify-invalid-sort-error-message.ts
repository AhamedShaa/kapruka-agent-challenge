import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
process.env.COMMERCE_MODE = 'live';

import { getAdapter } from '../src/adapters/index.js';
import { toUserSafeMessage } from '../src/agent/errorFormatter.js';

async function main(): Promise<void> {
  const adapter = await getAdapter();
  try {
    // Force the invalid value straight through the adapter, bypassing the
    // LLM's own (now-correct) tool description that would normally avoid it.
    await adapter.search('books', undefined, { sort: 'name' as any });
    console.log('UNEXPECTED: adapter.search did not throw');
  } catch (err) {
    const message = toUserSafeMessage(err, 'searchProducts');
    console.log('formatted message for searchProducts:', JSON.stringify(message));
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
