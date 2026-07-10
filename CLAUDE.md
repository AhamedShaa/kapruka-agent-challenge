# Kapruka Shopping Agent — Claude Code Context

> Read this file completely before writing any code.
> Every decision documented here has a reason. Do not deviate without understanding why.

---
BEFORE MAKING ANY CHANGE TO ADAPTER, NORMALIZER, TOOL, OR VENDOR PATCH 
CODE, READ docs/AGENT_BRIEFING.md. It contains empirically-verified facts 
about the live Kapruka API that override mock schemas, tool descriptions, 
and vendor documentation. Do not propose fixes that contradict the 
briefing without providing new empirical evidence.

## What We Are Building

An AI-powered conversational shopping agent for Kapruka.com (Sri Lanka's largest e-commerce platform), built for the **Kapruka Agent Challenge 2026**. The agent is named **Kasun** — a warm, witty, Sri Lankan shopping assistant persona.

**Goal:** Win the competition. Judges score on Experience & Polish (30), Visual Richness (20), Personality (15), Usefulness (15), End-to-End Checkout (15), Creativity (5).

**Public URL required.** Judges open it directly. If it crashes or loads slowly, it cannot win.

---

**The project uses `"type": "module"` (ESM). All imports must use .js extensions when referencing local files.**

---

## Architecture: Ports & Adapters (Hexagonal)

This is the load-bearing design decision. Understand it before writing any code.

```
┌─────────────────────────────────────────────────────┐
│  React Frontend (full-screen chat)                  │
│  Product cards · Cart drawer · Streaming text       │
└────────────────────┬────────────────────────────────┘
                     │ SSE stream (tokens + render events)
┌────────────────────▼────────────────────────────────┐
│  Next.js App Router                                 │
│  /api/chat (SSE) · /api/health                      │
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│  LangGraph.js Agent                                 │
│  Router → Discovery / Cart / Delivery / Checkout    │
│  → Responder (Kasun persona)                        │
│  Depends ONLY on CommercePort interface             │
└────────────────────┬────────────────────────────────┘
                     │ CommercePort (interface — the seam)
┌────────────────────▼────────────────────────────────┐
│  KaprukaAdapter                                     │
│  Implements CommercePort using KaprukaLocal +       │
│  InMemoryTransport. The ONLY file that imports      │
│  kapruka-mcp.                                       │
└────────────────────┬────────────────────────────────┘
                     │ InMemoryTransport (in-process)
┌────────────────────▼────────────────────────────────┐
│  KaprukaLocal (kapruka-mcp/local)                   │
│  15 tools · 30-min cache · rate-limit guard         │
│  SqliteStorage for cart persistence                 │
└────────────────────┬────────────────────────────────┘
                     │ StreamableHTTP
                  mcp.kapruka.com
```

**Why this matters:** The agent core never imports from `kapruka-mcp`. Only `KaprukaAdapter` does. This means we can swap mock ↔ live by changing one env var, and SDK bugs only ever touch one file.

---

## Directory Structure

```
kapruka-agent/
├── CLAUDE.md                         ← this file
├── .env.local                        ← secrets (gitignored)
├── .env.example                      ← template (committed)
├── .claude/
│   └── commands/                     ← custom slash commands
├── src/
│   ├── core/
│   │   └── ports/
│   │       └── commerce.port.ts      ← CommercePort interface + all shared types
│   ├── adapters/
│   │   ├── kapruka.adapter.ts        ← KaprukaLocal + InMemoryTransport impl
│   │   └── index.ts                  ← getAdapter() singleton
│   ├── agent/
│   │   ├── state.ts                  ← AgentState + RenderEvent union (zod)
│   │   ├── tools.ts                  ← LangChain tools wrapping CommercePort
│   │   ├── systemPrompt.ts           ← Kasun persona + rules
│   │   ├── graph.ts                  ← LangGraph StateGraph
│   │   └── index.ts                  ← exports createGraph()
│   ├── lib/
│   │   └── logger.ts                 ← pino structured logger
│   └── components/
│       ├── chat/                     ← chat UI components
│       ├── products/                 ← ProductCard, ProductCarousel, etc.
│       └── cart/                     ← CartDrawer, CartItem, etc.
├── app/
│   ├── layout.tsx
│   ├── page.tsx                      ← main chat page
│   ├── globals.css
│   └── api/
│       ├── health/route.ts
│       └── chat/route.ts             ← SSE streaming endpoint
└── scripts/
    └── smoke.ts                      ← tool validation script
```

---

```typescript
// Render event union — every event the UI can receive
type RenderEvent =
  | { type: 'PRODUCT_LIST';    products: Product[]; query: string }
  | { type: 'PRODUCT_DETAIL';  product: Product }
  | { type: 'CART';            items: CartItem[]; total: number }
  | { type: 'DELIVERY_QUOTE';  city: string; fee: number; days: number; available: boolean; note: string }
  | { type: 'CHECKOUT_LINK';   checkoutUrl: string; orderId: string; total: number; expiresAt: string }
  | { type: 'RECOMMENDATIONS'; products: Product[] }
  | { type: 'ERROR';           message: string; tool: string }
```

### SSE Frame Format
Every frame sent from /api/chat is one of:
```
data: {"type":"token","delta":"Hello! "}
data: {"type":"render","event":{"type":"PRODUCT_LIST","products":[...],"query":"roses"}}
data: {"type":"done"}
data: {"type":"error","message":"..."}
```

### Shopping Workflow (agent follows this order)
1. `search_products` → show PRODUCT_LIST
2. If results < 2: auto-call `get_alternatives` without asking
3. `get_product` when user selects one → show PRODUCT_DETAIL
4. `check_delivery` → show DELIVERY_QUOTE
5. `add_to_cart` → show CART + call `get_recommendations` → show RECOMMENDATIONS
6. `validate_shipping` → fix errors before proceeding
7. `create_order` only when user explicitly confirms → show CHECKOUT_LINK
8. 60-minute pay link expiry — always mention this

---

## Coding Conventions

### TypeScript
- Strict mode. No `any`. Use `unknown` and narrow.
- Zod for all external data validation (SDK responses, API inputs).
- No non-null assertions (`!`) — use proper guards.
- All async functions return typed promises, never `Promise<any>`.

### Error Handling
- Never let unhandled promise rejections reach the user.
- Tool errors become `ERROR` render events — they never crash the agent.
- API routes return structured errors: `{ ok: false, error: string, code: string }`.
- Use the pino logger, not `console.log`. Every error log includes context.

### React / Next.js
- Server components by default. Add `'use client'` only when needed.
- API routes use Node runtime (not Edge): `export const runtime = 'nodejs'`
- No `any` in component props. Define interfaces for everything.
- Optimistic UI for cart operations: update state immediately, rollback on error.

### Imports
- The agent core (`src/agent/`) must never import from `kapruka-mcp` directly.
- Only `src/adapters/kapruka.adapter.ts` imports from `kapruka-mcp`.
- Shared types (Product, CartItem, etc.) come from `src/core/ports/commerce.port.ts`.
- Use path aliases: `@/` maps to `src/`.

### File naming
- Components: PascalCase (`ProductCard.tsx`)
- Utilities, hooks, lib: camelCase (`useCart.ts`, `logger.ts`)
- API routes: Next.js convention (`route.ts`)
- Types/interfaces: in the same file as their primary consumer, or in `commerce.port.ts`

### Critical patterns

**NEXT.JS NATIVE MODULES** — Any module that uses worker threads must be in
`serverExternalPackages` in `next.config.ts`, or webpack will rewrite the worker
script path at bundle time and the thread will crash on the second route that
imports the module.
Current list: `['pino', 'pino-pretty', 'thread-stream']`
Add to this list whenever you add a package that spawns workers (e.g. `sharp`).

**LANGCHAIN INSTANCEOF** — Never use `instanceof AIMessage`, `instanceof HumanMessage`,
etc. `@langchain/openai`, `@langchain/langgraph`, and other packages may resolve to
different copies of `@langchain/core`, so cross-package `instanceof` checks return
`false` even for the correct type. Always duck-type instead:
- Tool-call routing: check `(msg as { tool_calls?: unknown[] }).tool_calls`
- Message type: call `msg._getType()` (returns `'ai'`, `'human'`, `'tool'`, etc.)
- Avoid `msg.role` — not part of the LangChain BaseMessage contract.

---

## Live-Verified Architecture Notes

Data flow: `KaprukaAdapter` (only file touching `kapruka-mcp`) → normalizers
(`src/adapters/normalizers/`, raw SDK shapes → `Normalized*` types) → agent
tools (`src/agent/tools.ts`, `CommercePort` → render events + tool-message
text) → `RenderEventEmitter` → SSE frames (`app/api/chat/route.ts`).

**Page resolver — critical fallback for partner products.** `get_product`
404s for every partner-catalog (`EF_PC_*`) product, 100% of the time (see
docs/AGENT_BRIEFING.md). `src/adapters/image-resolver.ts`'s
`resolveProductFromPage` is what keeps these products usable: it fetches the
product's own detail page (`NormalizedProduct.product_page_url`, captured
from the search result before Decision C nulls the raw `image_url`) and
extracts image/description/vendor/category from its JSON-LD `Product`
schema, falling back to og:image/og:description meta tags. Without it,
partner products would show a placeholder icon and an empty detail drawer
forever, even though they're fully orderable.

