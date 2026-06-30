import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { KaprukaLocal } from 'kapruka-mcp/local';
import { SqliteStorage } from 'kapruka-mcp/storage';
import { TOOL_NAMES } from 'kapruka-mcp';
import type { CartItem, CreateOrderRequest, Order, Product, ShippingAddress } from 'kapruka-mcp';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

interface SearchResult {
  products: Product[];
  total: number;
  query: string;
}

interface RawCart {
  items: Array<CartItem & { subtotal?: string }>;
  cartTotal: string;
  itemCount: number;
}

interface RawOrder {
  orderId: string;
  checkoutUrl?: string;
  total: string;
  currency: string;
  items: Order['items'];
  status: string;
  createdAt?: string;
  expiresAt: string;
}

const TOTAL_METHODS = 14;
const TOOL_TIMEOUT_MS = 20_000;

const results: CheckResult[] = [];
const recipient: ShippingAddress = {
  name: 'Test',
  phone: '0771234567',
  address_line1: '42 Galle Road',
  city: 'COL',
};

function tomorrowDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

  return JSON.stringify(result);
}

function throwIfErrorPayload(value: unknown): void {
  if (isRecord(value) && typeof value.error === 'string') {
    const suggestion = typeof value.suggestion === 'string' ? ` Suggestion: ${value.suggestion}` : '';
    throw new Error(`${value.error}${suggestion}`);
  }
}

function productSummary(product: Product | undefined): string {
  if (!product) return 'no product';
  return `${product.id} | ${product.name} | ${product.currency} ${product.price}`;
}

function cartSummary(cart: RawCart): string {
  const first = cart.items[0];
  const item = first ? `first=${first.productId} x${first.quantity}` : 'empty';
  return `items=${cart.itemCount}, total=${cart.cartTotal}, ${item}`;
}

function orderSummary(order: RawOrder): string {
  return `order=${order.orderId}, status=${order.status}, total=${order.currency} ${order.total}, items=${order.items.length}`;
}

async function check(name: string, fn: () => Promise<string>): Promise<void> {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`✅ ${name} — ${detail}`);
  } catch (err) {
    const detail = errorMessage(err);
    results.push({ name, ok: false, detail });
    console.log(`❌ ${name} — ${detail}`);
  }
}

async function requireProduct(product: Product | null): Promise<Product> {
  if (!product) throw new Error('no product available from getProduct()');
  return product;
}

async function requireCart(cart: RawCart | null): Promise<RawCart> {
  if (!cart) throw new Error('no cart available from getCart()');
  if (cart.items.length === 0) throw new Error('cart is empty');
  return cart;
}

async function requireOrder(order: RawOrder | null): Promise<RawOrder> {
  if (!order) throw new Error('no order available from createOrder()');
  return order;
}

async function createLiveClient(): Promise<Client> {
  const storage = await SqliteStorage.create('./kapruka-cart.db');
  const local = new KaprukaLocal({ mock: false, storage });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

  await local.getServer().connect(serverTransport);

  const client = new Client({ name: 'kapruka-live-diagnostic', version: '0.1.0' });
  await client.connect(clientTransport);

  return client;
}

