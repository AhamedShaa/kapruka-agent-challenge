import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
process.env.COMMERCE_MODE = 'live';

import { HumanMessage } from '@langchain/core/messages';
import { getAdapter } from '../src/adapters/index.js';
import { getMemoryStore } from '../src/lib/customerMemory.js';
import { createTools } from '../src/agent/tools.js';
import { createGraph } from '../src/agent/graph.js';
import { getCheckpointer } from '../src/agent/checkpointer.js';
import { RenderEventEmitter } from '../src/agent/events.js';
import type { StateType } from '../src/agent/state.js';

async function main(): Promise<void> {
  const adapter = await getAdapter();
  const memoryStore = await getMemoryStore();
  const emitter = new RenderEventEmitter();
  const tools = createTools(adapter, emitter, memoryStore, 'verify-books-sort-browser', null);
  const checkpointer = getCheckpointer();
  const graph = createGraph(tools, memoryStore, checkpointer, adapter);
  const sessionId = 'verify-books-sort-session';

  const userMessage = 'show me books, sorted by name';
  const result = (await graph.invoke(
    { messages: [new HumanMessage(userMessage)], sessionId, locale: 'en', browserId: 'verify-books-sort-browser' },
    { configurable: { thread_id: sessionId } },
  )) as StateType;

  const finalAi = [...result.messages].reverse().find((m) => m._getType() === 'ai');
  console.log(`USER: "${userMessage}"`);
  console.log('\nFINAL NARRATION:');
  console.log((finalAi as any)?.content);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
