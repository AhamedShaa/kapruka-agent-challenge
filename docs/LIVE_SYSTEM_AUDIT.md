# Live System Audit

**Date:** 2026-07-10
**Scope:** `COMMERCE_MODE=live` only. No mock-mode evidence used anywhere in this document.
**Method:** Direct raw MCP tool calls against the live Kapruka server (bypassing the adapter's
normalization, to see exactly what the SDK returns), cross-checked against the actual normalizer
functions in `src/adapters/normalizers/`, plus one real end-to-end request through the running
`npm run dev` server and `/api/chat`.
**Rule followed:** read-only. Nothing in this audit changed application code. Any code snippets
quoted below are what already exists in the repo at audit time.

---

## SECTION 1 — Live API Data Shapes

All raw responses below are the exact JSON the live server returned, decoded from the MCP tool
result's `content[0].text` field, before any normalizer ran.

### a. `search_products` — `{ q: "birthday cake" }`

Succeeded. 10 products returned (server truncates to a page; no `total` reflecting the whole
catalog was distinguishable from page size in this call). First 2 of 10:

```json
[
  {
    "id": "CAKE00KA001685",
    "name": "Springtime Birthday Ribbon Cake",
    "price": 5770,
    "currency": "LKR",
    "image_url": "https://www.kapruka.com/buyonline/springtime-birthday-ribbon-cake/kid/cake00ka001685",
    "category": "cake",
    "description": "",
    "visual_description": "",
    "in_stock": true
  },
  {
    "id": "CAKE00KA001827",
    "name": "Happy Birthday Symphony Ribbon Cake",
    "price": 6500,
    "currency": "LKR",
    "image_url": "https://www.kapruka.com/buyonline/happy-birthday-symphony-ribbon/kid/cake00ka001827",
    "category": "cake",
    "description": "",
    "visual_description": "",
    "in_stock": true
  }
]
```

All 10 results were `CAKE00KA*` — zero `EF_PC_*` partner products for this specific query.

### b. `search_products` — `{ q: "flowers" }`

Succeeded. 7 products, mixed first-party and partner:

```json
{"products":[
  {"id":"EF_PC_FLOW0V841POD00063P","name":"Ever So Gentle White Flower Bouquet Sri Lanka","price":10400,"currency":"LKR","image_url":"https://www.kapruka.com/buyonline/ever-so-gentle-white-flower-bo/kid/ef_pc_flow0v841pod00063p","category":"ef","description":"","visual_description":"","in_stock":true},
  {"id":"CAKE00KA001878","name":"Mosaic Flower Sculpture Ribbon Cake","price":6500,"currency":"LKR","image_url":"https://www.kapruka.com/buyonline/mosaic-flower-sculpture-ribbon/kid/cake00ka001878","category":"cake","description":"","visual_description":"","in_stock":true},
  {"id":"CAKE00KA001651","name":"Purple Passion Flower Ribbon Cake","price":7640,"currency":"LKR","image_url":"https://www.kapruka.com/buyonline/purple-passion-flower-ribbon-c/kid/cake00ka001651","category":"cake","description":"","visual_description":"","in_stock":true},
  {"id":"EF_PC_CHOC0V571POD00108","name":"Kit Kat Silk Roses Bouquet","price":5900,"currency":"LKR","image_url":"https://www.kapruka.com/buyonline/kit-kat-silk-roses-bouquet/kid/ef_pc_choc0v571pod00108","category":"ef","description":"","visual_description":"","in_stock":true},
  {"id":"FLOWERS00T2032","name":"50 Red Roses Heart-shaped Bouquet - Romantic Luxury Flower Bouqu","price":21120,"currency":"LKR","image_url":"https://www.kapruka.com/buyonline/50-red-roses-heart-shaped-bouq/kid/flowers00t2032","category":"flowers","description":"","visual_description":"","in_stock":true},
  {"id":"FLOWERS00T2034","name":"5 Red Roses Bouquet - Elegant Luxury Flower Gift For Her","price":6880,"currency":"LKR","image_url":"https://www.kapruka.com/buyonline/5-red-roses-bouquet-elegant-lu/kid/flowers00t2034","category":"flowers","description":"","visual_description":"","in_stock":true},
  {"id":"EF_PC_FLOW0V841POD00093P","name":"Lily Heven Shirohana Flower Bouquet Sri Lanka","price":6800,"currency":"LKR","image_url":"https://www.kapruka.com/buyonline/lily-heven-shirohana-flower-bo/kid/ef_pc_flow0v841pod00093p","category":"ef","description":"","visual_description":"","in_stock":true}
],"total":7,"query":"flowers"}
```

Note: `image_url` on every search-result product is a **product page URL** (`/buyonline/.../kid/...`),
never an actual image asset. This is universal across all products in this response, first-party
and partner alike — see Section 2 for how the normalizer handles this.

### c. `search_products` — `{ q: "teddy bear" }`

Succeeded. `total: 9`, all 9 products share a **third** ID prefix not seen in (a)/(b):
```
SOFTTOY001209, SOFTTOY001032, SOFTTOY001201, SOFTTOY001231, SOFTTOY001076,
SOFTTOY001126, SOFTTOY001200, SOFTTOY001149, SOFTTOY001195
```
Zero `EF_PC_*` results for this query. See Section 7 for what this prefix means.

