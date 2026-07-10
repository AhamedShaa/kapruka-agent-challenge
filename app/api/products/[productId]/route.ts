import { getAdapter } from '@/adapters/index.js';
import { normalizedToUIProduct } from '@/adapters/ui-mappers.js';
import { resolveProductFromPage } from '@/adapters/image-resolver.js';
import { logger } from '@/lib/logger.js';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
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

    // get_product has no record for this id (confirmed live: ~48% of search
    // results, not limited to any one ID prefix — docs/LIVE_SYSTEM_AUDIT.md).
    // The client already knows the product's own detail page URL from the
    // search result — fall back to scraping that page for whatever fields
    // are recoverable (image/description/vendor/category) rather than
    // leaving the detail drawer permanently empty for these products.
    const pageUrl = new URL(request.url).searchParams.get('pageUrl');
    if (pageUrl) {
      const pageData = await resolveProductFromPage(pageUrl, productId);
      if (pageData && (pageData.image_url || pageData.description)) {
        return Response.json({ ok: true, partial: pageData });
      }
    }

    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
