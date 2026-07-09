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
import { getCartDbPath } from '@/lib/db-paths.js';

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

/**
 * Mirrors the request-content markers in agent/errorFormatter.ts (pydantic
 * validation prose, the city-failure freeform message, and the `Error (code):`
 * shape) — duplicated here rather than imported, since importing from src/agent/
 * into src/adapters/ would invert the ports & adapters dependency direction.
 * Keep in sync with errorFormatter.ts's PYDANTIC_MARKERS/CITY_FAILURE_MARKER
 * by hand if either changes.
 */
const REQUEST_LEVEL_MARKERS = ['validation error for', 'Value error,', 'Field required', 'Delivery check failed for city'];
const CODED_ERROR_PATTERN = /Error \([a-z_]+\):/i;

/**
 * True when retrying with a rebuilt connection is pointless because the
 * problem is what we asked, not how we're connected — KaprukaError,
 * pydantic validation prose, or any `Error (code): ...` payload.
 */
export function isRequestLevelError(err: unknown): boolean {
  if (err instanceof KaprukaError) return true;
  if (err instanceof Error) {
    return REQUEST_LEVEL_MARKERS.some((marker) => err.message.includes(marker)) || CODED_ERROR_PATTERN.test(err.message);
  }
  return false;
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

function makeAmbiguousCityResponse(
  userCity: string,
  resolution: import('./cityForDelivery.js').CityResolution,
): NormalizedDeliveryCheckWithContext & { note: string } {
  return {
    city: null,
    availability: 'unknown',
    nextAvailableDate: null,
    fee: null,
    note: '',
    resolutionContext: {
      requestedCity: userCity,
      resolvedAs: resolution.suggestedDefault ?? null,
      ambiguous: true,
      alternateNames: resolution.alternateNames,
      reason: 'ambiguous-defaulted',
      requestedDate: null,
      resolvedDate: null,
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
  private client: Client;
  private local: KaprukaLocal;
  private readonly storage: SqliteStorage | MemoryStorage;
  private readonly mode: CommerceMode;
  /** Dedupes concurrent reconnect() calls — see reconnect() for why. */
  private reconnectInFlight: Promise<void> | null = null;

  private constructor(client: Client, local: KaprukaLocal, storage: SqliteStorage | MemoryStorage, mode: CommerceMode) {
    this.client = client;
    this.local = local;
    this.storage = storage;
    this.mode = mode;
  }

  /**
   * Builds a fresh local-server + in-process transport + client triple, then
   * warms it up. Shared by create() (first connection) and reconnect()
   * (rebuilding after a dead session) — storage is passed in rather than
   * rebuilt so cart state (SqliteStorage on disk, or the in-memory cart for
   * mock mode) survives a reconnect.
   */
  private static async buildConnection(
    storage: SqliteStorage | MemoryStorage,
    mode: CommerceMode,
  ): Promise<{ client: Client; local: KaprukaLocal }> {
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

    // R3 fix: warm up the connection (and isOfficialServer detection) before
    // any real calls are made. Uses search_products (not list_categories) —
    // the live server returns non-JSON for list_categories. The very first
    // call on a cold connection always throws here (the SDK checks
    // isOfficialServer before connect() has run, so it picks the wrong
    // response-parsing path) — that's expected and fine: its only job is to
    // force the connection so isOfficialServer is correct for every call after
    // it. Applies to both the initial connection (create()) and any rebuilt
    // one (reconnect()) — same cold-start race either way.
    try {
      await client.callTool(
        { name: TOOL_NAMES.search_products, arguments: { q: 'cake' } },
        undefined,
        { signal: AbortSignal.timeout(TOOL_TIMEOUT_MS) },
      );
    } catch (err) {
      const e = toError(err);
      logger.warn(
        { err: e.message, errName: e.name, errCode: (e as NodeJS.ErrnoException).code },
        'warm-up call failed (expected on cold connection)',
      );
    }

    return { client, local };
  }

  static async create(mode: CommerceMode): Promise<KaprukaAdapter> {
    const storage = mode === 'live' ? await SqliteStorage.create(getCartDbPath()) : new MemoryStorage();
    const { client, local } = await KaprukaAdapter.buildConnection(storage, mode);
    const adapter = new KaprukaAdapter(client, local, storage, mode);

    // Verification call — connection is proven healthy if this succeeds at
    // all (a genuinely dead connection/transport throws here). Deliberately
    // NOT wrapped in try/catch: if it throws, it propagates out of create()
    // so getAdapter() never caches a broken instance.
    const verifyRaw = await adapter.callTool<SearchResult>(TOOL_NAMES.search_products, { q: 'test' });

    // Normalizer check is diagnostic only — a healthy connection that returns
    // a shape the normalizer doesn't like shouldn't fail create() over it.
    try {
      normalizeSearchResult(verifyRaw);
    } catch (parseErr) {
      logger.warn(
        { err: toError(parseErr).message, rawKeys: Object.keys(verifyRaw ?? {}) },
        'verification response parsed but normalizer rejected it — connection is healthy, normalizer may need attention',
      );
    }

    return adapter;
  }

  /**
   * Rebuilds the local server + transport + client in place, preserving
   * `this` identity — callers that captured this adapter instance (route.ts,
   * reactiveTurn.ts hold one per request) keep a working reference after a
   * reconnect instead of pointing at an abandoned object. Storage (and so
   * cart state) is reused, not rebuilt.
   *
   * The singleton adapter is shared across concurrent requests (a chat POST
   * and a debounced reactive-cart-action can both be mid-call at once), so
   * two callers can hit retry-exhaustion together. Without dedup, both would
   * build their own replacement connection and tear down whatever the other
   * just installed. reconnectInFlight makes concurrent callers await the
   * same rebuild instead of racing.
   *
   * This does NOT protect an unrelated in-flight call on the old connection
   * from being aborted by the teardown below — that call's own retry loop
   * will pick up the new connection and self-heal, just with an extra failed
   * attempt. Accepted tradeoff; a full request-queue lock was judged overkill
   * here.
   */
  private async reconnect(): Promise<void> {
    if (this.reconnectInFlight) {
      return this.reconnectInFlight;
    }

    const doReconnect = async (): Promise<void> => {
      const oldLocal = this.local;
      const oldClient = this.client;

      const { client, local } = await KaprukaAdapter.buildConnection(this.storage, this.mode);
      this.client = client;
      this.local = local;

      await oldLocal.shutdown().catch((err: unknown) => {
        logger.warn({ err: toError(err).message }, 'error shutting down previous kapruka session during reconnect');
      });
      await oldClient.close().catch((err: unknown) => {
        logger.warn({ err: toError(err).message }, 'error closing previous kapruka client during reconnect');
      });
    };

    this.reconnectInFlight = doReconnect().finally(() => {
      this.reconnectInFlight = null;
    });
    return this.reconnectInFlight;
  }

  /** Best-effort teardown — used by adapters/index.ts's resetAdapter(). */
  async shutdown(): Promise<void> {
    await this.local.shutdown().catch((err: unknown) => {
      logger.warn({ err: toError(err).message }, 'error shutting down kapruka session');
    });
    await this.client.close().catch((err: unknown) => {
      logger.warn({ err: toError(err).message }, 'error closing kapruka client');
    });
  }

  /**
   * Parses a raw MCP callTool result into T, throwing KaprukaError for the
   * two known error shapes. Shared by callTool, callToolWithRaw, and each
   * one's post-reconnect single retry.
   */
  private parseToolResult<T>(name: string, result: unknown): { parsed: T; text: string } {
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

    return { parsed: parsed as T, text };
  }

  /**
   * After retries are exhausted on a non-request-level error (network/session
   * death, not bad input), rebuild the connection once and retry the call a
   * single time. hasAttemptedReconnect (scoped to the calling callTool/
   * callToolWithRaw invocation) prevents looping this more than once per call.
   * Returns the successful result, or throws (caller falls through to its
   * existing exhausted-retries throw).
   */
  private async reconnectAndRetryOnce<T>(name: string, args: Record<string, unknown>): Promise<{ parsed: T; text: string }> {
    await this.reconnect();
    const result = await this.client.callTool(
      { name, arguments: args },
      undefined,
      { signal: AbortSignal.timeout(TOOL_TIMEOUT_MS) },
    );
    return this.parseToolResult<T>(name, result);
  }

  // -------------------------------------------------------------------------
  // Tool call helper — timeout (R2), retry (R1), JSON parsing, error detection
  // -------------------------------------------------------------------------
  private async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const start = Date.now();
    let lastError: unknown;
    let hasAttemptedReconnect = false;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const result = await this.client.callTool(
          { name, arguments: args },
          undefined,
          { signal: AbortSignal.timeout(TOOL_TIMEOUT_MS) },
        );

        const { parsed } = this.parseToolResult<T>(name, result);

        logger.info({ tool: name, args, durationMs: Date.now() - start }, 'kapruka tool call succeeded');
        return parsed;
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

    // Retries exhausted (or a single non-retryable, non-KaprukaError failure).
    // If the problem doesn't look like it's about the request content itself,
    // it's plausibly a dead session/transport — rebuild the connection and
    // give the call one more shot before giving up for good.
    if (!isRequestLevelError(lastError) && !hasAttemptedReconnect) {
      hasAttemptedReconnect = true;
      logger.warn({ tool: name, err: toError(lastError).message }, 'non-request error after retry exhaustion — rebuilding connection');
      try {
        const { parsed } = await this.reconnectAndRetryOnce<T>(name, args);
        logger.info({ tool: name, args, durationMs: Date.now() - start }, 'kapruka tool call succeeded after reconnect');
        return parsed;
      } catch (retryErr) {
        lastError = retryErr;
        logger.error({ tool: name, err: toError(retryErr).message }, 'reconnect did not resolve the failure');
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
    let hasAttemptedReconnect = false;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const result = await this.client.callTool(
          { name, arguments: args },
          undefined,
          { signal: AbortSignal.timeout(TOOL_TIMEOUT_MS) },
        );

        const { parsed, text } = this.parseToolResult<T>(name, result);

        logger.info({ tool: name, args, durationMs: Date.now() - start }, 'kapruka tool call succeeded');
        return { parsed, rawText: text };
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

    if (!isRequestLevelError(lastError) && !hasAttemptedReconnect) {
      hasAttemptedReconnect = true;
      logger.warn({ tool: name, err: toError(lastError).message }, 'non-request error after retry exhaustion — rebuilding connection');
      try {
        const { parsed, text } = await this.reconnectAndRetryOnce<T>(name, args);
        logger.info({ tool: name, args, durationMs: Date.now() - start }, 'kapruka tool call succeeded after reconnect');
        return { parsed, rawText: text };
      } catch (retryErr) {
        lastError = retryErr;
        logger.error({ tool: name, err: toError(retryErr).message }, 'reconnect did not resolve the failure');
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
    // Client-side vendor filter — the server has no vendor param. We fetch a
    // wider batch, hydrate each result to get the vendor field (cached within
    // the 30-min KaprukaLocal cache, so a second getProduct call in tools.ts
    // is free), then filter by case-insensitive substring match.
    if (filters?.vendor) {
      const vendorLower = filters.vendor.toLowerCase();
      const wideLimit = Math.max((filters.limit ?? 10) * 2, 20);
      const vendorArgs: Record<string, unknown> = { q, limit: wideLimit };
      if (category && this.mode !== 'live') vendorArgs.category = category;
      if (filters.min_price !== undefined) vendorArgs.min_price = filters.min_price;
      if (filters.max_price !== undefined) vendorArgs.max_price = filters.max_price;
      if (filters.in_stock_only !== undefined) vendorArgs.in_stock_only = filters.in_stock_only;
      if (filters.sort !== undefined) vendorArgs.sort = filters.sort;
      if (cursor !== undefined) vendorArgs.cursor = cursor;

      const raw = await this.callTool<SearchResult>(TOOL_NAMES.search_products, vendorArgs);
      const result = normalizeSearchResult(raw);

      if (result.products.length > 0) {
        const hydrated = await Promise.allSettled(result.products.map((p) => this.getProduct(p.id)));
        const matched = result.products
          .map((p, i) => {
            const r = hydrated[i];
            return r.status === 'fulfilled' ? r.value : p;
          })
          .filter((p) => p.vendor !== null && p.vendor.toLowerCase().includes(vendorLower));

        return {
          products: matched.slice(0, filters.limit ?? 10),
          total: matched.length,
          query: q,
          cursor: matched.length > 0 ? result.cursor : null,
          matchOutcome: matched.length > 0 ? 'ok' : 'no-match',
        };
      }

      return { products: [], total: 0, query: q, cursor: null, matchOutcome: 'no-match' };
    }

    // R10 fix: live server taxonomy differs — category filtering returns 0 results live.
    const args: Record<string, unknown> = { q };
    if (category && this.mode !== 'live') args.category = category;
    if (filters?.min_price !== undefined) args.min_price = filters.min_price;
    if (filters?.max_price !== undefined) args.max_price = filters.max_price;
    if (filters?.in_stock_only !== undefined) args.in_stock_only = filters.in_stock_only;
    if (filters?.sort !== undefined) args.sort = filters.sort;
    if (filters?.limit !== undefined) args.limit = filters.limit;
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
      if (resolution.reason === 'ambiguous-defaulted') {
        return makeAmbiguousCityResponse(city, resolution);
      }
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
