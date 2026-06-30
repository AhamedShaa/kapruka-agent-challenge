import { existsSync } from 'node:fs';

// tsx doesn't auto-load .env.local the way Next.js does — load it explicitly
// before any module below reads process.env (createGraph() needs OPENROUTER_API_KEY).
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

import { HumanMessage } from '@langchain/core/messages';

import { getAdapter } from '../src/adapters/index.js';
import { getMemoryStore } from '../src/lib/customerMemory.js';
import { createTools } from '../src/agent/tools.js';
import { createGraph } from '../src/agent/graph.js';
import { getCheckpointer } from '../src/agent/checkpointer.js';
import { RenderEventEmitter } from '../src/agent/events.js';
import { getSystemPrompt } from '../src/agent/systemPrompt.js';
import type { StateType } from '../src/agent/state.js';

const SESSION_ID = 'diagnose-memory-session-1';
const BROWSER_ID = 'diagnose-memory-browser-1';

const TURNS = [
  "I want flowers for my mother's birthday",
  'Show me red roses under 5000',
  'Add the first one to my cart',
  "What's in my cart?",
  "I want to deliver to Galle, what's the fee?",
  "By the way, I'm Ahamed and I prefer Galle for delivery.",
  'What should I add to make this a nicer gift?',
];

interface ToolCallRecord {
  name: string;
  args: unknown;
  result: string;
}

interface TurnReport {
  turn: number;
  userMessage: string;
  sessionIdUsed: string;
  resultSessionId: string;
  preInvokeCheckpointMessageCount: number;
  finalState: StateType;
  systemPromptSentThisTurn: string;
  messagesSentToFinalLlmCall: unknown[];
  toolCalls: ToolCallRecord[];
  cartAfterTurn: { itemCount: number; total: number };
  customerMemoryAfterTurn: string;
  storedName: string | null;
  storedPreferredCity: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getToolCalls(message: unknown): Array<{ id?: string; name: string; args: unknown }> {
  const calls = (message as { tool_calls?: unknown[] } | undefined)?.tool_calls;
  if (!Array.isArray(calls)) return [];
  return calls.filter(isRecord).map((c) => ({
    id: typeof c.id === 'string' ? c.id : undefined,
    name: typeof c.name === 'string' ? c.name : 'unknown',
    args: c.args,
  }));
}

function messageType(message: unknown): string {
  const getType = (message as { _getType?: () => string } | undefined)?._getType;
  return typeof getType === 'function' ? getType.call(message) : 'unknown';
}

/** Pairs each AIMessage's tool_calls with the ToolMessage results that follow it, by tool_call_id. */
function extractToolCallsFromMessages(messages: unknown[]): ToolCallRecord[] {
  const records: ToolCallRecord[] = [];
  const toolResultsById = new Map<string, string>();

  for (const message of messages) {
    if (messageType(message) === 'tool') {
      const id = (message as { tool_call_id?: string }).tool_call_id;
      const content = (message as { content?: unknown }).content;
      if (id) toolResultsById.set(id, typeof content === 'string' ? content : JSON.stringify(content));
    }
  }

  for (const message of messages) {
    if (messageType(message) !== 'ai') continue;
    for (const call of getToolCalls(message)) {
      records.push({
        name: call.name,
        args: call.args,
        result: (call.id && toolResultsById.get(call.id)) ?? '(no matching ToolMessage found)',
      });
    }
  }

  return records;
}

async function runTurn(turnNumber: number, userMessage: string): Promise<TurnReport> {
  const adapter = await getAdapter();
  const memoryStore = await getMemoryStore();
  const emitter = new RenderEventEmitter();
  const tools = createTools(adapter, emitter, memoryStore, BROWSER_ID);

  // Fresh graph every turn, but a singleton checkpointer — this exactly mirrors
  // app/api/chat/route.ts, which calls createGraph() on every POST request but
  // fetches the checkpointer via getCheckpointer(). Reusing the graph instance
  // itself would mask bugs unrelated to checkpointer lifetime.
  const checkpointer = getCheckpointer();
  const graph = createGraph(tools, memoryStore, checkpointer, adapter);
  const config = { configurable: { thread_id: SESSION_ID } };

  // Check what the checkpointer already knows for this thread_id BEFORE this
  // turn's invoke — this is the direct, empirical answer to "was state read
  // back", independent of whether sessionId matches.
  const preState = await graph.getState(config);
  const preInvokeCheckpointMessageCount = Array.isArray(preState.values?.messages)
    ? preState.values.messages.length
    : 0;

  const input: Partial<StateType> = {
    messages: [new HumanMessage(userMessage)],
    sessionId: SESSION_ID,
    locale: 'en',
    browserId: BROWSER_ID,
  };

  const result = (await graph.invoke(input, config)) as StateType;

  const memoriesSection = memoryStore.formatForPrompt(BROWSER_ID);
  // Reconstructed the same way agentNode builds it for the turn's last internal
  // call — using this turn's final state, which is what every agentNode call
  // after the first tool round already saw (state is threaded through the
  // whole turn's node loop, not just carried across turns).
  const systemPromptSentThisTurn = getSystemPrompt('en', memoriesSection, {
    cartSnapshot: result.cartSnapshot,
    deliveryContext: result.deliveryContext,
    customerName: result.customerName,
  });

  // The array fed into the LAST internal agentNode call this turn is
  // everything except that call's own response.
  const messagesSentToFinalLlmCall = result.messages.slice(0, -1);

  const toolCalls = extractToolCallsFromMessages(result.messages);

  const cart = await adapter.getCart();

  return {
    turn: turnNumber,
    userMessage,
    sessionIdUsed: SESSION_ID,
    resultSessionId: result.sessionId,
    preInvokeCheckpointMessageCount,
    finalState: result,
    systemPromptSentThisTurn,
    messagesSentToFinalLlmCall,
    toolCalls,
    cartAfterTurn: { itemCount: cart.itemCount, total: cart.total },
    customerMemoryAfterTurn: memoriesSection,
    storedName: memoryStore.get<string>(BROWSER_ID, 'name'),
    storedPreferredCity: memoryStore.get<string>(BROWSER_ID, 'preferredCity'),
  };
}

function logTurnDetail(report: TurnReport): void {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TURN ${report.turn}: "${report.userMessage}"`);
  console.log('='.repeat(80));

  console.log(`\n-- session_id --`);
  console.log(`  used: ${report.sessionIdUsed}`);
  console.log(`  state.sessionId after invoke: ${report.resultSessionId}`);
  console.log(`  match: ${report.sessionIdUsed === report.resultSessionId}`);

  console.log(`\n-- checkpoint read-back (before this turn's invoke) --`);
  console.log(`  messages already in checkpoint for this thread_id: ${report.preInvokeCheckpointMessageCount}`);

  console.log(`\n-- full LangGraph state after this turn --`);
  console.log(
    JSON.stringify(
      {
        sessionId: report.finalState.sessionId,
        locale: report.finalState.locale,
        browserId: report.finalState.browserId,
        cartSnapshot: report.finalState.cartSnapshot,
        deliveryContext: report.finalState.deliveryContext,
        customerName: report.finalState.customerName,
        messageCount: report.finalState.messages.length,
      },
      null,
      2,
    ),
  );

  console.log(`\n-- system prompt sent this turn (first 500 chars) --`);
  console.log(`  ${report.systemPromptSentThisTurn.slice(0, 500).replace(/\n/g, ' ')}...`);

  console.log(`\n-- messages array sent to the final LLM call this turn --`);
  for (const m of report.messagesSentToFinalLlmCall) {
    const type = messageType(m);
    const content = (m as { content?: unknown }).content;
    console.log(`  [${type}] ${typeof content === 'string' ? content.slice(0, 120) : JSON.stringify(content).slice(0, 120)}`);
  }

  console.log(`\n-- tool calls this turn --`);
  if (report.toolCalls.length === 0) {
    console.log('  (none)');
  } else {
    for (const call of report.toolCalls) {
      console.log(`  ${call.name}(${JSON.stringify(call.args)}) -> ${call.result.slice(0, 150)}`);
    }
  }

  console.log(`\n-- persistent storage after this turn --`);
  console.log(`  cart: itemCount=${report.cartAfterTurn.itemCount}, total=${report.cartAfterTurn.total}`);
  console.log(`  customer memory (browserId=${BROWSER_ID}): ${report.customerMemoryAfterTurn || '(empty)'}`);
  console.log(`  stored fact 'name': ${report.storedName ?? '(none)'}`);
  console.log(`  stored fact 'preferredCity': ${report.storedPreferredCity ?? '(none)'}`);
}

function knewPreviousContext(report: TurnReport, turnIndex: number): boolean {
  if (turnIndex === 0) return true; // no prior turn to know about
  return report.preInvokeCheckpointMessageCount > 0;
}

async function run(): Promise<void> {
  const reports: TurnReport[] = [];

  for (let i = 0; i < TURNS.length; i++) {
    const report = await runTurn(i + 1, TURNS[i]);
    logTurnDetail(report);
    reports.push(report);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(
    `${'Turn'.padEnd(6)} ${'Knew prior context?'.padEnd(22)} ${'Cart persisted?'.padEnd(18)} Session ID mismatch?`,
  );

  for (let i = 0; i < reports.length; i++) {
    const report = reports[i];
    const knew = knewPreviousContext(report, i);
    const cartPersisted = report.cartAfterTurn.itemCount > 0;
    const mismatch = report.sessionIdUsed !== report.resultSessionId;

    console.log(
      `${String(report.turn).padEnd(6)} ${String(knew).padEnd(22)} ${String(cartPersisted).padEnd(18)} ${String(mismatch)}`,
    );
  }

  console.log(
    '\nNote: "knew prior context" is measured directly from the checkpointer ' +
      "(graph.getState() before this turn's invoke), not inferred from the LLM's reply.",
  );
}

run()
  .catch((err: unknown) => {
    console.error('Memory diagnosis crashed:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
