import { KaprukaAdapter } from '../src/adapters/kapruka.adapter.js';
import type { CommercePort, NormalizedOrder } from '../src/core/ports/commerce.port.js';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: CheckResult[] = [];

async function check(name: string, fn: () => Promise<string>): Promise<void> {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`✅ ${name} — ${detail}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, detail: message });
    console.log(`❌ ${name} — ${message}`);
  }
}

async function run(): Promise<void> {
  const adapter: CommercePort = await KaprukaAdapter.create('mock');

  let createdOrder: NormalizedOrder | null = null;

  await check('listCategories', async () => {
    const categories = await adapter.listCategories();
    return `${categories.length} categories (e.g. ${categories[0]?.name ?? 'n/a'})`;
  });

  await check('listDeliveryCities', async () => {
    const cityList = await adapter.listDeliveryCities();
    return `${cityList.cities.length} cities (e.g. ${cityList.cities[0]?.name ?? 'n/a'})`;
  });

  await check('search', async () => {
    const result = await adapter.search('rose', 'flowers');
    return `${result.total} results for "${result.query}" — first: ${result.products[0]?.name ?? 'n/a'}`;
  });

  await check('getAlternatives', async () => {
    const result = await adapter.getAlternatives('wireless headphones', 10_000);
    return `${result.total} alternatives — first: ${result.products[0]?.name ?? 'n/a'}`;
  });

  await check('getProduct', async () => {
    const product = await adapter.getProduct('KAP-FLW-001');
    return `${product.name} — LKR ${product.price}`;
  });

  await check('checkDelivery', async () => {
    const quote = await adapter.checkDelivery('COL', 'KAP-FLW-001');
    return `${quote.city}: fee=LKR ${quote.fee}, availability=${quote.availability}`;
  });

  await check('addToCart', async () => {
    const result = await adapter.addToCart('KAP-FLW-001', 'Red Rose Romance Bouquet (24 Stems)', 3500, 1);
    return `${result.message} — total=LKR ${result.total}, items=${result.itemCount}`;
  });

  await check('getCart', async () => {
    const cart = await adapter.getCart();
    return `${cart.itemCount} item(s), total=LKR ${cart.total}`;
  });

  await check('getRecommendations', async () => {
    const result = await adapter.getRecommendations('flowers');
    return `${result.products.length} recommendation(s) — first: ${result.products[0]?.name ?? 'n/a'}`;
  });

  await check('validateShipping', async () => {
    const validation = await adapter.validateShipping({
      name: 'Kamal Perera',
      phone: '0771234567',
      address_line1: '42 Temple Road',
      city: 'Colombo',
      postal_code: '00100',
    });
    return `valid=${validation.valid}, errors=${validation.errors.length}, warnings=${validation.warnings.length}`;
  });

  await check('createOrder', async () => {
    const order = await adapter.createOrder({
      cart: [{ product_id: 'KAP-FLW-001', quantity: 1 }],
      recipient: {
        name: 'Nimal Silva',
        phone: '0771234567',
        address: '12 Galle Road',
        city: 'COL',
      },
      delivery: { date: '2026-06-10' },
      sender: { name: 'Kamal Perera', phone: '0719876543' },
    });
    createdOrder = order;
    return `order ${order.id ?? 'n/a'} — total=LKR ${order.total ?? 0}, status=${order.status ?? 'n/a'}`;
  });

  await check('trackOrder', async () => {
    if (!createdOrder?.id) throw new Error('no order to track — createOrder must run first');
    const tracked = await adapter.trackOrder(createdOrder.id);
    return `${tracked.id ?? 'n/a'} — status=${tracked.status ?? 'n/a'}, total=LKR ${tracked.total ?? 0}`;
  });

  await check('convertCurrency', async () => {
    const converted = await adapter.convertCurrency(10_000, 'USD');
    return `${converted.original} → ${converted.converted} (${converted.source})`;
  });

  await check('clearCart', async () => {
    await adapter.clearCart();
    const cart = await adapter.getCart();
    return `cart cleared — items=${cart.itemCount}, total=LKR ${cart.total}`;
  });

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n${passed}/${total} tools working`);

  if (passed !== total) {
    process.exitCode = 1;
  }
}

run().catch((err: unknown) => {
  console.error('Smoke test crashed:', err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
