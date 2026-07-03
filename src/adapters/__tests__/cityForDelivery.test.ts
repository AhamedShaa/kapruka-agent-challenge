import { describe, expect, it } from 'vitest';
import { resolveCityForDelivery } from '../cityForDelivery.js';
import type { CommercePort, NormalizedDeliveryCity, NormalizedDeliveryCityList } from '@/core/ports/commerce.port.js';

function makeCity(name: string): NormalizedDeliveryCity {
  return { id: null, name, delivery_fee: null, estimated_days: null, aliases: null };
}

function notImplemented(method: string): () => never {
  return () => {
    throw new Error(`stub: ${method} should not be called in this test`);
  };
}

function stubAdapter(cityNames: string[]): CommercePort {
  const result: NormalizedDeliveryCityList = {
    cities: cityNames.map(makeCity),
    totalAvailable: null,
    returnedCount: cityNames.length,
  };

  return {
    search: notImplemented('search'),
    getProduct: notImplemented('getProduct'),
    getAlternatives: notImplemented('getAlternatives'),
    getRecommendations: notImplemented('getRecommendations'),
    listCategories: notImplemented('listCategories'),
    listDeliveryCities: async () => result,
    checkDelivery: notImplemented('checkDelivery'),
    validateShipping: notImplemented('validateShipping'),
    addToCart: notImplemented('addToCart'),
    getCart: notImplemented('getCart'),
    clearCart: notImplemented('clearCart'),
    removeFromCart: notImplemented('removeFromCart'),
    createOrder: notImplemented('createOrder'),
    trackOrder: notImplemented('trackOrder'),
    convertCurrency: notImplemented('convertCurrency'),
  };
}

describe('resolveCityForDelivery', () => {
  it('returns unknown for an empty string without calling the adapter', async () => {
    const result = await resolveCityForDelivery('', stubAdapter([]));
    expect(result).toEqual({ resolvedName: null, ambiguous: false, alternateNames: [], reason: 'unknown' });
  });

  it('returns unknown for a whitespace-only string without calling the adapter', async () => {
    const result = await resolveCityForDelivery('   ', stubAdapter([]));
    expect(result).toEqual({ resolvedName: null, ambiguous: false, alternateNames: [], reason: 'unknown' });
  });

  it('resolves an exact single-match city', async () => {
    const result = await resolveCityForDelivery('Jaffna', stubAdapter(['Jaffna']));
    expect(result).toEqual({ resolvedName: 'Jaffna', ambiguous: false, alternateNames: [], reason: 'exact' });
  });

  it('resolves a vernacular name to its single canonical match', async () => {
    const result = await resolveCityForDelivery('Wellawatta', stubAdapter(['Colombo 06']));
    expect(result).toEqual({ resolvedName: 'Colombo 06', ambiguous: false, alternateNames: [], reason: 'vernacular' });
  });

  it('defaults to Colombo 03 when an ambiguous bare "Colombo" query returns all 15 zones', async () => {
    const colomboZones = Array.from({ length: 15 }, (_, i) => `Colombo ${String(i + 1).padStart(2, '0')}`);
    const result = await resolveCityForDelivery('Colombo', stubAdapter(colomboZones));
    expect(result.resolvedName).toBe('Colombo 03');
    expect(result.ambiguous).toBe(true);
    expect(result.reason).toBe('ambiguous-defaulted');
    expect(result.alternateNames).toHaveLength(14);
    expect(result.alternateNames).not.toContain('Colombo 03');
  });

  it('returns unknown when the adapter finds no matching city', async () => {
    const result = await resolveCityForDelivery('Notacity', stubAdapter([]));
    expect(result).toEqual({ resolvedName: null, ambiguous: false, alternateNames: [], reason: 'unknown' });
  });

  it('defaults to the first result for a non-Colombo ambiguous match', async () => {
    const result = await resolveCityForDelivery('Mount', stubAdapter(['Mount Lavinia', 'Mount Pleasant']));
    expect(result).toEqual({
      resolvedName: 'Mount Lavinia',
      ambiguous: true,
      alternateNames: ['Mount Pleasant'],
      reason: 'ambiguous-defaulted',
    });
  });
});
