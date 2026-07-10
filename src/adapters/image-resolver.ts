import { logger } from '@/lib/logger.js';
import { getCachedProductImage, storeProductImage, storeNegativeProductImage } from '@/lib/productImageCache.js';

const FETCH_TIMEOUT_MS = 5_000;
const OG_IMAGE_PATTERN = /<meta\s+property="og:image"\s+content="([^"]+)"/i;

/**
 * Fallback image resolution for products get_product has no detail record
 * for (docs/LIVE_SYSTEM_AUDIT.md: ~48% of live search results, not limited
 * to any one ID prefix). Every search result still carries its own
 * /buyonline/.../kid/... detail page URL (NormalizedProduct.product_page_url)
 * — fetches that page and reads its og:image meta tag, which reliably held a
 * real product image across every failing catalog tested. No prefix
 * blacklist: this runs purely as a fallback when get_product already failed,
 * regardless of why.
 */
export async function resolveProductImage(productPageUrl: string, productId: string): Promise<string | null> {
  const cached = getCachedProductImage(productId);
  if (cached !== undefined) return cached;

  try {
    const res = await fetch(productPageUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      storeNegativeProductImage(productId);
      logger.warn({ productId, productPageUrl, status: res.status }, 'og:image fallback fetch failed');
      return null;
    }

    const html = await res.text();
    const match = html.match(OG_IMAGE_PATTERN);
    if (!match) {
      storeNegativeProductImage(productId);
      logger.warn({ productId, productPageUrl }, 'og:image fallback found no og:image tag');
      return null;
    }

    const imageUrl = match[1];
    storeProductImage(productId, imageUrl);
    logger.info({ productId, imageUrl }, 'og:image fallback resolved image');
    return imageUrl;
  } catch (err) {
    storeNegativeProductImage(productId);
    logger.warn(
      { productId, productPageUrl, err: err instanceof Error ? err.message : String(err) },
      'og:image fallback fetch threw',
    );
    return null;
  }
}
