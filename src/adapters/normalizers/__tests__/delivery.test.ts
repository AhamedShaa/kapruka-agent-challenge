import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DeliveryCity } from 'kapruka-mcp';
import {
  normalizeDeliveryCheck,
  normalizeDeliveryCity,
  normalizeDeliveryCityList,
} from '../delivery.js';

const FIXTURES_DIR = path.join(process.cwd(), 'fixtures', 'raw');

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8')) as T;
}

function loadText(filename: string): string {
  return readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8');
}

const cities = loadJson<DeliveryCity[]>('kapruka_list_delivery_cities.parsed.json');
const citiesRawText = loadText('kapruka_list_delivery_cities.raw.txt');
const agalawatta = cities.find((c) => c.id === 'AGALAWATTA') as DeliveryCity;

describe('normalizeDeliveryCity', () => {
  it('preserves name as-is', () => {
    const result = normalizeDeliveryCity(agalawatta);
    expect(result.name).toBe('Agalawatta');
  });

  it('preserves the derived id (no collision check in isolation)', () => {
    const result = normalizeDeliveryCity(agalawatta);
    expect(result.id).toBe('AGALAWATTA');
  });

  it('always nulls delivery_fee and estimated_days (100% fabricated by the SDK parser)', () => {
    expect(agalawatta.delivery_fee).toBe(0);
    expect(agalawatta.estimated_days).toBe(1);
    const result = normalizeDeliveryCity(agalawatta);
    expect(result.delivery_fee).toBeNull();
    expect(result.estimated_days).toBeNull();
  });

  it('always nulls aliases in isolation (requires the full list raw text)', () => {
    const result = normalizeDeliveryCity(agalawatta);
    expect(result.aliases).toBeNull();
  });
});

describe('normalizeDeliveryCityList', () => {
  it('normalizes every city in the captured 25-city fixture', () => {
    const result = normalizeDeliveryCityList(cities, citiesRawText);
    expect(result.cities).toHaveLength(25);
    expect(result.returnedCount).toBe(25);
  });

  it('extracts totalAvailable from the "(25 of 332 total)" header', () => {
    const result = normalizeDeliveryCityList(cities, citiesRawText);
    expect(result.totalAvailable).toBe(332);
  });

  it('nulls totalAvailable when rawText is omitted', () => {
    const result = normalizeDeliveryCityList(cities);
    expect(result.totalAvailable).toBeNull();
  });

  it('extracts aliases for cities that have them (Agalawatta -> agalawatha)', () => {
    const result = normalizeDeliveryCityList(cities, citiesRawText);
    const found = result.cities.find((c) => c.name === 'Agalawatta');
    expect(found?.aliases).toEqual(['agalawatha']);
  });

  it('leaves aliases null for cities with no aliases segment (Ahangama)', () => {
    const result = normalizeDeliveryCityList(cities, citiesRawText);
    const found = result.cities.find((c) => c.name === 'Ahangama');
    expect(found?.aliases).toBeNull();
  });

  it('detects batch-level id collisions and nulls every colliding entry (constructed "Mount" cities)', () => {
    const collidingCities: DeliveryCity[] = [
      { id: 'MOUNT', name: 'Mount Lavinia', delivery_fee: 0, estimated_days: 1 },
      { id: 'MOUNT', name: 'Mount Pleasant', delivery_fee: 0, estimated_days: 1 },
      agalawatta, // a real, non-colliding city alongside the synthetic ones
    ];

    const result = normalizeDeliveryCityList(collidingCities);

    const mountLavinia = result.cities.find((c) => c.name === 'Mount Lavinia');
    const mountPleasant = result.cities.find((c) => c.name === 'Mount Pleasant');
    const realCity = result.cities.find((c) => c.name === 'Agalawatta');

    expect(mountLavinia?.id).toBeNull();
    expect(mountPleasant?.id).toBeNull();
    // the non-colliding real city keeps its derived id
    expect(realCity?.id).toBe('AGALAWATTA');
  });

  it('does not null ids that do not collide', () => {
    const result = normalizeDeliveryCityList(cities, citiesRawText);
    const ids = result.cities.map((c) => c.id).filter((id): id is string => id !== null);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length); // no duplicates survived among non-null ids
  });
});

describe('normalizeDeliveryCheck', () => {
  const checkRaw = loadJson<{ available: boolean; fee: number; estimated_days: number; city: string }>(
    'kapruka_check_delivery.parsed.json',
  );
  const checkRawText = loadText('kapruka_check_delivery.raw.txt');

  it('classifies the real Agalawatta fixture as available_later, with the real next-available date and fee', () => {
    const result = normalizeDeliveryCheck(checkRaw, checkRawText);
    expect(result.availability).toBe('available_later');
    expect(result.nextAvailableDate).toBe('2026-06-25');
    expect(result.fee).toBe(1090);
    expect(result.city).toBe('Agalawatta');
  });

  it('classifies a constructed "available today" response as available, with no next-available date', () => {
    const availableText = '## Delivery to Colombo on 2026-06-24\n**Available!**\n- Rate: LKR 0\n- Estimated arrival: same day';
    const result = normalizeDeliveryCheck({ available: true, fee: 0, estimated_days: 0, city: 'Colombo' }, availableText);
    expect(result.availability).toBe('available');
    expect(result.nextAvailableDate).toBeNull();
    expect(result.city).toBe('Colombo');
  });

  it('classifies "not available" with no next-available date as unavailable', () => {
    const unavailableText = '## Delivery to Jaffna on 2026-06-24\n**Not available on this date.**\n- Perishable products cannot be delivered to this city.';
    const result = normalizeDeliveryCheck({ available: false, fee: 0, estimated_days: 2, city: 'Jaffna' }, unavailableText);
    expect(result.availability).toBe('unavailable');
    expect(result.nextAvailableDate).toBeNull();
  });

  it('classifies completely unrecognized text as unknown', () => {
    const garbageText = 'The server returned something unexpected and unparseable.';
    const result = normalizeDeliveryCheck({ available: false, fee: 0, estimated_days: 1, city: '' }, garbageText);
    expect(result.availability).toBe('unknown');
    expect(result.city).toBeNull();
  });

  it('nulls fee when the parsed/extracted value is 0 (Decision #1)', () => {
    const noFeeText = '## Delivery to Colombo on 2026-06-24\n**Available!**\n- Free delivery to this city.';
    const result = normalizeDeliveryCheck({ available: true, fee: 0, estimated_days: 0, city: 'Colombo' }, noFeeText);
    expect(result.fee).toBeNull();
  });

  it('degrades gracefully to available/unknown when rawText is omitted', () => {
    const availableResult = normalizeDeliveryCheck({ available: true, fee: 1500, estimated_days: 1, city: 'Colombo' });
    expect(availableResult.availability).toBe('available');

    const unavailableResult = normalizeDeliveryCheck(checkRaw);
    expect(unavailableResult.availability).toBe('unknown');
    expect(unavailableResult.nextAvailableDate).toBeNull();
  });
});
