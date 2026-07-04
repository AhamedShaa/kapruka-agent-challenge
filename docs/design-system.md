# Kasun — Design System & UX Strategy
### Kapruka AI Shopping Assistant — Kapruka Agent Challenge 2026

**Design philosophy in one sentence:** Kasun should feel like a Kapruka employee who spent a year at a great SaaS company and came back — same warmth, same colors, none of the Bootstrap-era clutter.

This document is the reference to check against while building the UI. Every rubric line (Experience & Polish 30, Visual Richness 20, Personality 15) maps to something here. Where a decision has real tradeoffs, I've included the reasoning — everywhere else, treat this as the spec.

---

## Revision Log

*Locked sections are not silently reopened — every change below is logged with what changed and why, per the project's design-doc discipline.*

- **§12 (Navigation & Sidebar) — superseded in part.** The original plan placed the language toggle in the top bar. It has moved into a new Settings panel inside the sidebar (§19), because the sidebar now exists as a Claude-style navigation shell and Settings is its natural home. Cart stays in the top bar — unchanged.
- **§1 — extended, not changed.** Dark-theme tokens added as §1.6. Light tokens in §1.1–1.5 are unchanged; dark is an additional token set, not a replacement.
- **§19 (Sidebar Navigation Shell) — new.** A Claude-pattern collapsible sidebar (icon rail collapsed, labeled panel expanded), mostly static chrome with one functional item (Settings). No conversation history list, no search backend, no subscription/FAQ system — those exist visually only, by direct request.
- **§20 (Session & Visitor Persistence) — new.** Fixes a real bug (full state loss on page refresh) — a correctness fix, not chrome. Uses the anonymous-identity approach originally scoped for full chat history, now scoped down to session continuity only.
- **§19 — implementation drift corrected, spec unchanged.** The built sidebar rendered as two separate components (an icon rail + a labeled panel shown simultaneously) instead of one component with a collapsed/expanded state. The spec below was already correct; Phase 14 re-asserts it against the actual build.
- **§19 Settings — language toggle removed.** Per direct decision, the EN/Sinhala/Tanglish UI switch is cut. The system prompt's language-handling behavior is untouched — Kasun still responds in whatever language the user writes in; only the explicit picker is gone.
- **§8 — product card buttons revised.** Icon-only quick-add replaced with two labeled buttons ("Buy now" / "Add to cart") per direct reference. No star-rating field is used anywhere on the card — Kapruka's product schema has no rating data, and a fabricated rating is a dark pattern, not a design choice.

---

## 1. Color Token System

### 1.1 The brand pair, given real jobs (see reasoning above chat)

```
--color-purple-primary:   #402970   /* brand voice: header, Kasun avatar ring, agent identity */
--color-yellow-primary:   #FFB800   /* conversion: primary CTA fills, "you should notice this" */
```

Neither is used as body text color at full saturation — both are chrome/action colors, not reading colors. This is the single biggest departure from the current site (which uses purple as text everywhere, hurting readability).

### 1.2 Full token scale

Named, not just "primary/secondary" — this is what lets you say `bg-purple-50` in code instead of re-deriving tints by hand every time.

```
Purple scale (brand)
--purple-50:  #F3EFFA   /* tinted backgrounds, e.g. agent message bubble bg */
--purple-100: #E4DBF0
--purple-200: #C9B8E3
--purple-300: #A98BCF
--purple-500: #402970   /* base — same as brand primary */
--purple-600: #33205A   /* hover on purple elements */
--purple-700: #271844   /* active/pressed */
--purple-900: #150C24   /* rarely used — max-contrast text on light */

Yellow scale (accent)
--yellow-50:  #FFF8E6   /* badge backgrounds e.g. "Best Seller" */
--yellow-100: #FFEDBF
--yellow-300: #FFD666
--yellow-500: #FFB800   /* base */
--yellow-600: #E0A100   /* hover on yellow buttons */
--yellow-700: #B88300   /* active/pressed */

Neutrals (the workhorse — 80% of the UI is these)
--gray-0:    #FFFFFF   /* page background */
--gray-25:   #FAFAF9   /* subtle section separation without a hard line */
--gray-50:   #F5F4F2
--gray-100:  #EBE9E6   /* borders, dividers */
--gray-300:  #C9C6C1   /* disabled borders, placeholder icons */
--gray-500:  #8A8680   /* secondary/muted text */
--gray-700:  #4A473F   /* body text */
--gray-900:  #1F1D18   /* headings, high-emphasis text */

Semantic (never reuse brand colors for status — see 1.3)
--success-500: #1E9E5A   /* order confirmed, delivery available */
--warning-500: #D97706   /* perishable warning, delivery date risk */
--error-500:   #DC3545   /* out of stock, validation error */
--info-500:    #2E7BD6   /* neutral informational callouts */
```

