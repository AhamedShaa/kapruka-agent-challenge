import type { RenderEvent } from './state.js';

/** Shared SSE frame shape — used by both the normal per-message chat stream
 * (app/api/chat/route.ts) and the reactive-turn stream (reactiveTurn.ts),
 * so the client's frame-handling logic works identically for either source. */
export type SseFrame =
  | { type: 'token'; delta: string }
  | { type: 'render'; event: RenderEvent }
  | { type: 'done' }
  | { type: 'error'; message: string };

export function sseFrame(data: SseFrame): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Chat model stream chunks can carry string or structured content blocks. */
export function extractDelta(content: unknown): string {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((block) => (typeof block === 'object' && block !== null && 'text' in block && typeof block.text === 'string' ? block.text : ''))
      .join('');
  }

  return '';
}
