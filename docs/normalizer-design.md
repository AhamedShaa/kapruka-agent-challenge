# Normalizer Design — Type Schemas, Meta Block, and Rules

> **This is a design document. No implementation code.** It defines the target
> shapes and rules the normalizer will implement in a later pass.
> Sources: `docs/tool-contracts.md` (full audit), `fixtures/raw/*.raw.txt` /
> `*.parsed.json` (empirical evidence), `fixtures/raw/visual-description-analysis.md`
> (5-category get_product audit), `node_modules/kapruka-mcp/dist/sdk/types.d.ts`
> (current SDK types), `src/core/ports/commerce.port.ts` (current app-level types).
>
> **Revision note (final lock-down)**: this version closes every previously
> OPEN decision in the Decisions Log, makes `product_url` nullable for
> defensive forward-compatibility, redesigns `NormalizedDeliveryCheck` around
> a tri-state `availability` enum (replacing the boolean+date design),
> resolves `NormalizedCategory`'s URL-duplication problem with a new `url`
> field, resolves `NormalizedDeliveryCity`'s id-collision risk with batch-time
> collision detection plus a new `aliases` field, and explicitly confirms
> `vendor`/`weight` are retained on `NormalizedProduct`. **This document is
> now implementation-ready end to end** — see the Ready to Implement
> checklist at the bottom.

---

## SECTION 1 — Normalized type definitions

A note on style: every field below is written as `T | null`, never `T?`, per
the instruction to be explicit. "Required" below means "always present with a
real, non-fabricated value in every fixture we captured" — not "the TS type
forbids null." Every nullable field's *why* cites the specific tool-contracts
finding or fixture that justifies it.

### NormalizedProduct
Used everywhere a product appears: search, get_product, cart items,
alternatives, recommendations.

```ts
interface NormalizedProduct {
  id: string;                          // never null — items without an id are dropped, not nulled (Section 3)
  name: string | null;                 // null if extraction regex fails (parser falls back to "")
  price: number | null;                // null if 0 (regex-miss fallback OR a genuine LKR-0 promo, indistinguishable — Decision #1, LOCKED: always null on 0)
  currency: string;                    // never null — hardcoded "LKR" in 100% of observed cases, platform is LKR-only
  image_url: string | null;            // ONLY a real product image (get_product); always null for search-derived products — Decision C
  product_url: string | null;          // the Kapruka product page link; present in 100% of fixtures captured, but kept nullable for forward compatibility — see Section 3
  category: string | null;             // null if neither an explicit field nor a URL slug was extractable
  description: string | null;          // the primary product description, visual content included when present, preserved exactly as returned (truncation included) — Decision B
  visual_description: string | null;   // ALWAYS null — Decision A (LOCKED)
  vendor: string | null;                // RETAINED — extracted as-is from get_product; always null for search (no Vendor label exists there) — Decision F (LOCKED)
  weight: string | null;                // RETAINED — null if the value is a "0 <unit>" stub or unparseable; preserved otherwise — Decision D / F (LOCKED)
  in_stock: boolean;                    // never null — see rationale below
  _meta: NormalizationMeta;
}
```

**Why `currency` is never null**: hardcoded to `"LKR"` in 100% of observed cases; the entire platform is LKR-denominated (CLAUDE.md). Disclosed via `_meta.confidence: "stub"`, not by nulling the field.

**Why `in_stock` is never null**: extracted via a working `/In stock/i` regex test in every fixture captured across both `search_products` and all 5 `get_product` category samples. Caveat, still unverified empirically (not a blocking unknown — see Decisions Log): we have never seen a live "out of stock" response, so the regex's negative case remains untested.

**Why `vendor`/`weight` are retained (Decision F, LOCKED)**: `vendor` supports Kasun's persona — naming a real vendor ("Singer Sri Lanka PLC", "Qualitea Ceylon Private Limited") reinforces marketplace trust/authenticity, which scores under the competition's Personality criterion. `weight` (when not the `"0 lbs"` stub) supports informative product framing, e.g. describing a cake's size. Both fields are low-cost to keep populated when real, and the cost of re-adding them later if dropped now would exceed the cost of keeping them.

---

### NormalizedCategory

```ts
interface NormalizedCategory {
  id: string | null;          // null if URL slug pattern didn't match (parser falls back to a slugified name, treated as inferred, not failed)
  name: string;                // never null — extracted from link text in every observed case
  description: string | null;  // ALWAYS null — see rationale below
  url: string | null;           // NEW — Decision #4 (LOCKED), see rationale below
  _meta: NormalizationMeta;
}
```

