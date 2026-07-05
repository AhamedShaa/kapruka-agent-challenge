/**
 * Smoke test: validates that withStructuredOutput works through this project's
 * exact ChatOpenAI → OpenRouter → Claude stack before any graph changes.
 *
 * Run with:
 *   npx tsx --env-file=.env.local test/structured-output-smoketest.ts
 */

import { z } from 'zod';
import { createChatModel } from '../src/agent/model.js';

// OpenAI structured output requires ALL properties in `required`.
// `.optional()` omits a key from `required`, causing a 400. Use a required
// field that defaults to empty string instead — semantically equivalent.
const schema = z.object({
  segments: z.array(
    z.object({
      productId: z.string(),
      narration: z.string(),
    }),
  ),
  comparison: z.string(),  // required; model returns "" when not applicable
});

const TEST_PROMPT = `
You are a shopping assistant. Two products are available:

Product A (id: "cake-001"):
  Name: Chocolate Fudge Cake
  Price: LKR 2,500
  Description: Rich, moist chocolate cake with fudge frosting. Serves 8.

Product B (id: "cake-002"):
  Name: Vanilla Sponge Cake
  Price: LKR 1,800
  Description: Light and fluffy vanilla sponge with cream filling. Serves 6.

A customer asked: "Tell me about both of these cakes."

Return a structured response with:
- segments: one entry per product with its productId and a 1-2 sentence narration
- comparison: a single sentence comparing the two products (optional but preferred)
`.trim();

async function runOnce(run: number): Promise<boolean> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RUN ${run}`);
  console.log('='.repeat(60));

  const model = createChatModel();
  const structured = model.withStructuredOutput(schema, { name: 'product_narration' });

  const startMs = Date.now();
  let result: z.infer<typeof schema>;
  try {
    result = await structured.invoke(TEST_PROMPT);
  } catch (err) {
    console.error(`RUN ${run} FAILED with error:`);
    // Print full error including any nested cause / response body
    if (err instanceof Error) {
      console.error('message:', err.message);
      // OpenAI SDK wraps the response body in err.cause or err.error
      const anyErr = err as unknown as Record<string, unknown>;
      if (anyErr['cause']) console.error('cause:', JSON.stringify(anyErr['cause'], null, 2));
      if (anyErr['error']) console.error('error:', JSON.stringify(anyErr['error'], null, 2));
      if (anyErr['response']) {
        const res = anyErr['response'] as Record<string, unknown>;
        console.error('response status:', res['status']);
        console.error('response body:', JSON.stringify(res['body'] ?? res['data'], null, 2));
      }
    } else {
      console.error(String(err));
    }
    return false;
  }

  const elapsed = Date.now() - startMs;

  console.log(`Elapsed: ${elapsed}ms`);
  console.log('Raw result:');
  console.log(JSON.stringify(result, null, 2));

  const parsed = schema.safeParse(result);
  if (!parsed.success) {
    console.error('SCHEMA VALIDATION FAILED:', parsed.error.format());
    return false;
  }

  const { segments, comparison } = parsed.data;
  const hasCorrectIds =
    segments.some((s) => s.productId === 'cake-001') &&
    segments.some((s) => s.productId === 'cake-002');
  const allNarrationsNonEmpty = segments.every((s) => s.narration.length > 0);

  console.log(`Segments count: ${segments.length} (expected 2)`);
  console.log(`Has both product IDs: ${hasCorrectIds}`);
  console.log(`All narrations non-empty: ${allNarrationsNonEmpty}`);
  console.log(`Comparison: "${comparison}"`);

  const pass = segments.length === 2 && hasCorrectIds && allNarrationsNonEmpty && typeof comparison === 'string';
  console.log(`\nRUN ${run}: ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
  return pass;
}

// Also try a plain (non-structured) invoke to confirm the base connection works
async function pingModel(): Promise<void> {
  console.log('\n--- Plain model ping (no structured output) ---');
  const model = createChatModel();
  try {
    const res = await model.invoke('Say "ok" and nothing else.');
    const content = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
    console.log('Plain invoke response:', content.slice(0, 120));
    console.log('Plain invoke: OK');
  } catch (err) {
    console.error('Plain invoke FAILED:', err instanceof Error ? err.message : String(err));
  }
}

async function main(): Promise<void> {
  console.log('Structured output smoke test — 3 runs');
  console.log(`Model: ${process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4.5'}`);
  console.log(`Base URL: ${process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'}`);

  await pingModel();

  const results: boolean[] = [];
  for (let i = 1; i <= 3; i++) {
    results.push(await runOnce(i));
  }

  console.log('\n' + '='.repeat(60));
  console.log(`SUMMARY: ${results.filter(Boolean).length}/3 runs passed`);
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
