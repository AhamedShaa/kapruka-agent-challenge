import { KaprukaLocal } from 'kapruka-mcp/local';
import { MemoryStorage, SqliteStorage } from 'kapruka-mcp/storage';
import { TOOL_NAMES } from 'kapruka-mcp';
import type { SearchResult, Product, Category, DeliveryCity, Order } from 'kapruka-mcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import {
  KaprukaError,
  type CommercePort,
  type ShippingAddress,
  type ShippingValidation,
  type CurrencyResult,
  type CreateOrderRequest,
  type CartItem,
  type SearchFilters,
  type SearchOutcome,
  type NormalizedSearchResult,
  type NormalizedProduct,
  type NormalizedCategory,
  type NormalizedDeliveryCityList,
  type NormalizedDeliveryCheckWithContext,
  type NormalizedCartView,
  type NormalizedOrder,
} from '@/core/ports/commerce.port.js';
import {
  normalizeSearchResult,
  normalizeAlternativesResult,
  normalizeRecommendationsResult,
  normalizeGetProductResult,
  normalizeCategoryList,
  normalizeDeliveryCityList,
  normalizeDeliveryCheck,
  normalizeCartView,
  normalizeCreateOrderResult,
  normalizeTrackOrderResult,
  normalizeOrderFromMarkdown,
  type RawCartView,
} from '@/adapters/normalizers/index.js';
import { normalizeDateToISO, InvalidDateError } from './normalizers/dateNormalizer.js';
import { resolveCityForDelivery } from './cityForDelivery.js';
import { resolveSearchOutcome } from './searchRelaxation.js';
import { logger } from '@/lib/logger.js';

export type CommerceMode = 'mock' | 'live';

const TOOL_TIMEOUT_MS = 8_000;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parses "LKR 1,234" / "FREE" / "LKR 0" into a plain number. */
export function parseLkr(value: string): number {
  if (value.trim().toUpperCase() === 'FREE') return 0;
  const digits = value.replace(/[^0-9.]/g, '');
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isErrorPayload(value: unknown): value is { error: string; tool: string; suggestion?: string } {
  return isRecord(value) && typeof value.error === 'string';
}

/** Network/5xx errors are retryable; rate-limit and validation errors are not. */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof KaprukaError) return false;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('rate limit') || msg.includes('validation') || msg.includes('invalid')) {
      return false;
    }
    return (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('fetch failed') ||
      /\b5\d{2}\b/.test(msg)
    );
  }
  return false;
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

function extractToolText(result: unknown): string {
  if (
    isRecord(result) &&
    Array.isArray(result.content) &&
    result.content.length > 0 &&
    isRecord(result.content[0]) &&
    typeof result.content[0].text === 'string'
  ) {
    return result.content[0].text;
  }
  throw new Error('Unexpected tool result shape: missing content[0].text');
}

function makeInvalidDateResponse(
  input: string | undefined,
  msg: string,
): NormalizedDeliveryCheckWithContext & { note: string } {
  return {
    city: null,
    availability: 'unknown',
    nextAvailableDate: null,
    fee: null,
    note: '',
    resolutionContext: {
      requestedCity: '',
      resolvedAs: null,
      ambiguous: false,
      alternateNames: [],
      reason: 'invalid-date',
      requestedDate: input ?? null,
      resolvedDate: null,
      errorMessage: msg,
    },
  };
}

function makeUnknownCityResponse(userCity: string): NormalizedDeliveryCheckWithContext & { note: string } {
  return {
    city: null,
    availability: 'unknown',
    nextAvailableDate: null,
    fee: null,
    note: '',
    resolutionContext: {
      requestedCity: userCity,
      resolvedAs: null,
      ambiguous: false,
      alternateNames: [],
      reason: 'unknown',
      requestedDate: null,
      resolvedDate: null,
    },
  };
}

/**
 * Implements CommercePort using an in-process KaprukaLocal MCP server connected
 * via InMemoryTransport. This is the ONLY file that imports from kapruka-mcp —
 * the agent core depends solely on the CommercePort interface.
 */
export class KaprukaAdapter implements CommercePort {
  private readonly client: Client;
  private readonly mode: CommerceMode;

  private constructor(client: Client, mode: CommerceMode) {
    this.client = client;
    this.mode = mode;
  }

