# Kapruka Tool Contracts — Full Specification (Input + Output)

> Source: `node_modules/kapruka-mcp/dist/local/server.js` (`KaprukaLocal.registerTools()`),
> `dist/sdk/client.js` (`KaprukaSDK`), `dist/sdk/markdown-parser.js`, `dist/sdk/types.d.ts`.
> Raw/parsed fixtures: `fixtures/raw/*.raw.txt` / `*.parsed.json`, captured by
> `scripts/audit-tool-outputs.ts` against the live server on 2026-06-24.
>
> Note: this file registers **15** tools, not 14 (`kapruka_clear_cart` and
> `kapruka_get_analytics` exist in addition to the other 13) — confirmed in the
> previous pass and kept consistent here.
>
> **Live-delegation status**, since this matters for every section below:
> - **Directly live-delegated and audited**: `search_products`, `get_product`,
>   `list_categories`, `list_delivery_cities`, `check_delivery`.
> - **Live-delegated but not audited** (would need a real run to confirm):
>   `create_order`, `track_order` — explicitly skipped (would create a real order
>   / nothing to track).
> - **Indirectly live-delegated, not audited as their own fixture**:
>   `get_alternatives`, `get_recommendations` (both call live `search_products`
>   internally via `searchAndCache`), `validate_shipping` (calls live
>   `list_delivery_cities` internally, but only to get city *names*).
> - **Local logic, no Kapruka live dependency**: `add_to_cart`, `get_cart`,
>   `clear_cart`, `get_analytics`.
> - **Local logic, but depends on a *different* external API** (not Kapruka's
>   MCP server): `convert_currency` (Frankfurter exchange-rate API).

---

## kapruka_search_products

### Intent
The entry point for product discovery — supports the first moment a shopper says "I'm looking for X," with optional refinement by category, price range, stock, sort order, and pagination.

### Input contract
```ts
const SearchSchema = {
  q: z.string().min(1).describe('Search keyword. Examples: "birthday cake", "red roses", "iPhone 15"'),
  category: z.string().optional().describe('Optional category filter: flowers | cakes | gifts | electronics | toys | fashion | grocery | appliances | beauty | books | fruits | beverages'),
  min_price: z.number().optional().describe('Minimum price filter in LKR'),
  max_price: z.number().optional().describe('Maximum price filter in LKR'),
  in_stock_only: z.boolean().optional().describe('Only show in-stock products'),
  sort: z.string().optional().describe('Sort order: price_asc, price_desc, name'),
  limit: z.number().int().optional().describe('Max results to return'),
  cursor: z.string().optional().describe('Pagination cursor from previous result'),
  currency: z.string().optional().describe('Currency code (default: LKR)'),
};
```
`q` required (min length 1); everything else optional and **not enum/format-enforced** despite suggestive descriptions (`category`, `sort`, `currency` are free-text strings).

### Live raw output shape
Markdown, not JSON (`fixtures/raw/kapruka_search_products.raw.txt`):
```
## Kapruka search: "roses"
Showing 9 results (LKR)

**1. Rose Elegance Display Vase With 30 Red Roses**
   ID: `FLOWERS00T1875` · LKR 18,000 · In stock (low) · ships internationally
   [View product](https://www.kapruka.com/buyonline/rose-elegance-display-vase-wit/kid/flowers00t1875)
```
...repeats per result, ending with `*More results available. Pass \`cursor="..."\` for the next page.*`

### Parsed output shape
TS interface: `SearchResult` (`{ products: Product[]; total: number; query: string }`).
Actual parsed JSON includes an **undocumented extra field**, `nextCursor`, not present in the published `SearchResult` type:
```json
{
  "products": [
    { "id": "FLOWERS00T1875", "name": "Rose Elegance Display Vase With 30 Red Roses",
      "price": 18000, "currency": "LKR",
      "image_url": "https://www.kapruka.com/buyonline/rose-elegance-display-vase-wit/kid/flowers00t1875",
      "category": "flowers", "description": "", "visual_description": "", "in_stock": true }
  ],
  "total": 9,
  "query": "roses",
  "nextCursor": "eyJ1IjoiTVRBPSIsInAiOjJ9"
}
```

