import { getAdapter } from '@/adapters/index.js';
import { normalizedToUICartItem } from '@/adapters/ui-mappers.js';
import { logger } from '@/lib/logger.js';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const adapter = await getAdapter();
    const cart = await adapter.getCart();
    return Response.json({
      ok: true,
      items: cart.items.map(normalizedToUICartItem),
      total: cart.total,
      itemCount: cart.itemCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'cart snapshot fetch failed');
    // Fail open — return empty cart, don't block page mount
    return Response.json({ ok: true, items: [], total: 0, itemCount: 0 });
  }
}
