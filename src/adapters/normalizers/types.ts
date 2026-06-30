export interface NormalizedProduct {
  id: string;
  name: string | null;
  price: number | null;
  currency: string;
  image_url: string | null;
  product_url: string | null;
  category: string | null;
  description: string | null;
  visual_description: string | null;
  vendor: string | null;
  weight: string | null;
  in_stock: boolean;
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
