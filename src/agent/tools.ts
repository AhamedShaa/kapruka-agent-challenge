import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import {
  type CommercePort,
  type CreateOrderRequest,
  type NormalizedProduct,
  type DeliveryResolutionContext,
} from '@/core/ports/commerce.port.js';
import {
  normalizedToUIProduct,
  normalizedToUICartItem,
  normalizedToUIDeliveryQuote,
} from '@/adapters/ui-mappers.js';
import type { CustomerMemoryStore } from '@/lib/customerMemory.js';
import { logger } from '@/lib/logger.js';
import { searchFAQ } from '@/lib/faq.js';
import { withCartLock } from '@/adapters/cartLock.js';
import { resolveCityQuery } from './cityResolver.js';
import { toUserSafeMessage } from './errorFormatter.js';
import type { RenderEventEmitter } from './events.js';
import type { LastSearchContext } from './state.js';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function dedup(products: NormalizedProduct[]): NormalizedProduct[] {
  return products.filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);
}

function formatPrice(price: number | null): string {
  return price !== null ? `LKR ${price}` : 'price unavailable';
}

/**
 * Shared by searchProducts and showMoreResults — hydrates real CDN image URLs
 * for every result, emits the carousel, and builds the full-set (not just
 * top-3) name/price summary the LLM needs to discuss anything the carousel
 * actually shows. Safe to hydrate the whole set unconditionally because the
 * result set itself is now explicitly bounded at the source (limit: 10 on
 * the search_products call) rather than capped here after the fact.
 */
async function hydrateAndEmitProducts(
  adapter: CommercePort,
  emitter: RenderEventEmitter,
  products: NormalizedProduct[],
  query: string,
): Promise<{ readyProducts: NormalizedProduct[]; summary: string }> {
  const hydrateResults = await Promise.allSettled(
    products.map((p) => adapter.getProduct(p.id)),
  );
  const readyProducts = products.map((p, i) => {
    const r = hydrateResults[i];
    return r.status === 'fulfilled' ? { ...p, image_url: r.value.image_url } : p;
  });

  emitter.emitRender({
    type: 'PRODUCT_LIST',
    products: readyProducts.map(normalizedToUIProduct),
    query,
  });

  const summary = readyProducts
    .map((p) => `${p.name ?? 'Unnamed item'} — ${formatPrice(p.price)} (id: ${p.id})`)
    .join(', ');

  return { readyProducts, summary };
}

/** Friendly labels for the TOOL_ACTIVITY event — covers every tool routed
 * through runTool/runToolWithArtifact, plus createOrder (emitted explicitly,
 * since it doesn't use either wrapper). rememberCustomerFact is intentionally
 * excluded — it's a silent, local, near-instant operation. */
const TOOL_LABELS: Record<string, string> = {
  searchProducts: 'Searching products',
  showMoreResults: 'Loading more results',
  getProduct: 'Getting product details',
  checkDelivery: 'Checking delivery',
  addToCart: 'Adding to cart',
  getCart: 'Checking your cart',
  clearCart: 'Clearing your cart',
  removeFromCart: 'Removing item',
  getRecommendations: 'Finding recommendations',
  createOrder: 'Placing your order',
  convertCurrency: 'Converting currency',
  listDeliveryCities: 'Looking up delivery cities',
  faqLookup: 'Checking policy details',
};

/**
 * Runs a tool body, emitting an ERROR render event and returning a short
 * narratable string on any failure — tools must never throw into the graph.
 */
async function runTool(
  toolName: string,
  emitter: RenderEventEmitter,
  fn: () => Promise<string>,
): Promise<string> {
  emitter.emitRender({
    type: 'TOOL_ACTIVITY',
    tool: toolName,
    label: TOOL_LABELS[toolName] ?? toolName,
    status: 'pending',
  });
  try {
    return await fn();
  } catch (err) {
    const message = toUserSafeMessage(err, toolName);
    emitter.emitRender({ type: 'ERROR', message, tool: toolName });
    return message;
  }
}