**Every `adapter.getProduct()` call site and its 404 handling** (audit as of
this note; re-check with `grep -rn "\.getProduct("` if this drifts):
- `src/agent/tools.ts` `addToCart` — falls back to LLM-supplied name/price.
- `src/agent/tools.ts` `hydrateAndEmitProducts` — falls back to the page
  resolver above.
- `app/api/cart/direct-action/route.ts` — falls back to client-supplied
  name/price (same pattern as `addToCart`).
- `app/api/products/[productId]/route.ts` — falls back to the page resolver,
  returning a `partial` shape instead of a bare 502.
- `src/adapters/kapruka.adapter.ts` (search hydration) — `Promise.allSettled`,
  degrades silently, no page-resolver fallback at this layer.
- `app/api/session/history/route.ts` (session reconstruction, two call
  sites) — `Promise.allSettled` / `.catch(() => null)`; the product is
  silently dropped from reconstructed history rather than falling back —
  acceptable here since it's a reconstruction nicety, not the live purchase
  path.
- `src/agent/tools.ts` `getProduct` (the chat-facing tool, user asks for
  product detail by ID) — **no fallback**. Throws straight through;
  `runTool` turns it into an `ERROR` render event instead of a crash, but
  the user gets an error message instead of a product detail for a partner
  product. Known gap, not yet fixed.