**Why `description` is always null, and `url` exists separately**: the live server's `description` field is *literally a duplicate of the category URL*, not a real description (`fixtures/raw/kapruka_list_categories.parsed.json`: `"description": "https://www.kapruka.com/online/automobile"`). Decision #4 (now LOCKED) resolves this the same way Decision C resolved `Product.image_url`/`product_url`: don't let a misleadingly-named field carry a URL — null `description`, and carry the real URL value in a separately-named `url` field instead.

---

### NormalizedDeliveryCity

```ts
interface NormalizedDeliveryCity {
  id: string | null;            // collision risk, resolved via batch-time detection — see rationale below
  name: string;                  // never null — extracted correctly in all 25 observed cities
  delivery_fee: number | null;   // ALWAYS null — see rationale below
  estimated_days: number | null; // ALWAYS null — see rationale below
  aliases: string[] | null;       // NEW — Decision #5 (LOCKED), see rationale below
  _meta: NormalizationMeta;
}
```

**Why `id` is nullable, and how the collision risk is resolved (Decision #5, LOCKED)**: the live parser derives `id` as "the first word of the city name, uppercased" — not a real code from the server (e.g. "Mount Lavinia" → `MOUNT`, collidable with any other "Mount..." city). Rather than accept the risk or discard `id` outright, the normalizer detects collisions **at batch-normalization time**: when normalizing a full list of cities together (as in `NormalizedDeliveryCityList`), any `id` that occurs more than once across that batch is nulled for every colliding entry (their `name` remains the only reliable key). A single city normalized in isolation (outside a batch) keeps its derived `id` with `confidence: "inferred"`, since collision can't be checked without sibling data.

**Why `aliases` is added**: raw delivery-city responses include alias data (e.g. `_aliases: agalawatha_` in `fixtures/raw/kapruka_list_delivery_cities.raw.txt`) that the current SDK parser discards entirely and that isn't part of any published `DeliveryCity` type. Since this is real, extractable data being silently thrown away, the normalizer extracts it into a new field rather than losing it.

**Why `delivery_fee`/`estimated_days` are *always* null, not sometimes**: confirmed hardcoded to `0` and `1` respectively for every single one of the 25 cities observed, with zero basis in the raw response. `_meta.enrichmentTool` should point to `check_delivery`, which *does* return a real per-product fee.

---

### NormalizedDeliveryCheck

```ts
interface NormalizedDeliveryCheck {
  city: string;                                                        // never null — extracted correctly in the one observed case
  availability: 'available' | 'available_later' | 'unavailable' | 'unknown'; // Decision #6 (LOCKED) — replaces the previous availableToday boolean
  nextAvailableDate: string | null;                                     // populated only when availability === 'available_later'
  fee: number | null;                                                    // null if no LKR figure found, OR if the parsed value is 0 (Decision #1)
  _meta: NormalizationMeta;
}
```

This remains the single most consequential type in this document, and its shape changed in this revision (Decision #6, LOCKED — the boolean+date design from the previous version is replaced).

**Why a tri-state(+unknown) enum instead of `availableToday: boolean | null` + always-derivable nullability**: the captured fixture shows the live server saying delivery is *not available today but IS available tomorrow*, with a real date and fee — a genuinely three-way fact (available now / available later / not available at all), not a boolean with an optional footnote. `'unknown'` is included as a fourth state for when the source text doesn't match any recognized pattern at all (distinct from a confirmed `'unavailable'`). `nextAvailableDate` is populated by the normalizer reading the `**Next available: DATE**` line directly from raw text — the current SDK parser doesn't extract this at all, so the normalizer must parse it independently rather than rely on the SDK's parsed output.

**Why `estimatedDays` is removed entirely (not just nulled)**: in the previous design it was always null because it carried zero independent information (`available ? 1 : 2`, never extracted from real text). Since the field would *never* hold a real value under any circumstance, keeping it as an always-null field added no value over removing it outright — the tri-state `availability` field already replaces what little signal it used to gesture at.

---

### NormalizedOrder (success case)

```ts
interface NormalizedOrder {
  id: string | null;                // null if regex-scrape fails
  items: OrderItemResult[] | null;  // ALWAYS null with current parser
  total: number | null;              // null if no LKR figure found, OR if the parsed value is 0 (Decision #1)
  currency: string;                   // never null, same rationale as NormalizedProduct.currency
  checkoutUrl: string | null;        // null if no URL containing "checkout" is found
  status: string | null;              // see rationale below
  createdAt: string | null;           // ALWAYS null with current parser
  expiresAt: string | null;           // ALWAYS null with current parser — see rationale below
  _meta: NormalizationMeta;
}
```

**LOCKED, by inference only (Decision #7)**: `create_order` and `track_order` were never tested against a real success response, and this revision **deliberately decides not to run one** to ground it — proceeding on source-code inference alone. This type is explicitly documented as the **lowest-confidence type in this entire document**. If `checkoutUrl` extraction (or any other field here) breaks during a pre-demo integration test against a real order, that is the trigger to revisit this type — not before.

**Why `items`/`createdAt` are always null**: both parsers hardcode `items: []` and fabricate `createdAt` via `Date.now()` at parse time, regardless of the real response content — 100%-fabricated, not sometimes-fabricated.

**Why `expiresAt` is always null**: fabricated (+1hr) for `create_order`, hardcoded `""` for `track_order` — neither reads the server's actual expiry. Given CLAUDE.md's "60-minute pay link expiry" rule is load-bearing UX, surfacing a fabricated value here is actively risky, not just imprecise.

---

### NormalizedCartView

```ts
interface NormalizedCartView {
  items: NormalizedCartItem[];  // never null — local logic, always at minimum []
  total: number;                 // never null — computed locally, not parsed from text
  itemCount: number;              // never null
  isEmpty: boolean;                // derived: itemCount === 0
  _meta: NormalizationMeta;
}

interface NormalizedCartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;  // price * quantity, computed
}
```

**Why nothing here is nullable**: cart logic is pure local logic that never touches the live server. There is no fidelity gap to model. This type exists mainly as a contrast case: not everything needs `_meta`-driven nullability.

---

### NormalizedSearchResult (wrapper)

```ts
interface NormalizedSearchResult {
  products: NormalizedProduct[];
  total: number;
  query: string;
  cursor: string | null;
  _meta: NormalizationMeta;
}
```

Carries the live server's undocumented `nextCursor` field (confirmed in `fixtures/raw/kapruka_search_products.parsed.json`), which has no home on a per-product type.

### NormalizedDeliveryCityList (wrapper)

```ts
interface NormalizedDeliveryCityList {
  cities: NormalizedDeliveryCity[];
  totalAvailable: number | null;
  returnedCount: number;
  _meta: NormalizationMeta;
}
```

Carries the "25 of 332 total" pagination signal the current parser discards (`fixtures/raw/kapruka_list_delivery_cities.raw.txt`). **This is also where the `DeliveryCity.id` batch-collision detection described above runs**: when this wrapper normalizes its `cities` array, it scans for duplicate `id` values across the whole batch and nulls every colliding entry before the array is returned.

---

## SECTION 2 — The `_meta` block specification

```ts
interface NormalizationMeta {
  source: ToolSource;
  normalizedAt: string;
  missingFields: string[];
  enrichmentTool: string | null;
  confidence: 'verified' | 'inferred' | 'stub';
  schemaVersion: number;
}
```

### `source: ToolSource` — **keep**
```ts
type ToolSource =
  | 'search_products' | 'get_product' | 'get_alternatives' | 'get_recommendations'
  | 'list_categories' | 'list_delivery_cities' | 'check_delivery'
  | 'cart' | 'create_order' | 'track_order';
```
The load-bearing field: the same normalized type has different reliability depending on which tool produced it (e.g. `description` differs in completeness between `search_products` and `get_product`). Without `source`, a consumer can't know which Section 3 rule table applies, or whether enrichment is worthwhile.

### `normalizedAt: string` (ISO timestamp) — **keep**
`KaprukaLocal` already caches read-only tool responses for 30 minutes — this timestamp is the only way a consumer can reason about staleness relative to "now." **Default**: set to `new Date().toISOString()` at normalization time — never copied from any source data, never cached/reused across calls.

### `missingFields: string[]` — **keep, core mechanism**
The structured, machine-readable encoding of every "Known fidelity gap" in `tool-contracts.md`. Distinguishes "this product has no description" (a real fact) from "the source never carries one" (a fidelity gap).

### `enrichable: boolean` — **dropped, redundant**
`enrichmentTool !== null` already implies enrichable; storing both invites the two getting out of sync.

### `enrichmentTool: string | null` — **keep**
Directly actionable: tells a consumer which follow-up tool call (if any) could fill a `null` field. Kept singular for v1 (Decision #9, LOCKED — see Decisions Log).

### `confidence: 'verified' | 'inferred' | 'stub'` — **keep, object-level summary, not a per-field map**
Represents the **worst confidence among that object's non-null fields**. Per-field confidence is static, per-source information already captured in Section 3's tables — storing it again per-instance would be redundant and roughly double `_meta`'s size. **Ordering for the worst-case rollup: `stub` < `inferred` < `verified`. An object's overall `confidence` equals the worst (lowest) confidence among its non-null fields.**

### `schemaVersion: number` — **keep**
Versions the normalization rules themselves so a future rule change doesn't silently reinterpret already-cached/already-logged normalized objects. **Default**: the constant `1` for this design version — bump only when Section 3's rules change in a way that would reinterpret previously-normalized data differently.

---

## SECTION 3 — Field-by-field normalization rules

### NormalizedProduct — populated from `search_products`

| Normalized field | SDK source field | Transformation | If absent |
|---|---|---|---|
| `id` | `parseSearchResults` regex on `` ID: `X` `` | preserve as-is | item is **dropped entirely** (per source: `if (id) products.push(...)`) |
| `name` | `**N. Name**` line regex | preserve; empty string → `null` | `null` + `missingFields += "name"` |
| `price` | `LKR ([\d,]+)` regex | real non-zero number → preserve; `0` (real or regex-miss, indistinguishable) → `null` (Decision #1, LOCKED) | `null` + `missingFields += "price"` |
| `currency` | n/a — hardcoded `"LKR"` | always `"LKR"` | n/a |
| `image_url` | n/a — search blocks never carry an `**Image**` line | **always** `null` for search-derived products (Decision C) | `null` + `missingFields += "image_url"`, `enrichmentTool: "get_product"` |
| `product_url` | `[View product](url)` link regex | preserve if present, `confidence: "verified"` (present in all 9 search-result blocks captured); `null` + `missingFields += "product_url"` if absent (not observed in any fixture, but kept nullable for forward compatibility rather than dropping the item) | `null` + `missingFields += "product_url"` |
| `category` | inferred from `/kid/xxxx` URL slug | preserve; `confidence: "inferred"` | `null` + `missingFields += "category"` |
| `description` | n/a — hardcoded `""` in parser | always `""` → `null` | `null` + `missingFields += "description"`, `enrichmentTool: "get_product"` |
| `visual_description` | n/a | **always** `null` (Decision A, LOCKED) | `null` + `missingFields += "visual_description"`, `enrichmentTool: null` |
| `vendor` | n/a — search blocks never carry a `**Vendor**` label | **always** `null` for search-derived products | `null` + `missingFields += "vendor"`, `enrichmentTool: "get_product"` |
| `weight` | n/a — search blocks never carry a `**Weight**` label | **always** `null` for search-derived products | `null` + `missingFields += "weight"`, `enrichmentTool: "get_product"` |
| `in_stock` | `/In stock/i` regex | preserve | defaults `false` (untested negative case) |

### NormalizedProduct — populated from `get_product`

| Normalized field | SDK source field | Transformation | If absent |
|---|---|---|---|
| `id` | `` **ID**: `X` `` regex | preserve | entire parse fails (`parseProductDetails` returns `null`) — see Section 4 for not-found handling |
| `name` | `^##\s+(.+)/m` regex | preserve | `null` + `missingFields += "name"` |
| `price` | `LKR ([\d,]+)` regex | real non-zero number → preserve; `0` → `null` (Decision #1, LOCKED, same rule as search) | `null` + `missingFields += "price"` |
| `currency` | n/a — hardcoded `"LKR"` | always `"LKR"` | n/a |
| `image_url` | `` **Image**: URL `` regex | real CDN image URL in all 5 captured category samples (flowers/cakes/electronics/books/grocery) → preserve, `confidence: "verified"` | `null` + `missingFields += "image_url"` |
| `product_url` | `[View on Kapruka](url)` link regex | preserve if present, `confidence: "verified"` (present in all 5 captured samples); `null` + `missingFields += "product_url"` if absent (not observed, kept nullable defensively) | `null` + `missingFields += "product_url"` |
| `category` | `**Category**: X` regex | preserve, `confidence: "verified"` | `null` + `missingFields += "category"` |
| `description` | text block between metadata and `**Image**` line | **Preserve text exactly as the parser returns it, including any trailing `"..."` if present. The normalizer neither strips nor adds ellipsis — it is a pure pass-through. The presence or absence of trailing `"..."` is itself meaningful signal preserved for downstream consumers** (Decision B, LOCKED) | `null` + `missingFields += "description"` |
| `visual_description` | n/a | **always** `null` (Decision A, LOCKED) | `null` + `missingFields += "visual_description"`, `enrichmentTool: null` |
| `vendor` | `**Vendor**: X` regex | preserve as-is, no transformation (Decision F, LOCKED) | `null` + `missingFields += "vendor"` |
| `weight` | `**Weight**: X` regex | **stub-detection rule (Decision D / F, LOCKED)**: if the matched value is `"0 lbs"` (or generally `"0 <unit>"`) → `null` (confirmed stub: 4 of 5 captured samples — electronics, books, grocery, flowers — all show exactly `"0 lbs"` despite spanning unrelated categories, while only cakes shows a real `"3 lbs"`); if it parses to a positive number with a unit → preserve the matched string as-is; if unparseable → `null` | `null` + `missingFields += "weight"` |
| `in_stock` | `/In stock/i` regex | preserve | same caveat as search |

### NormalizedCategory

| Normalized field | SDK source field | Transformation | If absent |
|---|---|---|---|
| `id` | `/online/(.+)$/` URL match | preserve if matched, `confidence: "verified"`; falls back to slugified `name` → `confidence: "inferred"` | `null` only if both fail (not observed in 65 captured categories) |
| `name` | link text | preserve | `null` + `missingFields += "name"` (not observed) |
| `description` | n/a — duplicate of the category URL | **always** `null` (Decision #4, LOCKED) | `null` + `missingFields += "description"`, `enrichmentTool: null` |
| `url` | same URL the parser currently (mis)stores in `description` | preserve as-is, `confidence: "verified"` (present in all 65 captured categories) — Decision #4, LOCKED | `null` + `missingFields += "url"` (not observed) |

### NormalizedDeliveryCity

| Normalized field | SDK source field | Transformation | If absent |
|---|---|---|---|
| `id` | first word of `name`, uppercased | preserve, `confidence: "inferred"`; **nulled if it collides with another city's derived `id` within the same normalization batch** (Decision #5, LOCKED — collision detection happens in `NormalizedDeliveryCityList`, not per-city in isolation) | n/a — always derivable from `name`, collision-checked separately |
| `name` | `- **Name**` regex | preserve | `null` + `missingFields += "name"` (not observed) |
| `delivery_fee` | n/a — hardcoded `0` | **always** `null` | `null` + `missingFields += "delivery_fee"`, `enrichmentTool: "check_delivery"` |
| `estimated_days` | n/a — hardcoded `1` | **always** `null` | `null` + `missingFields += "estimated_days"`, `enrichmentTool: "check_delivery"` |
| `aliases` | `_aliases: x y z_` markdown segment | split on whitespace into a string array, preserve, `confidence: "verified"` when present (Decision #5, LOCKED) | `null` (no `missingFields` entry — many cities legitimately have no aliases; this is a real absence, not a fidelity gap) |

### NormalizedDeliveryCheck (redesigned — Decision #6, LOCKED)

| Normalized field | SDK source field | Transformation | If absent |
|---|---|---|---|
| `city` | `Delivery to X on` header regex | preserve | `null` + `missingFields += "city"` (not observed) |
| `availability` | `"Not available"` text presence + presence of a `**Next available: DATE**` line | `'available'` if no "Not available" text found; `'available_later'` if "Not available" is found **and** a "Next available" date is present; `'unavailable'` if "Not available" is found with **no** next-available date; `'unknown'` if the text doesn't match any recognized pattern at all | `'unknown'` + `missingFields += "availability"` |
| `nextAvailableDate` | `**Next available: DATE**` line, parsed directly from raw text (not extracted by the current SDK parser at all) | populate only when `availability === 'available_later'`; otherwise `null` | `null` |
| `fee` | `LKR ([\d,]+)` first-match regex | preserve if non-zero, `confidence: "inferred"` (fragile, not anchored to a specific line); `0` → `null` (Decision #1, LOCKED) | `null` + `missingFields += "fee"` |

### NormalizedOrder
**LOCKED by inference only (Decision #7) — lowest-confidence type in this document, see rationale in Section 1.**

| Normalized field | SDK source field | Transformation | If absent |
|---|---|---|---|
| `id` | regex for `Order ID`/`order_id`/`orderId` label, or `KAP-ORD-\d+` | preserve, `confidence: "inferred"` | `null` + `missingFields += "id"` |
| `items` | n/a — hardcoded `[]` | **always** `null` | `null` + `missingFields += "items"`, `enrichmentTool: null` |
| `total` | `LKR ([\d,]+)` first-match regex (create_order only) | preserve if non-zero for create_order, `confidence: "inferred"`; `0` → `null` (Decision #1); **always** `null` for track_order | `null` + `missingFields += "total"` |
| `currency` | n/a — hardcoded `"LKR"` | always `"LKR"` | n/a |
| `checkoutUrl` | regex requiring a URL containing `"checkout"` | preserve if found, `confidence: "inferred"`; **always** `null` for track_order | `null` + `missingFields += "checkoutUrl"` |
| `status` | keyword match for track_order; hardcoded `"pending"` for create_order | preserve for track_order, `confidence: "inferred"`; **always** `null` for create_order | `null` + `missingFields += "status"` |
| `createdAt` | n/a — fabricated via `Date.now()` | **always** `null` | `null` + `missingFields += "createdAt"`, `enrichmentTool: null` |
| `expiresAt` | fabricated (+1hr) for create_order; hardcoded `""` for track_order | **always** `null` for both | `null` + `missingFields += "expiresAt"`, `enrichmentTool: null` |

### NormalizedCartView / NormalizedCartItem

| Normalized field | SDK source field | Transformation | If absent |
|---|---|---|---|
| `items[].productId`/`name`/`price`/`quantity` | local cart storage | preserve as-is, `confidence: "verified"` always | n/a |
| `items[].subtotal` | not present in raw response | computed: `price * quantity` | n/a |
| `total` | `cartTotal` formatted string | parsed to number (existing `parseLkr()` precedent) | n/a |
| `itemCount` | `itemCount` | preserve | n/a |
| `isEmpty` | not present in raw response | computed: `itemCount === 0` | n/a |

### NormalizedSearchResult

| Normalized field | SDK source field | Transformation | If absent |
|---|---|---|---|
| `products` | array of `NormalizedProduct` per the table above | preserve | `[]` if no matches |
| `total` | `Showing N results` regex, or `products.length` fallback | preserve | `0` |
| `query` | the original query string | preserve as-is, always known (it's our own input) | n/a |
| `cursor` | `cursor="..."` regex (currently surfaced as the undocumented `nextCursor` field) | preserve if present | `null` if no more pages |

### NormalizedDeliveryCityList

| Normalized field | SDK source field | Transformation | If absent |
|---|---|---|---|
| `cities` | array of `NormalizedDeliveryCity` per the table above, **with batch-time `id` collision detection applied across the whole array** (Decision #5, LOCKED) | preserve | `[]` |
| `totalAvailable` | `(N of M total)` header regex (the "332" in "25 of 332 total") | preserve if the header is parseable | `null` + `missingFields += "totalAvailable"` |
| `returnedCount` | `cities.length` | computed | `0` |

---

## SECTION 4 — Error envelope handling

*(unchanged — no new evidence affected this section)*

The audit found **two structurally different error mechanisms**:

- **Case A — thrown exception**: all three `create_order` test payloads failed via the official server's Pydantic schema validation, surfacing as a **JS exception thrown from `client.callTool()`**, with no response text to parse. Example (`fixtures/raw/create-order-error-empty-cart.raw.txt`):
  ```
  Kapruka API Error [kapruka_create_order]: Error executing tool kapruka_create_order: 6 validation errors for kapruka_create_orderArguments
  params.cart
    List should have at least 1 item after validation, not 0 [type=too_short, input_value=[], input_type=list]
  ```
- **Case B — response containing an error**: `track_order`'s not-found case returned real response content, no exception (`fixtures/raw/track-order-not-found.raw.txt`):
  ```
  Error (order_not_found): No order exists with the given order number
  ```
  Also the `{error, tool, suggestion}` JSON envelope `KaprukaLocal` itself produces for tools like `search_products`/`get_product`/`check_delivery`.

### Unified target shape

```ts
interface NormalizedError {
  ok: false;
  code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'RATE_LIMITED' | 'NETWORK_ERROR' | 'UNKNOWN';
  message: string;
  tool: string;
  retryable: boolean;
  details: Record<string, unknown> | null;
  raw: string;
}
```

### Case A — adapter catches an exception
1. `raw = err.message`.
2. Pattern-match: `"validation error"` → `VALIDATION_ERROR` (+ regex-extract per-field Pydantic lines into `details`); existing `isRetryableError()` network/timeout heuristics → `NETWORK_ERROR`, `retryable: true`; `"Rate limit exceeded"` → `RATE_LIMITED`, `retryable: true`; else `UNKNOWN`, `retryable: false`.
3. `message` is a rewritten, user-safe string derived from `code`.

### Case B — adapter detects an error in a successful response
1. `raw = rawText`.
2. Detection, in order: JSON with `.error` string (KaprukaLocal envelope) → code from `tool`/message content; plain text matching `/^Error \(([a-z_]+)\):\s*(.+)/i` → code mapped from the captured code; contains `"not found"` with no structured code → `NOT_FOUND` fallback; else `UNKNOWN`.
3. Same user-safe `message` rewriting as Case A.

Both cases converge on the same `NormalizedError` shape so downstream code branches on `code` exactly once, regardless of mechanism.

---

## SECTION 5 — DECISIONS LOG

All 12 design decisions raised across this audit (the original 11 plus Decision F), consolidated. **Every decision is now LOCKED.**

**A. `visual_description` — always null.**
The 5-category visual audit found the server *does* sometimes return visual content, but only mixed into the free-text `description` paragraph, with no structural markdown signal separating it (no `**Color**`/`**Material**` field exists in any of the 5 categories tested). Deterministically extracting "the visual parts" from free text is a classification task, out of scope for a rule-based normalizer. `enrichmentTool: null`.

**B. `description` — preserved as-is, truncation included.**
The description *is* the primary product description, including visual content when present. The normalizer does not strip the trailing `"..."` — it's honest signal that the live server itself cut the text off, not parser noise. Pure pass-through, no exceptions.

**C. `image_url` / `product_url` split.**
`image_url`: null for all search-derived products; real, verified value from `get_product`. `product_url`: separately-extracted page link, **now nullable** for defensive forward-compatibility even though it was present in 100% of the 14 fixtures captured (this revision's change #1).

**D. `weight` — stub-detection via the "0 lbs" pattern.**
4 of 5 captured `get_product` samples (electronics, books, grocery, flowers) show exactly `"0 lbs"` despite spanning unrelated categories, while cakes shows a real `"3 lbs"` — strong evidence `"0 lbs"` is a server-side default, not a measurement. Rule: preserve only if the value parses to a positive number with a unit; null for `"0 <unit>"` or unparseable values.

**E. `vendor` — preserved as-is, no transformation.**
Extracted directly from the `**Vendor**` markdown field; no fidelity gap found.

**F. `vendor` and `weight` fields retained on `NormalizedProduct`.**
Confirmed in this revision after a brief consideration of dropping them: **retained**. `vendor` supports trust/marketplace-authenticity signaling in Kasun's persona (the competition's Personality scoring criterion benefits from naming a real vendor rather than presenting products as generic). `weight`, when not the `"0 lbs"` stub, supports informative product framing (e.g. communicating a cake's size). Both are low-cost to keep populated when real data exists, and the cost of re-adding them later if removed now would exceed the cost of keeping them today.

**1. `price: 0` / `delivery_fee: 0` / `fee: 0` ambiguity — uniform rule adopted.**
A parsed `0` is indistinguishable from a real free item/fee when it's the parser's regex-miss fallback. **Resolved with one simple, uniform rule applied everywhere a price-like field is parsed**: any parsed `0` is treated as null, across `Product.price`, `DeliveryCity.delivery_fee`, `DeliveryCheck.fee`, and `Order.total`. Accepted tradeoff: a rare genuine `LKR 0` promotional item would also be nulled — judged an acceptable risk given how often `0` is confirmed-fabricated elsewhere in this audit, versus the cost of two different rules for "looks the same but means different things depending on which field it's in."

**4. `Category.description`'s URL-duplication — resolved with a new `url` field.**
Same pattern as Decision C: `description` stays null, a new `url: string | null` field carries the real (verified, present in all 65 captured categories) URL value instead.

**5. `DeliveryCity.id` collision risk + aliases — resolved with batch detection and a new field.**
`id` collisions are detected when a full city list is normalized together (in `NormalizedDeliveryCityList`); any `id` appearing more than once in that batch is nulled for every colliding entry, leaving `name` as the reliable key for those cities. Separately, the previously-discarded alias data (`_aliases: ..._`) is now captured in a new `aliases: string[] | null` field.

**6. `NormalizedDeliveryCheck.availability` — tri-state enum adopted, boolean+date design retired.**
Replaced `availableToday: boolean | null` with `availability: 'available' | 'available_later' | 'unavailable' | 'unknown'`, keeping `nextAvailableDate: string | null` (populated only for `'available_later'`). The `'unknown'` state distinguishes "the source text didn't match any pattern we recognize" from a confirmed `'unavailable'`. `estimatedDays` is removed entirely (not merely nulled) since it could never hold real, independently-meaningful data under the current parser.

**7. `NormalizedOrder` grounding — resolved: proceed on inference, no real order.**
Decision: do not place a real test order. `NormalizedOrder` proceeds entirely on source-code inference and is explicitly documented (Section 1, Section 3) as the lowest-confidence type in this document. Trigger for revisiting: if `checkoutUrl` extraction (or any other field in this type) breaks during a pre-demo integration test against a real order, that is the point to come back and re-ground this type empirically — not before.

**8. Wrapper types — added.**
`NormalizedSearchResult` and `NormalizedDeliveryCityList`, carrying the previously-homeless `nextCursor`/pagination-total data.

**9. Single `enrichmentTool` string — accepted as sufficient for v1.**
True for every gap found so far (one tool fixes all of a given object's gaps). Accepted for v1; revisit to an array/map shape only if a real case emerges where two different missing fields on the same object need two different enrichment tools.

---

## FINAL TYPE SHAPES

Clean, non-annotated type definitions — what the implementation follows exactly.

```ts
type ToolSource =
  | 'search_products' | 'get_product' | 'get_alternatives' | 'get_recommendations'
  | 'list_categories' | 'list_delivery_cities' | 'check_delivery'
  | 'cart' | 'create_order' | 'track_order';

interface NormalizationMeta {
  source: ToolSource;
  normalizedAt: string;
  missingFields: string[];
  enrichmentTool: string | null;
  confidence: 'verified' | 'inferred' | 'stub';
  schemaVersion: number;
}

interface NormalizedProduct {
  id: string;
  name: string | null;
  price: number | null;
  currency: string;
  image_url: string | null;
  product_url: string | null;
  category: string | null;
  description: string | null;
  visual_description: string | null;
  vendor: string | null;
  weight: string | null;
  in_stock: boolean;
  _meta: NormalizationMeta;
}

interface NormalizedCategory {
  id: string | null;
  name: string;
  description: string | null;
  url: string | null;
  _meta: NormalizationMeta;
}

interface NormalizedDeliveryCity {
  id: string | null;
  name: string;
  delivery_fee: number | null;
  estimated_days: number | null;
  aliases: string[] | null;
  _meta: NormalizationMeta;
}

interface NormalizedDeliveryCheck {
  city: string;
  availability: 'available' | 'available_later' | 'unavailable' | 'unknown';
  nextAvailableDate: string | null;
  fee: number | null;
  _meta: NormalizationMeta;
}

interface OrderItemResult {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
}

interface NormalizedOrder {
  id: string | null;
  items: OrderItemResult[] | null;
  total: number | null;
  currency: string;
  checkoutUrl: string | null;
  status: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  _meta: NormalizationMeta;
}

interface NormalizedCartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

interface NormalizedCartView {
  items: NormalizedCartItem[];
  total: number;
  itemCount: number;
  isEmpty: boolean;
  _meta: NormalizationMeta;
}

interface NormalizedSearchResult {
  products: NormalizedProduct[];
  total: number;
  query: string;
  cursor: string | null;
  _meta: NormalizationMeta;
}

interface NormalizedDeliveryCityList {
  cities: NormalizedDeliveryCity[];
  totalAvailable: number | null;
  returnedCount: number;
  _meta: NormalizationMeta;
}

interface NormalizedError {
  ok: false;
  code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'RATE_LIMITED' | 'NETWORK_ERROR' | 'UNKNOWN';
  message: string;
  tool: string;
  retryable: boolean;
  details: Record<string, unknown> | null;
  raw: string;
}
```

8 normalized types: `NormalizedProduct`, `NormalizedCategory`, `NormalizedDeliveryCity`, `NormalizedDeliveryCheck`, `NormalizedOrder`, `NormalizedCartView`, `NormalizedSearchResult`, `NormalizedDeliveryCityList` — plus `NormalizationMeta`, `NormalizedError`, and three small supporting shapes (`OrderItemResult`, `NormalizedCartItem`, `ToolSource`).

---

## READY TO IMPLEMENT checklist

| Item | Status |
|---|---|
| All field decisions locked | ✅ **YES** — all 12 decisions in the Decisions Log (A–F, #1, #4–#9) are LOCKED. |
| All fidelity rules documented per source | ✅ Yes — every field of every type has a Section 3 row citing the specific source regex/behavior and the fixture that confirmed it. |
| Error handling spec complete | ✅ Yes — Section 4 covers both observed mechanisms (thrown exception, response-embedded error) converging on one `NormalizedError` shape. |
| Both wrapper types specified | ✅ Yes — `NormalizedSearchResult` and `NormalizedDeliveryCityList` are fully defined in Section 1, Section 3, and Final Type Shapes. |
| No remaining unknowns | ✅ **YES** — every previously-OPEN item is now resolved with a documented rule, including the explicit decision to proceed on inference alone for `NormalizedOrder` rather than leaving it genuinely unknown. |

**Implementation may proceed against the entire document.**
