import { registerReactiveStream, unregisterReactiveStream } from '@/agent/reactiveStreamRegistry.js';

export const runtime = 'nodejs';

/**
 * Persistent SSE connection the client opens once per session (on mount) and
 * keeps open for the session's lifetime — separate from /api/chat's
 * per-message POST stream, which closes after every 'done'. This is the only
 * channel a server-side timer (reactiveTurn.ts, firing well after any POST
 * has already returned) can push reactive-turn frames into.
 */
export async function GET(request: Request): Promise<Response> {
  const sessionId = new URL(request.url).searchParams.get('sessionId');
  if (!sessionId) {
    return Response.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let heartbeat: NodeJS.Timeout | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      registerReactiveStream(sessionId, controller);

      // Without bytes flowing, idle SSE connections get killed (by the dev
      // server or an intermediary) well before a debounced reactive turn
      // (3s debounce + model generation latency) gets a chance to write its
      // first real token — silently dropping the reactive message. An
      // immediate comment frame plus a periodic keep-alive keeps the
      // connection demonstrably alive; SSE comments (lines starting with
      // `:`) are ignored by EventSource/readers, so this is invisible to the
      // client's frame handling.
      controller.enqueue(encoder.encode(': connected\n\n'));
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);
    },
    cancel() {
      clearInterval(heartbeat);
      unregisterReactiveStream(sessionId);
    },
  });

  request.signal.addEventListener('abort', () => {
    clearInterval(heartbeat);
    unregisterReactiveStream(sessionId);
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
