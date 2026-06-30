export class InvalidDateError extends Error {
  constructor(input: string) {
    super(`Could not parse "${input}" as a date.`);
    this.name = 'InvalidDateError';
  }
}

function toISO(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateOffsetISO(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return toISO(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** True only if year/month/day round-trip exactly — rejects overflow like day 32 or month 13. */
function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function normalizeDateToISO(input: string | undefined | null): string {
  if (input === undefined || input === null || input.trim() === '') {
    return dateOffsetISO(1);
  }

  const trimmed = input.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^today$/i.test(trimmed)) {
    return dateOffsetISO(0);
  }

  if (/^tomorrow$/i.test(trimmed)) {
    return dateOffsetISO(1);
  }

  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (ddmmyyyy) {
    const day = Number(ddmmyyyy[1]);
    const month = Number(ddmmyyyy[2]);
    const year = Number(ddmmyyyy[3]);
    if (!isValidCalendarDate(year, month, day)) throw new InvalidDateError(input);
    return toISO(year, month, day);
  }

  const yyyymmdd = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(trimmed);
  if (yyyymmdd) {
    const year = Number(yyyymmdd[1]);
    const month = Number(yyyymmdd[2]);
    const day = Number(yyyymmdd[3]);
    if (!isValidCalendarDate(year, month, day)) throw new InvalidDateError(input);
    return toISO(year, month, day);
  }

  const fallback = new Date(trimmed);
  if (!Number.isNaN(fallback.getTime())) {
    return toISO(fallback.getFullYear(), fallback.getMonth() + 1, fallback.getDate());
  }

  throw new InvalidDateError(input);
}