### 1.3 Why neutrals are warm-toned, not cool-gray

Pure cool grays (`#808080`-style, blue-tinted) read as generic-SaaS/Silicon-Valley. A slightly warm gray (`#8A8680` rather than `#808080`) sits better next to purple and yellow — it reads as "premium local brand," not "template." This is a small, cheap decision that pays off everywhere text touches a surface.

### 1.4 Why semantic colors are NOT yellow/purple

Kapruka's site uses yellow for warnings/badges/everything, which is exactly the ambiguity we're fixing. If yellow means both "click me" and "warning," users hesitate. Status colors get their own lane. This directly protects **Usefulness (15 pts)** — a user should never misread a perishable-delivery warning as a promo badge.

### 1.5 Accessible contrast rules (hard constraints, not guidelines)

- Yellow `#FFB800` **never** used as text on white — contrast ratio ~1.6:1, fails WCAG entirely. Yellow is a *fill* only; text on yellow fills is always `--purple-700` or `--gray-900` (both pass AA at 4.5:1+).
- Purple `#402970` on white passes AAA for text (12:1+) — safe for headings, links, icons.
- Body text is `--gray-700` on white (9:1+), not `--gray-900` — full-black text on white at length reads harsh; this is the same reasoning Stripe/Linear use for body copy.

---

### 1.6 Dark Theme Tokens

Dark mode is not "invert the colors" — that produces a UI that looks like a *different product* at night. The same brand hue discipline from §1.1–1.5 carries over: neutrals stay warm-tinted (not cool-gray-black), and the page background is a deep purple-black, not pure black, so the brand's hue is present even in the darkest surface.

```
--dark-bg-page:        #17141F   /* page background — deep purple-black, not #000 */
--dark-bg-surface:     #201C2C   /* cards, sidebar panel */
--dark-bg-surface-2:   #2A2438   /* popovers, dropdowns — one step lighter than surface */
--dark-border:         #3A3350
--dark-text-primary:   #F2F0F5   /* not pure white — matches the "not full-black on white" reasoning from §1.5 */
--dark-text-secondary: #A79FBB

--dark-purple-accent:  #B49FDD   /* base --purple-500 (#402970) is too dark to read as
                                     an accent/link color against a dark background —
                                     this lighter tint is the dark-mode equivalent */
--dark-yellow-accent:  #FFC940   /* slightly lightened for AA text contrast on dark bg;
                                     unchanged as a button fill (buttons don't need this shift) */
```

**Elevation on dark backgrounds works differently — this is a real mechanism change, not just new colors.** A shadow tuned for a white background (§5) is close to invisible against `--dark-bg-page`; shipping the same shadow tokens unchanged on dark is dead code that does nothing. Dark elevation instead uses **surface lightening + a 1px border**, one step per elevation level (`--dark-bg-surface` → `--dark-bg-surface-2` as you go up a level), which is how Material Dark and most mature dark-mode systems actually solve this — shadows fundamentally don't work the way you'd expect once the background is already dark.

