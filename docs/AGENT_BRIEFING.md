 Non-negotiable facts about the live API
LIVE API TRUTHS (from empirical probing — do not override these based on 
mock schema, tool descriptions, or documentation):

- checkDelivery.city: requires the full canonical NAME 
  (e.g. "Colombo 01", "Jaffna"). The `id` field ("COLOMBO", "JAFFNA") 
  is REJECTED as city_not_found. See probe run PROBE_CHECK_DELIVERY_001.
- checkDelivery.date: strict YYYY-MM-DD. Loose formats throw Pydantic 
  validation errors from the live server.
- checkDelivery.product_id: NOT validated server-side. Fake IDs return 
  successful-looking quotes. Do not trust checkDelivery success to imply 
  the product exists.
- Invalid city name (one the server doesn't recognize at all, e.g.
  "Nowhereville") passed to checkDelivery: NOT a coded error. Returns
  freeform prose with no `(code)` — `{"error":"Delivery check failed for
  city \"Nowhereville\""}`. Distinct from the city_not_found case above
  (that one is specifically the id-vs-name mixup). Confirmed via fresh
  probe (scripts/probe-error-shapes.ts, case 1) on 2026-07-03.
- createOrder.delivery.date: malformed dates (e.g. "2026-13-45") throw
  RAW Pydantic validation prose, same as checkDelivery.date — e.g.
  `"...1 validation error for kapruka_create_orderArguments\nparams.
  delivery.date\n  Value error, delivery.date must be YYYY-MM-DD
  [type=value_error, input_value='2026-13-45', ...]..."`. Also carries a
  generic, misleading `suggestion` field ("You may have reached the 30
  orders/hour limit, or an item may be out of stock") that has nothing to
  do with the actual date error — do not surface that suggestion text to
  the user. Confirmed via fresh probe (scripts/probe-error-shapes.ts,
  case 2) on 2026-07-03.
- createOrder.cart[].product_id: IS validated server-side (unlike
  checkDelivery.product_id above). A nonexistent product id throws a
  clean coded error: `{"error":"Error (product_not_found): Product not
  found"}`. This is the one confirmed case of the `Error (code): message`
  shape actually occurring live. Confirmed via fresh probe
  (scripts/probe-error-shapes.ts, case 3) on 2026-07-03.
- listDeliveryCities: server-side substring match. Query "Colombo" returns 
  15 sub-areas (Colombo 01-15), all sharing id "COLOMBO" (id collision).
- Colombo sub-areas: uniform fees and availability. Default "Colombo 03" 
  when the user says just "Colombo".
- MOCK MODE is not used in production. Mock schema differs from live in 
  ways that mislead debugging. Never use mock code as evidence of live 
  behavior.

Working principles for this project
  - Audit before act. No fix ships without empirical evidence (probe script 
  or LangSmith trace) proving the actual behavior first.
- Verify in the running UI, not just scripts. Scripts have caught bugs 
  that were invisible in unit tests; the UI has caught bugs invisible to 
  scripts. Both matter, in that order.
- Context engineering over prompt engineering. Constraints belong in code 
  (adapters, normalizers, resolvers), not in systemPrompt.ts rules or 
  verbose tool descriptions. Ask "can this be enforced in code?" before 
  reaching for a prompt rule.
- Vendor patches via patch-package are the accepted mechanism for 
  kapruka-mcp bugs. 5 patches currently in patches/kapruka-mcp+1.3.3.patch.
- Small phases with stop-and-report gates. Verbatim paste before editing 
  vendor code or non-trivial source files.

  Current project state.
  CLOSED (verified in live UI via LangSmith):
- Bug 1-3: listDeliveryCities family (query passing, vernacular resolution, 
  empty-result handling)
- Bug 4: checkDelivery (tri-state availability, city/date resolution, 
  artifact channel to state)

IN PROGRESS:
- Bug 5: createOrder schema (uncommitted work in progress)

DEFERRED:
- Bug 7 (max_price drop), 10 (context drift), 11/11b (image hydration)
- Tool hiding (trackOrder, getAlternatives) — at the end
- Post-submission: merge runToolWithArtifact into runTool, file upstream 
  bug reports