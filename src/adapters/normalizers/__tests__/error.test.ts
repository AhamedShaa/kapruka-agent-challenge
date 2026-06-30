import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeErrorResponse, normalizeException } from '../error.js';

const FIXTURES_DIR = path.join(process.cwd(), 'fixtures', 'raw');

function loadText(filename: string): string {
  return readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8');
}

// Fixture files were saved with a "__THREW__: " prefix by the audit script
// (scripts/audit-final-gaps.ts), marking that these came from a thrown
// exception, not response content — strip it to get the real err.message.
function loadThrownMessage(filename: string): string {
  return loadText(filename).replace(/^__THREW__: /, '');
}

describe('normalizeException (Case A — thrown exception)', () => {
  const emptyCartError = loadThrownMessage('create-order-error-empty-cart.raw.txt');
  const invalidProductError = loadThrownMessage('create-order-error-invalid-product.raw.txt');
  const invalidCityError = loadThrownMessage('create-order-error-invalid-city.raw.txt');

  it('classifies real Pydantic validation errors as VALIDATION_ERROR, not retryable', () => {
    const result = normalizeException(new Error(emptyCartError), 'kapruka_create_order');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(result.retryable).toBe(false);
    expect(result.tool).toBe('kapruka_create_order');
  });

  it('extracts per-field Pydantic details from the empty-cart error', () => {
    const result = normalizeException(new Error(emptyCartError), 'kapruka_create_order');
    expect(result.details).toMatchObject({
      'params.cart': { type: 'too_short' },
    });
  });

  it('extracts per-field Pydantic details from the invalid-product error', () => {
    const result = normalizeException(new Error(invalidProductError), 'kapruka_create_order');
    expect(result.details).toMatchObject({
      'params.recipient.address': { type: 'extra_forbidden' },
      'params.delivery.address': { type: 'missing' },
    });
  });

  it('extracts per-field Pydantic details from the invalid-city error', () => {
    const result = normalizeException(new Error(invalidCityError), 'kapruka_create_order');
    expect(result.details).toMatchObject({
      'params.recipient.city': { type: 'extra_forbidden' },
    });
  });

  it('never exposes the raw Pydantic dump in the user-facing message', () => {
    const result = normalizeException(new Error(emptyCartError), 'kapruka_create_order');
    expect(result.message).not.toContain('Pydantic');
    expect(result.message).not.toContain('params.cart');
  });

  it('preserves the original exception text in raw', () => {
    const result = normalizeException(new Error(emptyCartError), 'kapruka_create_order');
    expect(result.raw).toBe(emptyCartError);
  });

  it('classifies rate limit exceptions as RATE_LIMITED, retryable', () => {
    const result = normalizeException(new Error('Rate limit exceeded: max 60 requests per 60s.'), 'kapruka_search_products');
    expect(result.code).toBe('RATE_LIMITED');
    expect(result.retryable).toBe(true);
  });

  it('classifies network/timeout errors as NETWORK_ERROR, retryable (reusing isRetryableError)', () => {
    const result = normalizeException(new Error('fetch failed: network error'), 'kapruka_search_products');
    expect(result.code).toBe('NETWORK_ERROR');
    expect(result.retryable).toBe(true);
  });

  it('classifies an unrecognized error as UNKNOWN, not retryable', () => {
    const result = normalizeException(new Error('something completely unexpected'), 'kapruka_get_product');
    expect(result.code).toBe('UNKNOWN');
    expect(result.retryable).toBe(false);
    expect(result.details).toBeNull();
  });

  it('handles non-Error thrown values', () => {
    const result = normalizeException('a plain string throw', 'kapruka_get_product');
    expect(result.raw).toBe('a plain string throw');
    expect(result.code).toBe('UNKNOWN');
  });
});

describe('normalizeErrorResponse (Case B — error in a successful response)', () => {
  const trackOrderNotFound = loadText('track-order-not-found.raw.txt');

  it('classifies the real track_order "Error (order_not_found): ..." text as NOT_FOUND', () => {
    const result = normalizeErrorResponse(trackOrderNotFound, 'kapruka_track_order');
    expect(result.code).toBe('NOT_FOUND');
    expect(result.retryable).toBe(false);
    expect(result.details).toEqual({ sourceCode: 'order_not_found' });
  });

  it('preserves the original response text in raw', () => {
    const result = normalizeErrorResponse(trackOrderNotFound, 'kapruka_track_order');
    expect(result.raw).toBe(trackOrderNotFound);
  });

  it('classifies the KaprukaLocal {error, tool, suggestion} JSON envelope', () => {
    const envelope = JSON.stringify({
      error: 'Unexpected response format from "kapruka_search_products".',
      tool: 'kapruka_search_products',
      suggestion: 'Check your internet connection or switch to mock mode',
    });
    const result = normalizeErrorResponse(envelope, 'kapruka_search_products');
    expect(result.code).toBe('UNKNOWN');
    expect(result.details).toEqual({ suggestion: 'Check your internet connection or switch to mock mode' });
  });

  it('classifies a rate-limit JSON envelope as RATE_LIMITED, retryable', () => {
    const envelope = JSON.stringify({ error: 'Rate limit exceeded: max 60 requests per 60s.' });
    const result = normalizeErrorResponse(envelope, 'kapruka_search_products');
    expect(result.code).toBe('RATE_LIMITED');
    expect(result.retryable).toBe(true);
  });

  it('falls back to NOT_FOUND for unstructured "not found" text', () => {
    const result = normalizeErrorResponse('Product "XYZ" not found.', 'kapruka_get_product');
    expect(result.code).toBe('NOT_FOUND');
  });

  it('falls back to UNKNOWN for completely unrecognized response text', () => {
    const result = normalizeErrorResponse('some completely unrelated markdown content', 'kapruka_get_product');
    expect(result.code).toBe('UNKNOWN');
  });

  it('always sets ok: false', () => {
    expect(normalizeErrorResponse(trackOrderNotFound, 'kapruka_track_order').ok).toBe(false);
  });
});
