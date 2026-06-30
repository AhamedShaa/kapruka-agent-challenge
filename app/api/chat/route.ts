import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { getAdapter } from '@/adapters/index.js';
import { getMemoryStore } from '@/lib/customerMemory.js';
import { logger } from '@/lib/logger.js';
import { createTools } from '@/agent/tools.js';
import { createGraph } from '@/agent/graph.js';
import { getCheckpointer } from '@/agent/checkpointer.js';
import { RenderEventEmitter } from '@/agent/events.js';
import { sseFrame, toMessage, extractDelta } from '@/agent/sse.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const chatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  sessionId: z.string().min(1),
  locale: z.enum(['en', 'si', 'tanglish']).default('en'),
  browserId: z.string().default('anonymous'),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message, code: 'INVALID_BODY' }, { status: 400 });
  }

  const { message, sessionId, locale, browserId } = parsed.data;

  const adapter = await getAdapter();
  const memoryStore = await getMemoryStore();
  const emitter = new RenderEventEmitter();
  const tools = createTools(adapter, emitter, memoryStore, browserId);
  const checkpointer = getCheckpointer();
  const graph = createGraph(tools, memoryStore, checkpointer, adapter);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const close = (): void => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };

      emitter.onRender((event) => {
        controller.enqueue(sseFrame({ type: 'render', event }));
      });

      try {
        const events = graph.streamEvents(
          { messages: [new HumanMessage(message)], sessionId, locale, browserId },
          { version: 'v2', configurable: { thread_id: sessionId } },
        );

        for await (const event of events) {
          if (event.event === 'on_chat_model_stream') {
            const data = event.data as { chunk?: { content?: unknown } } | undefined;
            const delta = extractDelta(data?.chunk?.content);
            if (delta) controller.enqueue(sseFrame({ type: 'token', delta }));
          }
        }

        controller.enqueue(sseFrame({ type: 'done' }));
        close();
      } catch (err) {
        const errMessage = toMessage(err);
        logger.error({ err: errMessage, sessionId, browserId }, 'chat stream failed');
        controller.enqueue(sseFrame({ type: 'error', message: errMessage }));
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
