import { AIMessage, ToolMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';

import { getAdapter } from '@/adapters/index.js';
import { normalizedToUICartItem } from '@/adapters/ui-mappers.js';
import { getMemoryStore } from '@/lib/customerMemory.js';
import { logger } from '@/lib/logger.js';
import { createChatModel } from './model.js';
import { createGraph } from './graph.js';
import { RenderEventEmitter } from './events.js';
import { getCheckpointer } from './checkpointer.js';
import { getSystemPrompt } from './systemPrompt.js';
import { sseFrame, extractDelta, toMessage } from './sse.js';
import { getReactiveStreamController } from './reactiveStreamRegistry.js';
import type { Locale, UICartItem } from './state.js';

interface CheckpointedValues {
  messages: BaseMessage[];
  locale: Locale;
  browserId: string;
  deliveryContext: { city: string | null; date: string | null };
  customerName: string | null;
}

/** Mirrors state.ts's own Annotation defaults — used when no checkpoint exists yet
 * for this thread_id (e.g. a direct-action click is the very first interaction in a
 * brand-new session) so reading the checkpoint never throws. */
function defaultCheckpointedValues(): CheckpointedValues {
  return { messages: [], locale: 'en', browserId: '', deliveryContext: { city: null, date: null }, customerName: null };
}

async function readCheckpointedValues(sessionId: string): Promise<CheckpointedValues> {
  const checkpointer = getCheckpointer();
  const tuple = await checkpointer.getTuple({ configurable: { thread_id: sessionId } });
  if (!tuple) return defaultCheckpointedValues();

  const values = tuple.checkpoint.channel_values as Partial<CheckpointedValues> | undefined;
  const defaults = defaultCheckpointedValues();
  return {
    messages: values?.messages ?? defaults.messages,
    locale: values?.locale ?? defaults.locale,
    browserId: values?.browserId ?? defaults.browserId,
    deliveryContext: values?.deliveryContext ?? defaults.deliveryContext,
    customerName: values?.customerName ?? defaults.customerName,
  };
}

const pendingTimers = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 3000;

// Serializes reactive-turn generation (same pattern as cartLock.ts). Two
// debounce timers firing near-simultaneously (e.g. two different products
// added within the same window) would otherwise stream concurrently into the
// same SSE connection, interleaving their tokens into one garbled message.
// Serializing means the second turn's stream starts only after the first
// completes — two separate, non-garbled messages, arriving sequentially.
let reactiveQueue: Promise<unknown> = Promise.resolve();
function withReactiveLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = reactiveQueue.then(fn, fn);
  reactiveQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Debounced per (sessionId, productId) — NOT global per session. A burst of
 * quantity-adjust clicks on the SAME product coalesces into one reactive turn
 * reflecting the FINAL state after the burst settles. Adding two DIFFERENT
 * products within the same window each get their own reaction, since those
 * are genuinely separate decisions.
 */
export function scheduleReactiveTurn(sessionId: string, productId: string, description: string): void {
  const key = `${sessionId}:${productId}`;

  const existing = pendingTimers.get(key);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingTimers.delete(key);
    withReactiveLock(() => runReactiveTurn(sessionId, productId, description)).catch((err: unknown) => {
      logger.error({ err: toMessage(err), sessionId, productId }, 'reactive turn failed');
    });
  }, DEBOUNCE_MS);

  pendingTimers.set(key, timer);
}

async function runReactiveTurn(sessionId: string, productId: string, description: string): Promise<void> {
  const adapter = await getAdapter();
  const memoryStore = await getMemoryStore();
  const checkpoint = await readCheckpointedValues(sessionId);

  const freshCart = await adapter.getCart();
  const freshItems: UICartItem[] = freshCart.items.map(normalizedToUICartItem);

  const callId = `direct-${Date.now()}-${productId}`;
  const syntheticAI = new AIMessage({
    content: '',
    tool_calls: [{ id: callId, name: 'notifyDirectCartAction', args: { productId, description } }],
  });
  const syntheticTool = new ToolMessage({ content: description, tool_call_id: callId });

  const memoriesSection = memoryStore.formatForPrompt(checkpoint.browserId);
  const currentDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
  const sysPrompt = getSystemPrompt(checkpoint.locale, memoriesSection, {
    cartSnapshot: freshItems,
    deliveryContext: checkpoint.deliveryContext,
    customerName: checkpoint.customerName,
    currentDate,
  });

  const controller = getReactiveStreamController(sessionId);

  // Bare model — no .bindTools(...) — so it structurally cannot call a tool
  // in response to the synthetic pair, not just instructed not to.
  const model = createChatModel();
  const messages = [new SystemMessage(sysPrompt), ...checkpoint.messages, syntheticAI, syntheticTool];

  let accumulated = '';
  try {
    const stream = await model.stream(messages);
    for await (const chunk of stream) {
      const delta = extractDelta(chunk.content);
      if (delta) {
        accumulated += delta;
        controller?.enqueue(sseFrame({ type: 'token', delta }));
      }
    }
    controller?.enqueue(sseFrame({ type: 'done' }));
  } catch (err) {
    logger.error({ err: toMessage(err), sessionId, productId }, 'reactive turn model call failed');
    controller?.enqueue(sseFrame({ type: 'error', message: toMessage(err) }));
    return;
  }

  const finalReply = new AIMessage({ content: accumulated });

  try {
    // Pure state patch via updateState — applies the messages/cartSnapshot
    // reducers and persists a new checkpoint WITHOUT executing any graph node,
    // so the LLM is never called a second time for the same turn. Empty tools
    // array: this graph instance exists only to reach .updateState(), it never
    // runs agentNode/ToolNode.
    const graph = createGraph([], memoryStore, getCheckpointer(), adapter, new RenderEventEmitter());
    await graph.updateState(
      { configurable: { thread_id: sessionId } },
      { messages: [syntheticAI, syntheticTool, finalReply], cartSnapshot: freshItems },
    );
  } catch (err) {
    logger.error({ err: toMessage(err), sessionId, productId }, 'reactive turn checkpoint persist failed');
  }
}
