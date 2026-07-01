import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import {
  KaprukaError,
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
import type { RenderEventEmitter } from './events.js';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function dedup(products: NormalizedProduct[]): NormalizedProduct[] {
  return products.filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);
}

function formatPrice(price: number | null): string {
  return price !== null ? `LKR ${price}` : 'price unavailable';
}

function extractPriceConstraint(q: string): { cleanQ: string; maxPrice?: number } {
  const m = q.match(
    /(?:under|below|less than|max|up to|within|not more than)\s*(?:lkr\s*)?(\d[\d,]*)/i,
  );
  if (!m) return { cleanQ: q };
  const maxPrice = parseInt(m[1].replace(/,/g, ''), 10);
  const cleanQ = q.replace(m[0], '').replace(/\s+/g, ' ').trim() || q;
  return { cleanQ, maxPrice };
}

/**
 * Runs a tool body, emitting an ERROR render event and returning a short
 * narratable string on any failure — tools must never throw into the graph.
 */
async function runTool(
  toolName: string,
  emitter: RenderEventEmitter,
  fn: () => Promise<string>,
): Promise<string> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof KaprukaError ? err.message : toMessage(err);
    logger.error({ tool: toolName, err: message }, 'agent tool failed');
    emitter.emitRender({ type: 'ERROR', message, tool: toolName });
    return `Couldn't complete that just now — ${message}. Let's try again in a moment.`;
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
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof KaprukaError ? err.message : toMessage(err);
    logger.error({ tool: toolName, err: message }, 'agent tool failed');
    emitter.emitRender({ type: 'ERROR', message, tool: toolName });
    return [
      `Couldn't complete that just now — ${message}. Let's try again in a moment.`,
      errorArtifact,
    ];
  }
}