### Known fidelity gaps
(per `Product` field, from `parseSearchResults` in `markdown-parser.js`)
- `id` — ✅ extracted from `` ID: `X` `` pattern
- `name` — ✅ extracted from the `**N. Name**` line
- `price` — ✅ extracted via `LKR ([\d,]+)` regex; ❌ falls back to hardcoded `0` if the regex doesn't match
- `currency` — ❌ hardcoded to `"LKR"` always (never read from response)
- `image_url` — ⚠️ falls back to the product page URL if no explicit `**Image**` line exists in the block (search blocks never have one — so this is always the page URL, not a real image)
- `category` — ⚠️ inferred from the URL slug pattern `/kid/xxxx`, not an explicit category field
- `description` — ❌ hardcoded to `""` always — search results never carry description text
- `visual_description` — ❌ hardcoded to `""` always
- `in_stock` — ✅ extracted via `/In stock/i` test on the block
- `nextCursor` — ⚠️ extracted but **not part of the published `SearchResult` type** — a consumer typed strictly against `SearchResult` would silently drop it

### Empty-result behavior
**Untested — needs verification.** Two code paths exist depending on what the live server actually returns for zero matches: (1) `KaprukaSDK.searchProducts()` special-cases the literal substring `"No products found"` (or fully empty text) to return `{ products: [], total: 0, query: q }` directly, before even trying markdown parsing; (2) if the real empty-result text doesn't match that substring, it falls into `parseSearchResults`, which would produce `products: []` (no `**N.` blocks to match) and `total` from `Showing 0 results` if that phrase is present, else `0`. Neither path was exercised in this audit — we only tested a query with 9 real hits.

### Error behavior
At the `KaprukaSDK` layer: if the MCP response is JSON but not markdown and doesn't match either known pattern, `searchProducts()` throws `Unexpected response format from search_products: <first 200 chars>`. At the `KaprukaLocal` layer (confirmed empirically — this is the exact error this script's own warm-up call absorbs), that error gets caught and wrapped into the standard envelope:
```json
{ "error": "Unexpected response format from \"kapruka_search_products\".", "tool": "kapruka_search_products", "suggestion": "Check your internet connection or switch to mock mode" }
```
Also subject to the rate limiter (60 req/min) — returns `{ "error": "Rate limit exceeded: max 60 requests per 60s." }` with no `tool`/`suggestion` keys if triggered (rate-limit errors short-circuit before the try/catch that adds those fields).

---

## kapruka_get_product

### Intent
Lets the shopper drill into one specific item after browsing search results, to see full product details (per the tool's own description: name, price, description, visual description, image URL, stock status, category) before deciding to add it to cart. (This describes the tool's *output*, inferred from its `description` field in the source — distinct from the 2-field input contract below.)

### Input contract
```ts
const GetProductSchema = {
  product_id: z.string().describe('Product ID from search results. Example: "KAP-FLW-001"'),
  currency: z.string().optional().describe('Currency code (default: LKR)'),
};
```
`product_id` required; `currency` optional, free-text, defaults to LKR.

### Live raw output shape
Markdown (`fixtures/raw/kapruka_get_product.raw.txt`):
```
## Rose Elegance Display Vase With 30 Red Roses
**ID**: `flowers00T1875`
**Price**: LKR 18,000
**Stock**: In stock (low)
**Category**: flowers
**Vendor**: Flowers
**Weight**: 0 lbs
...
Bring timeless beauty to any room with the Rose Elegance Display Vase... This stunning arrangement in a chic vase is perfect for your...
```
(description paragraph itself is truncated with `...` by the *live server*, not by our parser)

### Parsed output shape
TS interface: `Product`.
```json
{
  "id": "flowers00T1875", "name": "Rose Elegance Display Vase With 30 Red Roses",
  "price": 18000, "currency": "LKR",
  "image_url": "https://www.kapruka.com/shops/flowershop/flowerImages/zooms/1750164720138_dsc03892.jpg",
  "category": "flowers",
  "description": "Bring timeless beauty to any room with the Rose Elegance Display Vase... This stunning arrangement in a chic vase is perfect for your...",
  "visual_description": "Vendor: Flowers. Weight: 0 lbs.",
  "in_stock": true
}
```

### Known fidelity gaps
- `id`, `name`, `price`, `category`, `image_url`, `in_stock` — ✅ extracted from clearly-labeled markdown fields
- `currency` — ❌ hardcoded to `"LKR"` always
- `description` — ⚠️ extracted, but truncated mid-sentence by the live server itself (parser is faithful to a lossy source)
- `visual_description` — ❌ **misleading field, not a stub but arguably worse**: the tool's own description and the server's `SERVER_INSTRUCTIONS` promise this field contains "rich detail about colours, materials, sizes, and textures... use it to describe products to blind users or over voice calls." The actual live value is just `"Vendor: Flowers. Weight: 0 lbs."` — vendor/weight metadata, not a visual description at all. Any feature built on the assumption that this field describes appearance will silently produce nonsense.

### Empty-result / not-found behavior
**Untested — needs verification.** Per source: `parseProductDetails` returns `null` if the text starts with `"Error"` or contains `"not found"`; `KaprukaSDK.getProduct()` then throws `Product "<id>" not found`. `KaprukaLocal.registerGetProduct()` catches that and additionally calls `findSimilar(product_id)` for a "did you mean" suggestion. Not exercised in this audit — only a known-valid ID was tested.

### Error behavior
Same `{error, tool, suggestion}` envelope as above; subject to the same 60 req/min rate limit.

---

## kapruka_get_alternatives

### Intent
The fallback when a search comes up empty or the customer's first choice is out of stock — keeps the conversation moving by offering close substitutes instead of a dead end.

### Input contract
```ts
const GetAlternativesSchema = {
  query: z.string().min(1).describe('The original search term that failed or returned too few results. Example: "wireless headphones under 10000"'),
  category: z.string().optional().describe('Optional category to narrow alternatives'),
  maxPrice: z.number().positive().optional().describe('Maximum price filter in LKR. Example: 10000'),
  limit: z.number().int().min(1).max(10).default(5).describe('Max alternatives to return (default: 5, max: 10)'),
};
```

### Live raw output shape
**Not tested in this audit.** This tool never calls `callToolRaw` itself with its own tool name — in live mode it calls `searchAndCache()`, which fires 2-4 parallel `sdk.searchProducts(token, category)` calls (same markdown response shape as `kapruka_search_products` above) and scores/deduplicates the results locally. There is no separate "kapruka_get_alternatives" raw response from the live server to capture — the live raw shape *is* whatever `search_products` already returns.

### Parsed output shape
No formal TS interface in `src/sdk/types.ts` for this wrapper shape (it's assembled inline in `server.js`); the `Product[]` items themselves are `Product`.
```json
{
  "query": "wireless headphones under 10000",
  "alternatives": [ /* Product[] */ ],
  "total": 2,
  "suggestion": "Found 2 alternatives for \"wireless headphones under 10000\"."
}
```

### Known fidelity gaps
- `alternatives[]` items inherit every gap listed under `kapruka_search_products` (description/visual_description always `""`, currency always `"LKR"`, etc.) since they're built from the same `parseSearchResults` output, then re-scored locally by `scoreAlternatives()` (a token-overlap heuristic, not the live server's own ranking).
- `suggestion` — ✅ generated locally from the alternatives count, not from any live data.

### Empty-result behavior
Per source: if no alternatives score above 0, the handler additionally tries each individual token from the query as a broader fallback search before giving up. If still empty: `{ query, alternatives: [], total: 0, suggestion: 'No alternatives found for "<query>". Try a broader search term.' }`. Not live-tested.

### Error behavior
Standard `{error, tool, suggestion}` envelope; subject to the 60 req/min rate limit (checked at the top of this handler).

---

## kapruka_add_to_cart

### Intent
Captures the moment a shopper commits to an item — moving it from "considered" to "in cart" so it can accumulate toward an order.

### Input contract
```ts
const AddToCartSchema = {
  productId: z.string().describe('Product ID to add to cart'),
  name: z.string().describe('Product name (from search/get_product result)'),
  price: z.number().positive().describe('Unit price in LKR'),
  quantity: z.number().int().min(1).default(1).describe('Quantity to add (default: 1)'),
};
```

### Live raw output shape
**N/A — local logic.** Per `KaprukaSDK.addToCart()`: "Cart is always local — never calls the official server"; calling it against the live server (`isOfficialServer === true`) actually **throws** rather than delegating: `'add_to_cart is a local-only tool and is not available on the official Kapruka MCP server.'`. `KaprukaLocal`'s own registered tool, however, never goes through `KaprukaSDK` at all — it writes straight to its local `Storage` regardless of mock/live mode, so this throw path is effectively dead code from the agent's perspective.

