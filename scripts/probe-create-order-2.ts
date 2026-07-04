// scripts/probe-create-order-2.ts
// Continues from probe-create-order.ts. Schema A is confirmed correct.
// This probe fetches real product IDs and tests: success path, multi-item
// cart, gift_message, and non-product error shapes (bad city / bad date).
// Run with: npx tsx scripts/probe-create-order-2.ts

import { KaprukaSDK } from 'kapruka-mcp';

async function probe(label: string, args: Record<string, any>) {
  console.log(`\n=== ${label} ===`);
  const sdk = new KaprukaSDK();
  try {
    const raw = await sdk.callToolRaw('kapruka_create_order', args);
    console.log('RAW (callToolRaw):', JSON.stringify(raw, null, 2));
  } catch (e) {
    console.log('THREW (callToolRaw):', e instanceof Error ? e.message : e);
  } finally {
    await sdk.disconnect();
  }
}

async function getRealProductIds(count: number): Promise<string[]> {
  const sdk = new KaprukaSDK();
  await sdk.callToolRaw('kapruka_list_categories', {}); // warmup, avoid R3 cold-start race
  const raw = await sdk.callToolRaw('kapruka_search_products', { q: 'flowers', limit: count });
  await sdk.disconnect();
  // raw.content[0].text is likely markdown on live — reuse whatever parser
  // pattern you already have, or eyeball it here first since this is a probe.
  console.log('SEARCH RAW (inspect manually to extract IDs):', JSON.stringify(raw, null, 2));
  return []; // fill in manually after inspecting the printed output, or wire up parseSearchResults
}

async function main() {
  const ids = await getRealProductIds(3);
  // Paste the real IDs you see printed above here:
  const [ID_1, ID_2] = ['PASTE_ID_1', 'PASTE_ID_2'];

  // D — success path, single item
  await probe('D — single item, valid product', {
    cart: [{ product_id: ID_1, quantity: 1 }],
    recipient: { name: 'Amara Perera', phone: '0771234567' },
    delivery: { date: '2026-07-10', city: 'Colombo 03', address: '42 Galle Road' },
    sender: { name: 'Rithik' },
  });

  // E — multi-item cart (bonus rubric item — needs explicit proof, not assumption)
  await probe('E — multi-item cart', {
    cart: [
      { product_id: ID_1, quantity: 1 },
      { product_id: ID_2, quantity: 2 },
    ],
    recipient: { name: 'Amara Perera', phone: '0771234567' },
    delivery: { date: '2026-07-10', city: 'Colombo 03', address: '42 Galle Road' },
    sender: { name: 'Rithik' },
  });

  // F — gift_message placement (top-level, per audit — unconfirmed)
  await probe('F — with gift_message', {
    cart: [{ product_id: ID_1, quantity: 1 }],
    recipient: { name: 'Amara Perera', phone: '0771234567' },
    delivery: { date: '2026-07-10', city: 'Colombo 03', address: '42 Galle Road' },
    sender: { name: 'Rithik' },
    gift_message: 'Happy Birthday!',
  });

  // G — bad city (not product-related — need to see if error shape/code differs)
  await probe('G — nonsense city', {
    cart: [{ product_id: ID_1, quantity: 1 }],
    recipient: { name: 'Amara Perera', phone: '0771234567' },
    delivery: { date: '2026-07-10', city: 'Nowhereville', address: '1 Fake St' },
    sender: { name: 'Rithik' },
  });

  // H — malformed date (loose input, same kind dateNormalizer already handles
  // for checkDelivery — confirm createOrder needs the same normalization)
  await probe('H — loose date format', {
    cart: [{ product_id: ID_1, quantity: 1 }],
    recipient: { name: 'Amara Perera', phone: '0771234567' },
    delivery: { date: 'tomorrow', city: 'Colombo 03', address: '42 Galle Road' },
    sender: { name: 'Rithik' },
  });

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });