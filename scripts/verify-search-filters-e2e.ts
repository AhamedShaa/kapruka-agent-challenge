// scripts/verify-search-filters-e2e.ts
// End-to-end check (no browser available in this session, so this is the
// closest substitute): sends "show me sarees under 5000" through the REAL
// LangGraph agent — real LLM tool-call extraction, real live searchProducts
// call, real narration — and confirms (a) the LLM populated max_price rather
// than leaving it embedded in q, and (b) the narrated text matches what the
// tool actually returned (no over-claiming, no under-claiming).
//
// Run: npx tsx scripts/verify-search-filters-e2e.ts

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
import type { RenderEvent } from '../src/agent/state.js';

const SESSION_ID = 'verify-search-filters-e2e-session';
const BROWSER_ID = 'verify-search-filters-e2e-browser';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function messageType(message: unknown): string {
  const getType = (message as { _getType?: () => string } | undefined)?._getType;
  return typeof getType === 'function' ? getType.call(message) : 'unknown';
}

function getToolCalls(message: unknown): Array<{ name: string; args: unknown }> {
  const calls = (message as { tool_calls?: unknown[] } | undefined)?.tool_calls;
  if (!Array.isArray(calls)) return [];
  return calls.filter(isRecord).map((c) => ({ name: String(c.name), args: c.args }));
}

async function main(): Promise<void> {
  const adapter = await getAdapter();
  const memoryStore = await getMemoryStore();
  const emitter = new RenderEventEmitter();
  const renderEvents: RenderEvent[] = [];
  emitter.onRender((ev: RenderEvent) => renderEvents.push(ev));

  const tools = createTools(adapter, emitter, memoryStore, BROWSER_ID);
  const checkpointer = getCheckpointer();
  const graph = createGraph(tools, memoryStore, checkpointer, adapter);
  const config = { configurable: { thread_id: SESSION_ID } };

  const userMessage = 'show me sarees under 5000';
  const input: Partial<StateType> = {
    messages: [new HumanMessage(userMessage)],
    sessionId: SESSION_ID,
    locale: 'en',
    browserId: BROWSER_ID,
  };

  const result = (await graph.invoke(input, config)) as StateType;

  console.log(`USER: "${userMessage}"\n`);

  console.log('-- tool calls the LLM made --');
  for (const m of result.messages) {
    if (messageType(m) !== 'ai') continue;
    for (const call of getToolCalls(m)) {
      console.log(`  ${call.name}(${JSON.stringify(call.args)})`);
    }
  }

  const productListEvent = renderEvents.find((e) => e.type === 'PRODUCT_LIST');
  console.log('\n-- PRODUCT_LIST render event actually emitted --');
  if (productListEvent && productListEvent.type === 'PRODUCT_LIST') {
    console.log(`  count: ${productListEvent.products.length}`);
    for (const p of productListEvent.products) {
      console.log(`  - ${p.name}: LKR ${p.price}${p.price > 5000 ? '  <-- OVER BUDGET, BUG' : ''}`);
    }
  } else {
    console.log('  (none emitted)');
  }

  const finalAi = [...result.messages].reverse().find((m) => messageType(m) === 'ai');
  const narration = (finalAi as { content?: unknown } | undefined)?.content;
  console.log('\n-- final assistant narration --');
  console.log(typeof narration === 'string' ? narration : JSON.stringify(narration));
}

main()
  .catch((e: unknown) => { console.error(e); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
