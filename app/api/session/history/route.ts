import type { BaseMessage, ToolMessage } from '@langchain/core/messages';

import { getCheckpointer } from '@/agent/checkpointer.js';
import { logger } from '@/lib/logger.js';
import type { StateType, LastSearchContext, UIProduct } from '@/agent/state.js';
import { getAdapter } from '@/adapters/index.js';
import { normalizedToUIProduct } from '@/adapters/ui-mappers.js';

export const runtime = 'nodejs';

interface HistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming: false;
  renderEvents?: Array<{ type: 'PRODUCT_LIST'; products: UIProduct[]; query: string }>;
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

    // --- Reconstruct PRODUCT_LIST render events from search ToolMessages ---
    // Find ToolMessages (in original checkpoint order) that look like search results.
    // For each one, locate the next assistant message in our visible list and attach
    // a PRODUCT_LIST render event so the carousel re-renders after refresh.

    interface SearchTurn {
      artifact: LastSearchContext;
      /** Index in the raw stored[] array where this ToolMessage sits. */
      rawIndex: number;
    }

    const searchTurns: SearchTurn[] = [];

    for (let i = 0; i < stored.length; i++) {
      const msg = stored[i];
      if (getMsgType(msg) !== 'tool') continue;
      const tm = msg as ToolMessage;
      const content = extractText(tm.content);
      if (!content.startsWith('Found')) continue;

      const artifact = tm.artifact as LastSearchContext | null | undefined;
      if (!artifact?.productIndex?.length) continue;

      searchTurns.push({ artifact, rawIndex: i });
    }

    // Cap to the most recent MAX_RECONSTRUCTED_SEARCHES turns.
    const turnsToReconstruct = searchTurns.slice(-MAX_RECONSTRUCTED_SEARCHES);

    if (turnsToReconstruct.length > 0) {
      const adapter = await getAdapter();

      await Promise.allSettled(
        turnsToReconstruct.map(async ({ artifact, rawIndex }) => {
          const productIndex = artifact.productIndex!;

          // Hydrate product details in parallel — same pattern as hydrateAndEmitProducts.
          const settled = await Promise.allSettled(
            productIndex.map((entry) => adapter.getProduct(entry.id)),
          );

          const uiProducts: UIProduct[] = settled
            .map((r) => (r.status === 'fulfilled' ? normalizedToUIProduct(r.value) : null))
            .filter((p): p is UIProduct => p !== null);

          if (uiProducts.length === 0) return;

          // Find the first assistant message in `messages[]` whose position in the
          // original raw array comes AFTER this ToolMessage.
          // Strategy: walk forward from rawIndex in stored[], skip non-ai messages,
          // take the first ai message that has visible text — then match its content
          // to the HistoryMessage we built.
          let nextAiContent: string | null = null;
          for (let j = rawIndex + 1; j < stored.length; j++) {
            if (getMsgType(stored[j]) === 'ai') {
              const text = extractText(stored[j].content).trim();
              if (text.length > 0) {
                nextAiContent = text;
                break;
              }
            }
          }
          if (!nextAiContent) return;

          const target = messages.find(
            (m) => m.role === 'assistant' && m.content === nextAiContent,
          );
          if (!target) return;

          target.renderEvents = [
            { type: 'PRODUCT_LIST', products: uiProducts, query: artifact.q },
          ];
        }),
      );
    }

    return Response.json({ ok: true, messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, sessionId }, 'session history fetch failed');
    // Fail open — don't block page mount; just show an empty state
    return Response.json({ ok: true, messages: [] });
  }
}