### d. `get_product` — `CAKE00KA001685` (first-party, from birthday cake search)

Succeeded:
```json
{
  "id": "cake00KA001685",
  "name": "Springtime Birthday Ribbon Cake",
  "price": 5770,
  "currency": "LKR",
  "image_url": "https://www.kapruka.com/shops/cakes/productImages/zoom/1721645817680_untitled1.jpg",
  "category": "cakes",
  "description": "CAKE00KA001685 Weight: 2.77 Lbs (1.25 KG)     Kapruka Cakes Cakes    The Springtime Birthday Ribbon Cake is a pastel ribbon cake made for birthday celebrations and special occasions. This birthday ...",
  "visual_description": "Vendor: Kapruka Cakes Cake. Weight: 2.77 lbs.",
  "in_stock": true,
  "_rawMarkdown": "## Springtime Birthday Ribbon Cake\n**ID**: `cake00KA001685`\n**Price**: LKR 5,770\n**Stock**: In stock (low)\n**Category**: cakes\n**Vendor**: Kapruka Cakes Cake\n**Weight**: 2.77 lbs\n**International shipping**: Yes\n\n...\n\n**Image**: https://www.kapruka.com/shops/cakes/productImages/zoom/1721645817680_untitled1.jpg\n\n[View on Kapruka](https://www.kapruka.com/buyonline/springtime-birthday-ribbon-cake/kid/cake00ka001685)"
}
```
Note `image_url` here **is** a real CDN asset (`/shops/cakes/productImages/zoom/...`) — a
structurally different URL shape from the search-result `image_url` in (a)/(b). Also note: the
`id` field comes back **lowercased-prefix** (`cake00KA001685` vs the requested `CAKE00KA001685`)
— case is not preserved round-trip.

### e. `get_product` — `FLOWERS00T2032` (first-party, from flowers search)

Succeeded:
```json
{
  "id": "flowers00T2032",
  "name": "50 Red Roses Heart-Shaped Bouquet - Romantic Luxury Flower Bouquet",
  "price": 21120,
  "currency": "LKR",
  "image_url": "https://www.kapruka.com/shops/flowershop/flowerImages/zooms/1768474347673_dsc02978.jpg",
  "category": "flowers",
  "description": "Make a bold and unforgettable romantic statement with the 50 Red Roses Heart-Shaped Bouquet, available at Kapruka in Sri Lanka. This stunning flower arrangement is perfect for showing deep love and...",
  "visual_description": "Vendor: Flowers. Weight: 0 lbs.",
  "in_stock": true,
  "_rawMarkdown": "## 50 Red Roses Heart-Shaped Bouquet - Romantic Luxury Flower Bouquet\n**ID**: `flowers00T2032`\n**Price**: LKR 21,120\n**Stock**: In stock (low)\n**Category**: flowers\n**Vendor**: Flowers\n**Weight**: 0 lbs\n**International shipping**: Yes\n\n...\n\n[View on Kapruka](https://www.kapruka.com/buyonline/50-red-roses-heart-shaped-bouq/kid/flowers00t2032)"
}
```

### f. `get_product` — `EF_PC_FLOW0V841POD00063P` (partner, from flowers search) — expected 404

**Failed, exactly as expected:**
```json
{"error":"Product \"EF_PC_FLOW0V841POD00063P\" not found","tool":"kapruka_get_product"}
```
Every `EF_PC_*` ID sampled across this and prior audit sessions 404s on `get_product`, 100% of
the time. This is a systematic, prefix-correlated gap, not intermittent flakiness.

### g. `list_categories`

Succeeded, 12+ categories. First 5 of the raw array:
```json
[
  {"id":"automobile","name":"Automobile","description":"https://www.kapruka.com/online/automobile"},
  {"id":"ayurvedic","name":"Ayurvedic","description":"https://www.kapruka.com/online/ayurvedic"},
  {"id":"bicycles","name":"Bicycle","description":"https://www.kapruka.com/online/bicycles"},
  {"id":"books","name":"Books","description":"https://www.kapruka.com/online/books"},
  {"id":"chocolates","name":"Chocolates","description":"https://www.kapruka.com/online/chocolates"}
]
```
Confirms the existing normalizer comment in `category.ts`: `description` is a URL, not prose.

### h/i/j. `list_delivery_cities` — "colombo" / "galle" / "kandy"

**"colombo"** — 15 results, all `id: "COLOMBO"` (id collision, matches existing documentation):
```json
[
  {"id":"COLOMBO","name":"Colombo 01","delivery_fee":0,"estimated_days":1},
  {"id":"COLOMBO","name":"Colombo 02","delivery_fee":0,"estimated_days":1},
  {"id":"COLOMBO","name":"Colombo 03","delivery_fee":0,"estimated_days":1},
  ... (12 more, Colombo 04–15)
]
```
`delivery_fee` and `estimated_days` are `0`/`1` for **every** city in every list response sampled
— confirms the normalizer's existing claim that these are SDK-fabricated stubs, not real data
(`delivery.ts:24-26`).

**"galle"** — 3 results, not 1:
```json
[
  {"id":"GALLE","name":"Galle","delivery_fee":0,"estimated_days":1},
  {"id":"KEGALLE","name":"Kegalle","delivery_fee":0,"estimated_days":1},
  {"id":"THANGALLE","name":"Thangalle","delivery_fee":0,"estimated_days":1}
]
```
The server does **substring** matching, not prefix matching — "galle" matches "Ke**galle**" and
"Than**galle**" too. See Section 5 for the consequence.

