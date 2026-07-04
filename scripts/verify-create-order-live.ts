// scripts/verify-create-order-live.ts
// End-to-end verification for Bug 5: calls KaprukaAdapter.createOrder via the
// same getAdapter() singleton that app/api/chat/route.ts uses, confirming the
// final NormalizedOrder has a real ORD-YYYYMMDD-XXXX id and a .jsp checkout URL.
//
// Run: COMMERCE_MODE=live npx tsx scripts/verify-create-order-live.ts

// Set before any module that reads COMMERCE_MODE is evaluated.
process.env.COMMERCE_MODE = 'live';

import { getAdapter } from '../src/adapters/index.js';

async function main(): Promise<void> {
  console.log('Initialising adapter via getAdapter() (live mode)…');
  const adapter = await getAdapter();

  const req = {
    cart: [{ product_id: 'CAKE00KA001865', quantity: 1 }],
    recipient: {
      name: 'Amara Perera',
      phone: '0771234567',
      address: '42 Galle Road',
      city: 'Colombo 03',
    },
    delivery: { date: '2026-07-10' },
    sender: { name: 'Rithik', phone: '0779999999' },
    gift_message: 'Happy Birthday!',
  };

  console.log('\nCalling adapter.createOrder…');
  try {
    const order = await adapter.createOrder(req);

    console.log('\n=== NormalizedOrder ===');
    console.log('id:          ', order.id);
    console.log('checkoutUrl: ', order.checkoutUrl);
    console.log('total:       ', order.total);
    console.log('currency:    ', order.currency);
    console.log('status:      ', order.status);
    console.log('expiresAt:   ', order.expiresAt);

    const idOk    = order.id !== null && /^ORD-\d{8}-[A-Z0-9]+$/i.test(order.id);
    const urlOk   = order.checkoutUrl !== null && order.checkoutUrl.startsWith('https://');
    const totalOk = order.total !== null && order.total > 0;

    console.log('\n=== Assertions ===');
    console.log(idOk    ? '✅ id matches ORD-YYYYMMDD-XXXX'   : `❌ id wrong: ${JSON.stringify(order.id)}`);
    console.log(urlOk   ? '✅ checkoutUrl is a real https URL' : `❌ checkoutUrl wrong: ${JSON.stringify(order.checkoutUrl)}`);
    console.log(totalOk ? `✅ total is positive (${order.total})` : `❌ total wrong: ${order.total}`);

    if (!idOk || !urlOk || !totalOk) process.exit(1);
  } catch (e) {
    console.error('\n❌ adapter.createOrder threw:', e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();
