/** Process-lifetime cache: productId → image_url. Populated by getProduct calls
 *  and the og:image/JSON-LD page fallback (src/adapters/image-resolver.ts);
 *  used to enrich cart views which the underlying SDK never stores images in. */
const imageMap = new Map<string, string>();

/** Process-lifetime cache: productId → product_page_url. Populated at search
 *  hydration time (src/agent/tools.ts's hydrateAndEmitProducts) — the page URL
 *  can't be reconstructed from a productId alone (it embeds a product-name
 *  slug Kapruka generates server-side), so this is the only way a later
 *  getProduct call for the same product can reach the page-resolver fallback. */
const pageUrlMap = new Map<string, string>();

export function storeProductImage(productId: string, imageUrl: string | null | undefined): void {
  if (imageUrl) imageMap.set(productId, imageUrl);
}

export function storeProductPageUrl(productId: string, pageUrl: string | null | undefined): void {
  if (pageUrl) pageUrlMap.set(productId, pageUrl);
}

export function getProductPageUrl(productId: string): string | undefined {
  return pageUrlMap.get(productId);
}

export function enrichCartItems<T extends { productId: string; image_url?: string | null }>(
  items: T[],
): T[] {
  return items.map((item) => ({
    ...item,
    image_url: item.image_url ?? imageMap.get(item.productId) ?? null,
  }));
}
