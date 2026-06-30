import { describe, expect, it } from 'vitest';
import type { Order } from 'kapruka-mcp';
import { normalizeCreateOrderResult, normalizeTrackOrderResult } from '../order.js';

// No real success fixture exists for create_order/track_order (deliberately
// skipped during the audit to avoid creating a real, billable order —
// Decisions Log #7, LOCKED: proceed on source-code inference alone). These
// inputs are constructed to match parseOrderResult/parseTrackOrder's
// documented output shape from kapruka-mcp/dist/sdk/markdown-parser.js.

const createOrderRaw: Order = {
  id: 'KAP-ORD-2501',
  items: [],
  total: 31400,
  currency: 'LKR',
  checkout_url: 'https://www.kapruka.com/checkout/KAP-ORD-2501',
  status: 'pending',
  created_at: '2026-06-24T10:00:00.000Z',
  expires_at: '2026-06-24T11:00:00.000Z',
};

const trackOrderRaw: Order = {
  id: 'KAP-ORD-2501',
  items: [],
  total: 0,
  currency: 'LKR',
  checkout_url: '',
  status: 'shipped',
  created_at: '2026-06-24T10:00:00.000Z',
  expires_at: '',
};

describe('normalizeCreateOrderResult', () => {
  it('preserves id when present', () => {
    const result = normalizeCreateOrderResult(createOrderRaw);
    expect(result.id).toBe('KAP-ORD-2501');
  });

  it('nulls id when the regex-scrape fails (empty string)', () => {
    const result = normalizeCreateOrderResult({ ...createOrderRaw, id: '' });
    expect(result.id).toBeNull();
  });

  it('always nulls items, regardless of what the input contains', () => {
    const result = normalizeCreateOrderResult(createOrderRaw);
    expect(result.items).toBeNull();
  });

  it('preserves a non-zero total, nulls a zero total (Decision #1)', () => {
    expect(normalizeCreateOrderResult(createOrderRaw).total).toBe(31400);
    const zeroTotal = normalizeCreateOrderResult({ ...createOrderRaw, total: 0 });
    expect(zeroTotal.total).toBeNull();
  });

  it('always sets currency to "LKR"', () => {
    expect(normalizeCreateOrderResult(createOrderRaw).currency).toBe('LKR');
  });

  it('preserves checkoutUrl when present, nulls it when empty', () => {
    expect(normalizeCreateOrderResult(createOrderRaw).checkoutUrl).toBe(
      'https://www.kapruka.com/checkout/KAP-ORD-2501',
    );
    const noUrl = normalizeCreateOrderResult({ ...createOrderRaw, checkout_url: '' });
    expect(noUrl.checkoutUrl).toBeNull();
  });

  it('always nulls status, createdAt, expiresAt regardless of input', () => {
    const result = normalizeCreateOrderResult(createOrderRaw);
    expect(result.status).toBeNull();
    expect(result.createdAt).toBeNull();
    expect(result.expiresAt).toBeNull();
  });
});

describe('normalizeTrackOrderResult', () => {
  it('preserves id when present', () => {
    expect(normalizeTrackOrderResult(trackOrderRaw).id).toBe('KAP-ORD-2501');
  });

  it('always nulls items, total, checkoutUrl regardless of input', () => {
    const result = normalizeTrackOrderResult(trackOrderRaw);
    expect(result.items).toBeNull();
    expect(result.total).toBeNull();
    expect(result.checkoutUrl).toBeNull();
  });

  it('preserves status when present (unlike create_order, track_order does attempt extraction)', () => {
    expect(normalizeTrackOrderResult(trackOrderRaw).status).toBe('shipped');
  });

  it('nulls status when absent', () => {
    const result = normalizeTrackOrderResult({ ...trackOrderRaw, status: '' });
    expect(result.status).toBeNull();
  });

  it('always nulls createdAt and expiresAt regardless of input', () => {
    const result = normalizeTrackOrderResult(trackOrderRaw);
    expect(result.createdAt).toBeNull();
    expect(result.expiresAt).toBeNull();
  });

  it('always sets currency to "LKR"', () => {
    expect(normalizeTrackOrderResult(trackOrderRaw).currency).toBe('LKR');
  });
});