/**
 * Sibling of runTool, for tools using responseFormat: 'content_and_artifact'.
 * Returns [content, artifact] tuple on both success and error paths so
 * StructuredTool.call()'s tuple check never throws.
 *
 * TODO(post-submission): Merge with runTool by genericizing runTool to
 * take an explicit errorValue parameter, then updating all 13 string-only
 * call sites to pass their error strings explicitly. Deferred for now to
 * avoid touching the 13 other tools under deadline pressure.
 * See conversation history for the Option A vs B decision rationale.
 */
async function runToolWithArtifact<A>(
  toolName: string,
  emitter: RenderEventEmitter,
  fn: () => Promise<[string, A]>,
  errorArtifact: A,
): Promise<[string, A]> {
  emitter.emitRender({
    type: 'TOOL_ACTIVITY',
    tool: toolName,
    label: TOOL_LABELS[toolName] ?? toolName,
    status: 'pending',
  });
  try {
    return await fn();
  } catch (err) {
    const message = toUserSafeMessage(err, toolName);
    emitter.emitRender({ type: 'ERROR', message, tool: toolName });
    return [message, errorArtifact];
  }
}

export function createTools(
  adapter: CommercePort,
  emitter: RenderEventEmitter,
  memoryStore: CustomerMemoryStore,
  browserId: string,
  lastSearchContext: LastSearchContext | null = null,
): DynamicStructuredTool[] {
  const searchProducts = new DynamicStructuredTool({
    name: 'searchProducts',
    description:
      'Call this when the user asks to find, browse, search for, or discover any product. ' +
      'Also call this when the user describes what they want as a gift, occasion, or recipient ' +
      'without naming a product (e.g. "something for my mum", "birthday gift under 5000"). ' +
      'NEVER describe products from memory — always call this tool to get real data. ' +
      'When the user mentions a budget, pass it as min_price/max_price — do not leave the ' +
      'number embedded in q. Use in_stock_only to exclude out-of-stock items, and sort for ' +
      'bestseller/newest/price_asc/price_desc/relevance ordering. Do not pass a category ' +
      'parameter when COMMERCE_MODE is live.',
    schema: z.object({
      q: z.string(),
      category: z.string().optional(),
      min_price: z.number().optional(),
      max_price: z.number().optional(),
      in_stock_only: z.boolean().optional(),
      sort: z.enum(['bestseller', 'newest', 'price_asc', 'price_desc', 'relevance']).optional(),
    }),
    responseFormat: 'content_and_artifact',
    func: async ({ q, category, min_price, max_price, in_stock_only, sort }) =>
      runToolWithArtifact<LastSearchContext | null>(
        'searchProducts',
        emitter,
        async () => {
          const result = await adapter.search(q, category, { min_price, max_price, in_stock_only, sort, limit: 10 });
          const products = dedup(result.products);
          const context: LastSearchContext = {
            q,
            ...(category !== undefined ? { category } : {}),
            ...(min_price !== undefined ? { min_price } : {}),
            ...(max_price !== undefined ? { max_price } : {}),
            ...(in_stock_only !== undefined ? { in_stock_only } : {}),
            ...(sort !== undefined ? { sort } : {}),
            cursor: result.cursor,
          };

          if (products.length === 0) {
            emitter.emitRender({ type: 'PRODUCT_LIST', products: [], query: q });
            // Differentiated per matchOutcome — "nothing matches this term at
            // all" and "matches exist, just not within your filters" call for
            // different next steps from the LLM (rephrase vs. adjust budget).
            if (result.matchOutcome === 'filtered-empty') {
              return [
                `Found matches for "${q}", but none fit the filters you specified (price range and/or stock). Ask the user if they'd like to widen the budget or see the closest options anyway.`,
                context,
              ];
            }
            return [
              `No results for "${q}" — nothing matches this term at all. Try rephrasing the search or ask the user what they had in mind.`,
              context,
            ];
          }

          // Full set, not just the top few — the carousel shows every item
          // returned, so the LLM needs all of them nameable/priceable too
          // (e.g. "what about the 5th one"), not just the first 3.
          const { readyProducts, summary } = await hydrateAndEmitProducts(adapter, emitter, products, q);
          const priceNote = max_price !== undefined ? ` (filtered to under LKR ${max_price})` : '';
          return [
            `Found ${readyProducts.length} results for "${q}"${priceNote}: ${summary}. Ask which one they'd like or offer to check delivery.`,
            context,
          ];
        },
        null,
      ),
  });

  const showMoreResults = new DynamicStructuredTool({
    name: 'showMoreResults',
    description:
      "Call this when the user asks to see more, other, or additional results from their most " +
      'recent search — never to start a new search, and never when there was no prior search ' +
      'this conversation.',
    schema: z.object({}),
    responseFormat: 'content_and_artifact',
    func: async () =>
      runToolWithArtifact<LastSearchContext | null>(
        'showMoreResults',
        emitter,
        async () => {
          if (!lastSearchContext) {
            return ["There's no previous search to expand — ask the user what they'd like to search for.", null];
          }
          if (!lastSearchContext.cursor) {
            return [`No more results for "${lastSearchContext.q}" — that was the full list.`, lastSearchContext];
          }

          const result = await adapter.search(
            lastSearchContext.q,
            lastSearchContext.category,
            {
              min_price: lastSearchContext.min_price,
              max_price: lastSearchContext.max_price,
              in_stock_only: lastSearchContext.in_stock_only,
              sort: lastSearchContext.sort,
              limit: 10,
            },
            lastSearchContext.cursor,
          );
          const products = dedup(result.products);
          const nextContext: LastSearchContext = { ...lastSearchContext, cursor: result.cursor };

          if (products.length === 0) {
            emitter.emitRender({ type: 'PRODUCT_LIST', products: [], query: lastSearchContext.q });
            return [`No more results for "${lastSearchContext.q}".`, nextContext];
          }

          const { readyProducts, summary } = await hydrateAndEmitProducts(adapter, emitter, products, lastSearchContext.q);
          return [
            `Here are ${readyProducts.length} more results for "${lastSearchContext.q}": ${summary}. Ask which one they'd like or offer to check delivery.`,
            nextContext,
          ];
        },
        lastSearchContext,
      ),
  });

  const getProduct = new DynamicStructuredTool({
    name: 'getProduct',
    description:
      'Call this when the user selects a specific product from search results, asks for more ' +
      'details about a product, or when you need the full product information before adding to cart.',
    schema: z.object({ productId: z.string() }),
    func: async ({ productId }) =>
      runTool('getProduct', emitter, async () => {
        const product = await adapter.getProduct(productId);
        emitter.emitRender({ type: 'PRODUCT_DETAIL', product: normalizedToUIProduct(product) });

        const description = product.description ? `${product.description.slice(0, 80)}. ` : '';
        const vendorPart = product.vendor ? ` Vendor: ${product.vendor}.` : '';
        const weightPart = product.weight ? ` Weight: ${product.weight}.` : '';
        const urlPart = product.product_url ? ` View more details [here](${product.product_url}).` : '';
        return `${product.name ?? 'Unnamed item'} — ${formatPrice(product.price)}. ${description}In stock: ${product.in_stock ? 'yes' : 'no'}.${vendorPart}${weightPart}${urlPart}`;
      }),
  });

  const checkDelivery = new DynamicStructuredTool({
    name: 'checkDelivery',
    description:
      'Check whether a product can be delivered to a city on a date. The system handles city ' +
      'name resolution (vernacular names, ambiguous zones like "Colombo") and date format ' +
      'normalization (accepts "tomorrow", "15/07/2026", or "2026-07-15") automatically — pass ' +
      'the user\'s phrasing as-is.',
    schema: z.object({
      city: z.string().describe('City name as the user said it — vernacular ("Wellawatta"), ambiguous ("Colombo"), or canonical ("Colombo 06") all work.'),
      productId: z.string().describe('A product ID from a prior searchProducts or getProduct result.'),
      date: z.string().optional().describe('When delivery should happen, in any reasonable format. If omitted, defaults to tomorrow.'),
    }),
    responseFormat: 'content_and_artifact',
    func: async ({ city, productId, date }) =>
      runToolWithArtifact<{ resolutionContext: DeliveryResolutionContext | null }>(
        'checkDelivery',
        emitter,
        async () => {
          const quote = await adapter.checkDelivery(city, productId, date);
          const uiQuote = normalizedToUIDeliveryQuote(quote);
          emitter.emitRender({ type: 'DELIVERY_QUOTE', ...uiQuote });

          const narration = uiQuote.available
            ? `Delivery to ${uiQuote.city}: ${uiQuote.fee === 0 ? 'FREE' : `LKR ${uiQuote.fee}`}.`
            : `Cannot deliver to ${uiQuote.city}. ${uiQuote.note}. Suggest an alternative city.`;

          return [narration, { resolutionContext: quote.resolutionContext ?? null }];
        },
        { resolutionContext: null },
      ),
  });

  const addToCart = new DynamicStructuredTool({
    name: 'addToCart',
    description:
      'Call this when the user says they want to add an item to their cart, buy something, ' +
      'or proceed with a product. You only need the product id — name and price are looked up ' +
      'server-side from the canonical product record, never taken from your own memory.',
    schema: z.object({
      productId: z.string(),
      quantity: z.number().default(1),
    }),
    func: async ({ productId, quantity }) =>
      runTool('addToCart', emitter, async () => {
        // Canonical name/price, never LLM-supplied — closes off the class of bug
        // where a hallucinated or stale price/name gets written into the cart.
        const product = await adapter.getProduct(productId);
        const name = product.name ?? productId;
        const price = product.price ?? 0;

        const cart = await withCartLock(() => adapter.addToCart(productId, name, price, quantity));
        emitter.emitRender({
          type: 'CART',
          items: cart.items.map(normalizedToUICartItem),
          total: cart.total,
          itemCount: cart.itemCount,
        });

        return `Added ${quantity}x ${name} (LKR ${price}) to cart. Cart: ${cart.itemCount} item(s), LKR ${cart.total} total.`;
      }),
  });

  const getCart = new DynamicStructuredTool({
    name: 'getCart',
    description:
      'Call this when the user asks to see their cart, review what they\'ve added, or asks ' +
      'about their cart total.',
    schema: z.object({}),
    func: async () =>
      runTool('getCart', emitter, async () => {
        const cart = await adapter.getCart();
        emitter.emitRender({
          type: 'CART',
          items: cart.items.map(normalizedToUICartItem),
          total: cart.total,
          itemCount: cart.itemCount,
        });

        if (cart.items.length === 0) return 'Cart is empty.';

        const names = cart.items.map((item) => item.name).join(', ');
        return `Cart: ${cart.itemCount} item(s), LKR ${cart.total} total. Items: ${names}.`;
      }),
  });

  const clearCart = new DynamicStructuredTool({
    name: 'clearCart',
    description: 'Call this when the user asks to clear their entire cart or start over.',
    schema: z.object({}),
    func: async () =>
      runTool('clearCart', emitter, async () => {
        await withCartLock(() => adapter.clearCart());
        emitter.emitRender({ type: 'CART', items: [], total: 0, itemCount: 0 });
        return 'Cart cleared.';
      }),
  });

  const removeFromCart = new DynamicStructuredTool({
    name: 'removeFromCart',
    description:
      'Call this when the user wants to remove one specific item from their cart, keeping the rest.',
    schema: z.object({
      productId: z.string().describe(
        'The product id of the item to remove — shown in the current cart state in your context as "(id: ...)".',
      ),
    }),
    func: async ({ productId }) =>
      runTool('removeFromCart', emitter, async () => {
        const cart = await withCartLock(() => adapter.removeFromCart(productId));
        emitter.emitRender({
          type: 'CART',
          items: cart.items.map(normalizedToUICartItem),
          total: cart.total,
          itemCount: cart.itemCount,
        });

        if (cart.items.length === 0) return 'Item removed. Cart is now empty.';
        const names = cart.items.map((item) => item.name).join(', ');
        return `Item removed. Cart: ${cart.itemCount} item(s), LKR ${cart.total} total. Remaining: ${names}.`;
      }),
  });

  const getRecommendations = new DynamicStructuredTool({
    name: 'getRecommendations',
    description:
      'Call this after every addToCart to suggest complementary items. Use the category of ' +
      'the item just added. Only call once per cart addition.',
    schema: z.object({ category: z.string() }),
    func: async ({ category }) =>
      runTool('getRecommendations', emitter, async () => {
        const result = await adapter.getRecommendations(category);

        if (result.products.length === 0) {
          return 'No recommendations available.';
        }

        emitter.emitRender({ type: 'RECOMMENDATIONS', products: result.products.map(normalizedToUIProduct) });
        const top2 = result.products.slice(0, 2);
        const summary = top2.map((p) => `${p.name ?? 'Unnamed item'} — ${formatPrice(p.price)}`).join(', ');
        return `Suggestions: ${summary}. Mention these briefly.`;
      }),
  });

  const createOrder = new DynamicStructuredTool({
    name: 'createOrder',
    description:
      'Call this ONLY when the user explicitly confirms they want to place the order — ' +
      'phrases like "yes go ahead", "place it", "confirm", "order now". Never call this ' +
      'speculatively. Collect recipient name, phone (Sri Lankan mobile), address, city, ' +
      'and delivery date before calling.',
    schema: z.object({
      recipientName: z.string(),
      recipientPhone: z.string(),
      deliveryAddress: z.string(),
      deliveryCity: z.string(),
      deliveryDate: z.string().describe(
        'Delivery date as the user said it (e.g. "tomorrow", "next ' +
        'Monday", "2026-07-15") — do NOT compute or guess a calendar ' +
        'date yourself. Pass the user\'s words as-is; the system ' +
        'converts it using the real current date shown in your context.'
      ),
      senderName: z.string(),
      giftMessage: z.string().optional(),
    }),
    func: async ({
      recipientName,
      recipientPhone,
      deliveryAddress,
      deliveryCity,
      deliveryDate,
      senderName,
      giftMessage,
    }) => {
      emitter.emitRender({
        type: 'TOOL_ACTIVITY',
        tool: 'createOrder',
        label: TOOL_LABELS.createOrder,
        status: 'pending',
      });
      try {
        const cart = await adapter.getCart();
        const request: CreateOrderRequest = {
          cart: cart.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
          recipient: { name: recipientName, phone: recipientPhone, address: deliveryAddress, city: deliveryCity },
          delivery: { date: deliveryDate },
          // OrderSender requires `phone`, but the tool's input (per spec) only
          // collects a sender name — the live API drops sender.phone anyway
          // (see KaprukaAdapter.createOrder's live-mode remap).
          sender: { name: senderName, phone: '' },
          ...(giftMessage ? { gift_message: giftMessage } : {}),
        };

        const order = await adapter.createOrder(request);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const orderId = order.id ?? 'unknown';

        emitter.emitRender({
          type: 'CHECKOUT_LINK',
          checkoutUrl: order.checkoutUrl ?? '',
          orderId,
          total: order.total ?? 0,
          expiresAt,
        });

        memoryStore.recordOrder(browserId, recipientName, deliveryCity, giftMessage);

        return `Order created. Payment link ready. Order ID: ${orderId}. Link expires in 60 minutes.`;
      } catch (err) {
        const message = toUserSafeMessage(err, 'createOrder');
        emitter.emitRender({ type: 'ERROR', message, tool: 'createOrder' });
        return message;
      }
    },
  });

  const convertCurrency = new DynamicStructuredTool({
    name: 'convertCurrency',
    description:
      'Call this when the user asks to see a price in a currency other than LKR, asks ' +
      '"how much is that in USD/AUD/GBP/AED", or mentions they\'re sending from overseas.',
    schema: z.object({ amount: z.number(), to: z.string().default('USD') }),
    func: async ({ amount, to }) =>
      runTool('convertCurrency', emitter, async () => {
        const result = await adapter.convertCurrency(amount, to);
        return `LKR ${amount} = ${to} ${result.converted} (rate: 1 ${to} = LKR ${result.rate}).`;
      }),
  });

  const listDeliveryCities = new DynamicStructuredTool({
    name: 'listDeliveryCities',
    description:
      'Call this when the user mentions a delivery city, asks if something can be delivered, ' +
      'or asks about delivery fees or timing. Always use city names returned by this tool — ' +
      'never 3-letter mock codes like "COL". Pass the exact name field from the city list to ' +
      'checkDelivery.',
    schema: z.object({ query: z.string() }),
    func: async ({ query }) =>
      runTool('listDeliveryCities', emitter, async () => {
        const resolvedQuery = resolveCityQuery(query);
        const cityList = await adapter.listDeliveryCities(resolvedQuery);
        const matches = cityList.cities.slice(0, 3);
        // (No local filtering — the SDK already did substring matching
        // server-side using the resolved query)

        if (matches.length === 0) {
          return `No city found for "${query}". Ask the user to clarify.`;
        }

        const summary = matches.map((city) => `${city.name} (id: ${city.id ?? 'unavailable — use check_delivery by name'})`).join(', ');
        return `Cities matching "${query}": ${summary}.`;
      }),
  });

  const rememberCustomerFact = new DynamicStructuredTool({
    name: 'rememberCustomerFact',
    description:
      "Call this when the user mentions their name, a preferred delivery city, an allergy, or any " +
      'other durable preference that should be remembered for future conversations. Do not call this ' +
      "for transient details that only apply to this conversation (e.g. 'today I want roses').",
    schema: z.object({
      key: z.enum(['name', 'preferredCity', 'allergies', 'preferences']),
      value: z.string(),
    }),
    func: async ({ key, value }) => {
      try {
        memoryStore.recordFact(browserId, key, value);
      } catch (err) {
        logger.error({ tool: 'rememberCustomerFact', err: toMessage(err) }, 'agent tool failed');
      }
      return "Got it — I'll remember that.";
    },
  });

  const faqLookup = new DynamicStructuredTool({
    name: 'faqLookup',
    description:
      "Call this when the user asks about Kapruka's policies, returns, refunds, cancellation, " +
      'payment methods, delivery times, or anything that sounds like a customer support question ' +
      'rather than a product search.',
    schema: z.object({ query: z.string() }),
    func: async ({ query }) =>
      runTool('faqLookup', emitter, async () => {
        const answer = searchFAQ(query);
        if (answer) return answer;
        return "I don't have specific information on that. For direct support, contact Kapruka at support@kapruka.com or +94 11 234 5678.";
      }),
  });

  return [
    searchProducts,
    showMoreResults,
    getProduct,
    checkDelivery,
    addToCart,
    getCart,
    clearCart,
    removeFromCart,
    getRecommendations,
    createOrder,
    convertCurrency,
    listDeliveryCities,
    rememberCustomerFact,
    faqLookup,
  ];
}
