// scripts/verify-fifth-item-followup.ts
// Live UI re-test (no browser available in this session — closest substitute
// is driving the real LangGraph agent end-to-end, same harness pattern as
// verify-search-filters-e2e.ts): reruns the original failing query ("bathik
// sarees") then asks a "what about the 5th one" follow-up, to confirm the
// top-3 narration ceiling removal actually lets the agent answer about items
// beyond position 3.
//
// Run: npx tsx scripts/verify-fifth-item-followup.ts

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

const SESSION_ID = 'verify-fifth-item-followup-session';
const BROWSER_ID = 'verify-fifth-item-followup-browser';

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

async function runTurn(
  graph: ReturnType<typeof createGraph>,
  config: { configurable: { thread_id: string } },
  renderEvents: RenderEvent[],
  userMessage: string,
): Promise<void> {
  renderEvents.length = 0;
  const input: Partial<StateType> = {
    messages: [new HumanMessage(userMessage)],
    sessionId: SESSION_ID,
    locale: 'en',
    browserId: BROWSER_ID,
  };
  const result = (await graph.invoke(input, config)) as StateType;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`USER: "${userMessage}"`);
  console.log('='.repeat(70));

  console.log('\n-- tool calls the LLM made this turn --');
  const aiMessages = result.messages.filter((m) => messageType(m) === 'ai');
  // Only the messages produced in this turn carry fresh tool_calls; find all anyway.
  for (const m of aiMessages) {
    for (const call of getToolCalls(m)) {
      console.log(`  ${call.name}(${JSON.stringify(call.args)})`);
    }
  }

  const productListEvent = renderEvents.find((e) => e.type === 'PRODUCT_LIST');
  if (productListEvent && productListEvent.type === 'PRODUCT_LIST') {
    console.log(`\n-- PRODUCT_LIST carousel this turn: ${productListEvent.products.length} items --`);
    productListEvent.products.forEach((p, i) => console.log(`  ${i + 1}. ${p.name} — LKR ${p.price}`));
  }

  const finalAi = [...result.messages].reverse().find((m) => messageType(m) === 'ai');
  const narration = (finalAi as { content?: unknown } | undefined)?.content;
  console.log('\n-- final assistant narration --');
  console.log(typeof narration === 'string' ? narration : JSON.stringify(narration));
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

  await runTurn(graph, config, renderEvents, 'bathik sarees');
  await runTurn(graph, config, renderEvents, 'what about the 5th one?');
}

main()
  .catch((e: unknown) => { console.error(e); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
