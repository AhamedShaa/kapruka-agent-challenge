import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { KaprukaLocal } from 'kapruka-mcp/local';
import { MemoryStorage } from 'kapruka-mcp/storage';
import { TOOL_NAMES } from 'kapruka-mcp';
import type { Product, SearchResult } from 'kapruka-mcp';

const TOOL_TIMEOUT_MS = 20_000;
const FIXTURES_DIR = path.join(process.cwd(), 'fixtures', 'raw');

// `callToolRaw` is marked `private` in KaprukaSDK's shipped .d.ts, but it's a
// plain property at runtime. Reaching into KaprukaLocal's internal `sdk` lets
// us send payloads straight to the live server, bypassing KaprukaLocal's own
// Zod input schema (which would otherwise reject e.g. cart: [] locally via
// .min(1) before the live server ever sees it) — see audit-tool-outputs.ts.
interface SdkRawAccess {
  callToolRaw(name: string, args: Record<string, unknown>): Promise<string>;
  searchProducts(q: string, category?: string): Promise<SearchResult>;
}

interface CaptureRecord {
  name: string;
  rawText: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function tomorrowDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function createLiveClient(): Promise<{ client: Client; local: KaprukaLocal }> {
  const local = new KaprukaLocal({ mock: false, storage: new MemoryStorage() });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

  await local.getServer().connect(serverTransport);

  const client = new Client({ name: 'kapruka-final-gaps-audit', version: '0.1.0' });
  await client.connect(clientTransport);

  return { client, local };
}

async function saveRaw(filename: string, rawText: string): Promise<CaptureRecord> {
  await writeFile(path.join(FIXTURES_DIR, filename), rawText);
  return { name: filename, rawText };
}

/** Classifies a raw response: JSON envelope keys, or markdown/plain-text signal words. */
function describeEnvelope(rawText: string): string {
  try {
    const parsed: unknown = JSON.parse(rawText);
    if (isRecord(parsed)) {
      const keys = Object.keys(parsed);
      const flags = ['error', 'suggestion', 'code', 'validation_errors']
        .filter((k) => k in parsed)
        .join(', ');
      return `JSON envelope, keys=[${keys.join(', ')}]${flags ? `, notable fields present: ${flags}` : ''}`;
    }
    return `JSON, but not an object (${typeof parsed})`;
  } catch {
    const signals = ['error', 'Error', 'not found', 'validation', 'invalid']
      .filter((s) => rawText.includes(s))
      .join(', ');
    return `Not JSON (markdown/plain text)${signals ? `, contains signal words: ${signals}` : ', no recognizable error signal words'}`;
  }
}

async function run(): Promise<void> {
  const { client, local } = await createLiveClient();
  const sdk = (local as unknown as { sdk: SdkRawAccess }).sdk;

  await mkdir(FIXTURES_DIR, { recursive: true });

  // Absorb the documented cold-start failure (first call on a fresh live
  // connection always fails) before any real capture below.
  await client
    .callTool(
      { name: TOOL_NAMES.search_products, arguments: { q: 'cake' } },
      undefined,
      { signal: AbortSignal.timeout(TOOL_TIMEOUT_MS) },
    )
    .catch(() => undefined);

  const captures: CaptureRecord[] = [];

  // -------------------------------------------------------------------------
  // 2. Empty search result behavior
  // -------------------------------------------------------------------------
  console.log('\n=== EMPTY SEARCH RESULT ===\n');

  const emptySearchQuery = 'xyzqwerty123abc';
  const emptySearchRaw = await sdk.callToolRaw(TOOL_NAMES.search_products, { q: emptySearchQuery });
  await saveRaw('empty-search.raw.txt', emptySearchRaw);
  captures.push({ name: 'empty-search', rawText: emptySearchRaw });

  console.log('Raw text:');
  console.log(emptySearchRaw);

  const matchesNoProductsString = emptySearchRaw.includes('No products found');
  console.log(`\nMatches parser's "No products found" detection string: ${matchesNoProductsString}`);

  const emptySearchParsed = await sdk.searchProducts(emptySearchQuery);
  await writeFile(
    path.join(FIXTURES_DIR, 'empty-search.parsed.json'),
    JSON.stringify(emptySearchParsed, null, 2),
  );
  console.log('Parsed result:', JSON.stringify(emptySearchParsed));

  // -------------------------------------------------------------------------
  // Get a real product ID for the "invalid city" case (cart must be valid there)
  // -------------------------------------------------------------------------
  const rosesSearch = await sdk.searchProducts('roses');
  const realProductId = rosesSearch.products[0]?.id;
  if (!realProductId) throw new Error('no product ID available from search("roses") for the invalid-city case');

  // -------------------------------------------------------------------------
  // 3. create_order error envelopes — all three payloads are deliberately
  // invalid and designed to fail server-side validation. No real order will
  // be created by any of these calls.
  // -------------------------------------------------------------------------
  console.log('\n=== CREATE_ORDER ERROR ENVELOPES ===\n');

  const validSender = { name: 'Diagnostic Test', phone: '0771234567' };
  const validDelivery = { date: tomorrowDate() };

  // 3a. Empty cart
  const emptyCartPayload = {
    cart: [],
    recipient: { name: 'Diagnostic Test', phone: '0771234567', address: '1 Test Road', city: 'Colombo' },
    delivery: validDelivery,
    sender: validSender,
  };
  const emptyCartRaw = await sdk
    .callToolRaw(TOOL_NAMES.create_order, emptyCartPayload)
    .catch((err: unknown) => `__THREW__: ${errorMessage(err)}`);
  await saveRaw('create-order-error-empty-cart.raw.txt', emptyCartRaw);
  captures.push({ name: 'create-order-error-empty-cart', rawText: emptyCartRaw });
  console.log(`3a. empty cart -> ${describeEnvelope(emptyCartRaw)}`);

  // 3b. Invalid product ID, otherwise-valid shape
  const invalidProductPayload = {
    cart: [{ product_id: 'DOES-NOT-EXIST-XYZ', quantity: 1 }],
    recipient: { name: 'Diagnostic Test', phone: '0771234567', address: '1 Test Road', city: 'Colombo' },
    delivery: validDelivery,
    sender: validSender,
  };
  const invalidProductRaw = await sdk
    .callToolRaw(TOOL_NAMES.create_order, invalidProductPayload)
    .catch((err: unknown) => `__THREW__: ${errorMessage(err)}`);
  await saveRaw('create-order-error-invalid-product.raw.txt', invalidProductRaw);
  captures.push({ name: 'create-order-error-invalid-product', rawText: invalidProductRaw });
  console.log(`3b. invalid product -> ${describeEnvelope(invalidProductRaw)}`);

  // 3c. Invalid city, real product
  const invalidCityPayload = {
    cart: [{ product_id: realProductId, quantity: 1 }],
    recipient: { name: 'Diagnostic Test', phone: '0771234567', address: '1 Test Road', city: 'Atlantis' },
    delivery: validDelivery,
    sender: validSender,
  };
  const invalidCityRaw = await sdk
    .callToolRaw(TOOL_NAMES.create_order, invalidCityPayload)
    .catch((err: unknown) => `__THREW__: ${errorMessage(err)}`);
  await saveRaw('create-order-error-invalid-city.raw.txt', invalidCityRaw);
  captures.push({ name: 'create-order-error-invalid-city', rawText: invalidCityRaw });
  console.log(`3c. invalid city -> ${describeEnvelope(invalidCityRaw)}`);

  // -------------------------------------------------------------------------
  // 4. track_order not-found error
  // -------------------------------------------------------------------------
  console.log('\n=== TRACK_ORDER NOT-FOUND ===\n');

  const trackNotFoundRaw = await sdk
    .callToolRaw(TOOL_NAMES.track_order, { order_number: 'KAP-ORD-FAKE-12345' })
    .catch((err: unknown) => `__THREW__: ${errorMessage(err)}`);
  await saveRaw('track-order-not-found.raw.txt', trackNotFoundRaw);
  captures.push({ name: 'track-order-not-found', rawText: trackNotFoundRaw });
  console.log(`track_order not-found -> ${describeEnvelope(trackNotFoundRaw)}`);

  // -------------------------------------------------------------------------
  // 5. Summary
  // -------------------------------------------------------------------------
  console.log('\n=== SUMMARY ===\n');

  for (const capture of captures) {
    console.log(`${capture.name}: ${describeEnvelope(capture.rawText)}`);
  }

  const createOrderCaptures = captures.filter((c) => c.name.startsWith('create-order-error'));
  const allJson = createOrderCaptures.every((c) => {
    try {
      JSON.parse(c.rawText);
      return true;
    } catch {
      return false;
    }
  });
  console.log(
    `\nCommon envelope across the 3 create_order errors: ${
      allJson ? 'all JSON' : 'mixed/not all JSON'
    } — compare key sets above to confirm whether they share the same shape.`,
  );

  const trackOrderCapture = captures.find((c) => c.name === 'track-order-not-found');
  if (trackOrderCapture) {
    const trackIsJson = (() => {
      try {
        JSON.parse(trackOrderCapture.rawText);
        return true;
      } catch {
        return false;
      }
    })();
    console.log(
      `track_order not-found format vs create_order errors: ${
        trackIsJson === allJson ? 'same JSON-ness' : 'DIFFERENT — one is JSON, the other is not'
      } (compare envelope descriptions above for exact field differences).`,
    );
  }
}

run()
  .catch((err: unknown) => {
    console.error('Final gaps audit crashed:', errorMessage(err));
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