  static async create(mode: CommerceMode): Promise<KaprukaAdapter> {
    const storage = mode === 'live' ? await SqliteStorage.create('./kapruka-cart.db') : new MemoryStorage();

    const local = new KaprukaLocal({
      mock: mode === 'mock',
      storage,
      events: {
        onToolCall: (tool, args) => {
          logger.info({ tool, args }, 'kapruka tool call');
        },
        onError: (tool, error) => {
          logger.error({ tool, err: error.message }, 'kapruka tool error');
        },
      },
    });

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await local.getServer().connect(serverTransport);

    const client = new Client({ name: 'kapruka-agent', version: '0.1.0' });
    await client.connect(clientTransport);

    const adapter = new KaprukaAdapter(client, mode);

    // R3 fix: warm up the connection (and isOfficialServer detection) before
    // any real calls are made. Uses search_products (not list_categories) —
    // the live server returns non-JSON for list_categories. The very first
    // call on a cold connection always throws here (the SDK checks
    // isOfficialServer before connect() has run, so it picks the wrong
    // response-parsing path) — that's expected and fine: its only job is to
    // force the connection so isOfficialServer is correct for every call after it.
    try {
      await adapter.callTool(TOOL_NAMES.search_products, { q: 'cake' });
    } catch (err) {
      logger.info({ err: toError(err).message }, 'kapruka warm-up call failed (expected on cold connection)');
    }

    return adapter;
  }

  // -------------------------------------------------------------------------
  // Tool call helper — timeout (R2), retry (R1), JSON parsing, error detection
  // -------------------------------------------------------------------------
  private async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const start = Date.now();
    let lastError: unknown;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const result = await this.client.callTool(
          { name, arguments: args },
          undefined,
          { signal: AbortSignal.timeout(TOOL_TIMEOUT_MS) },
        );

        const text = extractToolText(result);
        if (text.startsWith('MCP error') || text.startsWith('Error')) {
          throw new KaprukaError({
            tool: name,
            message: text.slice(0, 300),
            suggestion: 'Live server error — may be rate limited or temporarily unavailable',
          });
        }

        const parsed: unknown = JSON.parse(text);

        if (isErrorPayload(parsed)) {
          throw new KaprukaError({ tool: name, message: parsed.error, suggestion: parsed.suggestion });
        }