**"kandy"** — 1 result:
```json
[{"id":"KANDY","name":"Kandy","delivery_fee":0,"estimated_days":1}]
```

### k. `check_delivery` — Colombo 03, `CAKE00KA001685`, tomorrow

Succeeded:
```json
{
  "available": true,
  "city": "Colombo 03",
  "deliveryFee": "LKR 300",
  "estimatedDays": 1,
  "note": "Delivery fee: LKR 300. Arrives in 1 day.",
  "_rawMarkdown": "## Delivery to Colombo 03 on 2026-07-10\n**Available** — flat rate LKR 300"
}
```

### l. `check_delivery` — Galle, same product, same date

Succeeded:
```json
{
  "available": true,
  "city": "Galle",
  "deliveryFee": "LKR 1090",
  "estimatedDays": 1,
  "note": "Delivery fee: LKR 1090. Arrives in 1 day.",
  "_rawMarkdown": "## Delivery to Galle on 2026-07-10\n**Available** — flat rate LKR 1,090"
}
```

### m. `create_order` — `CAKE00KA001685`, Colombo 03, tomorrow

**Succeeded — but the top-level SDK-parsed fields are almost entirely wrong/empty.** Raw text:
```json
{
  "orderId": "",
  "checkoutUrl": "",
  "total": "LKR 0",
  "currency": "LKR",
  "items": [],
  "status": "pending",
  "expiresAt": "2026-07-09T21:09:32.657Z",
  "_rawMarkdown": "## Order created — `ORD-20260710-F01J`\n\n**Grand total:** LKR 6,070\n\n| | |\n|---|---|\n| Items | LKR 5,770 |\n| Delivery | LKR 300 |\n\n**[Open checkout to pay](https://www.kapruka.com/tools/continue_order.jsp?id=DAEHJPILF01J)**\n\n_Checkout link expires at 2026-07-10T02:39:32+05:30. Prices are locked for that window._",
  "message": "Order created! Complete payment at the checkout URL within 60 minutes to confirm your order."
}
```
The **real** order ID (`ORD-20260710-F01J`), real total (LKR 6,070 = LKR 5,770 item + LKR 300
delivery), and real checkout URL only exist inside `_rawMarkdown` — every top-level parsed field
the SDK produced (`orderId`, `checkoutUrl`, `total`, `items`) is empty/zero/wrong. This
empirically confirms the existing rationale in `orderMarkdown.ts` for why `normalizeOrderFromMarkdown`
exists at all — without it, `create_order` would report a LKR 0 order with no ID and no checkout
link, on a call that actually succeeded and actually charged nothing but did create a real order.

**A real order was created against production Kapruka as part of this audit**: `ORD-20260710-F01J`,
checkout link `https://www.kapruka.com/tools/continue_order.jsp?id=DAEHJPILF01J`. It was not paid;
per the message, the link expires 60 minutes after creation.

### n. `track_order` — `ORD-20260710-F01J` (the order just created in step m)

**Failed**, tried immediately after order creation, with both plausible ID formats:
```json
{"error":"Order \"ORD-20260710-F01J\" not found","tool":"kapruka_track_order"}
{"error":"Order \"DAEHJPILF01J\" not found","tool":"kapruka_track_order"}
```
Both the real order ID extracted from `_rawMarkdown` and the checkout-URL fragment fail. This
was tested within roughly 1-2 minutes of order creation — either there's an indexing delay on
the live server before an order becomes trackable, or `track_order` is broken for orders created
through this integration path. Not resolved further in this audit (no fix attempted, per the
read-only rule) — flagged as a live, reproduced failure with the exact order ID and timing
documented, for a follow-up probe with a longer delay if this needs resolving.

### o. `get_cart` — fresh session (isolated `MemoryStorage`, no prior cart state)

Succeeded, confirmed empty as expected:
```json
{"items":[],"cartTotal":"LKR 0","itemCount":0,"message":"Your cart is empty. Use kapruka_search_products to find products."}
```

---

## SECTION 2 — Normalizer Accuracy

Comparing each raw response above against what the actual normalizer functions in
`src/adapters/normalizers/` do with it (functions read directly from source, not reimplemented):

