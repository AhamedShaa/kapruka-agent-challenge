let queue: Promise<unknown> = Promise.resolve();

/**
 * Serializes cart-mutating adapter calls across all call sites (chat-driven
 * addToCart in tools.ts, direct-action's add/remove/updateQuantity sequences)
 * so a chat tool-call and a direct UI click can never interleave mid-sequence
 * — e.g. one request's clearCart() landing between another's getCart()
 * snapshot and its re-adds. Single in-memory promise chain; doesn't need to
 * survive restarts since the cart itself doesn't either.
 */
export function withCartLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn, fn);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
