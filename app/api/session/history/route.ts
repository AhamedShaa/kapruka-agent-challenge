import type { BaseMessage, ToolMessage } from '@langchain/core/messages';

import { getCheckpointer } from '@/agent/checkpointer.js';
import { logger } from '@/lib/logger.js';
import type { StateType, LastSearchContext, UIProduct } from '@/agent/state.js';
import { getAdapter } from '@/adapters/index.js';
import { normalizedToUIProduct } from '@/adapters/ui-mappers.js';

export const runtime = 'nodejs';

type HistoryRenderEvent =
  | { type: 'PRODUCT_LIST'; products: UIProduct[]; query: string }
  | { type: 'PRODUCT_DETAIL'; product: UIProduct };

interface HistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming: false;
  renderEvents?: HistoryRenderEvent[];
}

function getMsgType(msg: BaseMessage): string {
  if (typeof msg._getType === 'function') return msg._getType();
  // Fallback for plain objects after deserialization
  return (msg as unknown as Record<string, unknown>).type as string ?? '';
}

function extractText(content: BaseMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        typeof block === 'object' && block !== null && 'text' in block && typeof block.text === 'string'
          ? block.text
          : '',
      )
      .join('');
  }
  return '';
}

/** Max number of search turns to reconstruct carousel data for. Prevents
 *  30+ getProduct calls on page load when the session has many searches. */
const MAX_RECONSTRUCTED_SEARCHES = 3;

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId || sessionId.length < 1) {
    return Response.json({ ok: false, error: 'sessionId required' }, { status: 400 });
  }

  try {
    const checkpointer = getCheckpointer();
    const tuple = await checkpointer.getTuple({ configurable: { thread_id: sessionId } });

    if (!tuple) {
      return Response.json({ ok: true, messages: [] });
    }

    const stored = ((tuple.checkpoint.channel_values as Partial<StateType>)?.messages ?? []) as BaseMessage[];

    // Build the visible message list (human + ai only, drop silent tool-call turns).
    // We work on the raw stored array so we can correlate ToolMessages (which are
    // filtered out of the final list) with the assistant message that follows them.
    const messages: HistoryMessage[] = stored
      .filter((msg) => {
        const t = getMsgType(msg);
        return t === 'human' || t === 'ai';
      })
      .map((msg) => ({
        id: crypto.randomUUID(),
        role: (getMsgType(msg) === 'human' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: extractText(msg.content),
        isStreaming: false as const,
      }))
      // Drop AI tool-call turns that produced no visible text
      .filter((msg) => msg.content.trim().length > 0);

    // Helper: find the first visible assistant message after rawIndex in stored[].
    function findNextVisibleAI(rawIndex: number): HistoryMessage | null {
      for (let j = rawIndex + 1; j < stored.length; j++) {
        if (getMsgType(stored[j]) === 'ai') {
          const text = extractText(stored[j].content).trim();
          if (text.length > 0) {
            return messages.find((m) => m.role === 'assistant' && m.content === text) ?? null;
          }
        }
      }
      return null;
    }

    // --- Reconstruct PRODUCT_LIST render events from search ToolMessages ---
    interface SearchTurn {
      artifact: LastSearchContext;
      rawIndex: number;
    }

    const searchTurns: SearchTurn[] = [];

    // --- Collect getProduct AI message indices for PRODUCT_DETAIL reconstruction ---
    interface GetProductTurn {
      productId: string;
      rawIndex: number; // index of the last getProduct ToolMessage in this batch
    }
    const getProductTurns: GetProductTurn[] = [];

    for (let i = 0; i < stored.length; i++) {
      const msg = stored[i];
      const t = getMsgType(msg);

      if (t === 'tool') {
        const tm = msg as ToolMessage;
        const content = extractText(tm.content);

        // Search ToolMessage: starts with 'Found'
        if (content.startsWith('Found')) {
          const artifact = tm.artifact as LastSearchContext | null | undefined;
          if (artifact?.productIndex?.length) {
            searchTurns.push({ artifact, rawIndex: i });
          }
          continue;
        }

        // getProduct ToolMessage: look at the preceding AI message's tool_calls
        // to extract the productId. The ToolMessage itself doesn't carry it.
        // Walk backwards to find the last AI message with tool_calls.
        let productId: string | null = null;
        for (let k = i - 1; k >= 0; k--) {
          if (getMsgType(stored[k]) === 'ai') {
            const toolCalls = (stored[k] as unknown as { tool_calls?: Array<{ name: string; args: Record<string, unknown> }> }).tool_calls;
            if (Array.isArray(toolCalls)) {
              // Match by tool_call_id if available on the ToolMessage
              const tmId = (tm as unknown as { tool_call_id?: string }).tool_call_id;
              const matchedCall = tmId
                ? toolCalls.find((c) => (c as unknown as { id?: string }).id === tmId)
                : toolCalls.find((c) => c.name === 'getProduct');
              if (matchedCall?.name === 'getProduct') {
                productId = String(matchedCall.args['productId'] ?? '');
              }
            }
            break;
          }
          if (getMsgType(stored[k]) === 'tool') continue;
          break;
        }

        if (productId) {
          getProductTurns.push({ productId, rawIndex: i });
        }
      }
    }

    const adapter = await getAdapter();

    // Reconstruct PRODUCT_LIST (capped to avoid thundering-herd on long sessions)
    const searchesToReconstruct = searchTurns.slice(-MAX_RECONSTRUCTED_SEARCHES);
    await Promise.allSettled(
      searchesToReconstruct.map(async ({ artifact, rawIndex }) => {
        const productIndex = artifact.productIndex!;
        const settled = await Promise.allSettled(
          productIndex.map((entry) => adapter.getProduct(entry.id)),
        );
        const uiProducts: UIProduct[] = settled
          .map((r) => (r.status === 'fulfilled' ? normalizedToUIProduct(r.value) : null))
          .filter((p): p is UIProduct => p !== null);
        if (uiProducts.length === 0) return;

        const target = findNextVisibleAI(rawIndex);
        if (!target) return;
        target.renderEvents = [{ type: 'PRODUCT_LIST', products: uiProducts, query: artifact.q }];
      }),
    );

    // Reconstruct PRODUCT_DETAIL (most recent 6 to stay lightweight)
    const detailsToReconstruct = getProductTurns.slice(-6);
    await Promise.allSettled(
      detailsToReconstruct.map(async ({ productId, rawIndex }) => {
        if (!productId) return;
        const result = await adapter.getProduct(productId).catch(() => null);
        if (!result) return;
        const product = normalizedToUIProduct(result);

        const target = findNextVisibleAI(rawIndex);
        if (!target) return;
        target.renderEvents = [
          ...(target.renderEvents ?? []),
          { type: 'PRODUCT_DETAIL', product },
        ];
      }),
    );

    return Response.json({ ok: true, messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, sessionId }, 'session history fetch failed');
    // Fail open — don't block page mount; just show an empty state
    return Response.json({ ok: true, messages: [] });
  }
}