Implementation: `next-themes` with Tailwind's `darkMode: 'class'` strategy — handles the classic Next.js "flash of wrong theme on load" problem correctly out of the box, which a hand-rolled localStorage+context solution reliably gets wrong on first paint. `defaultTheme="light"`, `enableSystem={false}` — per the decision to default light with dark as an explicit opt-in, not OS-driven.

---

## 2. Typography

### 2.1 Typeface decision

| Option | Pros | Cons | Recommendation |
|---|---|---|---|
| Roboto only (current brand) | Exact brand continuity | Roboto's proportions feel slightly dated at small UI sizes (tabular numbers, tight letterforms) vs. what Linear/Stripe use | Rejected as sole face |
| Inter only | Best-in-class for UI: excellent numeral tabularity (critical for prices), huge weight range, what most modern SaaS uses | Zero connection to existing brand typography | Rejected as sole face |
| **Inter for UI/headings + Roboto for long-form body/chat text** | Inter carries the "modern SaaS" feel in headings, buttons, labels, prices — the places judges' eyes land first. Roboto stays for chat message text and descriptions, preserving brand DNA where users are reading, not scanning | Two font files to load | **Chosen** |

Reasoning: judges scan UI chrome (headers, buttons, cards) in the first 3 seconds — that's where "modern" needs to register instantly, so Inter goes there. Chat conversation is where brand *voice* lives, and Roboto is already the voice Kapruka customers unconsciously associate with the brand. You get modernization exactly where it's noticed and continuity exactly where it matters.

### 2.2 Type scale (8px-aligned line heights)

```
--text-display:  32px / 40px line-height / Inter 700   /* hero moments only — rare */
--text-h1:        24px / 32px / Inter 600               /* page-level headings */
--text-h2:        20px / 28px / Inter 600               /* section headings, product name in detail view */
--text-h3:        16px / 24px / Inter 600               /* card titles */
--text-body-lg:    16px / 24px / Roboto 400              /* chat message text */
--text-body:       14px / 20px / Roboto 400              /* descriptions, secondary chat content */
--text-caption:    12px / 16px / Inter 500               /* metadata, timestamps, badges */
--text-price:      18px / 24px / Inter 700 tabular-nums  /* always Inter — numeral clarity matters for money */
```

Rule: **Inter for anything numeric or UI-structural. Roboto only for prose the user reads sentence-by-sentence.**

---

## 3. Spacing Scale (8px system)

```
--space-1: 4px   /* icon-to-label gaps, tight inline spacing */
--space-2: 8px   /* base unit — default gap inside compact components */
--space-3: 12px  /* internal card padding on mobile */
--space-4: 16px  /* standard card padding, gap between chat elements */
--space-6: 24px  /* section spacing, gap between carousel cards */
--space-8: 32px  /* major section breaks */
--space-12: 48px /* page-level breathing room, desktop margins */
--space-16: 64px /* hero/empty-state vertical centering */
```

Why 4px exists despite the "8px system" framing: pure 8px grids get cramped for icon+label micro-layouts. Half-steps (4, 12) are allowed *only* for spacing under 16px; everything above 16px stays on the 8px multiple to keep rhythm predictable as the eye moves down the page.

---

## 4. Border Radius System

```
--radius-sm:  8px   /* inputs, small buttons, badges */
--radius-md:  12px  /* cards, chat bubbles */
--radius-lg:  16px  /* modals, large containers, image containers on product cards */
--radius-full: 999px /* avatars, pills, filter chips */
```

Reasoning for the range: current Kapruka site uses 2–4px (Bootstrap default) or hard corners — that alone is a major "old" signal. 8–16px is the exact range Airbnb/Stripe/Linear sit in. Going *above* 16px (24px+, the "bubbly" extreme some AI-chat apps use) starts to feel like a toy, which undercuts trust for a checkout flow. 8–16px is the sweet spot between modern and credible-for-payments.

---

## 5. Shadow / Elevation System

A distinctive, cheap signature move: shadows are tinted purple, not neutral black. Neutral-gray shadows are the single most common "AI generated this" tell in current SaaS UI — a warm-tinted shadow ties elevation back to brand even when no brand color is otherwise visible on that element.

