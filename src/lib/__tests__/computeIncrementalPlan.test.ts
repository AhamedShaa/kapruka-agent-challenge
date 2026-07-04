import { describe, expect, it } from 'vitest';
import { computeIncrementalPlan } from '../displayPlan.js';
import type { DisplaySegment } from '../displayPlan.js';
import type { RenderEvent, UIProduct } from '@/agent/state.js';

function makeUIProduct(id: string, name: string): UIProduct {
  return {
    id,
    name,
    price: 1000,
    image_url: '',
    category: '',
    description: '',
    visual_description: '',
    in_stock: true,
  };
}

function productList(query: string, names: string[]): Extract<RenderEvent, { type: 'PRODUCT_LIST' }> {
  return { type: 'PRODUCT_LIST', query, products: names.map((n, i) => makeUIProduct(`${query}-${i}`, n)) };
}

/** The ordered sequence of render-segment event identities in a plan — the
 * thing that must never reorder/disappear as content grows. */
function renderOrder(plan: DisplaySegment[]): RenderEvent[] {
  return plan.filter((s): s is Extract<DisplaySegment, { kind: 'render' }> => s.kind === 'render').map((s) => s.event);
}

/** Any segment that is itself a render, or a text segment immediately
 * followed by one, is "committed" — it must be byte-identical once it first
 * appears (a section is only ever committed once its own closure is proven,
 * so nothing already committed should need to grow again). The trailing
 * (last) text segment, if not followed by a render, is still-growing prose
 * for the still-open section and is exempt. */
function committedSegments(plan: DisplaySegment[]): DisplaySegment[] {
  return plan.filter((s, i) => s.kind === 'render' || plan[i + 1]?.kind === 'render');
}

/** Asserts calling computeIncrementalPlan against a strictly growing sequence
 * of content prefixes only ever extends the result — never reorders or
 * removes a render event already shown, and never mutates a committed
 * (non-trailing) text segment once it first appears. */
function assertMonotonicOverPrefixes(fullContent: string, renderEvents: RenderEvent[], step = 3): void {
  let prevRenderOrder: RenderEvent[] = [];
  let prevCommitted: DisplaySegment[] = [];

  for (let len = 0; len <= fullContent.length; len += step) {
    const prefix = fullContent.slice(0, len);
    const plan = computeIncrementalPlan(prefix, renderEvents, true);

    const currentRenderOrder = renderOrder(plan);
    expect(
      currentRenderOrder.slice(0, prevRenderOrder.length),
      `render-event order must extend, not reorder/remove, at prefix length ${len}`,
    ).toEqual(prevRenderOrder);

    const currentCommitted = committedSegments(plan);
    expect(
      currentCommitted.slice(0, prevCommitted.length),
      `committed (non-trailing) segments must never mutate once shown, at prefix length ${len}`,
    ).toEqual(prevCommitted);

    prevRenderOrder = currentRenderOrder;
    prevCommitted = currentCommitted;
  }

  // Full content, still streaming: every event should be visible only if a
  // header for it actually appeared in the text.
  const finalStreamingPlan = computeIncrementalPlan(fullContent, renderEvents, true);
  expect(renderOrder(finalStreamingPlan)).toEqual(prevRenderOrder);

  // Done streaming: any never-matched events append once, at the end,
  // without disturbing anything already committed.
  const donePlan = computeIncrementalPlan(fullContent, renderEvents, false);
  const doneRenderOrder = renderOrder(donePlan);
  expect(doneRenderOrder.slice(0, finalStreamingPlan ? renderOrder(finalStreamingPlan).length : 0)).toEqual(
    renderOrder(finalStreamingPlan),
  );
  expect(doneRenderOrder).toHaveLength(renderEvents.filter((e) => e.type === 'PRODUCT_LIST').length);
}

// Real captured trace: LangSmith run run-019f28c5-c07d-7227-a618-560d1bfe816b,
// input "show flowers and chocolates" — same content as displayPlan.test.ts.
const REAL_2TOPIC_CONTENT = `Here are some lovely options for flowers and chocolates available on Kapruka:

### Flowers
1. **Purple Passion Flower Ribbon Cake** — LKR 7640
2. **Kit Kat Silk Roses Bouquet** — LKR 5900
3. **Mosaic Flower Sculpture Ribbon Cake** — LKR 6500
4. **5 Red Roses Bouquet - Elegant Luxury Flower Gift For Her** — LKR 6880
5. **50 Red Roses Heart-shaped Bouquet - Romantic Luxury Flower Bouquet** — LKR 21120
6. **Love In Bloom Flower And Cake Combo** — LKR 7360
7. **Crimson Desire Flower Bouquet With 6 Pink Roses And 9 Red Roses** — LKR 8840

### Chocolates
1. **All Nuts Mix-12 Piece (java)** — LKR 3600
2. **Java Pistachio Kunafa Dubai Style Milk Chocolate 40g** — LKR 1070
3. **Java I Love Dad 10 Piece Chocolate Box** — LKR 3070
4. **Java I Love Thaththa 8 Pieces Slab Box** — LKR 4640
5. **Cadbury Milk Chocolate Chunks 135g N#226; 30 Minis** — LKR 2200
6. **Love Harmony Kitkat Chocolate Bouquet** — LKR 6000
7. **Chocolate Mixology Bouquet** — LKR 7400
8. **Kinder Girl Chocolate Bouquet** — LKR 5800

Let me know if any of these catch your eye, or if you'd like to check delivery options for a specific item!`;