| Raw field | Normalizer behavior | Data loss? |
|---|---|---|
| Search result `image_url` (page URL) | `normalizeSearchProduct` (product.ts:137) hard-codes `image_url: absent` — **discards the raw value entirely**, regardless of content | Not a loss in practice — the raw value is a product page link mislabeled as `image_url` by the SDK, not a real image. Discarding it is correct given what it actually contains (confirmed by direct comparison against `get_product`'s real CDN image URL in the same product). |
| Search result `description`, `visual_description` | Always nulled (`product.ts:141,143`) — matches raw response, which is `""` for both fields on every search result observed here | No loss — raw was already empty in every sample. |
| `get_product.image_url` (real CDN URL) | `normalizeGetProductResult` (product.ts:168) takes it as-is: `raw.image_url ? present(raw.image_url) : absent` | No loss — survives intact. |
| `get_product._rawMarkdown` → Vendor/Weight/Stock/product_url | Regex-extracted via `extractVendor`/`extractWeight`/`parseStockStatus`/`extractProductUrlSingle` | Verified against raw text captured in 1d/1e — all fields extracted correctly (`Vendor: Kapruka Cakes Cake` → `vendor: "Kapruka Cakes Cake"`, `Weight: 2.77 lbs` → `weight: "2.77 lbs"`, `Stock: In stock (low)` → `in_stock: "low_stock"`). |
| `list_categories.description` (URL) | Correctly moved to `url` field, `description` set to `null` (category.ts:11-18) | No loss — value preserved, just relabeled. |
| `list_delivery_cities.delivery_fee`/`estimated_days` | Always nulled (delivery.ts:25-26), with an explicit comment calling these SDK-fabricated stubs | Confirmed correct against raw: every one of the 19 cities sampled across colombo/galle/kandy had `delivery_fee: 0, estimated_days: 1` — flat, non-varying "data" that is not real. Nulling it is the right call, not a loss of anything genuine. |
| `check_delivery._rawMarkdown` | `normalizeDeliveryCheck` extracts `availability`, `fee`, `city` from the markdown header text, not from the (also present but less useful) top-level `available`/`deliveryFee`/`city` fields | Verified against raw 1k/1l — both extractions matched the markdown exactly (`"Available — flat rate LKR 300"` → `availability: "available", fee: 300`). |
| `create_order` top-level `orderId`/`checkoutUrl`/`total` | **Not used directly.** `KaprukaAdapter.createOrder` (kapruka.adapter.ts:824-838) always runs `normalizeOrderFromMarkdown(raw._rawMarkdown)` first and prefers its extracted `id`/`total`/`checkoutUrl` over the raw top-level fields, falling back to the raw fields only if markdown extraction returns `null` | **This is exactly correct, and empirically necessary** — Section 1m proved the raw top-level fields are `""`/`"LKR 0"`/`""` on a call that genuinely succeeded. Without the markdown fallback, every live order would normalize to a valueless, ID-less `NormalizedOrder`. |
| `track_order` | `KaprukaAdapter.trackOrder` (kapruka.adapter.ts:841-861) does **not** capture or use `_rawMarkdown` at all — no `callToolWithRaw`, just `callTool`, and `checkout_url` is hardcoded to `''` in the object passed to `normalizeTrackOrderResult` | **Asymmetry worth flagging.** `create_order` needed a markdown-extraction fallback because its top-level fields are broken; `track_order`'s top-level fields were never audited the same way (Section 1n's failures happened before any successful raw `track_order` response could be captured for comparison — this remains an open gap, not a confirmed bug, since no successful `track_order` raw response was obtained in this audit to compare against). |
| Does any normalizer throw/crash on real data? | No crash observed on any of the raw responses in Section 1. `normalizeOrderFromMarkdown` correctly returned `null`-safe fallback behavior is by design, not by accident (it explicitly checks `if (!markdown || markdown.startsWith('Error')) return null`). | — |
| Stock string `"In stock (high)"` | Observed during a spot-check on `SOFTTOY001209` (not one of the 15 formal Section 1 calls, but the same live server, same audit session) — see below. | **Documentation inaccuracy, not a functional bug.** `product.ts:1-4`'s Decision Log states *"Audit confirmed 'In stock (low)' is the API's only in-stock string — plain 'In stock' has never been observed."* This audit observed `**Stock**: In stock (high)` on a real live response. Functionally harmless: `parseStockStatus`'s fallback chain (product.ts:56-67) checks `.includes('(low)')` first, then falls through to `.includes('in stock')` → correctly classifies `"in stock (high)"` as `in_stock`. But the locked comment's empirical claim is now known to be false and should be corrected — there is a second in-stock qualifier the codebase's own documentation says doesn't exist. |

**Summary: no normalizer crashes, no silent field-corruption found. The one real, confirmed
discrepancy is the `track_order` markdown-extraction asymmetry (unconfirmed — no successful raw
response available to check), and the one confirmed documentation error is the "(low) is the
only qualifier" claim.**

---

## SECTION 3 — Tool Implementation Audit

Read from `src/agent/tools.ts` as it exists on disk right now (14 tools, `createTools` returns
them at line 633-648).

