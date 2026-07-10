/** Three-value stock enum derived from the raw **Stock** markdown field.
 *  Audit confirmed "In stock (low)" is the API's only in-stock string —
 *  plain "In stock" has never been observed. Both purchasable states map
 *  to truthy for cart/checkout purposes. */
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface NormalizedProduct {
  id: string;
  name: string | null;
  price: number | null;
  currency: string;
  image_url: string | null;
  product_url: string | null;
  /**
   * The product's /buyonline/.../kid/... detail page — NOT an image. On the
   * search path this is the raw SDK's own `image_url` field, which is
   * actually a page link mislabeled as an image (Decision C nulls the real
   * `image_url` field because of this). Kept here, separately, so a
   * get_product failure has something to fall back to for image resolution
   * (see src/adapters/image-resolver.ts) without resurrecting the mislabeled
   * value into `image_url` itself.
   */
  product_page_url: string | null;
  category: string | null;
  description: string | null;
  visual_description: string | null;
  vendor: string | null;
  weight: string | null;
  in_stock: StockStatus;
  international_shipping: boolean | null;
}

export interface NormalizedCategory {
  id: string | null;
  name: string;
  description: string | null;
  url: string | null;
}

export interface NormalizedDeliveryCity {
  id: string | null;
  name: string;
  delivery_fee: number | null;
  estimated_days: number | null;
  aliases: string[] | null;
}

export interface NormalizedDeliveryCheck {
  // Section 1 / Final Type Shapes said "string" (never null), but Section 3's
  // rules table says "null + missingFields += 'city' (not observed)" if
  // absent — that's a contradiction in the design doc. Per the explicit
  // resolution instruction: widened to match the rules table.
  city: string | null;
  availability: 'available' | 'available_later' | 'unavailable' | 'unknown';
  nextAvailableDate: string | null;
  fee: number | null;
}

export interface DeliveryResolutionContext {
  requestedCity: string;
  resolvedAs: string | null;
  ambiguous: boolean;
  alternateNames: string[];
  reason: 'exact' | 'vernacular' | 'ambiguous-defaulted' | 'unknown' | 'invalid-date';
  requestedDate: string | null;
  resolvedDate: string | null;
  errorMessage?: string;
}

export interface NormalizedDeliveryCheckWithContext extends NormalizedDeliveryCheck {
  resolutionContext?: DeliveryResolutionContext;
}

export interface OrderItemResult {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
}

export interface NormalizedOrder {
  id: string | null;
  items: OrderItemResult[] | null;
  total: number | null;
  currency: string;
  checkoutUrl: string | null;
  status: string | null;
  createdAt: string | null;
  expiresAt: string | null;
}

export interface NormalizedCartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  image_url?: string | null;
}

export interface NormalizedCartView {
  items: NormalizedCartItem[];
  total: number;
  itemCount: number;
  isEmpty: boolean;
}

export interface NormalizedSearchResult {
  products: NormalizedProduct[];
  total: number;
  query: string;
  cursor: string | null;
}

export interface NormalizedDeliveryCityList {
  cities: NormalizedDeliveryCity[];
  totalAvailable: number | null;
  returnedCount: number;
}

export interface NormalizedError {
  ok: false;
  code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'RATE_LIMITED' | 'NETWORK_ERROR' | 'UNKNOWN';
  message: string;
  tool: string;
  retryable: boolean;
  details: Record<string, unknown> | null;
  raw: string;
}
