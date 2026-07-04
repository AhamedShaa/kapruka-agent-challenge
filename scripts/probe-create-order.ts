// scripts/probe-create-order.ts
// Read-only probe: hits KaprukaSDK.createOrder directly against the live API.
// Goal: empirically confirm request/response shape before touching KaprukaAdapter.
// Run with: npx tsx scripts/probe-create-order.ts

import { KaprukaSDK } from 'kapruka-mcp';

async function probe(label: string, args: Record<string, any>) {
  console.log(`\n=== ${label} ===`);
  console.log('REQUEST:', JSON.stringify(args, null, 2));
  const sdk = new KaprukaSDK();
  try {
    // Use callToolRaw (not the convenience method) so we see the untouched
    // response text before any SDK-side parsing/discarding happens —
    // same lesson as the checkDelivery _rawMarkdown investigation.
    const raw = await sdk.callToolRaw('kapruka_create_order', args);
    console.log('RAW RESPONSE:', JSON.stringify(raw, null, 2));

    // Also try the convenience method, to see what gets parsed/dropped
    // on the way out — this is where the "local server flattens markdown"
    // pattern would show up if it repeats here.
    const parsed = await sdk.createOrder(args as any).catch(e => ({ __threw: String(e) }));
    console.log('PARSED (convenience method):', JSON.stringify(parsed, null, 2));
  } catch (e) {
    console.log('THREW:', e);
  } finally {
    await sdk.disconnect();
  }
}

async function main() {
  // First: force a live connection with a throwaway call, so we don't hit
  // the R3 cold-start args-wrapping race documented in the audit.
  const warmup = new KaprukaSDK();
  await warmup.callToolRaw('kapruka_list_categories', {});
  await warmup.disconnect();

  // You'll need a real, currently-valid product_id from a live search first —
  // grab one manually or via a quick kapruka_search_products call.
  const PRODUCT_ID = 'REPLACE_WITH_REAL_LIVE_ID';

  // Probe A: the shape the audit document claims is correct
  await probe('A — city/address under delivery, no sender.phone', {
    cart: [{ product_id: PRODUCT_ID, quantity: 1 }],
    recipient: { name: 'Amara Perera', phone: '0771234567' },
    delivery: { date: '2026-07-10', city: 'Colombo 03', address: '42 Galle Road' },
    sender: { name: 'Rithik' },
  });

  // Probe B: the shape your mock/audit-doc schema (recipient.city/address) implies
  await probe('B — city/address under recipient, sender.phone included', {
    cart: [{ product_id: PRODUCT_ID, quantity: 1 }],
    recipient: { name: 'Amara Perera', phone: '0771234567', address: '42 Galle Road', city: 'Colombo 03' },
    delivery: { date: '2026-07-10' },
    sender: { name: 'Rithik', phone: '0779876543' },
  });

  // Probe C: deliberately malformed — missing required field — to see error shape
  await probe('C — malformed: missing recipient.name', {
    cart: [{ product_id: PRODUCT_ID, quantity: 1 }],
    recipient: { phone: '0771234567' },
    delivery: { date: '2026-07-10', city: 'Colombo 03', address: '42 Galle Road' },
    sender: { name: 'Rithik' },
  });

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });