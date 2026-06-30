import { KaprukaSDK } from 'kapruka-mcp';

interface Probe {
  label: string;
  args: { city: string; product_id: string; delivery_date: string };
}

interface SummaryEntry {
  label: string;
  args: Record<string, string>;
  outcome: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errorStack(err: unknown): string {
  const stack = err instanceof Error ? err.stack : undefined;
  return stack?.split('\n').slice(0, 5).join('\n') ?? '(no stack)';
}

function separator(): void {
  console.log('========================================');
}

function tomorrowISO(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// callToolRaw is a private method on KaprukaSDK at the type level only —
// bypassing via a cast to inspect the raw, unparsed response text.
function withRaw(sdk: KaprukaSDK): { callToolRaw(name: string, args: Record<string, unknown>): Promise<unknown> } {
  return sdk as unknown as { callToolRaw(name: string, args: Record<string, unknown>): Promise<unknown> };
}

const summary: SummaryEntry[] = [];

async function runRawProbe(sdk: KaprukaSDK, label: string, args: Record<string, unknown>): Promise<void> {
  separator();
  console.log(label);
  separator();
  console.log(`Args sent: ${JSON.stringify(args)}`);

  try {
    const raw = await withRaw(sdk).callToolRaw('kapruka_check_delivery', args);
    console.log(`Raw response: ${typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)}`);
    summary.push({
      label,
      args: args as Record<string, string>,
      outcome: `SUCCESS — ${typeof raw === 'string' ? raw.slice(0, 120) : JSON.stringify(raw).slice(0, 120)}`,
    });
  } catch (err) {
    console.log(`Error message: ${errorMessage(err)}`);
    console.log(`Error stack (first 5 lines): ${errorStack(err)}`);
    summary.push({ label, args: args as Record<string, string>, outcome: `THROW — '${errorMessage(err)}'` });
  }

  console.log('----------------------------------------');
}

async function main(): Promise<void> {
  const sdk = new KaprukaSDK();
  await sdk.connect();

  // --- PRE-PROBE: get a real product_id from the live catalog ---
  separator();
  console.log('PRE-PROBE: searchProducts("cake")');
  separator();
  let productId: string;
  try {
    const search = await sdk.searchProducts('cake');
    const first = search.products[0];
    if (!first) throw new Error('searchProducts("cake") returned 0 products');
    productId = first.id;
    console.log(`Chosen productId: ${productId} (${first.name})`);
  } catch (err) {
    console.log(`PRE-PROBE FAILED: ${errorMessage(err)}`);
    console.log(`Error stack (first 5 lines): ${errorStack(err)}`);
    await sdk.disconnect();
    process.exitCode = 1;
    return;
  }
  console.log('----------------------------------------');

  const tomorrow = tomorrowISO();

  const cityProbes: Probe[] = [
    { label: 'PROBE 1: city = "Colombo 01" (full canonical name with number)', args: { city: 'Colombo 01', product_id: productId, delivery_date: tomorrow } },
    { label: 'PROBE 2: city = "COLOMBO" (uppercase id alone)', args: { city: 'COLOMBO', product_id: productId, delivery_date: tomorrow } },
    { label: 'PROBE 3: city = "Colombo" (ambiguous bare name, no number)', args: { city: 'Colombo', product_id: productId, delivery_date: tomorrow } },
    { label: 'PROBE 4: city = "Jaffna" (known single-row city)', args: { city: 'Jaffna', product_id: productId, delivery_date: tomorrow } },
    { label: 'PROBE 5: city = "JAFFNA" (uppercase — does case matter?)', args: { city: 'JAFFNA', product_id: productId, delivery_date: tomorrow } },
    { label: 'PROBE 6: city = "Agalawatta" (previously-working fixture city)', args: { city: 'Agalawatta', product_id: productId, delivery_date: tomorrow } },
  ];

  for (const probe of cityProbes) {
    await runRawProbe(sdk, probe.label, probe.args);
  }

  // Pick a working city from probes 1-6 (first one whose summary outcome was SUCCESS), else fall back.
  const workingCityEntry = summary.find((s, i) => i < cityProbes.length && s.outcome.startsWith('SUCCESS'));
  const workingCity = workingCityEntry ? workingCityEntry.args.city : 'Agalawatta';
  console.log(`>>> Using city "${workingCity}" for date-format probes (fallback: "Agalawatta" if all city probes errored) <<<`);

  await runRawProbe(sdk, 'PROBE 7: delivery_date = "2026-07-15" (YYYY-MM-DD sanity check)', {
    city: workingCity,
    product_id: productId,
    delivery_date: '2026-07-15',
  });

  await runRawProbe(sdk, 'PROBE 8: delivery_date = "15/07/2026" (DD/MM/YYYY tolerance test)', {
    city: workingCity,
    product_id: productId,
    delivery_date: '15/07/2026',
  });

  await runRawProbe(sdk, 'PROBE 9: product_id = "FAKE-INVALID-999" (nonexistent product)', {
    city: workingCity,
    product_id: 'FAKE-INVALID-999',
    delivery_date: tomorrow,
  });

  // --- PROBES 10-12: fee comparison across Colombo sub-areas, same date ---
  const colomboFees = new Map<string, string | null>();

  async function runFeeProbe(label: string, city: string): Promise<void> {
    const args = { city, product_id: productId, delivery_date: '2026-07-15' };
    separator();
    console.log(label);
    separator();
    console.log(`Args sent: ${JSON.stringify(args)}`);

    try {
      const raw = await withRaw(sdk).callToolRaw('kapruka_check_delivery', args);
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
      console.log(`Raw response: ${text}`);

      const availableMatch = /\*\*(Available|Not available[^*]*)\*\*/i.exec(text);
      const status = availableMatch ? availableMatch[1] : '(status not found in response)';
      const feeMatch = /LKR\s*[\d,]+/.exec(text);
      const fee = feeMatch ? feeMatch[0] : null;

      console.log(`Status: ${status}`);
      console.log(`Fee: ${fee ?? '(not found in response)'}`);
      colomboFees.set(city, fee);
    } catch (err) {
      console.log(`Error message: ${errorMessage(err)}`);
      console.log(`Error stack (first 5 lines): ${errorStack(err)}`);
      colomboFees.set(city, null);
    }

    console.log('----------------------------------------');
  }

  await runFeeProbe('PROBE 10: city = "Colombo 01", delivery_date = "2026-07-15" (re-run of probe 7 for comparison)', 'Colombo 01');
  await runFeeProbe('PROBE 11: city = "Colombo 06", delivery_date = "2026-07-15"', 'Colombo 06');
  await runFeeProbe('PROBE 12: city = "Colombo 11", delivery_date = "2026-07-15"', 'Colombo 11');

  separator();
  console.log('FEE COMPARISON');
  separator();
  const fee01 = colomboFees.get('Colombo 01') ?? '(none)';
  const fee06 = colomboFees.get('Colombo 06') ?? '(none)';
  const fee11 = colomboFees.get('Colombo 11') ?? '(none)';
  console.log(`Colombo 01: ${fee01} | Colombo 06: ${fee06} | Colombo 11: ${fee11}`);
  const uniform = fee01 === fee06 && fee06 === fee11 && fee01 !== '(none)';
  console.log(`Fees uniform: ${uniform ? 'YES' : 'NO'}`);

  separator();
  console.log('SUMMARY');
  separator();
  for (const entry of summary) {
    console.log(`${entry.label}`);
    console.log(`  args: ${JSON.stringify(entry.args)}`);
    console.log(`  outcome: ${entry.outcome}`);
  }

  await sdk.disconnect();
  console.log('Probes complete.');
}

main().catch((err: unknown) => {
  console.error('Probe script crashed:', errorMessage(err));
  process.exitCode = 1;
});
