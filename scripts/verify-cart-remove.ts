// scripts/verify-cart-remove.ts
// Verifies cart add → remove-one → clear via the real getAdapter() singleton.
// Uses mock mode — cart is local-only so no live network needed.
//
// Run: npx tsx scripts/verify-cart-remove.ts

import { getAdapter } from '../src/adapters/index.js';

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ ${msg}`);
}

async function main(): Promise<void> {
  console.log('Initialising adapter via getAdapter() (mock mode)…\n');
  const adapter = await getAdapter();

  // --- baseline: clear any leftover state ---
  await adapter.clearCart();
  const baseline = await adapter.getCart();
  assert(baseline.isEmpty, 'Cart starts empty');

  // --- add two items ---
  await adapter.addToCart('CAKE00KA001685', 'Springtime Ribbon Cake', 5770, 1);
  await adapter.addToCart('FLOWERS00T2075', '6 Red Rose Bouquet', 5210, 2);

  const afterAdds = await adapter.getCart();
  assert(afterAdds.itemCount === 2, 'Cart has 2 items after adding both');
  assert(
    afterAdds.items.some((i) => i.productId === 'CAKE00KA001685'),
    'Cake is in cart',
  );
  assert(
    afterAdds.items.some((i) => i.productId === 'FLOWERS00T2075'),
    'Roses are in cart',
  );

  console.log('\nCart after adds:');
  afterAdds.items.forEach((i) =>
    console.log(`  ${i.quantity}x ${i.name} (id: ${i.productId}) @ LKR ${i.price} = subtotal LKR ${i.subtotal}`),
  );
  console.log(`  Total: LKR ${afterAdds.total}\n`);

  // --- remove one item (the cake) ---
  const afterRemove = await adapter.removeFromCart('CAKE00KA001685');
  assert(afterRemove.itemCount === 1, 'Cart has 1 item after removing cake');
  assert(
    !afterRemove.items.some((i) => i.productId === 'CAKE00KA001685'),
    'Cake is gone from cart',
  );
  assert(
    afterRemove.items.some((i) => i.productId === 'FLOWERS00T2075'),
    'Roses still in cart after removal',
  );
  assert(
    afterRemove.items[0].quantity === 2,
    'Roses quantity preserved (2)',
  );

  console.log('Cart after remove-one:');
  afterRemove.items.forEach((i) =>
    console.log(`  ${i.quantity}x ${i.name} (id: ${i.productId}) @ LKR ${i.price}`),
  );
  console.log(`  Total: LKR ${afterRemove.total}\n`);

  // --- clear entire cart ---
  await adapter.clearCart();
  const afterClear = await adapter.getCart();
  assert(afterClear.isEmpty, 'Cart is empty after clearCart');
  assert(afterClear.itemCount === 0, 'itemCount is 0 after clearCart');
  assert(afterClear.total === 0, 'total is 0 after clearCart');

  console.log('\nAll assertions passed.');
}

main().catch((e) => {
  console.error('\n❌ Unexpected error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
