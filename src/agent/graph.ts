import { StateGraph, START, END, type BaseCheckpointSaver } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { SystemMessage } from '@langchain/core/messages';
import type { DynamicStructuredTool } from '@langchain/core/tools';

import type { CustomerMemoryStore } from '@/lib/customerMemory.js';
import type { CommercePort } from '@/core/ports/commerce.port.js';
import { AgentState, type StateType } from './state.js';
import { getSystemPrompt } from './systemPrompt.js';
import { stateUpdaterNode } from './stateUpdaterNode.js';
import { createChatModel } from './model.js';
import type { RenderEventEmitter } from './events.js';

/**
 * Builds a compiled LangGraph agent. Compiled per-request (not as a module-level
 * singleton) because each request has its own RenderEventEmitter and
 * browserId-scoped tools — graph compilation in LangGraph.js is cheap (<10ms).
 * This is competition-appropriate, not a production-scalability pattern.
 * `checkpointer` is injected (see src/agent/checkpointer.ts) so the checkpoint
 * store survives across requests for the same thread_id.
 */
export function createGraph(
  tools: DynamicStructuredTool[],
  memoryStore: CustomerMemoryStore,
  checkpointer: BaseCheckpointSaver,
  adapter: CommercePort,
  emitter: RenderEventEmitter,
) {
  const model = createChatModel();
  const modelWithTools = model.bindTools(tools);
  const toolNode = new ToolNode(tools);

  async function agentNode(state: StateType): Promise<Partial<StateType>> {
    const memoriesSection = memoryStore.formatForPrompt(state.browserId);
    const currentDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
    const sysPrompt = getSystemPrompt(state.locale, memoriesSection, {
      cartSnapshot: state.cartSnapshot,
      deliveryContext: state.deliveryContext,
      customerName: state.customerName,
      currentDate,
    });

    const response = await modelWithTools.invoke([new SystemMessage(sysPrompt), ...state.messages]);
    emitter.flushDeferred();

    return { messages: [response] };
  }

  async function stateUpdater(state: StateType): Promise<Partial<StateType>> {
    return stateUpdaterNode(state, adapter);
  }

  function shouldContinue(state: StateType): 'tools' | typeof END {
    const last = state.messages.at(-1);
    // Duck-type on `tool_calls` — see CLAUDE.md LANGCHAIN INSTANCEOF note.
    const toolCalls = (last as unknown as { tool_calls?: unknown[] } | undefined)?.tool_calls;
    return Array.isArray(toolCalls) && toolCalls.length > 0 ? 'tools' : END;
  }

  return new StateGraph(AgentState)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addNode('stateUpdater', stateUpdater)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue, { tools: 'tools', [END]: END })
    .addEdge('tools', 'stateUpdater')
    .addEdge('stateUpdater', 'agent')
    .compile({ checkpointer });
}
