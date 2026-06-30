import { KaprukaAdapter } from '../src/adapters/kapruka.adapter.js';
import { resolveCityQuery } from '../src/agent/cityResolver.js';
import type { CommercePort } from '../src/core/ports/commerce.port.js';

interface TestCase {
  input: string;
  expectedCount: number | 'min1';
}

const TEST_CASES: TestCase[] = [
  { input: 'Colombo', expectedCount: 15 },
  { input: 'Jaffna', expectedCount: 1 },
  { input: 'Wellawatta', expectedCount: 'min1' },
  { input: 'Pettah', expectedCount: 'min1' },
  { input: 'Kandy', expectedCount: 'min1' },
  { input: 'Agalawatta', expectedCount: 1 },
  { input: 'xyz123', expectedCount: 0 },
];

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function main(): Promise<void> {
  const adapter: CommercePort = await KaprukaAdapter.create('live');

  let passed = 0;

  for (const testCase of TEST_CASES) {
    const resolvedQuery = resolveCityQuery(testCase.input);

    console.log('========================================');
    console.log(`Input: "${testCase.input}"`);
    console.log(`Resolved query: "${resolvedQuery}"`);

    try {
      const result = await adapter.listDeliveryCities(resolvedQuery);
      const names = result.cities.slice(0, 3).map((c) => c.name);
      console.log(`City count: ${result.cities.length}`);
      console.log(`First 3 names: ${names.length > 0 ? names.join(', ') : '(none)'}`);

      const ok =
        testCase.expectedCount === 'min1'
          ? result.cities.length >= 1
          : result.cities.length === testCase.expectedCount;

      console.log(ok ? 'PASS' : `FAIL (expected ${testCase.expectedCount})`);
      if (ok) passed++;
    } catch (err) {
      console.log(`Error thrown: ${errorMessage(err)}`);
      console.log(`FAIL (expected ${testCase.expectedCount})`);
    }
    console.log('----------------------------------------');
  }

  console.log(`${passed}/${TEST_CASES.length} cases passed`);
}

main().catch((err: unknown) => {
  console.error('Verification script crashed:', errorMessage(err));
  process.exitCode = 1;
});
