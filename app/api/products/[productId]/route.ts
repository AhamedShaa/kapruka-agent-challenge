import { getAdapter } from '@/adapters/index.js';
import { normalizedToUIProduct } from '@/adapters/ui-mappers.js';
import { logger } from '@/lib/logger.js';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ productId: string }> },
): Promise<Response> {
  const { productId } = await params;

  try {
    const adapter = await getAdapter();
    const product = await adapter.getProduct(productId);
    return Response.json({ ok: true, product: normalizedToUIProduct(product) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, productId }, 'product detail fetch failed');
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