// NOTE: I do not have a real captured 3-topic trace anywhere in this session
// — only the 2-topic one above was ever actually pasted to me. This is a
// clearly-labeled SYNTHETIC stand-in for 3-topic coverage; swap in a real
// captured trace if one becomes available.
const SYNTHETIC_3TOPIC_CONTENT = `Here's a mix of flowers, chocolates, and cakes for the occasion:

### Flowers
1. **Rose Bouquet** — LKR 5000
2. **Lily Arrangement** — LKR 4500

### Chocolates
1. **Belgian Truffles** — LKR 3000

### Cakes
1. **Chocolate Fudge Cake** — LKR 6000
2. **Vanilla Sponge Cake** — LKR 4000

Let me know which combination works best for you!`;

describe('computeIncrementalPlan — monotonicity property (the actual guarantee)', () => {
  it('real 2-topic trace: growing content prefixes only ever extend the plan, never reorder/remove', () => {
    const flowers = productList('flowers', ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    const chocolates = productList('chocolates', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    assertMonotonicOverPrefixes(REAL_2TOPIC_CONTENT, [flowers, chocolates]);
  });

  it('synthetic 3-topic case: same guarantee holds with three sections', () => {
    const flowers = productList('flowers', ['a', 'b']);
    const chocolates = productList('chocolates', ['a']);
    const cakes = productList('cakes', ['a', 'b']);
    assertMonotonicOverPrefixes(SYNTHETIC_3TOPIC_CONTENT, [flowers, chocolates, cakes]);
  });

  it('a half-typed header never produces a false-positive match (no flicker)', () => {
    // Content ends mid-header, no trailing newline yet — "### Choc" alone
    // must NOT be treated as a closed "Chocolates" header. Flowers matched
    // but stays open (it's the last/only match while streaming) — no card
    // yet, since we can't be sure more text won't still land above it.
    const partial = REAL_2TOPIC_CONTENT.slice(0, REAL_2TOPIC_CONTENT.indexOf('### Chocolates') + '### Choc'.length);
    const flowers = productList('flowers', ['a']);
    const chocolates = productList('chocolates', ['a']);
    const plan = computeIncrementalPlan(partial, [flowers, chocolates], true);

    expect(renderOrder(plan)).toEqual([]);
  });
});

describe('computeIncrementalPlan — held-back / safety-net behavior', () => {
  const flowers = productList('flowers', ['a']);
  const chocolates = productList('chocolates', ['a']);

  it('withholds even a matched PRODUCT_LIST event while its section is still open (no later header yet)', () => {
    const contentWithOnlyFlowersHeader = '### Flowers\n1. **Item** — LKR 100\n';
    const plan = computeIncrementalPlan(contentWithOnlyFlowersHeader, [flowers, chocolates], true);
    expect(renderOrder(plan)).toEqual([]);
  });

  it('commits the open section once a later header proves it closed', () => {
    const content = '### Flowers\n1. **Item** — LKR 100\n\n### Chocolates\n';
    const plan = computeIncrementalPlan(content, [flowers, chocolates], true);
    expect(renderOrder(plan)).toEqual([flowers]);
  });

  it('appends the never-matched event once, at the end, when streaming finishes', () => {
    const contentWithOnlyFlowersHeader = '### Flowers\n1. **Item** — LKR 100\n';
    const plan = computeIncrementalPlan(contentWithOnlyFlowersHeader, [flowers, chocolates], false);
    expect(renderOrder(plan)).toEqual([flowers, chocolates]);
  });

  it('renders non-PRODUCT_LIST events immediately regardless of streaming state', () => {
    const activity: RenderEvent = { type: 'TOOL_ACTIVITY', tool: 'searchProducts', label: 'Searching', status: 'pending' };
    const planStreaming = computeIncrementalPlan('', [activity], true);
    const planDone = computeIncrementalPlan('', [activity], false);
    expect(renderOrder(planStreaming)).toEqual([activity]);
    expect(renderOrder(planDone)).toEqual([activity]);
  });
});
