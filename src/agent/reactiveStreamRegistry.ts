/**
 * Module-level registry of open persistent reactive-stream SSE connections,
 * keyed by sessionId (== thread_id). The normal per-message /api/chat POST
 * stream is unrelated and untouched — this registry exists solely so a
 * server-side timer (reactiveTurn.ts, fired well after any POST has already
 * returned) can push frames to a still-connected client.
 */
const controllers = new Map<string, ReadableStreamDefaultController<Uint8Array>>();

export function registerReactiveStream(sessionId: string, controller: ReadableStreamDefaultController<Uint8Array>): void {
  controllers.set(sessionId, controller);
}

export function unregisterReactiveStream(sessionId: string): void {
  controllers.delete(sessionId);
}

export function getReactiveStreamController(sessionId: string): ReadableStreamDefaultController<Uint8Array> | undefined {
  return controllers.get(sessionId);
}