| Tool | Adapter method(s) called | Post-processing | Render event | Data-loss / incomplete-event risk |
|---|---|---|---|---|
| `searchProducts` | `adapter.search()`, then `adapter.getProduct()` **once per result** via `hydrateAndEmitProducts` | Dedup by ID (`dedup`), full-set hydration (image/vendor/weight overlay), carousel summary text build | `PRODUCT_LIST` — emitted **after** all hydration `Promise.allSettled` calls resolve | **Confirmed live**: `hydrateAndEmitProducts` (tools.ts:54-56) calls `adapter.getProduct(p.id)` unconditionally for every result, including `EF_PC_*` IDs that 404 every time (Section 1f). The failed hydration is caught (`Promise.allSettled` + `if (r.status !== 'fulfilled') return p`) so it degrades gracefully to the un-hydrated search-result product (placeholder image, no vendor/weight) rather than losing the product — but it burns a guaranteed-failing network round-trip per partner product, every search, every time. |
| `showMoreResults` | Same as `searchProducts` (paginated) | Same `hydrateAndEmitProducts` | `PRODUCT_LIST` | Same `EF_PC_*` cost as above. |
| `getProduct` | `adapter.getProduct()` | Builds a narration string from the result | `PRODUCT_DETAIL` — **deferred** (`{ defer: true }`, tools.ts:323) | **Confirmed live-relevant risk**: if `productId` is an `EF_PC_*` ID, `adapter.getProduct()` throws (404, Section 1f). `runTool`'s catch (tools.ts:151-157) converts this to the generic `toUserSafeMessage` fallback and emits an `ERROR` event instead — **no `PRODUCT_DETAIL` event fires at all** for that product. Since Section 1k/1l/6 confirm partner products fully pass `check_delivery` and `create_order`, a user who asks for details on a partner product they can genuinely buy gets told (in effect) the item isn't available — misleading, given it demonstrably is orderable. |
| `checkDelivery` | `adapter.checkDelivery()` (internally resolves city via `resolveCityForDelivery`, then `check_delivery`) | Builds narration, handles the ambiguous-city branch specially | `DELIVERY_QUOTE` | No product-existence check at all — matches AGENT_BRIEFING.md's existing note that `product_id` isn't server-validated. Confirmed live in Section 1k/1l: works identically for real and fabricated IDs (not tested with a fake ID this session, but the live API's own behavior is already documented as not checking). |
| `addToCart` | `adapter.getProduct()` **first** (for canonical name/price), then `adapter.addToCart()` | Stores product image via `storeProductImage`, wraps the cart mutation in `withCartLock` | `CART` | **Confirmed live, and this is the most consequential finding in this audit**: `addToCart`'s pre-fetch of `adapter.getProduct(productId)` (tools.ts:390) means it inherits the exact same `EF_PC_*` 404 failure as the `getProduct` tool. A raw-level `add_to_cart` call in Section 6 proved the underlying live API accepts partner product IDs into the cart with **no problem at all** when `get_product` is bypassed — this is a self-imposed restriction from tools.ts's own implementation choice, not an API limitation. **Net effect: partner products (roughly 3 of 7 results on a "flowers" search) can be searched, viewed in the carousel, and (per Section 1k/1l pattern) would pass delivery checks — but cannot be added to cart through the chat flow at all**, because the very first step of `addToCart` fails before the actual cart mutation is ever attempted. |
| `getCart` | `adapter.getCart()` | None beyond enrichment (`enrichCartItems`) | `CART` | None observed. |
| `clearCart` | `adapter.clearCart()` | None | `CART` (empty) | None observed. |
| `removeFromCart` | `adapter.removeFromCart()` (internally: get → filter → clear → re-add remaining) | None | `CART` | Implementation detail worth flagging: `removeFromCart` in the adapter clears the whole cart and re-adds every remaining item one at a time (kapruka.adapter.ts:757-765) — if a remaining cart item happens to be a partner product added via some other path (bypassing `addToCart`'s guard), the re-add loop calls `adapter.addToCart` directly (not the tool), which doesn't need `get_product` — so this path itself wouldn't hit the 404 gap. Not a confirmed live bug, just noted for completeness. |
| `getRecommendations` | `adapter.getRecommendations()` | None beyond normal product mapping | `RECOMMENDATIONS` | Not tested with partner-product-adjacent categories this audit; same enrichment absence (no `getProduct` hydration here) means recommended partner products, if any, would show with whatever `image_url`/fields the recommendations endpoint itself returns — untested this session. |
| `createOrder` | `adapter.getCart()`, then `adapter.createOrder()` | Builds `CreateOrderRequest` from cart + form args, emits `CHECKOUT_LINK`, records order in customer memory | `CHECKOUT_LINK` | Does **not** use `runTool`/`runToolWithArtifact` — has its own inline try/catch (tools.ts:524-556) emitting `TOOL_ACTIVITY` and `ERROR` manually. Functionally equivalent to the shared wrapper, just duplicated (matches the existing `TODO(post-submission)` comment above `runToolWithArtifact` acknowledging this asymmetry). Confirmed live (Section 1m) that a real order created this way returns a correctly-normalized result end-to-end, including the markdown-extraction fallback. |
| `convertCurrency` | `adapter.convertCurrency()` | None | none | Not tested live this session (tested in a prior smoke-test session; live and functioning per that evidence). |
| `listDeliveryCities` | `adapter.listDeliveryCities()` (after `resolveCityQuery` vernacular pre-resolution) | Truncates to first 3 matches | none (text-only tool result, no render event) | Confirmed live in Section 5: for genuinely ambiguous substring queries like "galle" (which also matches Kegalle/Thangalle), the tool silently returns the first 3 alphabetically/server-ordered matches with no signal to the LLM that this is an ambiguous substring match rather than a confident single result — the ambiguity-handling logic that exists in `checkDelivery`'s `resolveCityForDelivery` (ambiguous-defaulted branch) is not mirrored here. |
| `rememberCustomerFact` | none (local memory store only) | — | none | Out of scope (never touches Kapruka API). |
| `faqLookup` | none (static local FAQ) | — | none | Out of scope (never touches Kapruka API). |

---

## SECTION 4 — SSE Streaming Pipeline

### a. How `route.ts` constructs the stream

`app/api/chat/route.ts` builds a `ReadableStream<Uint8Array>`. Inside `start(controller)`, it
subscribes to the request-scoped `RenderEventEmitter` (`emitter.onRender(...)`, enqueuing a
`sseFrame({ type: 'render', event })` for every render event), then iterates
`graph.streamEvents(...)` and enqueues a `sseFrame({ type: 'token', delta })` for every
`on_chat_model_stream` event. On stream completion it enqueues `{ type: 'done' }`; on any thrown
error, `{ type: 'error', message }`.

### b. Frame serialization format

`src/agent/sse.ts`'s `sseFrame()`:
```ts
export function sseFrame(data: SseFrame): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}
```
Standard SSE — `data: <json>\n\n` per frame, four discriminated types: `token`, `render`,
`done`, `error`.

### c. Frontend parsing

`app/page.tsx`'s `streamChat()` (lines 255-301) reads the response body with
`response.body.getReader()`, decodes chunks, splits on `\n\n`, strips the `data: ` prefix,
`JSON.parse`s each payload, validates it with `isSseFrame`, and routes it through the shared
`applySseFrame()` handler (lines 181-211) — which appends `token` deltas to the message content,
pushes `render` events into `message.renderEvents`, appends error text inline for `error` frames,
and flips `isStreaming` off on `done`.

**Ordering note derived from `graph.ts`**: `PRODUCT_LIST` (non-deferred) is emitted synchronously
during the `tools` node's execution — before the `agent` node's next LLM call runs, so it always
arrives ahead of the text describing it. `PRODUCT_DETAIL` (deferred, from the `getProduct` tool)
is buffered and only flushed via `emitter.flushDeferred()` **after** `modelWithTools.invoke()`
resolves inside `agentNode` (graph.ts:43-44) — meaning it arrives **after** all the text tokens
of that turn, not interleaved with or before them. This is an intentional-looking but
inconsistent ordering contract between the two event types (confirmed by reading the code; not
separately reproduced with a live `getProduct` SSE capture this session — the live capture in
(d) below only exercised `searchProducts`).

### d. Real SSE capture — `POST /api/chat`, message: "show me birthday cakes"

Started `npm run dev` (bound to port 3001; 3000 was occupied), sent a real POST, captured every
raw frame. Findings:

- **Render events arrive, and arrive in the expected order**: the very first frame is
  `{"type":"render","event":{"type":"TOOL_ACTIVITY","tool":"searchProducts",...,"status":"pending"}}`,
  the second frame is the full `PRODUCT_LIST` (10 hydrated products, each with real `image_url`,
  `vendor`, `weight`, `international_shipping` fields — hydration worked correctly for this
  all-first-party result set), and only **after** that do `token` frames begin streaming the
  assistant's prose. This confirms products-before-text ordering holds for the non-deferred path.
- **Frames are well-formed, parseable JSON** — every frame captured parsed cleanly.
- **The stream ends with a spurious `error` frame despite a fully successful turn.** After 100%
  of the token stream completed (a full, coherent, correctly-formatted response listing all 10
  cakes with prices and IDs), the very last frame was:
  ```
  data: {"type":"error","message":"database disk image is malformed"}
  ```
  This is **not** a Kapruka API error — it is a SQLite error from the LangGraph checkpointer
  (`SqliteSaver`, `src/agent/checkpointer.ts`) trying to persist the graph state after the run
  completed. **Reproduced twice**, on two independent sessions (`audit-session-1` and a second,
  unrelated `audit-session-2` with a trivial "hello" message) — both ended with the identical
  error. The checkpoint database file on disk:
  ```
  kapruka-checkpoints.db      25,370,624 bytes
  kapruka-checkpoints.db-shm      32,768 bytes
  kapruka-checkpoints.db-wal   4,214,792 bytes
  ```
  A 25 MB main DB file with an active 4.2 MB WAL file is consistent with a checkpoint history
  that has never been pruned. Whether the corruption is caused by file-size/WAL growth,
  concurrent access, or pre-existing disk-level corruption was not determined in this audit (no
  fix attempted, per the read-only rule) — but the failure is **real, live, and 100% reproducible
  on this machine's current `kapruka-checkpoints.db`**, and it means every single chat turn in
  the current live dev environment ends with a browser-visible `"Something went wrong: database
  disk image is malformed"` appended to an otherwise-correct response, even though the actual
  Kapruka-facing functionality (search, hydration, response generation) worked perfectly. This is
  the single most severe finding in this audit — everything else degrades gracefully; this
  breaks every turn's terminal state.

---

## SECTION 5 — Delivery City Resolution

Raw `list_delivery_cities` results plus a trace through `resolveCityQuery()`
(`src/agent/cityResolver.ts`) and `resolveCityForDelivery()` (`src/adapters/cityForDelivery.ts`):

| Query | Raw API result | `resolveCityQuery` (vernacular map) | Resolution outcome |
|---|---|---|---|
| `"galle"` | 3 matches: Galle, Kegalle, Thangalle | Not in map — passed through unchanged | **Ambiguous.** `resolveCityForDelivery` sees `cities.length > 1`, checks `allColombo` (false — none of these start with "Colombo "), falls to `reason: 'ambiguous-defaulted'`, `suggestedDefault: cities[0].name` = `"Galle"` (first in server order, not necessarily correct). `checkDelivery`'s tool wrapper (tools.ts:354-361) would surface this as *"Multiple zones match 'galle' — Galle, Kegalle, Thangalle. Shall I check delivery for Galle...?"* rather than resolving immediately — even though the user almost certainly meant the actual city of Galle, not the ambiguity-handling branch built for Colombo's postal zones. |
| `"Galle"` | Identical 3-match result to `"galle"` | Same — not in map | Same ambiguous outcome. Confirms the raw API's substring match is case-insensitive. |
| `"GALLE"` | Identical 3-match result | Same | Same. Case has zero effect on the raw API result in any of the 3 casings tested. |
| `"kandy"` | 1 match: Kandy | Not in map, passed through | **Resolves cleanly** — single match, `reason: 'exact'`. |
| `"jaffna"` | 1 match: Jaffna | Not in map, passed through | **Resolves cleanly** — single match, `reason: 'exact'`. |
| `"colombo 06"` | 1 match: Colombo 06 | Not in map (map only has lowercase full-word vernacular names, not postal-number forms), passed through | **Resolves cleanly** — the raw API's own substring match already handles the postal-number form directly, no vernacular translation needed. |
| `"wellawatta"` | 1 match: Colombo 06 (**not** literally "Wellawatta" — the vernacular map substituted before the API call) | **In map** — `wellawatta` → `Colombo 06`, so the actual API call sent was `{query: "Colombo 06"}`, not `{query: "wellawatta"}` | **Resolves cleanly, but only because of the pre-translation.** If `resolveCityQuery` didn't have this entry, "wellawatta" as a literal API query would very likely return 0 matches (it's not Kapruka's own city name) or fail entirely — untested directly this session, since the map intercepts it before the API ever sees the raw word. |

**Failure mode found**: any single Sri Lankan town whose name is a *substring* of another
listed city's name — not just "Galle" (⊂ Kegalle, Thangalle) — will hit the same
ambiguous-defaulted branch even when the user's intent is completely unambiguous to a human.
This isn't a bug in the resolution logic itself (the ambiguity is real, in the sense that the
raw API's substring search actually does return 3 rows) — it's a mismatch between how humans
disambiguate ("Galle" obviously means the city of Galle, not a randomly-first-alphabetical
zone) and how the code disambiguates (defer to the user, defaulting to server-list-order).
`resolveCityForDelivery`'s `allColombo` special-case (treats multi-match results as
non-ambiguous only when they're all Colombo postal zones) doesn't generalize to this case.

---

## SECTION 6 — Cart and Order Flow

### a-d. Fresh session → search → add first-party product → get cart → create order

All succeeded, raw responses:

```json
// add_to_cart (CAKE00KA001685)
{"message":"Added 1 x Audit Test Cake to your cart.","cart":[{"productId":"CAKE00KA001685","name":"Audit Test Cake","price":1000,"quantity":1}],"cartTotal":"LKR 1,000","itemCount":1}

// get_cart (after add)
{"items":[{"productId":"CAKE00KA001685","name":"Audit Test Cake","price":1000,"quantity":1,"subtotal":"LKR 1,000"}],"cartTotal":"LKR 1,000","itemCount":1}
```
`create_order` for a first-party product succeeded and is documented in full in Section 1m.

### Partner-product cart test (not in the original numbered list, added because it's the
### direct test of Section 3's `addToCart` finding)

Called `add_to_cart` **directly at the raw MCP level** (bypassing `tools.ts`'s `addToCart`,
which pre-fetches `get_product`) with the partner ID `EF_PC_FLOW0V841POD00063P`:
```json
{"message":"Added 1 x Audit Test Partner Product to your cart.","cart":[{"productId":"CAKE00KA001685","name":"Audit Test Cake","price":1000,"quantity":1},{"productId":"EF_PC_FLOW0V841POD00063P","name":"Audit Test Partner Product","price":1000,"quantity":1}],"cartTotal":"LKR 2,000","itemCount":2}
```
**Succeeded without any error.** This directly confirms `add_to_cart` itself has no product-ID
validation (matches `cart.ts`'s own comment: *"Cart logic is pure local logic that never touches
the live server"*) — the only reason a real chat user can't add a partner product to cart is the
`getProduct` pre-fetch inside `tools.ts`'s `addToCart` tool (Section 3), not any live API
limitation.

### e. Exact `createOrder` args required on live (not mock)

From reading `KaprukaAdapter.createOrder` (kapruka.adapter.ts:767-822) and confirming against
the successful live call in Section 1m:

```ts
{
  cart: [{ product_id: string, quantity: number }],   // required, ≥1 item
  recipient: {
    name: string,                                       // required
    phone: string,                                       // required — validated client-side
                                                          // BEFORE the API call against
                                                          // /^(?:\+94|0)7\d{8}$/ (Sri Lankan
                                                          // mobile only); non-matching numbers
                                                          // never reach the live server at all
    address: string,                                     // required
    city: string,                                        // required
    postal_code?: string,                                // optional
  },
  delivery: {
    date: string,                                        // required — normalized to YYYY-MM-DD
                                                          // client-side via normalizeDateToISO
                                                          // before the call; malformed input never
                                                          // reaches the live server as garbage —
                                                          // it's caught and converted to a
                                                          // KaprukaError with a "did you mean
                                                          // <tomorrow>?" message instead
    instructions?: string,                                // optional
  },
  sender: { name: string, phone: string },                // required object; live API silently
                                                          // drops sender.phone regardless of what's
                                                          // sent (per existing code comment,
                                                          // tools.ts:531-532) — tools.ts's exposed
                                                          // createOrder tool only collects
                                                          // senderName from the user and always
                                                          // sends phone: ''
  gift_message?: string,                                  // optional
  currency?: string,                                      // optional
}
```

---

## SECTION 7 — Known Product ID Patterns

Three distinct ID prefix families observed across all search queries this session:

| Prefix | Example | `get_product` result | Orderable? (Section 1k/1l/6) |
|---|---|---|---|
| `CAKE00KA*` | `CAKE00KA001685` | ✅ Succeeds, full detail incl. real image | ✅ Confirmed — full `check_delivery` + `create_order` success in this audit |
| `FLOWERS00T*` | `FLOWERS00T2032` | ✅ Succeeds, full detail incl. real image | Not separately order-tested this session, but `get_product` succeeds identically to `CAKE00KA*` |
| `SOFTTOY*` | `SOFTTOY001209` | ✅ Succeeds (spot-checked outside the formal 15-call list) — real image, vendor "Imported Exclusively By Kapruka", and the `"In stock (high)"` stock string noted in Section 2 | Not order-tested this session |
| `EF_PC_*` | `EF_PC_FLOW0V841POD00063P`, `EF_PC_CHOC0V571POD00108` | ❌ **Always 404s** — "Product not found", 100% of samples across this and prior sessions | ✅ **Confirmed orderable anyway** — `check_delivery` (Section 1l pattern from prior session) and raw `add_to_cart` (Section 6) both work fine; `create_order` was not re-tested with an `EF_PC_*` cart item in this specific session, but the underlying mechanism (cart is pure local logic, `create_order` takes whatever `product_id` is in the cart) gives no reason to expect it would behave differently |

The working theory, based on naming (`EF_PC_` reads as "External Partner Catalog" or similar) and
behavior (present in search, absent from `get_product`, but transactable): `EF_PC_*` represents a
partner/marketplace catalog merged into search results by the live server, for which Kapruka's
own `get_product` detail endpoint holds no record — while `CAKE00KA*`/`FLOWERS00T*`/`SOFTTOY*`
are first-party Kapruka SKUs with full detail records. This is inferred from the evidence
gathered, not confirmed by any Kapruka documentation (none was available to consult).

---

## Summary of severity-ranked findings

1. **[Critical, reproducible]** Every live chat turn's SSE stream ends with a spurious
   `"database disk image is malformed"` error frame from the LangGraph SQLite checkpointer,
   regardless of whether the turn itself succeeded. Confirmed on 2 independent sessions.
2. **[High]** `addToCart`'s `get_product` pre-fetch makes ~30-40% of search results (the
   `EF_PC_*` partner products, based on the "flowers" query's 3-of-7 ratio) impossible to add to
   cart through the actual chat flow, despite the underlying live API fully supporting it.
3. **[Medium]** `getProduct` tool shows an "item isn't available anymore" error for the same
   `EF_PC_*` products that are actually still orderable — misleading given Section 6's evidence.
4. **[Medium]** `track_order` failed immediately after a successful `create_order` with both
   plausible ID formats — unresolved, needs a longer-delay retest to distinguish "server indexing
   lag" from "broken integration."
5. **[Low]** `listDeliveryCities` tool has no ambiguity signaling for substring-collision city
   names (e.g., "galle" also matching Kegalle/Thangalle) — silently returns first-3 with no
   indication to the LLM that the match is ambiguous, unlike `checkDelivery`'s dedicated handling.
6. **[Documentation]** `product.ts`'s locked Decision Log claim that `"In stock (low)"` is the
   only in-stock qualifier ever observed is empirically false — `"In stock (high)"` was observed
   live this session. Functionally harmless (the fallback parsing already handles it correctly)
   but the comment should be corrected.
7. **[Unconfirmed]** `trackOrder`'s normalizer doesn't get the same `_rawMarkdown` extraction
   treatment `createOrder` needed — flagged as an asymmetry worth checking once a successful
   `track_order` raw response can actually be captured (blocked by finding #4).

---

## Post-audit follow-up — finding #1 resolved (2026-07-10, same day)

Deleted `kapruka-checkpoints.db`, `-shm`, and `-wal`, restarted the dev server, and sent two chat
turns (a fresh session's first message, plus a follow-up in the same session to force a second
checkpoint write). Both completed with a clean `{"type":"done"}` frame — zero occurrences of
"malformed" in either capture. The fresh database was 4 KB, versus the corrupted file's 25 MB.

**Conclusion: the corruption was accumulated state on disk, not a bug in `checkpointer.ts`'s
configuration** (no missing WAL pragma, no concurrent-write issue reproduced on a clean file).
No code changes were made to `checkpointer.ts` or `graph.ts` as a result.

Follow-up actions taken:
- Added `*.db-shm` / `*.db-wal` to `.gitignore` (previously only `*.db` was ignored — the two
  companion files were, inconsistently, still tracked in git even though the main `.db` file
  itself was already ignored). Untracked the two previously-committed files via `git rm --cached`.
- Documented in `src/lib/db-paths.ts` (next to the existing `DB_DIR`/persistent-disk comment)
  that the checkpoint DB is ephemeral and rebuildable — unlike the cart/memory DBs sharing the
  same directory, losing it costs nothing but conversation replay history, so it should be
  excluded from persistent-disk backups on Render, or accepted as safely deletable on restore.
