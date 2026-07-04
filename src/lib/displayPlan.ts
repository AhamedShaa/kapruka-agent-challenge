import type { RenderEvent } from '@/agent/state.js';

export type DisplaySegment =
  | { kind: 'text'; content: string }
  | { kind: 'render'; event: RenderEvent };

interface DetectedHeader {
  text: string;
  lineStart: number;
}

const ATX_HEADER = /^#{1,6}\s+(.+?)\s*$/;
/** A line that is ENTIRELY a bolded phrase (optionally with a trailing colon)
 * — deliberately excludes inline bold ("this is **great**") since that's not
 * a section header. */
const BOLD_ALONE_HEADER = /^\*\*(.+?)\*\*:?\s*$/;

function detectHeaders(content: string): DetectedHeader[] {
  const headers: DetectedHeader[] = [];
  let offset = 0;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    const text = trimmed.match(ATX_HEADER)?.[1] ?? trimmed.match(BOLD_ALONE_HEADER)?.[1];
    if (text) headers.push({ text: text.trim(), lineStart: offset });
    offset += line.length + 1;
  }
  return headers;
}

/** Case-insensitive substring match either direction — confidence-checking
 * against a known query/category, not free-text guessing. */
function looselyMatches(headerText: string, query: string): boolean {
  const h = headerText.toLowerCase().trim();
  const q = query.toLowerCase().trim();
  if (!h || !q) return false;
  return h.includes(q) || q.includes(h);
}

function isProductListEvent(event: RenderEvent): event is Extract<RenderEvent, { type: 'PRODUCT_LIST' }> {
  return event.type === 'PRODUCT_LIST';
}

/**
 * Splits a completed assistant message into an ordered sequence of text/render
 * segments when the narration clearly labels each PRODUCT_LIST section with
 * its own header (e.g. a "flowers and chocolates" dual-topic reply) — so the
 * UI can interleave cards under their own section instead of showing all text
 * first and all carousels after.
 *
 * Returns null (safety net — caller falls back to the existing single-block
 * render) unless EVERY detected header confidently aligns, in order, with one
 * PRODUCT_LIST event's query. No guessing: alignment is checked against the
 * render event's own ground-truth query string, not inferred from prose.
 *
 * Known scope limitation: a trailing wrap-up sentence after the last section
 * (with no header of its own) can't be reliably distinguished from that last
 * section's own text using header-line boundaries alone, so it's absorbed
 * into the last section's text segment rather than split into a separate
 * "closing" segment — isolating it would require fragile prose heuristics
 * this function deliberately avoids.
 */
export function buildDisplayPlan(content: string, renderEvents: RenderEvent[]): DisplaySegment[] | null {
  const productListEvents = renderEvents.filter(isProductListEvent);
  // Fewer than 2 lists: no multi-section story to tell — the existing
  // single-block render is already correct and there's nothing to split.
  if (productListEvents.length < 2) return null;

  const headers = detectHeaders(content);
  if (headers.length !== productListEvents.length) return null;

  for (let i = 0; i < headers.length; i++) {
    if (!looselyMatches(headers[i].text, productListEvents[i].query)) return null;
  }

  const segments: DisplaySegment[] = [];

  const intro = content.slice(0, headers[0].lineStart).trim();
  if (intro) segments.push({ kind: 'text', content: intro });

  for (let i = 0; i < headers.length; i++) {
    const sectionEnd = i + 1 < headers.length ? headers[i + 1].lineStart : content.length;
    const sectionText = content.slice(headers[i].lineStart, sectionEnd).trim();
    if (sectionText) segments.push({ kind: 'text', content: sectionText });
    segments.push({ kind: 'render', event: productListEvents[i] });
  }

  // Non-PRODUCT_LIST events (CART, ERROR, TOOL_ACTIVITY, etc.) aren't part of
  // the header-alignment check — pass them through at the end, in their
  // original relative order, same as the current flat renderEvents map.
  for (const event of renderEvents) {
    if (!isProductListEvent(event)) segments.push({ kind: 'render', event });
  }

  return segments;
}