```
--shadow-xs:  0 1px 2px rgba(64, 41, 112, 0.06)                         /* input focus rest state */
--shadow-sm:  0 1px 3px rgba(64, 41, 112, 0.08), 0 1px 2px rgba(64,41,112,0.05)  /* cards at rest */
--shadow-md:  0 4px 12px rgba(64, 41, 112, 0.10)                        /* cards on hover, dropdowns */
--shadow-lg:  0 12px 32px rgba(64, 41, 112, 0.14)                       /* modals, order confirmation card */
--shadow-focus: 0 0 0 3px rgba(255, 184, 0, 0.35)                       /* keyboard focus ring — yellow, not purple, so it's never confused with a hover shadow */
```

Note the focus ring is intentionally the *only* place yellow is used as an outline rather than a fill — it needs to be unmistakably different from hover states, and reusing yellow (already "pay attention" in the user's mental model) for focus reinforces rather than fragments meaning.

---

## 6. Buttons

| Variant | Fill | Text | Use case |
|---|---|---|---|
| Primary | `--yellow-500`, hover `--yellow-600`, active `--yellow-700` | `--purple-700` | Add to cart, Proceed to checkout, Pay now — the one action per screen you most want taken |
| Secondary | transparent, 1.5px border `--purple-500` | `--purple-500` | Secondary actions: "View details," "See alternatives" |
| Tertiary/Ghost | transparent, no border | `--purple-500`, underline on hover | Low-emphasis actions inside cards: "Remove," "Change quantity" |
| Destructive | transparent, border `--error-500` | `--error-500` | Clear cart, remove item |
| Disabled | `--gray-100` | `--gray-300` | any variant, disabled state — no exceptions to this override |

**States (all variants):**
- Hover: fill/border darkens one step + `--shadow-sm` lift on filled buttons only (ghost/secondary don't lift — lifting a bordered button looks like a bug, not affordance)
- Active/pressed: darkens two steps, no shadow (visually "pressed into" the page)
- Loading: label replaced by a small spinner in the button's text color, button width does not change (prevents layout jump — a real Checkout-button annoyance on the current site's flow)
- Transition: `all 150ms cubic-bezier(0.4, 0, 0.2, 1)` — fast enough to feel responsive, slow enough to not feel like a snap

Sizes: `sm` (32px height, for inline chat actions), `md` (40px, default), `lg` (48px, checkout/pay CTA only — the single most important button on the page gets the biggest target).

---

## 7. Input Fields

```
Rest:     border 1px --gray-300, bg --gray-0, radius --radius-sm
Hover:    border --gray-500
Focus:    border --purple-500, --shadow-focus ring, no border-color jump on blur (avoids flicker)
Error:    border --error-500, helper text below in --error-500, icon left-aligned in field
Disabled: bg --gray-50, border --gray-100, text --gray-300, cursor not-allowed
```

**Chat input specifically** gets its own spec since it's the most-used control in the entire product:
- Pill-shaped (`--radius-full`), fixed at the bottom of the viewport, `--shadow-md` at rest so it visually floats above the conversation
- Send button embedded inside the input's right edge, not a separate button below it — reduces the input from feeling like a "form field" to feeling like a "message composer" (this single choice is what separates chat UIs that feel like AI products from ones that feel like a search bar with extra steps)
- Placeholder rotates through 2–3 example prompts ("Find a birthday gift under Rs. 3000...") — teaches capability without a separate onboarding screen, which directly serves **Usefulness** and **Creativity**

---

## 8. Product Cards

This is the single highest-leverage component for **Visual Richness (20 pts)** — it appears dozens of times per session.

```
Container:  white bg, 1px --gray-100 border, --radius-md, --shadow-sm at rest → --shadow-md on hover
Image:      4:5 or 1:1 aspect (locked, never let images distort card height — inconsistent card heights in a carousel is the #1 thing that makes a product grid look broken)
Image radius: top corners match card radius, bottom corners 0
Padding:    --space-4 below the image
Badge(s):   top-left overlay on image — vendor name if the normalized product has one, else category; stack a second "Out of stock" badge (--error-500) below it if applicable. NEVER a star rating — Kapruka's product schema has no rating field, and fabricating one is a dark pattern, not a design choice.
Name:       --text-h3, max 2 lines, ellipsis overflow
Secondary line: vendor or weight, if present on the normalized product (e.g. "250g") — --text-caption, --gray-500
Price:      --text-price, --purple-700 (not yellow — price is information, not a CTA)
Buttons:    two labeled buttons side by side, not icon-only —
            "Buy now": primary variant (§6), adds to cart if not already present AND immediately opens the checkout/delivery flow for this item — a real fast-path, not a relabeled add-to-cart.
            "Add to cart": secondary/outline variant (§6), adds silently, no navigation — user keeps browsing.
Hover:      lift via shadow + 2px translateY(-2px), 150ms — subtle, not a dramatic scale-up (scale transforms on hover in a horizontally-scrolling carousel cause layout jitter with neighboring cards)
```

---

## 9. Chat Message Bubbles

| | User message | Kasun (agent) message |
|---|---|---|
| Alignment | right | left |
| Background | `--purple-500` | `--gray-0` with 1px `--gray-100` border |
| Text color | white | `--gray-700` |
| Radius | `--radius-md`, sharp corner on the bottom-right (points toward the input, standard chat-UI convention) | `--radius-md`, sharp corner on the bottom-left |
| Max width | 75% of container | 85% of container (agent responses are often longer/richer) |
| Avatar | none (implicitly "you") | small circular Kasun avatar, `--purple-500` ring, left of bubble, only shown on the *first* bubble of a consecutive run |

Agent bubbles support rich content inline (already using `react-markdown` per your build) — bold, links, and **embedded structured cards** (see §10) rendered *inside* the bubble flow, not as separate detached elements. This keeps the conversation feeling like one continuous thread rather than "chat log + separate app UI," which is a common failure mode in bolted-together agent demos and something judges will notice by contrast.

---

## 10. AI Response Cards (structured, non-product content)

These are the cards Kasun renders for delivery checks, order confirmations, and city/date clarifications — distinct from product cards because they're informational, not "shop this."

```
Container: --purple-50 bg (tinted, not white — visually signals "this came from Kasun's reasoning," distinct from product cards), --radius-md, no shadow (sits flat inside the bubble, doesn't compete with it), left border-accent 3px --purple-500
Icon:      small line icon top-left (truck for delivery, checkmark-circle for confirmation, calendar for date), --purple-500
Title:     --text-h3
Body:      key-value rows (e.g. "Delivery to Jaffna" / "3 days" / "LKR 650"), label in --gray-500, value in --gray-900 --text-body, right-aligned value for scannability
```

Reasoning: giving structured data its own visual language (tinted, icon-led, key-value) rather than dumping it as prose is what makes the agent feel like it's *doing* something (checking a system, running a query) rather than just talking — this is a direct, cheap win for both **Personality** and **Usefulness**.

---

## 11. Product Recommendation Cards (inline, in-chat)

Same visual language as §8 product cards but constrained for horizontal carousel use inside a chat bubble:

- Fixed width (~160px mobile / ~200px desktop), horizontal scroll with `scroll-snap-type: x mandatory` so swiping settles cleanly on a card, never mid-card
- Scrollbar hidden, replaced by a subtle gradient fade at the trailing edge (signals "more to scroll" without a visible scrollbar breaking the clean aesthetic)
- 3–5 cards per recommendation set — more than that and it becomes a wall of options, which undermines the "confidently guide from *I'm not sure* to *add to cart*" usefulness goal explicitly named in the brief

---

## 12. Navigation & Sidebar

Given the brief explicitly wants full-screen chat as the *main* surface (not a widget), navigation should be minimal by design — a heavy sidebar competes with the conversation for attention.

```
Top bar only (no persistent sidebar):
  - height 56px, white bg, --shadow-xs (barely-there separation from content)
  - left: Kapruka wordmark/logo, small
  - right: cart icon with item-count badge (--yellow-500 bg, --purple-700 text), language toggle (EN / සිංහල / Tanglish — visible, not buried in settings, since language support is a named bonus criterion and should be *discoverable*)
```

A cart *drawer* (slides in from the right, doesn't navigate away from chat) rather than a cart *page* — preserves conversational continuity, directly protects the "close the loop end to end" checkout completeness score by never making the user feel like they left the agent.

---

## 13. Loading States & Skeletons

| Context | Treatment |
|---|---|
| Kasun "thinking" | Three-dot typing indicator inside an agent bubble shell (same bg/border as a real message) — never a generic spinner, which breaks the chat metaphor |
| Product search in progress | Skeleton cards (same dimensions as §8, gray shimmer blocks for image/title/price) shown in the carousel position *before* results arrive — never a blank gap, which reads as "broken" for the ~1-2s a tool call takes |
| Order/checkout submission | Button loading state (§6) + a one-line status update inside the response card ("Confirming with Kapruka...") — checkout is the highest-anxiety moment in the flow; silence here is the worst possible failure |
| Shimmer animation | `background: linear-gradient(90deg, --gray-50 0%, --gray-100 50%, --gray-50 100%)`, animated left-to-right, 1.5s loop |

---

## 14. Hover & Interaction States (summary reference)

```
Cards:        shadow-sm → shadow-md, translateY(-2px), 150ms
Buttons:      color step-down + shadow (filled only), 150ms
Links:        underline appears on hover, color unchanged (color-shift links feel dated)
List rows:    bg --gray-25 on hover (delivery city list, order history)
Icons-only buttons: circular --gray-50 bg appears on hover (gives a touch target without a visible border at rest)
```

Touch devices: hover states are replaced by press states (`:active`) only — never rely on `:hover` to reveal functionality (e.g. quick-add button) on anything that must also work on mobile, since hover doesn't exist there. This is a common bug source worth flagging now, not after mobile QA.

---

## 15. Animation Guidelines

**Durations:**
```
--duration-fast:   100ms  /* micro-feedback: button press, checkbox toggle */
--duration-base:   150ms  /* default: hover states, color transitions */
--duration-medium: 250ms  /* card entrance, drawer slide */
--duration-slow:   400ms  /* page-level transitions, modal open */
```

**Easing:** `cubic-bezier(0.4, 0, 0.2, 1)` (standard "ease-out" feel) for anything entering the screen; `cubic-bezier(0.4, 0, 1, 1)` (ease-in) for anything leaving. Never linear — linear motion is the most common "this is unpolished" tell in interactive demos.

**What gets animated (be selective — see restraint note below):**
- New chat message arriving: fade + slight translateY(8px→0), 250ms — signals "new," doesn't distract from reading
- Product carousel appearing: cards stagger in with a 40ms delay between each (first 3 only, rest appear instantly) — a staggered reveal on 5+ cards starts to feel slow rather than delightful
- Cart drawer: slide from right, 250ms, with a scrim fade-in behind it
- Order confirmation: a single, restrained checkmark draw-in (SVG stroke animation, ~400ms) — this is the "signature moment" worth spending polish on, because it's the emotional peak of the checkout flow and judges will see it during every successful demo run

**What does NOT get animated:** text content changing, price updates, skeleton-to-content swaps beyond a simple crossfade. Motion on every single state change reads as busy/AI-generated rather than considered — restraint here is itself a signal of craft.

**Reduced motion:** every animation above collapses to an instant state change (or a 80ms opacity-only fade, never transform) when `prefers-reduced-motion: reduce` is set. Non-negotiable — this is graded implicitly under accessibility and explicitly hurts polish score if missed, since judges reviewing on accessibility settings would see a broken (not just plain) experience if transforms are left half-implemented.

---

## 16. Responsive Behavior

```
Breakpoints:
--bp-sm:  375px   /* mobile baseline — design here first */
--bp-md:  768px   /* tablet */
--bp-lg:  1024px  /* desktop */
--bp-xl:  1440px  /* large desktop — cap content width, don't let chat stretch full-bleed */
```

Mobile-first, not "desktop shrunk down" — given judges will very likely open the link on a phone first (it's the fastest way to evaluate a demo), the mobile experience is not secondary polish, it is the primary experience to get right.

Key responsive rules:
- Chat input: fixed to viewport bottom on mobile with safe-area-inset padding (avoids iOS home-indicator overlap — a small detail that separates "built for the web" from "built for a phone")
- Product carousels: horizontal scroll on all breakpoints (never reflow into a grid) — consistent interaction model regardless of screen size
- Cart drawer: full-screen takeover on mobile (`< 768px`) rather than a partial-width slide-in, since a 30%-width drawer on a 375px screen leaves too little room to read anything
- Top bar: language toggle collapses to a single globe icon + dropdown on mobile, full three-way toggle on desktop

---

## 17. Accessibility Recommendations

- **Contrast:** all text combinations pass WCAG AA minimum (4.5:1 body, 3:1 large text) — verified per-token in §1.5, not left to spot-checking.
- **Focus visibility:** every interactive element gets the yellow `--shadow-focus` ring on keyboard focus — no `outline: none` without a replacement, which is a common and easily-caught accessibility failure.
- **Chat semantics:** the message list should be an `aria-live="polite"` region so new agent messages are announced to screen readers without interrupting whatever the user is currently doing (e.g., typing).
- **Alt text:** every product image gets real alt text from the product name/description, not empty strings — meaningfully helps both accessibility and, incidentally, gives a fallback when an image fails to load.
- **Touch targets:** minimum 44×44px for any tappable element (quick-add buttons, chip filters), even where the visual element is smaller — pad the hit area, don't enlarge the visual.
- **Color independence:** status badges (perishable, out-of-stock) pair an icon + text label with the color, never color alone — protects colorblind users and, again, directly serves the "genuinely helpful" usefulness criterion (a misread status is a usefulness failure, not just an accessibility one).
- **Reduced motion:** covered in §15 — treat as a hard requirement, not a nice-to-have.

---

## 18. Why This Cohesively Reads as "Kapruka, Modernized" (Not Rebranded)

Three deliberate anchors keep brand recognition intact even though almost everything else changed:

1. **The purple/yellow pair never disappears — it's just disciplined.** Every screen still shows both colors in the first second of viewing (purple in chrome/agent identity, yellow in the primary action). Recognition survives; only the *chaos* of using both colors everywhere, undifferentiated, is removed.
2. **Roboto persists exactly where the brand's "voice" lives** — the actual words Kasun says. A returning Kapruka customer's ear (so to speak) for the brand's tone is preserved even as the surrounding chrome modernizes.
3. **Warm-toned neutrals, not cool SaaS-gray.** This is the subtlest anchor but the one that stops the UI from feeling like "generic AI chat product #47." A slightly warm gray family, combined with purple-tinted shadows, means even the parts of the UI with zero brand color in them still feel like they belong to this brand rather than a template.

Everything else — 8px spacing, 8–16px radii, tinted shadows, skeleton loading, staggered carousel reveals — is *category-standard modern craft*, not brand identity. Judges evaluating "Experience & Polish" are pattern-matching against Linear/Stripe/Perplexity whether they say so or not; meeting that bar is what "polish" means in 2026. The brand recognition comes from the anchors above, layered on top of that bar — not from avoiding it.

---

### Next step

This document is the reference. When we move into implementation, each section above becomes: a `tokens.css`/Tailwind config (§1–5), a component spec per §6–13, and a motion utility set for §15. Say when you're ready to move to implementation and we'll go component-by-component, starting with tokens since everything else depends on them.

---

## 19. Sidebar Navigation Shell (Claude-pattern)

**Scope note:** by direct decision, this is a visual navigation shell, not a functional feature set. Chats / Search / Manage Subscriptions / Updates & FAQ exist so the app *looks* like a complete product, matching Claude's own chrome — they are not wired to real data or backend logic in this pass. Settings is the exception: it's functional, because it's where the theme and language toggles now live.

**Structure, collapsed (icon rail, ~64–72px):**
```
[Kapruka mark — icon-only]
[💬 icon]   Chats
[🔍 icon]   Search
[📦 icon]   Manage Subscriptions
[📣 icon]   Updates & FAQ
[⚙️ icon]   Settings
```
Each icon shows a tooltip with its label on hover (desktop) — this is what makes an icon-only rail usable rather than a guessing game, and is exactly how Claude's own collapsed rail behaves.

**Structure, expanded (~260–280px, matching the reference product's proportions):**
```
[Kapruka wordmark]
──────────────
Chats
Search
Manage Subscriptions
Updates & FAQ
──────────────
Settings
```
Settings sits visually separated (a divider above it) from the four static items, signaling it's a different kind of item — the one that opens something real.

**Settings panel contents (functional):**
- Theme toggle: Light / Dark — two-state switch, not a dropdown (a switch communicates "pick one of two" faster than a dropdown does, and this is a binary choice)
- No language toggle. English-only UI by decision — this does NOT mean Kasun stops understanding or replying in Sinhala/Tanglish; the system prompt's language handling is untouched. Only the explicit picker is removed.

**Implementation note — this is ONE component, not two.** The collapsed rail and the expanded panel are the same Sidebar component in two states, driven by one boolean (`collapsed`), not two separately-rendered components shown at the same time. Rendering both simultaneously is the specific bug this section exists to prevent.

**Static items (Chats, Search, Manage Subscriptions, Updates & FAQ):**
- Still get real hover/focus/active states and keyboard navigation — "visual-only" means no backend wiring, not "not built properly." A static nav item with a broken focus ring is a worse accessibility miss than not having the item at all, because it *looks* interactive and isn't reachable.
- Clicking one shows a brief, on-brand placeholder (e.g., a small "Coming soon" tooltip in Kasun's voice) rather than doing nothing silently — a click with zero feedback reads as broken; a click with an honest "not yet" reads as intentional.

**Reconciling with §12:** the top bar keeps the cart icon and drawer — that's a *current shopping session* concern. This sidebar is a *navigation/account* concern. They don't overlap in content, only in occupying screen space, and the layout math (top bar height + sidebar width) needs both accounted for together when sizing the main chat column.

---

## 20. Session & Visitor Persistence

**This section exists to fix a bug, not to add a feature.** Refreshing the page currently loses the cart, the conversation, and any customer context — every time. That's a correctness problem that will surface the moment a judge refreshes mid-demo, which is a near-certain event, not an edge case.

**Mechanism:**
1. On first page load, check `localStorage` for a `kasun_visitor_id`. If absent, generate a UUID and store it.
2. Send `kasun_visitor_id` as a header on every API request to the backend.
3. Backend maps `visitor_id` → the LangGraph `thread_id` already in use for that visitor's conversation, and to their cart in the existing SQLite storage. On a fresh visitor, create both; on a returning one (same `visitor_id`, e.g. after a refresh), resume both.
4. No new conversation-history UI reads this — it exists purely so "the same visitor, after a refresh, sees the same cart and the same in-progress conversation," full stop.

**Why this scopes down cleanly from the earlier chat-history proposal:** the identity mechanism (an anonymous visitor ID) is identical either way. What's cut is everything *downstream* of identity — the `conversations` metadata table, the FTS5 search index, the grouped/dated list UI. Building the identity layer now means it's a small, contained addition if a browsable history is ever wanted later — the expensive part (getting identity right, without cross-visitor leakage) is done once, correctly, here.

**Common mistake to guard against:** scoping every cart/memory/thread lookup by `visitor_id` in the query itself, not just at the API route boundary — a single un-scoped query is a data-leak bug between two different visitors sharing a server process, not merely a UI inconsistency.
