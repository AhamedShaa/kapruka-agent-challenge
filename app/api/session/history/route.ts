import type { BaseMessage } from '@langchain/core/messages';

import { getCheckpointer } from '@/agent/checkpointer.js';
import { logger } from '@/lib/logger.js';
import type { StateType } from '@/agent/state.js';

export const runtime = 'nodejs';

interface HistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming: false;
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

    return Response.json({ ok: true, messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, sessionId }, 'session history fetch failed');
    // Fail open — don't block page mount; just show an empty state
    return Response.json({ ok: true, messages: [] });
  }
}
