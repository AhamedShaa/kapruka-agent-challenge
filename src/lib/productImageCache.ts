/** Process-lifetime cache: productId → image_url. Populated by getProduct calls;
 *  used to enrich cart views which the underlying SDK never stores images in. */
const imageMap = new Map<string, string>();

export function storeProductImage(productId: string, imageUrl: string | null | undefined): void {
  if (imageUrl) imageMap.set(productId, imageUrl);
}

export function enrichCartItems<T extends { productId: string; image_url?: string | null }>(
  items: T[],
): T[] {
  return items.map((item) => ({
    ...item,
    image_url: item.image_url ?? imageMap.get(item.productId) ?? null,
  }));
}