**Two cart-add paths, same fallback pattern, kept in sync manually**:
`src/agent/tools.ts`'s `addToCart` tool (chat-driven) and
`app/api/cart/direct-action/route.ts` (product-card "add to cart" button).
Both accept optional `name`/`price`, skip `getProduct` when both are
present, and reject a non-positive resolved price rather than sending an
invalid value the live `add_to_cart` API rejects anyway. If you change one,
change the other.

**Known limitations**:
- `trackOrder` fails immediately after `createOrder` succeeds (order not
  found, both ID formats tried) — unresolved, see docs/AGENT_BRIEFING.md.
- `listDeliveryCities` does substring matching server-side, not prefix
  matching — root cause of the still-open "Galle resolves ambiguous"
  bug (documented as `test.skip` in `tests/integration/live-smoke.test.ts`).

---
---
## Phase Build Log
Update this section after each phase is complete.

| Phase | Status | Key files built | Notes |
|---|---|---|---|
| 0 | ✅ Done | commerce.port.ts, kapruka.adapter.ts, adapters/index.ts, app/api/health/route.ts, scripts/smoke.ts | 14/14 CommercePort tools verified via smoke test (mock). Live mode boots but warm-up fails — see notes below. |
| 1 | ✅ Done | customerMemory.ts, agent/state.ts, agent/events.ts, agent/systemPrompt.ts, agent/tools.ts, agent/graph.ts, app/api/chat/route.ts, app/page.tsx | LangGraph agent wired end-to-end (router → tools → Kasun responder) over the existing CommercePort seam. ChatOpenAI via OpenRouter (model `anthropic/claude-sonnet-4.5`) — `.env.local` has no `ANTHROPIC_API_KEY`, decided with user. 12 tools cover discovery/cart/delivery/checkout. SSE route streams `token`/`render`/`done`/`error` frames; test page at `/` exercises it. `npx tsc --noEmit` clean. |
| 2 | ✅ Done | lib/faq.ts, components/chat/{ChatInput,TypingIndicator,RenderEventView}, components/products/{ProductCard,ProductCarousel,ProductDetailDrawer,SkeletonCard}, components/cart/CartDrawer, components/delivery/DeliveryCard, components/checkout/CheckoutPanel, app/page.tsx | Production chat UI (ChatGPT-like shell). Framer Motion drawers + animated product cards. faqLookup tool (13th tool) with 15-entry static KB. `npx tsc --noEmit` clean. |
| 3 | ⬜ Pending | — | — |
| 4 | ⬜ Pending | — | — |
| 5 | ⬜ Pending | — | — |
| 6 | ⬜ Pending | — | — |
| 7 | ⬜ Pending | — | — |
