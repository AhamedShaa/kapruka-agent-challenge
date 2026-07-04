// scripts/verify-show-more-results-e2e.ts
// End-to-end check of showMoreResults + lastSearchContext, driving the real
// LangGraph agent (real LLM tool-call decisions, real live search calls),
// mirroring app/api/chat/route.ts's own pattern of reading lastSearchContext
// from the checkpoint before building tools.
//
// Run: npx tsx scripts/verify-show-more-results-e2e.ts

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
import type { StateType, RenderEvent, LastSearchContext } from '../src/agent/state.js';

const SESSION_ID = 'verify-show-more-results-e2e-session';
const BROWSER_ID = 'verify-show-more-results-e2e-browser';

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
  console.log('-- tool calls --');
  for (const m of result.messages.filter((mm) => messageType(mm) === 'ai')) {
    for (const call of getToolCalls(m)) console.log(`  ${call.name}(${JSON.stringify(call.args)})`);
  }

  const productListEvent = renderEvents.find((e) => e.type === 'PRODUCT_LIST');
  if (productListEvent && productListEvent.type === 'PRODUCT_LIST') {
    console.log(`-- carousel: ${productListEvent.products.length} items --`);
    productListEvent.products.forEach((p, i) => console.log(`  ${i + 1}. ${p.id} — ${p.name} (LKR ${p.price})`));
  }

  console.log('-- lastSearchContext after this turn --');
  console.log(JSON.stringify(result.lastSearchContext));
}

async function main(): Promise<void> {
  const adapter = await getAdapter();
  const memoryStore = await getMemoryStore();
  const checkpointer = getCheckpointer();
  const config = { configurable: { thread_id: SESSION_ID } };

  // Turn 1: initial search. lastSearchContext starts null (fresh thread_id).
  let emitter = new RenderEventEmitter();
  let renderEvents: RenderEvent[] = [];
  emitter.onRender((ev) => renderEvents.push(ev));
  let tools = createTools(adapter, emitter, memoryStore, BROWSER_ID, null);
  let graph = createGraph(tools, memoryStore, checkpointer, adapter);
  await runTurn(graph, config, renderEvents, 'show me sarees');

  // Read back the checkpoint exactly like route.ts does, to get the cursor
  // stateUpdaterNode just persisted.
  const tuple1 = await checkpointer.getTuple(config);
  const contextAfterTurn1 = (tuple1?.checkpoint.channel_values as Partial<StateType> | undefined)
    ?.lastSearchContext as LastSearchContext | null | undefined;
  console.log('\ncontext read back from checkpoint before turn 2:', JSON.stringify(contextAfterTurn1));

  // Turn 2: "show me more" — rebuild tools with the real checkpointed context,
  // same as a fresh route.ts request would.
  emitter = new RenderEventEmitter();
  renderEvents = [];
  emitter.onRender((ev) => renderEvents.push(ev));
  tools = createTools(adapter, emitter, memoryStore, BROWSER_ID, contextAfterTurn1 ?? null);
  graph = createGraph(tools, memoryStore, checkpointer, adapter);
  await runTurn(graph, config, renderEvents, 'show me more');
}

main()
  .catch((e: unknown) => { console.error(e); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
