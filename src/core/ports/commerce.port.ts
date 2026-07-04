// Types below are defined here (not re-exported from kapruka-mcp) so that
// the port is fully self-contained. Only KaprukaAdapter may import from
// kapruka-mcp at runtime.

// Product/SearchResult/Category/DeliveryCity/DeliveryCheckResult/CartAddResult/
// CartContents/Order are now Normalized* types (src/adapters/normalizers/types.ts)
// — re-exported here so the rest of the port file (and its consumers) only
// needs to import from this one file.
import type {
  NormalizedProduct,
  NormalizedSearchResult,
  NormalizedCategory,
  NormalizedDeliveryCity,
  NormalizedDeliveryCityList,
  NormalizedDeliveryCheck,
  NormalizedDeliveryCheckWithContext,
  DeliveryResolutionContext,
  NormalizedCartItem,
  NormalizedCartView,
  NormalizedOrder,
  OrderItemResult,
} from '@/adapters/normalizers/types.js';

export type {
  NormalizedProduct,
  NormalizedSearchResult,
  NormalizedCategory,
  NormalizedDeliveryCity,
  NormalizedDeliveryCityList,
  NormalizedDeliveryCheck,
  NormalizedDeliveryCheckWithContext,
  DeliveryResolutionContext,
  NormalizedCartItem,
  NormalizedCartView,
  NormalizedOrder,
  OrderItemResult,
};

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface OrderRecipient {
  name: string;
  phone: string;
  address: string;
  city: string;
  postal_code?: string;
}

export interface OrderDelivery {
  date: string;
  instructions?: string;
}

export interface OrderSender {
  name: string;
  phone: string;
}

export interface CreateOrderRequest {
  cart: Array<{ product_id: string; quantity: number }>;
  recipient: OrderRecipient;
  delivery: OrderDelivery;
  sender: OrderSender;
  gift_message?: string;
  currency?: string;
}

export interface ShippingAddress {
  name: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  postal_code?: string;
  delivery_instructions?: string;
}

export interface ShippingValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestion?: string;
}

/** Result of kapruka_convert_currency. */
export interface CurrencyResult {
  original: string;
  converted: string;
  rate: string;
  source: string;
  note: string;
}

/**
 * search_products filters — confirmed live via raw-protocol probe
 * (scripts/probe-search-raw-filters.ts) to be genuinely honored server-side,
 * once actually forwarded (see patches/kapruka-mcp+1.3.3.patch for the
 * vendor-side plumbing this required).
 */
export interface SearchFilters {
  min_price?: number;
  max_price?: number;
  in_stock_only?: boolean;
  // Confirmed live via raw probe (scripts/probe-sort-values.ts) — 'name' was
  // never a real accepted value; the server's own Pydantic error lists the
  // true set: bestseller, newest, price_asc, price_desc, relevance.
  sort?: 'bestseller' | 'newest' | 'price_asc' | 'price_desc' | 'relevance';
  limit?: number;
  /** Client-side vendor filter — server has no vendor param. The adapter fetches
   *  a wider batch, hydrates to get vendor info, then filters by substring match. */
  vendor?: string;
}

/**
 * Distinguishes a genuine no-match from "matches exist, just not within your
 * filters" — the search-hardening pass's zero-result relaxation ladder (see
 * src/adapters/searchRelaxation.ts) is what actually computes this.
 */
export type MatchOutcome = 'ok' | 'no-match' | 'filtered-empty';

export interface SearchOutcome extends NormalizedSearchResult {
  matchOutcome: MatchOutcome;
}

/**
 * The single seam between the agent core and the Kapruka commerce backend.
 * The agent depends only on this interface — only KaprukaAdapter may import
 * from 'kapruka-mcp'.
 */
export interface CommercePort {
  search(q: string, category?: string, filters?: SearchFilters, cursor?: string): Promise<SearchOutcome>;
  getProduct(productId: string): Promise<NormalizedProduct>;
  getAlternatives(query: string, maxPrice?: number): Promise<NormalizedSearchResult>;
  getRecommendations(category: string): Promise<NormalizedSearchResult>;
  listCategories(): Promise<NormalizedCategory[]>;
  listDeliveryCities(query: string): Promise<NormalizedDeliveryCityList>;
  checkDelivery(city: string, productId: string, date?: string): Promise<NormalizedDeliveryCheckWithContext & { note: string }>;
  validateShipping(address: ShippingAddress): Promise<ShippingValidation>;
  addToCart(productId: string, name: string, price: number, qty: number): Promise<{ message: string } & NormalizedCartView>;
  getCart(): Promise<NormalizedCartView>;
  clearCart(): Promise<void>;
  removeFromCart(productId: string): Promise<NormalizedCartView>;
  createOrder(req: CreateOrderRequest): Promise<NormalizedOrder>;
  trackOrder(orderNumber: string): Promise<NormalizedOrder>;
  convertCurrency(amount: number, to: string): Promise<CurrencyResult>;
}

/** Thrown by KaprukaAdapter when a tool call returns an `{ error }` payload. */
export class KaprukaError extends Error {
  readonly tool: string;
  readonly suggestion?: string;

  constructor(params: { tool: string; message: string; suggestion?: string }) {
    super(params.message);
    this.name = 'KaprukaError';
    this.tool = params.tool;
    this.suggestion = params.suggestion;
  }
}
