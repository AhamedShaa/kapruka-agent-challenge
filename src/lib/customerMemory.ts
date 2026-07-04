import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { MEMORY_DB_PATH } from '@/lib/db-paths.js';

interface MemoryRow {
  key: string;
  value: string;
}

interface LastRecipient {
  name: string;
  city: string;
}

interface ContactInfo {
  city: string;
}

function isLastRecipient(value: unknown): value is LastRecipient {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).name === 'string' &&
    typeof (value as Record<string, unknown>).city === 'string'
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isContactInfo(value: unknown): value is ContactInfo {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).city === 'string'
  );
}

/**
 * Long-term per-browser customer memory, persisted in its own SQLite database
 * (separate from the kapruka-mcp cart storage). Keyed by an anonymous browserId
 * generated client-side and stored in localStorage.
 */
export class CustomerMemoryStore {
  private readonly db: DatabaseType;

  private constructor(db: DatabaseType) {
    this.db = db;
  }

  static async create(dbPath = './kapruka-memory.db'): Promise<CustomerMemoryStore> {
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS customer_memories (
        browserId TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updatedAt INTEGER NOT NULL,
        PRIMARY KEY (browserId, key)
      )
    `);
    return new CustomerMemoryStore(db);
  }

  set(browserId: string, key: string, value: unknown): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO customer_memories (browserId, key, value, updatedAt) VALUES (?, ?, ?, ?)`,
      )
      .run(browserId, key, JSON.stringify(value), Date.now());
  }

  get<T>(browserId: string, key: string): T | null {
    const row = this.db
      .prepare(`SELECT value FROM customer_memories WHERE browserId = ? AND key = ?`)
      .get(browserId, key) as { value: string } | undefined;

    if (!row) return null;

    try {
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  }

  formatForPrompt(browserId: string): string {
    const rows = this.db
      .prepare(`SELECT key, value FROM customer_memories WHERE browserId = ?`)
      .all(browserId) as MemoryRow[];

    if (rows.length === 0) return '';

    const lines: string[] = [];

    for (const row of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.value);
      } catch {
        continue;
      }

      if (row.key === 'last_recipient' && isLastRecipient(parsed)) {
        lines.push(`Last sent a gift to ${parsed.name} in ${parsed.city}`);
      } else if (row.key === 'past_occasions' && isStringArray(parsed) && parsed.length > 0) {
        lines.push(`Has shopped for: ${parsed.join(', ')}`);
      } else if (row.key === 'contact_info' && isContactInfo(parsed)) {
        lines.push(`Previous delivery details: ${parsed.city}`);
      }
    }

    if (lines.length === 0) return '';

    return [
      'What you remember about this customer:',
      ...lines.map((line) => `- ${line}`),
      '',
      "Use this context naturally. Don't reference it robotically. If a current",
      'request resembles a past order, mention it casually.',
    ].join('\n');
  }

  recordFact(
    browserId: string,
    key: 'name' | 'preferredCity' | 'allergies' | 'preferences',
    value: string,
  ): void {
    this.set(browserId, key, value);
  }

  recordOrder(browserId: string, recipientName: string, deliveryCity: string, giftMessage?: string): void {
    this.set(browserId, 'last_recipient', { name: recipientName, city: deliveryCity });
    this.set(browserId, 'contact_info', { city: deliveryCity });

    const occasions = this.get<string[]>(browserId, 'past_occasions') ?? [];
    const entry = giftMessage ? `${recipientName} (${giftMessage.slice(0, 40)})` : recipientName;
    this.set(browserId, 'past_occasions', [...occasions, entry]);
  }
}

let _store: CustomerMemoryStore | null = null;

export async function getMemoryStore(): Promise<CustomerMemoryStore> {
  if (!_store) {
    _store = await CustomerMemoryStore.create(MEMORY_DB_PATH);
  }
  return _store;
}
