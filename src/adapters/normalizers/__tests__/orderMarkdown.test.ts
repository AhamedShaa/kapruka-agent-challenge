import { describe, expect, it } from 'vitest';
import { normalizeOrderFromMarkdown } from '../orderMarkdown.js';

// Real raw strings captured from the live kapruka.com server via probe-create-order-3.ts
// on 2026-07-01. These are the actual strings callToolRaw returns — paste verbatim, never hand-craft.

const D2_RAW =
  '## Order created — `ORD-20260701-HJ0V`\n\n**Grand total:** LKR 7,850\n\n| | |\n|---|---|\n| Items | LKR 7,550 |\n| Delivery | LKR 300 |\n\n**[Open checkout to pay](https://www.kapruka.com/tools/continue_order.jsp?id=M6PESHKRHJ0V)**\n\n_Checkout link expires at 2026-07-01T21:44:35+05:30. Prices are locked for that window._';

const E2_RAW =
  '## Order created — `ORD-20260701-KJ8L`\n\n**Grand total:** LKR 18,270\n\n| | |\n|---|---|\n| Items | LKR 17,970 |\n| Delivery | LKR 300 |\n\n**[Open checkout to pay](https://www.kapruka.com/tools/continue_order.jsp?id=SDQE9V6HKJ8L)**\n\n_Checkout link expires at 2026-07-01T21:44:36+05:30. Prices are locked for that window._';

const F2_RAW =
  '## Order created — `ORD-20260701-G8AQ`\n\n**Grand total:** LKR 7,850\n\n| | |\n|---|---|\n| Items | LKR 7,550 |\n| Delivery | LKR 300 |\n\n**[Open checkout to pay](https://www.kapruka.com/tools/continue_order.jsp?id=CC5S24TFG8AQ)**\n\n_Checkout link expires at 2026-07-01T21:44:38+05:30. Prices are locked for that window._';

describe('normalizeOrderFromMarkdown — D2 (single item)', () => {
  const result = normalizeOrderFromMarkdown(D2_RAW);

  it('returns a non-null result', () => {
    expect(result).not.toBeNull();
  });

  it('extracts real ORD-YYYYMMDD-XXXX order id', () => {
    expect(result?.id).toBe('ORD-20260701-HJ0V');
  });

  it('extracts .jsp checkout URL (no "checkout" substring)', () => {
    expect(result?.checkoutUrl).toBe(
      'https://www.kapruka.com/tools/continue_order.jsp?id=M6PESHKRHJ0V',
    );
  });

  it('extracts grand total as a positive integer', () => {
    expect(result?.total).toBe(7850);
  });
});

describe('normalizeOrderFromMarkdown — E2 (multi-item cart)', () => {
  const result = normalizeOrderFromMarkdown(E2_RAW);

  it('extracts the correct order id', () => {
    expect(result?.id).toBe('ORD-20260701-KJ8L');
  });

  it('extracts the checkout URL', () => {
    expect(result?.checkoutUrl).toBe(
      'https://www.kapruka.com/tools/continue_order.jsp?id=SDQE9V6HKJ8L',
    );
  });

  it('extracts the higher total (18270)', () => {
    expect(result?.total).toBe(18270);
  });
});

describe('normalizeOrderFromMarkdown — F2 (gift_message)', () => {
  const result = normalizeOrderFromMarkdown(F2_RAW);

  it('extracts the correct order id', () => {
    expect(result?.id).toBe('ORD-20260701-G8AQ');
  });

  it('extracts the checkout URL', () => {
    expect(result?.checkoutUrl).toBe(
      'https://www.kapruka.com/tools/continue_order.jsp?id=CC5S24TFG8AQ',
    );
  });

  it('extracts total', () => {
    expect(result?.total).toBe(7850);
  });
});

describe('normalizeOrderFromMarkdown — error / null cases', () => {
  it('returns null for a business-logic error string', () => {
    expect(normalizeOrderFromMarkdown('Error (product_not_found): Product ID not found')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeOrderFromMarkdown('')).toBeNull();
  });

  it('returns null for unrecognized markdown (no ORD-id, no URL)', () => {
    expect(normalizeOrderFromMarkdown('## Something happened\n\nSome text without order info.')).toBeNull();
  });

  it('vendor KAP-ORD-XXXX id format does NOT match (wrong format for live server)', () => {
    const result = normalizeOrderFromMarkdown(
      '## Order\n\nKAP-ORD-2501\n\nhttps://kapruka.com/checkout/abc',
    );
    // URL is found but KAP-ORD pattern is not matched — id is null, not KAP-ORD-2501
    expect(result?.id).toBeNull();
    expect(result?.checkoutUrl).toBe('https://kapruka.com/checkout/abc');
  });
});
