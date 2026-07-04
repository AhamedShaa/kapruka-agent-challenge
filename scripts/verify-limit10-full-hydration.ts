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
import type { StateType, RenderEvent } from '../src/agent/state.js';

const SESSION_ID = 'verify-limit10-session';
const BROWSER_ID = 'verify-limit10-browser';

async function runTurn(
  graph: ReturnType<typeof createGraph>,
  config: { configurable: { thread_id: string } },
  renderEvents: RenderEvent[],
  userMessage: string,
): Promise<void> {
  renderEvents.length = 0;
  const result = (await graph.invoke(
    { messages: [new HumanMessage(userMessage)], sessionId: SESSION_ID, locale: 'en', browserId: BROWSER_ID },
    config,
  )) as StateType;

  console.log(`\nUSER: "${userMessage}"`);
  const productListEvent = renderEvents.find((e) => e.type === 'PRODUCT_LIST');
  if (productListEvent && productListEvent.type === 'PRODUCT_LIST') {
    console.log(`carousel: ${productListEvent.products.length} items`);
    productListEvent.products.forEach((p, i) => {
      const hasImage = typeof p.image_url === 'string' && p.image_url.length > 0 && !p.image_url.includes('/buyonline/');
      console.log(`  ${i + 1}. ${p.name} — image_url=${hasImage ? 'REAL' : `MISSING/PAGE-URL (${JSON.stringify(p.image_url)})`}`);
    });
  } else {
    console.log('(no PRODUCT_LIST event)');
  }

  const finalAi = [...result.messages].reverse().find((m) => m._getType() === 'ai');
  console.log('narration:', (finalAi as any)?.content?.slice(0, 200));
}

async function main(): Promise<void> {
  const adapter = await getAdapter();
  const memoryStore = await getMemoryStore();
  const emitter = new RenderEventEmitter();
  const renderEvents: RenderEvent[] = [];
  emitter.onRender((ev) => renderEvents.push(ev));
  const tools = createTools(adapter, emitter, memoryStore, BROWSER_ID, null);
  const checkpointer = getCheckpointer();
  const graph = createGraph(tools, memoryStore, checkpointer, adapter);
  const config = { configurable: { thread_id: SESSION_ID } };

  await runTurn(graph, config, renderEvents, 'show me flowers');

  // Exercise a couple of OTHER tools right after, in the same conversation,
  // to check for rate-limit fallout from hydrating a full 10-item page.
  await runTurn(graph, config, renderEvents, 'show me books too');
  await runTurn(graph, config, renderEvents, "what's in my cart?");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => process.exit(process.exitCode ?? 0));
