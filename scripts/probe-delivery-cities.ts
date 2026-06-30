import { KaprukaSDK } from 'kapruka-mcp';

interface Probe {
  label: string;
  query: string | undefined;
}

const PROBES: Probe[] = [
  { label: 'PROBE 1: query = "" (empty string)', query: '' },
  { label: 'PROBE 2: query omitted entirely (no query argument)', query: undefined },
  { label: 'PROBE 3: query = "Colombo"', query: 'Colombo' },
  { label: 'PROBE 4: query = "colombo" (lowercase)', query: 'colombo' },
  { label: 'PROBE 5: query = "Jaffna"', query: 'Jaffna' },
  { label: 'PROBE 6: query = "Col" (partial match test)', query: 'Col' },
];

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function separator(): void {
  console.log('========================================');
}

async function runProbe(sdk: KaprukaSDK, probe: Probe): Promise<void> {
  separator();
  console.log(probe.label);
  separator();
  console.log(`Query argument sent: ${probe.query === undefined ? '(omitted)' : JSON.stringify(probe.query)}`);

  try {
    const result = await sdk.listDeliveryCities(probe.query);
    console.log(`Raw response: ${JSON.stringify(result, null, 2)}`);

    if (Array.isArray(result)) {
      console.log(`Cities returned: ${result.length}`);
      const names = result.slice(0, 5).map((city) => city.name);
      console.log(`First 5 city names: ${names.length > 0 ? names.join(', ') : '(none)'}`);
    } else {
      console.log('Cities returned: n/a (response is not an array)');
    }
  } catch (err) {
    console.log(`Error thrown: ${errorMessage(err)}`);
  }

  console.log('----------------------------------------');
}

interface DetailedProbe {
  label: string;
  query: string;
}

const DETAILED_PROBES: DetailedProbe[] = [
  { label: 'PROBE 7: query = "xyz123" (genuine no-match)', query: 'xyz123' },
  { label: 'PROBE 8: query = "Negombo" (should succeed — real city)', query: 'Negombo' },
];

async function runDetailedProbe(sdk: KaprukaSDK, probe: DetailedProbe): Promise<void> {
  separator();
  console.log(probe.label);
  separator();
  console.log(`Query argument sent: ${JSON.stringify(probe.query)}`);

  try {
    const result = await sdk.listDeliveryCities(probe.query);
    console.log('Result type:', typeof result);
    console.log('Result value:', JSON.stringify(result, null, 2));
    console.log('Is array:', Array.isArray(result));
    console.log('Length (if array):', Array.isArray(result) ? result.length : 'N/A');
  } catch (err) {
    console.log('ERROR caught:');
    console.log('Error message:', errorMessage(err));
    console.log('Error name:', err instanceof Error ? err.constructor.name : typeof err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.log('Error stack (first 5 lines):', stack?.split('\n').slice(0, 5).join('\n'));
  }

  console.log('----------------------------------------');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function runRawProbe(sdk: KaprukaSDK): Promise<void> {
  separator();
  console.log('PROBE 9: callToolRaw("kapruka_list_delivery_cities", { query: "xyz123" })');
  separator();

  try {
    // callToolRaw is a private method on KaprukaSDK at the type level only —
    // bypassing via a cast to inspect the raw, unparsed response text.
    const sdkWithRaw = sdk as unknown as {
      callToolRaw(name: string, args: Record<string, unknown>): Promise<unknown>;
    };
    const rawResult = await sdkWithRaw.callToolRaw('kapruka_list_delivery_cities', { query: 'xyz123' });
    console.log('Raw result type:', typeof rawResult);
    console.log('Raw result:', JSON.stringify(rawResult, null, 2));
    if (isRecord(rawResult)) {
      console.log('Keys:', Object.keys(rawResult));
      if ('content' in rawResult) {
        console.log('Content:', JSON.stringify(rawResult.content, null, 2));
      }
    }
  } catch (err) {
    console.log('callToolRaw also threw:', errorMessage(err));
  }

  console.log('----------------------------------------');
}

async function main(): Promise<void> {
  const sdk = new KaprukaSDK();
  await sdk.connect();

  for (const probe of PROBES) {
    await runProbe(sdk, probe);
  }

  for (const probe of DETAILED_PROBES) {
    await runDetailedProbe(sdk, probe);
  }

  await runRawProbe(sdk);

  await sdk.disconnect();
  console.log('Probes complete. Check output above for city naming patterns.');
}

main().catch((err: unknown) => {
  console.error('Probe script crashed:', errorMessage(err));
  process.exitCode = 1;
});
