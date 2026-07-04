import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { KaprukaAdapter } from '../src/adapters/kapruka.adapter.js';
import { stateUpdaterNode } from '../src/agent/stateUpdaterNode.js';
import type { StateType } from '../src/agent/state.js';
import type { CommercePort, NormalizedDeliveryCheckWithContext } from '../src/core/ports/commerce.port.js';

type CheckResult = NormalizedDeliveryCheckWithContext & { note: string };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function separator(): void {
  console.log('========================================');
}

let passed = 0;
let total = 0;

function check(label: string, condition: boolean, detail: string): void {
  total++;
  if (condition) {
    passed++;
    console.log(`PASS — ${label} (${detail})`);
  } else {
    console.log(`FAIL — ${label} (${detail})`);
  }
}

function makeBaseState(deliveryContext: StateType['deliveryContext']): StateType {
  return {
    messages: [],
    sessionId: 'verify-session',
    locale: 'en',
    browserId: 'verify-browser',
    cartSnapshot: null,
    deliveryContext,
    customerName: null,
    lastSearchContext: null,
  };
}

const defaultDeliveryContext: StateType['deliveryContext'] = {
  city: null,
  date: null,
  resolvedCity: null,
  ambiguous: false,
  alternateZones: [],
  lastResolutionReason: null,
};

async function runAdapterCase(
  adapter: CommercePort,
  label: string,
  city: string,
  productId: string,
  date: string,
): Promise<CheckResult | null> {
  separator();
  console.log(label);
  separator();
  console.log(`Args: city=${JSON.stringify(city)}, productId=${productId}, date=${JSON.stringify(date)}`);

  try {
    const quote = (await adapter.checkDelivery(city, productId, date)) as CheckResult;
    console.log(`Full return value: ${JSON.stringify(quote, null, 2)}`);
    return quote;
  } catch (err) {
    console.log(`Error thrown: ${errorMessage(err)}`);
    return null;
  }
}

async function runStateCase(
  adapter: CommercePort,
  label: string,
  userCity: string,
  productId: string,
  date: string,
  quote: CheckResult,
): Promise<StateType['deliveryContext'] | null> {
  separator();
  console.log(label);
  separator();

  const fakeState = makeBaseState(defaultDeliveryContext);
  fakeState.messages = [
    new HumanMessage('Can I get this delivered?'),
    new AIMessage({
      content: '',
      tool_calls: [{ id: 'call_1', name: 'checkDelivery', args: { city: userCity, productId, date } }],
    }),
    new ToolMessage({
      content: 'narration text (not used by stateUpdaterNode)',
      tool_call_id: 'call_1',
      name: 'checkDelivery',
      artifact: { resolutionContext: quote.resolutionContext ?? null },
    }),
  ];

  try {
    const updates = await stateUpdaterNode(fakeState, adapter);
    console.log(`updates.deliveryContext: ${JSON.stringify(updates.deliveryContext, null, 2)}`);
    return updates.deliveryContext ?? null;
  } catch (err) {
    console.log(`Error thrown: ${errorMessage(err)}`);
    return null;
  }
}