async function run(): Promise<void> {
  process.env.COMMERCE_MODE = 'live';

  const client = await createLiveClient();
  console.log('\n--- Live CommercePort diagnostic (COMMERCE_MODE=live, no adapter warm-up) ---\n');

  async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await client.callTool(
      { name, arguments: args },
      undefined,
      { signal: AbortSignal.timeout(TOOL_TIMEOUT_MS) },
    );
    const text = extractToolText(result);
    const parsed: unknown = JSON.parse(text);

    throwIfErrorPayload(parsed);
    return parsed as T;
  }

  let searchProductId: string | null = null;
  let product: Product | null = null;
  let cart: RawCart | null = null;
  let order: RawOrder | null = null;

  await check('listDeliveryCities()', async () => {
    const cities = await callTool<Array<{ id: string; name: string; delivery_fee: number }>>(
      TOOL_NAMES.list_delivery_cities,
      {},
    );
    const first = cities[0];
    return `${cities.length} cities, first=${first ? `${first.id} | ${first.name} | fee=${first.delivery_fee}` : 'n/a'}`;
  });

  await check('listCategories()', async () => {
    const categories = await callTool<Array<{ id: string; name: string }>>(TOOL_NAMES.list_categories, {});
    const first = categories[0];
    return `${categories.length} categories, first=${first ? `${first.id} | ${first.name}` : 'n/a'}`;
  });

  await check('search("roses")', async () => {
    const search = await callTool<SearchResult>(TOOL_NAMES.search_products, { q: 'roses' });
    searchProductId = search.products[0]?.id ?? null;
    return `${search.total} results for "${search.query}", first=${productSummary(search.products[0])}`;
  });

  await check('getAlternatives("birthday cake")', async () => {
    const alternatives = await callTool<{ query: string; alternatives: Product[]; total: number }>(
      TOOL_NAMES.get_alternatives,
      { query: 'birthday cake' },
    );
    return `${alternatives.total} alternatives, first=${productSummary(alternatives.alternatives[0])}`;
  });

  await check('getRecommendations("flowers")', async () => {
    const recommendations = await callTool<{ recommendations: Product[] }>(TOOL_NAMES.get_recommendations, {});
    return `${recommendations.recommendations.length} recommendations, first=${productSummary(
      recommendations.recommendations[0],
    )}`;
  });

  await check('getProduct()', async () => {
    if (!searchProductId) throw new Error('no product ID available from search("roses")');
    product = await callTool<Product>(TOOL_NAMES.get_product, { product_id: searchProductId });
    return productSummary(product);
  });

  await check('checkDelivery("COL", product_id)', async () => {
    const selected = await requireProduct(product);
    const delivery = await callTool<{
      available: boolean;
      city: string;
      deliveryFee: string;
      estimatedDays: number;
      note: string;
    }>(TOOL_NAMES.check_delivery, { city: 'COL', product_id: selected.id });

    return `available=${delivery.available}, city=${delivery.city}, fee=${delivery.deliveryFee}, days=${delivery.estimatedDays}, note=${delivery.note}`;
  });

  await check('validateShipping()', async () => {
    const validation = await callTool<{ valid: boolean; errors: string[]; warnings: string[]; suggestion?: string }>(
      TOOL_NAMES.validate_shipping,
      {
        name: recipient.name,
        phone: recipient.phone,
        address: recipient.address_line1,
        city: recipient.city,
      },
    );

    return `valid=${validation.valid}, errors=${validation.errors.length}, warnings=${validation.warnings.length}${
      validation.suggestion ? `, suggestion=${validation.suggestion}` : ''
    }`;
  });

  await check('addToCart(product_id, name, price, 1)', async () => {
    const selected = await requireProduct(product);
    const added = await callTool<{ message: string; cart: CartItem[]; cartTotal: string; itemCount: number }>(
      TOOL_NAMES.add_to_cart,
      {
        productId: selected.id,
        name: selected.name,
        price: selected.price,
        quantity: 1,
      },
    );

    return `${added.message}, items=${added.itemCount}, total=${added.cartTotal}`;
  });

  await check('getCart()', async () => {
    cart = await callTool<RawCart>(TOOL_NAMES.get_cart, {});
    return cartSummary(cart);
  });

  await check('convertCurrency(3500, "USD")', async () => {
    const converted = await callTool<{
      original: string;
      converted: string;
      rate: string;
      source: string;
      note: string;
    }>(TOOL_NAMES.convert_currency, { amount: 3500, to: 'USD' });

    return `${converted.original} -> ${converted.converted}, rate=${converted.rate}, source=${converted.source}`;
  });

  await check('createOrder()', async () => {
    const currentCart = await requireCart(cart);
    const request: CreateOrderRequest = {
      cart: currentCart.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
      })),
      recipient: {
        name: recipient.name,
        phone: recipient.phone,
        address: recipient.address_line1,
        city: recipient.city,
      },
      delivery: { date: tomorrowDate() },
      sender: { name: 'Test', phone: '0771234567' },
    };

    order = await callTool<RawOrder>(TOOL_NAMES.create_order, { ...request });
    return orderSummary(order);
  });

  await check('trackOrder()', async () => {
    const createdOrder = await requireOrder(order);
    const tracked = await callTool<RawOrder>(TOOL_NAMES.track_order, { order_number: createdOrder.orderId });
    return orderSummary(tracked);
  });

  await check('clearCart()', async () => {
    await callTool<{ message: string }>(TOOL_NAMES.clear_cart, {});
    const emptyCart = await callTool<RawCart>(TOOL_NAMES.get_cart, {});
    return cartSummary(emptyCart);
  });

  const passed = results.filter((result) => result.ok).length;
  console.log(`\n${passed}/${TOTAL_METHODS} tools working in live mode`);

  if (passed !== TOTAL_METHODS) {
    process.exitCode = 1;
  }
}

run().catch((err: unknown) => {
  console.error('Live diagnostic crashed:', errorMessage(err));
  process.exitCode = 1;
});
