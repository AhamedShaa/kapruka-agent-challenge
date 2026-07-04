import { z } from 'zod';
import { getAdapter } from '@/adapters/index.js';
import { getMemoryStore } from '@/lib/customerMemory.js';

export const runtime = 'nodejs';

const checkoutSchema = z.object({
  recipientName: z.string().min(1),
  recipientPhone: z.string().min(1),
  recipientAddress: z.string().min(1),
  recipientCity: z.string().min(1),
  deliveryDate: z.string().min(1),
  senderName: z.string().min(1),
  senderPhone: z.string().min(1),
  giftMessage: z.string().optional(),
});

const bodySchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1),
  browserId: z.string().default('anonymous'),
  checkout: checkoutSchema.optional(),
});

export type BuyNowCheckout = z.infer<typeof checkoutSchema>;

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }

  const { productId, quantity, browserId, checkout } = parsed.data;

  // Phase 1: client is asking what we know — return prefill data from memory.
  if (!checkout) {
    const store = await getMemoryStore();
    const lastRecipient = store.get<{ name: string; city: string }>(browserId, 'last_recipient');
    return Response.json({
      ok: false,
      needsDetails: true,
      prefill: {
        recipientName: lastRecipient?.name ?? '',
        recipientCity: lastRecipient?.city ?? '',
      },
    });
  }

  // Phase 2: create the order against a synthetic single-item cart.
  // The user's real cart (adapter.getCart()) is never read or modified.
  const adapter = await getAdapter();
  try {
    const order = await adapter.createOrder({
      cart: [{ product_id: productId, quantity }],
      recipient: {
        name: checkout.recipientName,
        phone: checkout.recipientPhone,
        address: checkout.recipientAddress,
        city: checkout.recipientCity,
      },
      delivery: { date: checkout.deliveryDate },
      sender: { name: checkout.senderName, phone: checkout.senderPhone },
      gift_message: checkout.giftMessage,
    });

    const store = await getMemoryStore();
    store.recordOrder(browserId, checkout.recipientName, checkout.recipientCity, checkout.giftMessage);

    return Response.json({ ok: true, order });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Order creation failed';
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