        logger.info({ tool: name, args, durationMs: Date.now() - start }, 'kapruka tool call succeeded');
        return parsed as T;
      } catch (err) {
        lastError = err;

        // Never retry rate-limit or validation errors (KaprukaError) — fail fast.
        if (err instanceof KaprukaError) throw err;
        if (!isRetryableError(err) || attempt === RETRY_DELAYS_MS.length) break;

        logger.info(
          { tool: name, attempt: attempt + 1, delayMs: RETRY_DELAYS_MS[attempt] },
          'retrying kapruka tool call',
        );
        await delay(RETRY_DELAYS_MS[attempt]);
      }
    }

    logger.error({ tool: name, args, durationMs: Date.now() - start, err: toError(lastError).message }, 'kapruka tool call failed');
    throw toError(lastError);
  }

  /**
   * Same as callTool, but also returns the raw response text alongside the
   * parsed result — needed when a normalizer wants to extract information
   * (e.g. tri-state availability) that the parsed JSON shape alone can't carry.
   */
  private async callToolWithRaw<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ parsed: T; rawText: string }> {
    const start = Date.now();
    let lastError: unknown;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const result = await this.client.callTool(
          { name, arguments: args },
          undefined,
          { signal: AbortSignal.timeout(TOOL_TIMEOUT_MS) },
        );

        const text = extractToolText(result);
        if (text.startsWith('MCP error') || text.startsWith('Error')) {
          throw new KaprukaError({
            tool: name,
            message: text.slice(0, 300),
            suggestion: 'Live server error — may be rate limited or temporarily unavailable',
          });
        }

        const parsed: unknown = JSON.parse(text);

        if (isErrorPayload(parsed)) {
          throw new KaprukaError({ tool: name, message: parsed.error, suggestion: parsed.suggestion });
        }

        logger.info({ tool: name, args, durationMs: Date.now() - start }, 'kapruka tool call succeeded');
        return { parsed: parsed as T, rawText: text };
      } catch (err) {
        lastError = err;

        // Never retry rate-limit or validation errors (KaprukaError) — fail fast.
        if (err instanceof KaprukaError) throw err;
        if (!isRetryableError(err) || attempt === RETRY_DELAYS_MS.length) break;

        logger.info(
          { tool: name, attempt: attempt + 1, delayMs: RETRY_DELAYS_MS[attempt] },
          'retrying kapruka tool call',
        );
        await delay(RETRY_DELAYS_MS[attempt]);
      }
    }

    logger.error({ tool: name, args, durationMs: Date.now() - start, err: toError(lastError).message }, 'kapruka tool call failed');
    throw toError(lastError);
  }

  /**
   * Diagnostic helper: calls list_delivery_cities directly (bypassing callTool's
   * JSON parsing/error detection) and logs the raw response text. Used to inspect
   * the live server's actual response format before writing a parser for it.
   */
  private async debugRawDeliveryCity(): Promise<void> {
    const result = await this.client.callTool(
      { name: TOOL_NAMES.list_delivery_cities, arguments: {} },
      undefined,
      { signal: AbortSignal.timeout(TOOL_TIMEOUT_MS) },
    );
    const text = extractToolText(result);
    logger.info({ tool: TOOL_NAMES.list_delivery_cities, rawText: text }, 'raw delivery city diagnostic dump');
  }

  // -------------------------------------------------------------------------
  // CommercePort implementation
  // -------------------------------------------------------------------------

  async search(q: string, category?: string, filters?: SearchFilters, cursor?: string): Promise<SearchOutcome> {
    // R10 fix: live server taxonomy differs — category filtering returns 0 results live.
    const args: Record<string, unknown> = { q };
    if (category && this.mode !== 'live') args.category = category;
    if (filters?.min_price !== undefined) args.min_price = filters.min_price;
    if (filters?.max_price !== undefined) args.max_price = filters.max_price;
    if (filters?.in_stock_only !== undefined) args.in_stock_only = filters.in_stock_only;
    if (filters?.sort !== undefined) args.sort = filters.sort;
    if (cursor !== undefined) args.cursor = cursor;

    const filtersWereSent =
      'category' in args || 'min_price' in args || 'max_price' in args || 'in_stock_only' in args;

    const raw = await this.callTool<SearchResult>(TOOL_NAMES.search_products, args);
    const filteredResult = normalizeSearchResult(raw);

    // A cursor-driven page coming back empty just means end-of-pagination,
    // not "filters too narrow" — the relaxation ladder doesn't apply (retrying
    // bare would misleadingly restart from page 1). Confirmed live that
    // cursor pagination is real and non-repeating (scripts/probe-cursor-pagination.ts).
    if (filteredResult.products.length > 0 || !filtersWereSent || cursor !== undefined) {
      return resolveSearchOutcome(q, filteredResult, filtersWereSent && cursor === undefined, filters, null);
    }

    // Zero-result relaxation ladder: confirmed necessary this session — the
    // exact combination of a misspelled term + price filters together can
    // zero out even though each piece works in isolation
    // (scripts/probe-exact-original-combo.ts). Retry bare (no filters, no
    // category) to tell a genuine no-match apart from filters-too-narrow.
    const bareRaw = await this.callTool<SearchResult>(TOOL_NAMES.search_products, { q });
    const bareResult = normalizeSearchResult(bareRaw);

    return resolveSearchOutcome(q, filteredResult, filtersWereSent, filters, bareResult);
  }

  async getProduct(productId: string): Promise<NormalizedProduct> {
    const raw = await this.callTool<Product & { _rawMarkdown?: string }>(TOOL_NAMES.get_product, { product_id: productId });
    return normalizeGetProductResult(raw, raw._rawMarkdown);
  }

  async getAlternatives(query: string, maxPrice?: number): Promise<NormalizedSearchResult> {
    const raw = await this.callTool<{ query: string; alternatives: Product[]; total: number }>(
      TOOL_NAMES.get_alternatives,
      { query, ...(maxPrice !== undefined ? { maxPrice } : {}) },
    );

    return normalizeAlternativesResult(raw);
  }

  async getRecommendations(category: string): Promise<NormalizedSearchResult> {
    // The underlying tool derives recommendations from cart context, not a category.
    const raw = await this.callTool<{ recommendations: Product[] }>(TOOL_NAMES.get_recommendations, {});

    return normalizeRecommendationsResult(raw, category);
  }

  async listCategories(): Promise<NormalizedCategory[]> {
    const raw = await this.callTool<Category[]>(TOOL_NAMES.list_categories, {});
    return normalizeCategoryList(raw);
  }

  async listDeliveryCities(query: string): Promise<NormalizedDeliveryCityList> {
    const raw = await this.callTool<DeliveryCity[]>(TOOL_NAMES.list_delivery_cities, { query });
    return normalizeDeliveryCityList(raw);
  }



  async checkDelivery(
    city: string,
    productId: string,
    date?: string,
  ): Promise<NormalizedDeliveryCheckWithContext & { note: string }> {
    // Normalize the date. InvalidDateError on garbage input — we catch
    // and return a structured error rather than propagating the throw.
    let isoDate: string;
    try {
      isoDate = normalizeDateToISO(date);
    } catch (e) {
      if (e instanceof InvalidDateError) {
        return makeInvalidDateResponse(date, e.message);
      }
      throw e;
    }

    // Resolve the city to a canonical name the SDK will accept.
    const resolution = await resolveCityForDelivery(city, this);

    if (!resolution.resolvedName) {
      return makeUnknownCityResponse(city);
    }

    // Call the SDK with values we know are valid; capture raw text
    // so the normalizer can do tri-state availability extraction.
    const { parsed: raw } = await this.callToolWithRaw<{
      available: boolean;
      city: string;
      deliveryFee: string;
      estimatedDays: number;
      note: string;
      _rawMarkdown?: string;
    }>(TOOL_NAMES.check_delivery, {
      city: resolution.resolvedName,
      product_id: productId,
      delivery_date: isoDate,
    });


    // _rawMarkdown carries the original API markdown. Local server
    // patched to propagate it — see patches/. Falls back to undefined
    // in mock mode or if patching didn't reach a call, where the
    // normalizer's degraded branch handles it correctly.
    const normalized = normalizeDeliveryCheck({
      available: raw.available,
      city: raw.city,
      fee: parseLkr(raw.deliveryFee),
      estimated_days: raw.estimatedDays,
    }, raw._rawMarkdown);


    let noteForResponse = raw.note;
    if (normalized.availability === 'available_later' && normalized.nextAvailableDate) {
      noteForResponse = `Not available on the requested date. Next available: ${normalized.nextAvailableDate}. Fee when available: LKR ${normalized.fee ?? 'TBD'}.`;
    } else if (normalized.availability === 'unavailable') {
      noteForResponse = raw.note || 'Delivery not available to this city.';
    }

    return {
      ...normalized,
      note: noteForResponse,
      resolutionContext: {
        requestedCity: city,
        resolvedAs: resolution.resolvedName,
        ambiguous: resolution.ambiguous,
        alternateNames: resolution.alternateNames,
        reason: resolution.reason,
        requestedDate: date ?? null,
        resolvedDate: isoDate,
      },
    };
  }

  async validateShipping(address: ShippingAddress): Promise<ShippingValidation> {
    const raw = await this.callTool<ShippingValidation & { checkedAddress: unknown }>(
      TOOL_NAMES.validate_shipping,
      {
        name: address.name,
        phone: address.phone,
        address: address.address_line1,
        city: address.city,
        ...(address.postal_code ? { postal_code: address.postal_code } : {}),
        ...(address.delivery_instructions ? { delivery_instructions: address.delivery_instructions } : {}),
      },
    );

    return { valid: raw.valid, errors: raw.errors, warnings: raw.warnings, suggestion: raw.suggestion };
  }

  async addToCart(
    productId: string,
    name: string,
    price: number,
    qty: number,
  ): Promise<{ message: string } & NormalizedCartView> {
    const raw = await this.callTool<{
      message: string;
      cart: CartItem[];
      cartTotal: string;
      itemCount: number;
    }>(TOOL_NAMES.add_to_cart, { productId, name, price, quantity: qty });

    const normalized = normalizeCartView({ items: raw.cart, cartTotal: raw.cartTotal, itemCount: raw.itemCount });
    return { message: raw.message, ...normalized };
  }

  async getCart(): Promise<NormalizedCartView> {
    const raw = await this.callTool<RawCartView>(TOOL_NAMES.get_cart, {});
    return normalizeCartView(raw);
  }

  async clearCart(): Promise<void> {
    await this.callTool<{ message: string }>(TOOL_NAMES.clear_cart, {});
  }

  async removeFromCart(productId: string): Promise<NormalizedCartView> {
    const current = await this.getCart();
    const remaining = current.items.filter((item) => item.productId !== productId);
    await this.clearCart();
    for (const item of remaining) {
      await this.addToCart(item.productId, item.name, item.price, item.quantity);
    }
    return this.getCart();
  }

  async createOrder(req: CreateOrderRequest): Promise<NormalizedOrder> {
    // Inline Sri Lankan mobile number check — avoids a round-trip that would
    // just fail at the live API anyway.
    const SL_PHONE = /^(?:\+94|0)7\d{8}$/;
    if (!SL_PHONE.test(req.recipient.phone.replace(/[\s\-()]/g, ''))) {
      throw new KaprukaError({
        tool: TOOL_NAMES.create_order,
        message: 'Please provide a valid Sri Lankan mobile number, e.g. 0771234567.',
      });
    }

    // Normalize the delivery date — same treatment as checkDelivery.
    let isoDate: string;
    try {
      isoDate = normalizeDateToISO(req.delivery.date);
    } catch (e) {
      if (e instanceof InvalidDateError) {
        const tomorrow = normalizeDateToISO(undefined); // safe: always a future date
        throw new KaprukaError({
          tool: TOOL_NAMES.create_order,
          message: `That delivery date doesn't look right. Did you mean ${tomorrow}? Please confirm the date and I'll try again.`,
        });
      }
      throw e;
    }

    // Always send KaprukaLocal-format (recipient carries address + city).
    // The local server's live-mode handler remaps to the live API's schema.
    const args: Record<string, unknown> = {
      cart: req.cart,
      recipient: {
        name: req.recipient.name,
        phone: req.recipient.phone,
        address: req.recipient.address,
        city: req.recipient.city,
        ...(req.recipient.postal_code ? { postal_code: req.recipient.postal_code } : {}),
      },
      delivery: {
        date: isoDate,
        ...(req.delivery.instructions ? { instructions: req.delivery.instructions } : {}),
      },
      sender: { name: req.sender.name, phone: req.sender.phone },
      ...(req.gift_message ? { gift_message: req.gift_message } : {}),
      ...(req.currency ? { currency: req.currency } : {}),
    };

    const { parsed: raw } = await this.callToolWithRaw<{
      orderId: string;
      checkoutUrl: string;
      total: string;
      currency: string;
      items: Order['items'];
      status: string;
      expiresAt: string;
      _rawMarkdown?: string;
    }>(TOOL_NAMES.create_order, args);

    // In live mode KaprukaLocal embeds the real API markdown in _rawMarkdown.
    // normalizeOrderFromMarkdown extracts the real ORD-YYYYMMDD-XXXX id and the
    // legacy .jsp checkout URL that the vendor's own regexes miss.
    const fromMarkdown = raw._rawMarkdown ? normalizeOrderFromMarkdown(raw._rawMarkdown) : null;

    return normalizeCreateOrderResult({
      id: fromMarkdown?.id ?? raw.orderId,
      items: raw.items,
      total: fromMarkdown?.total ?? parseLkr(raw.total),
      currency: raw.currency,
      checkout_url: fromMarkdown?.checkoutUrl ?? raw.checkoutUrl,
      status: raw.status,
      created_at: new Date().toISOString(),
      expires_at: raw.expiresAt,
    });
  }

  async trackOrder(orderNumber: string): Promise<NormalizedOrder> {
    const raw = await this.callTool<{
      orderId: string;
      status: string;
      items: Order['items'];
      total: string;
      currency: string;
      createdAt: string;
      expiresAt: string;
    }>(TOOL_NAMES.track_order, { order_number: orderNumber });

    return normalizeTrackOrderResult({
      id: raw.orderId,
      items: raw.items,
      total: parseLkr(raw.total),
      currency: raw.currency,
      checkout_url: '',
      status: raw.status,
      created_at: raw.createdAt,
      expires_at: raw.expiresAt,
    });
  }

  async convertCurrency(amount: number, to: string): Promise<CurrencyResult> {
    return this.callTool<CurrencyResult>(TOOL_NAMES.convert_currency, { amount, to });
  }
}