/**
 * Streaming-safe counterpart to buildDisplayPlan — recomputed fresh on every
 * render from the CURRENT (possibly partial) content, not incrementally
 * mutated. Reuses the same header-detection/artifact-matching primitives.
 *
 * The guarantee this exists to provide: called repeatedly with a strictly
 * growing `content` prefix and a fixed `renderEvents` array, the returned
 * segment list only ever extends — an element already present at index i in
 * an earlier call's result is still present at index i in every later call's
 * result, AND a committed text segment (one immediately followed by a render
 * segment) is byte-identical from the call where it first appears onward.
 * See computeIncrementalPlan.test.ts for the property test. This holds
 * because of three design choices:
 *
 * 1. A header only counts once its OWN LINE IS CLOSED (terminated by '\n' in
 *    `content`) — never the trailing, still-growing line. A half-typed
 *    "### Fl" is not a "full substring" match of anything and must not
 *    flicker in as a false-positive header. Since streamed content only ever
 *    grows by appending at the end, a line that was closed earlier stays
 *    identically closed and identically positioned in every later call.
 * 2. Headers are matched to PRODUCT_LIST events via a deterministic,
 *    order-preserving greedy pass: scan headers left-to-right in the order
 *    they appear in the text; for each, claim the FIRST not-yet-claimed
 *    event (in original arrival order) whose query loosely matches. Given
 *    the same header text and the same candidate pool, this always produces
 *    the same assignment — so re-running it on longer content reproduces
 *    every earlier assignment exactly, plus possibly new ones discovered
 *    strictly after (never before) anything already assigned.
 * 3. A matched section is only COMMITTED (its text + its card both emitted)
 *    once we know the section is closed — i.e. once a LATER matched header
 *    exists (proving no more text will be inserted before it), or once
 *    streaming has finished. The most recently matched header (the "last
 *    match") is left OPEN while streaming: its still-accumulating text
 *    renders as a plain trailing block with no card yet, instead of
 *    committing a card early and then having to grow the text above it on a
 *    later call — which would mutate an already-shown segment. This delays a
 *    card's first appearance until its section is provably done, in exchange
 *    for making every commit permanent once made.
 *
 * PRODUCT_LIST events with no header match yet are held back entirely (not
 * rendered) while streaming — no partial/guessed placement. Once
 * `isStreaming` is false, every matched section (including the previously
 * open last one) is committed, and any events that never matched at all are
 * appended once, in original arrival order, as the safety net (append-only:
 * nothing already shown ever moves). Non-PRODUCT_LIST events (TOOL_ACTIVITY,
 * CART, etc.) aren't part of this gating at all — they render immediately,
 * same as today, appended in their original relative order.
 */
export function computeIncrementalPlan(
  content: string,
  renderEvents: RenderEvent[],
  isStreaming: boolean,
): DisplaySegment[] {
  const productListEvents = renderEvents.filter(isProductListEvent);

  const lastNewline = content.lastIndexOf('\n');
  const closedContent = lastNewline === -1 ? '' : content.slice(0, lastNewline + 1);
  const headers = detectHeaders(closedContent);

  const claimed = new Set<number>();
  const matches: Array<{ header: DetectedHeader; eventIndex: number }> = [];

  for (const header of headers) {
    for (let i = 0; i < productListEvents.length; i++) {
      if (claimed.has(i)) continue;
      if (looselyMatches(header.text, productListEvents[i].query)) {
        claimed.add(i);
        matches.push({ header, eventIndex: i });
        break;
      }
    }
  }

  const segments: DisplaySegment[] = [];

  // Only commit a section (text + card) once we KNOW it's closed: either a
  // later matched header already exists, or streaming is over. The last
  // match, while still streaming, stays open/uncommitted — see (3) above.
  const committedCount = isStreaming ? Math.max(0, matches.length - 1) : matches.length;

  if (committedCount > 0) {
    const intro = content.slice(0, matches[0].header.lineStart).trim();
    if (intro) segments.push({ kind: 'text', content: intro });

    for (let i = 0; i < committedCount; i++) {
      const sectionEnd = matches[i + 1] ? matches[i + 1].header.lineStart : content.length;
      const sectionText = content.slice(matches[i].header.lineStart, sectionEnd).trim();
      if (sectionText) segments.push({ kind: 'text', content: sectionText });
      segments.push({ kind: 'render', event: productListEvents[matches[i].eventIndex] });
    }

    // Everything from the open section onward (its header plus whatever has
    // streamed in under it so far) — a plain growing text block, no card yet.
    const openStart = matches[committedCount]?.header.lineStart ?? content.length;
    const openText = content.slice(openStart).trim();
    if (openText) segments.push({ kind: 'text', content: openText });
  } else if (content.trim()) {
    // No section has been committed yet (0 or 1 matches while streaming) —
    // single flat text block, identical to today's un-gated behavior.
    segments.push({ kind: 'text', content: content.trim() });
  }

  if (!isStreaming) {
    for (let i = 0; i < productListEvents.length; i++) {
      if (!claimed.has(i)) segments.push({ kind: 'render', event: productListEvents[i] });
    }
  }

  // Non-PRODUCT_LIST events are never gated — same immediate, unconditional
  // rendering as the existing flat behavior, regardless of streaming state.
  for (const event of renderEvents) {
    if (!isProductListEvent(event)) segments.push({ kind: 'render', event });
  }

  return segments;
}