### Parsed output shape
No formal TS interface in `src/sdk/types.ts`; inline shape from `server.js`:
```json
{
  "message": "Added 1 x Red Rose Bouquet to your cart.",
  "cart": [ { "productId": "...", "name": "...", "price": 0, "quantity": 1 } ],
  "cartTotal": "LKR 18,000",
  "itemCount": 1
}
```
(`cart` items match the `CartItem` interface; `cartTotal` is a pre-formatted string, not a number.)

### Known fidelity gaps
N/A — local logic, no live source to be lossy against. The only "fidelity" risk is the caller supplying a wrong `name`/`price` (the tool trusts whatever the caller passes — it does not re-verify against `get_product`).

### Empty-result behavior
N/A — always succeeds (no validation that `productId` is a real product).

### Error behavior
No rate limiter check on this handler. No error envelope path exists in the code — there's no try/catch and no condition that produces an `errorContent()` response; it cannot return an error.

---

## kapruka_get_cart

### Intent
Lets the shopper (or the agent, before checkout) review everything accumulated in the cart so far, with running totals, before deciding to proceed or keep shopping.

### Input contract
No fields — `inputSchema: {}`.

### Live raw output shape
N/A — local logic (cart never touches the live server).

### Parsed output shape
```json
{
  "items": [ { "productId": "...", "name": "...", "price": 18000, "quantity": 1, "subtotal": "LKR 18,000" } ],
  "cartTotal": "LKR 18,000",
  "itemCount": 1
}
```

### Known fidelity gaps
N/A — local logic.

### Empty-result behavior
✅ Explicitly handled (and identical in mock/live, since cart logic is mode-independent): empty cart returns
```json
{ "items": [], "cartTotal": "LKR 0", "itemCount": 0, "message": "Your cart is empty. Use kapruka_search_products to find products." }
```

### Error behavior
No rate limiter, no error path — cannot return an error.

---

## kapruka_clear_cart

### Intent
Supports the "start over" moment — wiping the cart when a customer wants to abandon their current selections and begin a fresh shopping session.

### Input contract
No fields — `inputSchema: {}`.

### Live raw output shape
N/A — local logic.

### Parsed output shape
```json
{ "message": "Cart cleared.", "items": [], "cartTotal": "LKR 0", "itemCount": 0 }
```

### Known fidelity gaps
N/A — local logic.

### Empty-result behavior
This tool's "result" is always the empty-cart shape above by definition — there's no other outcome.

### Error behavior
No rate limiter, no error path — cannot return an error.

---

## kapruka_list_categories

### Intent
Helps the shopper (or agent) discover what's available to browse when they don't yet have a specific product in mind.

### Input contract
No fields — `inputSchema: {}`.

