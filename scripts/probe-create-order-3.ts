// scripts/probe-create-order-3.ts
// Run with: npx tsx scripts/probe-create-order-3.ts

import { KaprukaSDK } from 'kapruka-mcp';

async function probe(label: string, args: Record<string, any>) {
  console.log(`\n=== ${label} ===`);
  const sdk = new KaprukaSDK();

  try {
    const raw = await sdk.callToolRaw('kapruka_create_order', args);
    console.log('RAW:', JSON.stringify(raw, null, 2));
  } catch (e) {
    console.log('THREW:', e instanceof Error ? e.message : e);
  } finally {
    await sdk.disconnect();
  }
}

async function main() {
  // Paste your real product IDs here.
  const ID_1 = 'CAKE00KA001865';
  const ID_2 = 'FLOWERS00T2075';

  await probe('D2 — single item, real product', {
    cart: [{ product_id: ID_1, quantity: 1 }],
    recipient: {
      name: 'Amara Perera',
      phone: '0771234567',
    },
    delivery: {
      date: '2026-07-10',
      city: 'Colombo 03',
      address: '42 Galle Road',
    },
    sender: {
      name: 'Rithik',
    },
  });

  await probe('E2 — multi-item cart, real products', {
    cart: [
      { product_id: ID_1, quantity: 1 },
      { product_id: ID_2, quantity: 2 },
    ],
    recipient: {
      name: 'Amara Perera',
      phone: '0771234567',
    },
    delivery: {
      date: '2026-07-10',
      city: 'Colombo 03',
      address: '42 Galle Road',
    },
    sender: {
      name: 'Rithik',
    },
  });

  await probe('F2 — with gift_message', {
    cart: [{ product_id: ID_1, quantity: 1 }],
    recipient: {
      name: 'Amara Perera',
      phone: '0771234567',
    },
    delivery: {
      date: '2026-07-10',
      city: 'Colombo 03',
      address: '42 Galle Road',
    },
    sender: {
      name: 'Rithik',
    },
    gift_message: 'Happy Birthday!',
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});