export function createTools(
  adapter: CommercePort,
  emitter: RenderEventEmitter,
  memoryStore: CustomerMemoryStore,
  browserId: string,
): DynamicStructuredTool[] {
  const searchProducts = new DynamicStructuredTool({
    name: 'searchProducts',
    description:
      'Call this when the user asks to find, browse, search for, or discover any product. ' +
      'Also call this when the user describes what they want as a gift, occasion, or recipient ' +
      'without naming a product (e.g. "something for my mum", "birthday gift under 5000"). ' +
      'NEVER describe products from memory — always call this tool to get real data. ' +
      'Do not pass a category parameter when COMMERCE_MODE is live.',
    schema: z.object({ q: z.string(), category: z.string().optional() }),
    func: async ({ q, category }) =>
      runTool('searchProducts', emitter, async () => {
        const { cleanQ, maxPrice } = extractPriceConstraint(q);
        const result = await adapter.search(cleanQ, category);

        const filtered = maxPrice !== undefined
          ? result.products.filter((p) => p.price !== null && p.price <= maxPrice)
          : result.products;
        const products = dedup(filtered);

        if (products.length === 0) {
          emitter.emitRender({ type: 'PRODUCT_LIST', products: [], query: cleanQ });
          if (maxPrice !== undefined) {
            const priced = result.products.filter((p) => p.price !== null);
            const cheapest = [...priced].sort((a, b) => (a.price as number) - (b.price as number))[0];
            const hint = cheapest
              ? ` Cheapest available is "${cheapest.name}" at ${formatPrice(cheapest.price)}.`
              : '';
            return `No results for "${cleanQ}" under LKR ${maxPrice}.${hint} Call getAlternatives with the same query.`;
          }
          return `No results for "${cleanQ}". Calling getAlternatives now.`;
        }

        // Hydrate real image URLs for top 5 results. search_products returns product page
        // URLs; get_product returns the real CDN image. KaprukaLocal caches for 30 min.
        const toHydrate = products.slice(0, 5);
        const hydrateResults = await Promise.allSettled(
          toHydrate.map((p) => adapter.getProduct(p.id)),
        );
        const withImages = toHydrate.map((p, i) => {
          const r = hydrateResults[i];
          return r.status === 'fulfilled' ? { ...p, image_url: r.value.image_url } : p;
        });
        const readyProducts = [...withImages, ...products.slice(5)];

        emitter.emitRender({
          type: 'PRODUCT_LIST',
          products: readyProducts.map(normalizedToUIProduct),
          query: cleanQ,
        });

        const top3 = readyProducts.slice(0, 3);
        const summary = top3.map((p) => `${p.name ?? 'Unnamed item'} — ${formatPrice(p.price)} (id: ${p.id})`).join(', ');
        const priceNote = maxPrice !== undefined ? ` (filtered to under LKR ${maxPrice})` : '';
        return `Found ${readyProducts.length} results for "${cleanQ}"${priceNote}. Top matches: ${summary}. Ask which one they'd like or offer to check delivery.`;
      }),
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
        return `${product.name ?? 'Unnamed item'} — ${formatPrice(product.price)}. ${description}In stock: ${product.in_stock ? 'yes' : 'no'}.`;
      }),
  });

  const getAlternatives = new DynamicStructuredTool({
    name: 'getAlternatives',
    description:
      'Call this automatically when searchProducts returns fewer than 2 results, or when the ' +
      'user says results don\'t match what they want. Do not ask the user before calling — ' +
      'just call it and say "let me look a bit wider".',
    schema: z.object({ query: z.string() }),
    func: async ({ query }) =>
      runTool('getAlternatives', emitter, async () => {
        const { cleanQ, maxPrice } = extractPriceConstraint(query);
        const result = await adapter.getAlternatives(cleanQ, maxPrice);

        const filtered = maxPrice !== undefined
          ? result.products.filter((p) => p.price !== null && p.price <= maxPrice)
          : result.products;
        const products = dedup(filtered);

        emitter.emitRender({
          type: 'PRODUCT_LIST',
          products: products.map(normalizedToUIProduct),
          query: cleanQ,
        });

        const top3 = products.slice(0, 3);
        const summary = top3.map((p) => `${p.name ?? 'Unnamed item'} — ${formatPrice(p.price)}`).join(', ');
        return `Found ${products.length} alternatives. Top: ${summary}.`;
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

  const validateShipping = new DynamicStructuredTool({
    name: 'validateShipping',
    description:
      'Call this before every createOrder to validate the recipient\'s name, phone number, ' +
      'and city. If validation fails, tell the user exactly what to fix. Never call createOrder ' +
      'if this returns errors.',
    schema: z.object({ name: z.string(), phone: z.string(), address: z.string(), city: z.string() }),
    func: async ({ name, phone, address, city }) =>
      runTool('validateShipping', emitter, async () => {
        const result = await adapter.validateShipping({
          name,
          phone,
          address_line1: address,
          city,
        });

        if (result.valid) {
          return 'Shipping validated. Ready to create order.';
        }

        const warnings = result.warnings.length > 0 ? ` Warnings: ${result.warnings.join(', ')}` : '';
        return `Shipping issues: ${result.errors.join(', ')}.${warnings}`;
      }),
  });

  const addToCart = new DynamicStructuredTool({
    name: 'addToCart',
    description:
      'Call this when the user says they want to add an item to their cart, buy something, ' +
      'or proceed with a product. You need the product id, name, and price from a previous ' +
      'searchProducts or getProduct call.',
    schema: z.object({
      productId: z.string(),
      name: z.string(),
      price: z.number(),
      quantity: z.number().default(1),
    }),
    func: async ({ productId, name, price, quantity }) =>
      runTool('addToCart', emitter, async () => {
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
      'speculatively. Always call validateShipping first.',
    schema: z.object({
      recipientName: z.string(),
      recipientPhone: z.string(),
      deliveryAddress: z.string(),
      deliveryCity: z.string(),
      deliveryDate: z.string(),
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
        const message = err instanceof KaprukaError ? err.message : toMessage(err);
        logger.error({ tool: 'createOrder', err: message }, 'agent tool failed');
        emitter.emitRender({ type: 'ERROR', message, tool: 'createOrder' });
        return `Could not create order right now. ${message}. Please try again in a moment.`;
      }
    },
  });

  const trackOrder = new DynamicStructuredTool({
    name: 'trackOrder',
    description:
      'Call this when the user provides an order number and asks about delivery status, ' +
      'or asks to track their order.',
    schema: z.object({ orderNumber: z.string() }),
    func: async ({ orderNumber }) =>
      runTool('trackOrder', emitter, async () => {
        const order = await adapter.trackOrder(orderNumber);
        return `Order ${orderNumber}: ${order.status ?? 'status unavailable'}.`;
      }),
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
    getProduct,
    getAlternatives,
    checkDelivery,
    validateShipping,
    addToCart,
    getCart,
    getRecommendations,
    createOrder,
    trackOrder,
    convertCurrency,
    listDeliveryCities,
    rememberCustomerFact,
    faqLookup,
  ];
}
