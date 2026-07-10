/** Process-lifetime cache: productId → image_url. Populated by getProduct calls;
 *  used to enrich cart views which the underlying SDK never stores images in.
 *  A stored `null` is a negative cache entry (resolution was attempted and
 *  found nothing) — distinct from an absent key (never attempted). */
const imageMap = new Map<string, string | null>();

export function storeProductImage(productId: string, imageUrl: string | null | undefined): void {
  if (imageUrl) imageMap.set(productId, imageUrl);
}

/** Explicit negative-cache write — resolution was attempted and failed. */
export function storeNegativeProductImage(productId: string): void {
  imageMap.set(productId, null);
}

/** undefined = never attempted, null = attempted and failed, string = resolved. */
export function getCachedProductImage(productId: string): string | null | undefined {
  return imageMap.get(productId);
}

export function enrichCartItems<T extends { productId: string; image_url?: string | null }>(
  items: T[],
): T[] {
  return items.map((item) => ({
    ...item,
    image_url: item.image_url ?? imageMap.get(item.productId) ?? null,
  }));
}