async function main(): Promise<void> {
  const adapter: CommercePort = await KaprukaAdapter.create('live');

  separator();
  console.log('PRE-PROBE: search("cake")');
  separator();
  const search = await adapter.search('cake');
  const productId = search.products[0]?.id;
  if (!productId) {
    console.log('PRE-PROBE FAILED: no products returned');
    process.exitCode = 1;
    return;
  }
  console.log(`Chosen productId: ${productId} (${search.products[0]?.name ?? 'unnamed'})`);

  // --- Adapter-level test cases ---

  const case1 = await runAdapterCase(adapter, 'CASE 1: checkDelivery("Colombo", productId, "tomorrow")', 'Colombo', productId, 'tomorrow');
  if (case1) {
    const ctx = case1.resolutionContext;
    check('Case 1 resolvedAs', ctx?.resolvedAs === 'Colombo 03', `resolvedAs=${ctx?.resolvedAs}`);
    check('Case 1 ambiguous', ctx?.ambiguous === true, `ambiguous=${ctx?.ambiguous}`);
    check('Case 1 alternateNames.length', ctx?.alternateNames.length === 14, `length=${ctx?.alternateNames.length}`);
    check('Case 1 reason', ctx?.reason === 'ambiguous-defaulted', `reason=${ctx?.reason}`);
  } else {
    check('Case 1 (adapter call)', false, 'threw instead of returning');
  }

  const case2 = await runAdapterCase(adapter, 'CASE 2: checkDelivery("Wellawatta", productId, "tomorrow")', 'Wellawatta', productId, 'tomorrow');
  if (case2) {
    const ctx = case2.resolutionContext;
    check('Case 2 resolvedAs', ctx?.resolvedAs === 'Colombo 06', `resolvedAs=${ctx?.resolvedAs}`);
    check('Case 2 ambiguous', ctx?.ambiguous === false, `ambiguous=${ctx?.ambiguous}`);
    check('Case 2 reason', ctx?.reason === 'vernacular', `reason=${ctx?.reason}`);
  } else {
    check('Case 2 (adapter call)', false, 'threw instead of returning');
  }

  const case3 = await runAdapterCase(adapter, 'CASE 3: checkDelivery("Jaffna", productId, "15/07/2026")', 'Jaffna', productId, '15/07/2026');
  if (case3) {
    const ctx = case3.resolutionContext;
    check('Case 3 resolvedAs', ctx?.resolvedAs === 'Jaffna', `resolvedAs=${ctx?.resolvedAs}`);
    check('Case 3 resolvedDate', ctx?.resolvedDate === '2026-07-15', `resolvedDate=${ctx?.resolvedDate}`);
    console.log(`Case 3 availability (informational, not graded — depends on live server capacity): ${case3.availability}`);
  } else {
    check('Case 3 (adapter call)', false, 'threw instead of returning');
  }

  const case4 = await runAdapterCase(adapter, 'CASE 4: checkDelivery("xyznotacity", productId, "tomorrow")', 'xyznotacity', productId, 'tomorrow');
  if (case4) {
    const ctx = case4.resolutionContext;
    check('Case 4 resolvedAs', ctx?.resolvedAs === null, `resolvedAs=${ctx?.resolvedAs}`);
    check('Case 4 reason', ctx?.reason === 'unknown', `reason=${ctx?.reason}`);
  } else {
    check('Case 4 (adapter call)', false, 'threw instead of returning');
  }

  const case5 = await runAdapterCase(adapter, 'CASE 5: checkDelivery("Colombo", productId, "garbage date")', 'Colombo', productId, 'garbage date');
  if (case5) {
    const ctx = case5.resolutionContext;
    check('Case 5 reason', ctx?.reason === 'invalid-date', `reason=${ctx?.reason}`);
  } else {
    check('Case 5 (adapter call)', false, 'threw instead of returning');
  }

  // --- State-extraction test cases (cases 1 and 2) ---

  if (case1) {
    const dc = await runStateCase(adapter, 'STATE CASE 1: stateUpdaterNode after checkDelivery("Colombo", ...)', 'Colombo', productId, 'tomorrow', case1);
    check('State case 1 city', dc?.city === 'Colombo', `city=${dc?.city}`);
    check('State case 1 resolvedCity', dc?.resolvedCity === 'Colombo 03', `resolvedCity=${dc?.resolvedCity}`);
    check('State case 1 ambiguous', dc?.ambiguous === true, `ambiguous=${dc?.ambiguous}`);
    check('State case 1 alternateZones.length', dc?.alternateZones.length === 14, `length=${dc?.alternateZones.length}`);
    check('State case 1 lastResolutionReason', dc?.lastResolutionReason === 'ambiguous-defaulted', `reason=${dc?.lastResolutionReason}`);
  } else {
    check('State case 1', false, 'skipped — case 1 adapter call failed');
  }

  if (case2) {
    const dc = await runStateCase(adapter, 'STATE CASE 2: stateUpdaterNode after checkDelivery("Wellawatta", ...)', 'Wellawatta', productId, 'tomorrow', case2);
    check('State case 2 city', dc?.city === 'Wellawatta', `city=${dc?.city}`);
    check('State case 2 resolvedCity', dc?.resolvedCity === 'Colombo 06', `resolvedCity=${dc?.resolvedCity}`);
    check('State case 2 ambiguous', dc?.ambiguous === false, `ambiguous=${dc?.ambiguous}`);
    check('State case 2 lastResolutionReason', dc?.lastResolutionReason === 'vernacular', `reason=${dc?.lastResolutionReason}`);
  } else {
    check('State case 2', false, 'skipped — case 2 adapter call failed');
  }

  separator();
  console.log('SUMMARY');
  separator();
  console.log(`${passed}/${total} checks passed`);
}

main().catch((err: unknown) => {
  console.error('Verification script crashed:', errorMessage(err));
  process.exitCode = 1;
});
