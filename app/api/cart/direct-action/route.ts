import { z } from 'zod';

import { getAdapter } from '@/adapters/index.js';
import { normalizedToUICartItem } from '@/adapters/ui-mappers.js';
import { withCartLock } from '@/adapters/cartLock.js';
import { storeProductImage, enrichCartItems } from '@/lib/productImageCache.js';
import { scheduleReactiveTurn } from '@/agent/reactiveTurn.js';
import { logger } from '@/lib/logger.js';
import type { NormalizedCartView } from '@/core/ports/commerce.port.js';

export const runtime = 'nodejs';

const directActionSchema = z.object({
  sessionId: z.string().min(1),
  action: z.enum(['add', 'remove', 'updateQuantity']),
  productId: z.string().min(1),
  quantity: z.number().int().min(0).optional(),
});

function toResponse(cart: NormalizedCartView): { items: ReturnType<typeof normalizedToUICartItem>[]; total: number; itemCount: number } {
  return {
    items: cart.items.map(normalizedToUICartItem),
    total: cart.total,
    itemCount: cart.itemCount,
  };
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = directActionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }

  // sessionId isn't used by the cart mutation itself (the cart is process-global,
  // not session-scoped, same as the agent's own addToCart/getCart tools) — it's
  // used below to target the right thread_id when scheduling the debounced
  // reactive-turn notification.
  const { sessionId, action, productId, quantity } = parsed.data;

  try {
    const adapter = await getAdapter();

    // The whole read-mutate-read sequence is locked as one unit — see
    // src/adapters/cartLock.ts. Without this, a concurrent chat-driven
    // addToCart (tools.ts, also lock-wrapped) could land its write between
    // this route's getCart() snapshot and its re-adds below, corrupting either
    // request's intent (Phase 2's clear-and-replay has no primitive-level
    // atomicity of its own).
    const result = await withCartLock(async (): Promise<NormalizedCartView> => {
      if (action === 'add') {
        // The request body intentionally carries no name/price (per spec) — look
        // the product up server-side rather than trusting client-supplied price.
        const product = await adapter.getProduct(productId);
        const name = product.name ?? productId;
        const price = product.price ?? 0;
        storeProductImage(productId, product.image_url);
        return adapter.addToCart(productId, name, price, quantity ?? 1);
      }

      // 'remove' and 'updateQuantity' have no direct primitive in the underlying
      // SDK (add_to_cart is additive-only with quantity >= 1; there is no
      // remove/decrement tool) — implemented as clear-and-replay.
      const current = await adapter.getCart();
      await adapter.clearCart();

      for (const item of current.items) {
        if (item.productId === productId) {
          if (action === 'remove') continue; // drop it entirely
          if (action === 'updateQuantity' && (quantity ?? 0) <= 0) continue; // 0 = remove
          if (action === 'updateQuantity') {
            await adapter.addToCart(item.productId, item.name, item.price, quantity as number);
            continue;
          }
        }
        await adapter.addToCart(item.productId, item.name, item.price, item.quantity);
      }

      return adapter.getCart();
    });

    const settledItem = result.items.find((item) => item.productId === productId);
    const description = settledItem
      ? `User changed ${settledItem.name} to ${settledItem.quantity}x in their cart directly via the product card.`
      : `User removed an item from their cart directly via the product card.`;
    scheduleReactiveTurn(sessionId, productId, description);

    const enriched = { ...toResponse(result), items: enrichCartItems(toResponse(result).items) };
    return Response.json({ ok: true, ...enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, action, productId }, 'direct cart action failed');
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