### Live raw output shape
Markdown (`fixtures/raw/kapruka_list_categories.raw.txt`):
```
## Kapruka Categories

- [Automobile](https://www.kapruka.com/online/automobile)
- [Ayurvedic](https://www.kapruka.com/online/ayurvedic)
- [Bicycle](https://www.kapruka.com/online/bicycles)
```
(65 entries total, full real Kapruka taxonomy — not the 12-category list suggested in `SearchSchema`'s description)

### Parsed output shape
TS interface: `Category[]` (`{ id: string; name: string; description: string }[]`).
```json
[
  { "id": "automobile", "name": "Automobile", "description": "https://www.kapruka.com/online/automobile" },
  { "id": "ayurvedic", "name": "Ayurvedic", "description": "https://www.kapruka.com/online/ayurvedic" }
]
```

### Known fidelity gaps
- `id` — ✅ extracted from the URL slug (`/online/automobile` → `automobile`); falls back to a slugified name if the URL doesn't match `/online/(.+)$`
- `name` — ✅ extracted from the link text
- `description` — ❌ **field name is misleading**: it's not a description at all, it's the same category URL duplicated into the `description` field. There is no real category description anywhere in the live response.

### Empty-result behavior
N/A — this is a fixed reference list; there's no "search" semantics that could come back empty. Untested whether the live category list ever changes size between calls (30-minute cache makes this moot in practice).

### Error behavior
Standard `{error, tool, suggestion}` envelope; subject to the 60 req/min rate limit.

---

## kapruka_list_delivery_cities

### Intent
Surfaces the full set of valid delivery destinations and their codes, so the shopper can confirm whether their location is serviceable before going further into checkout.

### Input contract
No fields — `inputSchema: {}`.

### Live raw output shape
Markdown (`fixtures/raw/kapruka_list_delivery_cities.raw.txt`):
```
## Kapruka delivery cities (25 of 332 total)

- **Agalawatta**  _aliases: agalawatha_
- **Agunukolapelassa**  _aliases: anguna_
- **Ahangama**
```
Note the header itself says **"25 of 332 total"** — the live server paginates and only returns a 25-city sample by default; there is no fee or estimated-day data per city in this raw text at all.

### Parsed output shape
TS interface: `DeliveryCity[]` (`{ id, name, delivery_fee, estimated_days }[]`).
```json
[
  { "id": "AGALAWATTA", "name": "Agalawatta", "delivery_fee": 0, "estimated_days": 1 },
  { "id": "AGUNUKOLAPELASSA", "name": "Agunukolapelassa", "delivery_fee": 0, "estimated_days": 1 }
]
```

### Known fidelity gaps
- `id` — ⚠️ derived as the *first word* of the city name, uppercased — not a real city code from the server (the server doesn't expose codes in this view; compare to `AGALAWATTA` here vs. a city like "Mount Lavinia" which would become `id: "MOUNT"`, silently colliding with any other city starting "Mount")
- `name` — ✅ extracted correctly
- `delivery_fee` — ❌ **hardcoded to `0` for every single city, with no basis in the live response whatsoever** — the raw markdown contains no fee data here at all; this is the field the audit script's stub-detector flagged automatically
- `estimated_days` — ❌ **hardcoded to `1` for every single city**, same reasoning
- Also: only 25 of 332 real cities are returned per call, and **nothing in the parser surfaces the "25 of 332" pagination info** — a consumer reading only the parsed array would have no idea 307 cities are missing.

### Empty-result behavior
N/A — always returns the (partial) city list; untested whether an empty/zero-city response is possible.

### Error behavior
Standard `{error, tool, suggestion}` envelope; subject to the 60 req/min rate limit.

---

## kapruka_check_delivery

### Intent
Answers "can this specific item actually reach this specific city by when I need it?" — especially relevant for perishables that can't reach remote cities.

### Input contract
```ts
const CheckDeliverySchema = {
  city: z.string().describe('City code (e.g. COL, KAN, JAF). Use kapruka_list_delivery_cities for the full list.'),
  product_id: z.string().describe('Product ID to check delivery constraints for'),
  delivery_date: z.string().optional().describe('Delivery date in YYYY-MM-DD format (optional, defaults to today)'),
};
```

### Live raw output shape
Markdown (`fixtures/raw/kapruka_check_delivery.raw.txt`):
```
## Delivery to Agalawatta on 2026-06-24
**Not available on this date.**
- We've scheduled your delivery for tomorrow (25 / June). Today's slots for Agalawatta are full
- Next available: **2026-06-25**
- Rate when available: LKR 1,090
```

### Parsed output shape
TS interface: `DeliveryCheck` (`{ available, fee, estimated_days, city }`).
```json
{ "available": false, "fee": 1090, "estimated_days": 2, "city": "Agalawatta" }
```

### Known fidelity gaps — this is the most significant gap found in the whole audit
- `city` — ✅ extracted correctly from the header line
- `fee` — ⚠️ extracted via a generic `LKR ([\d,]+)` regex that grabs the *first* LKR figure anywhere in the text; happens to be correct here (`1,090`) only because it's the only LKR mention, but is not specifically anchored to the "Rate when available" line — a response with an earlier unrelated LKR figure would silently produce the wrong fee
- `available` — ❌ **actively misleading, not just lossy**: computed as `!text.includes('Not available')` — a blunt boolean. The real response says delivery is *not available today but IS available tomorrow (2026-06-25), with a real price*. The parsed result discards that nuance entirely and reports a flat `false`, indistinguishable from "this city/product combination can never be delivered." An agent (or UI) trusting this field alone would tell the customer delivery isn't possible at all, when in fact it's just delayed by one day.
- `estimated_days` — ❌ **hardcoded to a binary `1` or `2`** based solely on the `available` boolean (`available ? 1 : 2`) — never actually extracted from the response text. The real "tomorrow" answer here is being reported as a generic "2 days," losing the actual next-available date (`2026-06-25`) entirely.

### Empty-result / not-found behavior
**Untested — needs verification.** Per source, `parseDeliveryCheck` returns `null` if the text contains `"not found"` or `"Error"`; `KaprukaLocal.registerCheckDelivery` then returns an error envelope with city suggestions (mock mode only — live mode passes an empty city list to that suggestion logic, so live not-found errors carry no "valid city codes" hint).

### Error behavior
Standard `{error, tool, suggestion}` envelope; subject to the 60 req/min rate limit.

---

## kapruka_validate_shipping

### Intent
A pre-flight check the agent is instructed to always run before checkout — catching address/phone problems while the conversation is still ongoing, rather than after a failed delivery.

### Input contract
```ts
const ValidateShippingSchema = {
  name: z.string().min(2).describe('Full name (e.g., "Kamal Perera")'),
  phone: z.string().describe('Sri Lankan phone number in any common format: 0771234567, +94771234567, 077-123-4567'),
  address: z.string().min(5).describe('Street address or house number and street (e.g., "42 Temple Road")'),
  city: z.string().describe('Delivery city name or code (e.g. "Colombo", "Kandy", "JAF")'),
  postal_code: z.string().optional().describe('5-digit Sri Lankan postal code (optional but recommended)'),
  delivery_instructions: z.string().optional().describe('Special delivery instructions (optional)'),
};
```

### Live raw output shape
**Not tested in this audit.** In live mode this handler calls `this.sdk.listDeliveryCities()` internally (same raw markdown response as `kapruka_list_delivery_cities` above) purely to get a list of valid city *names* for matching — it discards `delivery_fee`/`estimated_days` from that call entirely, so the stubbed-zero fields documented above don't affect this tool's correctness. All other validation (phone regex, address length, postal code format) is pure local logic with no live component.

### Parsed output shape
No formal TS interface in `src/sdk/types.ts`; matches the local `ShippingValidation`-shaped object used by `KaprukaLocal` itself:
```json
{
  "valid": false,
  "errors": ["Unknown delivery city: \"Atlantis\". Valid cities: Agalawatta, Agunukolapelassa, ..., etc."],
  "warnings": ["Adding a postal code improves delivery accuracy."],
  "suggestion": "Fix the errors above before creating your order to prevent failed deliveries.",
  "checkedAddress": { "name": "...", "phone": "...", "address": "...", "city": "...", "postal_code": null, "delivery_instructions": null }
}
```

### Known fidelity gaps
- City validation in live mode is only as good as the **25-of-332** city sample returned by `list_delivery_cities` (see gap above) — a real, valid city outside that sample would be incorrectly rejected as "unknown." This was not caught by the original audit of `list_delivery_cities` alone; it's a downstream consequence worth flagging here.
- If the live city fetch itself fails, the code silently falls back to the local 16-city mock map (`catch {}` swallows the error) — meaning validation behavior can silently change shape (16 hardcoded cities vs. up to 332 real ones) depending on transient network conditions, with no signal to the caller that the fallback occurred.

### Empty-result behavior
N/A — always returns a `{valid, errors, warnings}` object; "empty" isn't a meaningful outcome here.

### Error behavior
No rate limiter check on this handler. No explicit error envelope path in the success case; if the internal live city fetch throws, it's caught and silently ignored (falls back to mock cities) rather than surfacing an error.

---

## kapruka_create_order

### Intent
The commitment step — converting a reviewed cart plus recipient/sender/delivery details into a real, price-locked checkout link, only meant to fire once the customer has explicitly confirmed they're ready to pay.

### Input contract
```ts
const CreateOrderSchema = {
  cart: z.array(z.object({ product_id: z.string(), quantity: z.number().int().min(1) })).min(1),
  recipient: z.object({ name: z.string(), phone: z.string(), address: z.string(), city: z.string(), postal_code: z.string().optional() }),
  delivery: z.object({ date: z.string(), instructions: z.string().optional() }),
  sender: z.object({ name: z.string(), phone: z.string() }),
  gift_message: z.string().optional(),
  currency: z.string().optional(),
};
```

### Live raw output shape
**Not tested in this audit, requires real order** — explicitly skipped to avoid creating a real, billable Kapruka order during this diagnostic pass.

### Parsed output shape
TS interface: `Order`. Based on `parseOrderResult` in source (untested against a real response):
```json
{
  "id": "KAP-ORD-XXXX",
  "items": [],
  "total": 0,
  "currency": "LKR",
  "checkout_url": "",
  "status": "pending",
  "created_at": "<ISO timestamp at parse time>",
  "expires_at": "<parse time + 1 hour>"
}
```

### Known fidelity gaps
**All inferred from source code, not confirmed against a real response — mark everything here as untested:**
- `id` — regex-scraped for an `Order ID`/`order_id`/`orderId` label or a literal `KAP-ORD-\d+` pattern; ⚠️ best-effort
- `items` — ❌ **hardcoded to `[]` unconditionally** — the parser never attempts to extract the actual ordered items from the response text, regardless of what the live server returns
- `total` — extracted via the same generic `LKR ([\d,]+)` first-match regex used in `check_delivery` — same "grabs the first number, not necessarily the right one" risk
- `checkout_url` — regex looks specifically for a URL containing the substring `"checkout"`; ⚠️ would miss a valid checkout link using different URL wording
- `status` — ❌ hardcoded to `"pending"` always — never read from the response
- `created_at`/`expires_at` — ❌ **both fabricated client-side from `Date.now()`** at parse time, not read from the server's actual order timestamps/expiry at all. Given CLAUDE.md's "60-minute pay link expiry" rule is load-bearing for the UX, this is a real risk: the displayed expiry may not match the server's actual expiry.

### Empty-result / failure behavior
Per source: `parseOrderResult` returns `null` if the text contains `"Error"` or `"validation error"`; `KaprukaLocal.registerCreateOrder` then returns an error envelope suggesting the 30-orders/hour limit or out-of-stock items. Untested.

### Error behavior
Subject to **both** the 60 req/min rate limit and the 30 orders/hour order-specific limit (`rateLimiter.checkOrder()`), checked before the general limit. Standard `{error, tool, suggestion}` envelope on failure.

---

## kapruka_track_order

### Intent
Answers the post-purchase "where's my order?" moment — letting a returning customer check status on something they already bought, independent of the current cart/session.

### Input contract
```ts
const TrackOrderSchema = {
  order_number: z.string().describe('Order ID from a create_order response or confirmation email. Example: "KAP-ORD-2501"'),
};
```

### Live raw output shape
**Not tested in this audit, requires real order** — there is no real order ID to track since `create_order` was skipped.

### Parsed output shape
TS interface: `Order`. Based on `parseTrackOrder` in source (untested):
```json
{ "id": "KAP-ORD-XXXX", "items": [], "total": 0, "currency": "LKR", "checkout_url": "", "status": "pending", "created_at": "<parse-time ISO>", "expires_at": "" }
```

### Known fidelity gaps
**All inferred from source, untested:**
- `id` — regex-scraped from an `Order: X` pattern; ⚠️ best-effort
- `items` — ❌ hardcoded `[]` always
- `total` — ❌ hardcoded `0` always (no price regex attempted at all here, unlike `parseOrderResult`)
- `currency` — ❌ hardcoded `"LKR"`
- `checkout_url` — ❌ hardcoded `""` always (a tracked order presumably already has/had a checkout link, but it's never extracted)
- `status` — ⚠️ derived from keyword matching (`delivered`/`shipped`|`dispatched`/`processing`, else default `"pending"`) — coarser than CLAUDE.md's documented `pending → processing → dispatched → delivered` pipeline (note: `dispatched` text maps to internal status `"shipped"`, a naming mismatch with CLAUDE.md's own vocabulary)
- `created_at` — ❌ fabricated as "now" at parse time, not the real order creation time
- `expires_at` — ❌ hardcoded to `""` always

### Empty-result / not-found behavior
Per source: returns `null` if text contains `"order_not_found"` or `"Error"`; handler then returns a not-found error envelope suggesting the `KAP-ORD-XXXX` format. Untested.

### Error behavior
Standard `{error, tool, suggestion}` envelope; subject to the 60 req/min rate limit only (no order-specific limit on tracking).

---

## kapruka_get_recommendations

### Intent
The upsell moment — once something is in the cart, proactively suggest complementary items to increase basket size without the customer having to ask.

### Input contract
```ts
const GetRecommendationsSchema = {
  limit: z.number().int().min(1).max(5).default(3).describe('Number of recommendations to return (default: 3)'),
};
```

### Live raw output shape
**Not tested in this audit.** Like `get_alternatives`, this has no raw shape of its own — it derives rule-based queries from cart contents (e.g. a cart item ID containing `"cake"` → searches `"topper candles"`) and routes those through the same live `search_products` markdown path via `findAlternatives`/`searchAndCache`.

### Parsed output shape
No formal TS interface in `src/sdk/types.ts`.
```json
{
  "recommendations": [ /* Product[] */ ],
  "context": "Based on your cart containing Rose Elegance Display Vase"
}
```
or, if cart is empty:
```json
{ "recommendations": [ /* Product[] */ ], "message": "Your cart is empty. Here are some popular gift ideas." }
```

### Known fidelity gaps
- `recommendations[]` items inherit all the `kapruka_search_products` gaps (description/visual_description always `""`, etc.)
- The category→query mapping (`cake → "topper candles"`, `flower/rose → "vase greeting card"`, etc.) is matched against the **product ID string**, not a real category field — e.g. `cat.includes('cak')` checks the lowercased `productId`. This is brittle: it depends on Kapruka's product IDs continuing to embed category hints in their text (confirmed true in the live IDs we saw, e.g. `FLOWERS00T1875`, `CAKE00KA001460`), but is not a guaranteed contract.

### Empty-result behavior
Per source, if no rule-based query yields matches, falls back to a general `'gift hampers'` / `'gifts'` search to top up to `limit`. Not live-tested.

### Error behavior
No rate limiter check on this handler specifically. No explicit error envelope in the code path shown — internal failures from `findAlternatives` are not caught here, so an unhandled rejection could propagate (this differs from most other tools, which wrap their logic in try/catch).

---

## kapruka_convert_currency

### Intent
Helps an overseas customer translate an LKR price into a currency they actually think in, before deciding whether something is affordable.

### Input contract
```ts
const ConvertCurrencySchema = {
  amount: z.number().positive().describe('The amount in LKR to convert'),
  to: z.enum(['USD', 'AED', 'EUR', 'GBP', 'INR']).describe('The target currency code'),
};
```
`to` is the **one field across all 15 tools that is genuinely enum-enforced** by Zod.

### Live raw output shape
**N/A — not Kapruka live data at all.** This tool calls the Frankfurter exchange-rate API (`FRANKFURTER_RATE_URL`) directly via `fetch()`, completely independent of `mcp.kapruka.com` / `KaprukaSDK`. Not part of this audit's live-server scope.

### Parsed output shape
No formal TS interface in `src/sdk/types.ts`.
```json
{
  "original": "LKR 10,000",
  "converted": "USD 30.12",
  "rate": "1 USD = LKR 332.87",
  "source": "live (Frankfurter API)",
  "note": "Live exchange rates. Rates refresh every hour."
}
```

### Known fidelity gaps
- USD rate — ✅ from a real API call (when reachable)
- AED/EUR/GBP/INR rates — ❌ **all derived via hardcoded cross-rate multipliers off the single USD/LKR figure** (`usdPerLkr * 3.6725` for AED, `* 0.92` for EUR, etc.) — not independently fetched real rates for those currencies, just approximations pinned to a comment-documented constant
- If the API call fails entirely, falls back to a fully hardcoded `lkrPerUsd = 310` and the same derived-multiplier approach for the rest — `source` field correctly reports `"cached"` in this case, so the fallback is at least disclosed to the caller

### Empty-result behavior
N/A — always returns a converted value; cannot fail to produce a number given the enum restricts `to` to a key that's always present in the rate table.

### Error behavior
No rate limiter check. No error envelope path — `fetchCurrencyRates()` catches its own internal errors and falls back to hardcoded rates rather than ever surfacing a tool-level error.

---

## kapruka_get_analytics

### Intent
Not a shopper-facing moment — per its own description ("This tool is for developers to monitor agent performance"), an operator/debugging tool to see trending products by mention/view/cart-add counts, outside the conversational shopping flow.

### Input contract
No fields — `inputSchema: {}`.

### Live raw output shape
N/A — local logic; reads from the local `Storage`'s action log, never touches the live server.

### Parsed output shape
No formal TS interface in `src/sdk/types.ts`.
```json
{
  "trendingProducts": [ /* storage.getAnalytics(10) result — shape defined in storage.ts, not audited here */ ],
  "totalActionsRecorded": 42,
  "note": "This tool is for developers to monitor agent performance."
}
```

### Known fidelity gaps
N/A — local logic; whatever it reports is exactly what's in local storage, by construction. (The shape of `storage.getAnalytics()`'s return value itself was not separately verified in this audit — flagged here as **untested — needs verification** if precise field names matter downstream.)

### Empty-result behavior
Presumably `{ trendingProducts: [], totalActionsRecorded: 0, note: ... }` on a fresh session with no recorded actions — untested.

### Error behavior
No rate limiter, no try/catch — cannot return an error envelope.
