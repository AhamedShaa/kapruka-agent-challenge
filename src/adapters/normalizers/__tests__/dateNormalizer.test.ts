import { describe, expect, it } from 'vitest';
import { InvalidDateError, normalizeDateToISO } from '../dateNormalizer.js';

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function tomorrowISO(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayISO(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

describe('normalizeDateToISO', () => {
  it('passes through an already-ISO date unchanged', () => {
    expect(normalizeDateToISO('2026-07-15')).toBe('2026-07-15');
  });

  it('returns tomorrow ISO for undefined', () => {
    const result = normalizeDateToISO(undefined);
    expect(result).toMatch(ISO_PATTERN);
    expect(result).toBe(tomorrowISO());
  });

  it('returns tomorrow ISO for an empty string', () => {
    const result = normalizeDateToISO('');
    expect(result).toMatch(ISO_PATTERN);
    expect(result).toBe(tomorrowISO());
  });

  it('resolves "today" to today ISO', () => {
    expect(normalizeDateToISO('today')).toBe(todayISO());
  });

  it('resolves "TOMORROW" case-insensitively', () => {
    expect(normalizeDateToISO('TOMORROW')).toBe(tomorrowISO());
  });

  it('parses DD/MM/YYYY (Sri Lankan convention)', () => {
    expect(normalizeDateToISO('15/07/2026')).toBe('2026-07-15');
  });

  it('parses single-digit D/M/YYYY with zero-padding', () => {
    expect(normalizeDateToISO('5/7/2026')).toBe('2026-07-05');
  });

  it('parses YYYY/MM/DD', () => {
    expect(normalizeDateToISO('2026/07/15')).toBe('2026-07-15');
  });

  it('falls back to Date parsing for natural-language dates', () => {
    expect(normalizeDateToISO('July 15 2026')).toBe('2026-07-15');
  });

  it('throws InvalidDateError for unparseable garbage', () => {
    expect(() => normalizeDateToISO('garbage xyz')).toThrow(InvalidDateError);
  });

  it('throws InvalidDateError for an invalid day/month', () => {
    expect(() => normalizeDateToISO('32/13/2026')).toThrow(InvalidDateError);
  });
});
