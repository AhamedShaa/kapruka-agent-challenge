import { describe, expect, it } from 'vitest';
import { resolveCityQuery } from '../cityResolver.js';

describe('resolveCityQuery', () => {
  it('resolves a vernacular name to its canonical Kapruka name', () => {
    expect(resolveCityQuery('Wellawatta')).toBe('Colombo 06');
  });

  it('is case-insensitive', () => {
    expect(resolveCityQuery('wellawatta')).toBe('Colombo 06');
  });

  it('trims surrounding whitespace', () => {
    expect(resolveCityQuery('  Pettah  ')).toBe('Colombo 11');
  });

  it('passes through unrecognized but valid city names unchanged', () => {
    expect(resolveCityQuery('Kandy')).toBe('Kandy');
  });

  it('passes through gibberish unchanged', () => {
    expect(resolveCityQuery('xyz123')).toBe('xyz123');
  });

  it('passes through an empty string unchanged', () => {
    expect(resolveCityQuery('')).toBe('');
  });
});
