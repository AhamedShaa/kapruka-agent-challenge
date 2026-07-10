import { Annotation } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import type { StockStatus } from '@/adapters/normalizers/types.js';

export type Locale = 'en' | 'si' | 'tanglish';

/**
 * UI-facing shapes for RenderEvent payloads. These are deliberately decoupled
 * from the Normalized* types the agent/adapter layer uses — React components
 * never see nulls or _meta; src/adapters/ui-mappers.ts flattens Normalized*
 * into these before any RenderEvent is emitted.
 */
export interface UIProduct {
  id: string;
  name: string;
  price: number;
  image_url: string;
  category: string;
  description: string;
  visual_description: string;
  in_stock: StockStatus;
  vendor?: string | null;
  weight?: string | null;
  international_shipping?: boolean | null;
  /** The product's own detail page — used client-side to request the
   *  og:image/JSON-LD fallback when get_product has no record for this id. */
  product_page_url?: string | null;
}

export interface UICartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string | null;
}

export interface UIDeliveryQuote {
  city: string;
  available: boolean;
  fee: number;
  etaLabel: string;
  note: string;
}

/**
 * Snapshot of the most recent searchProducts/showMoreResults call — lets
 * showMoreResults re-issue the same search with the stored cursor rather than
 * the LLM having to (mis)remember and retype the original query/filters.
 * Confirmed live (scripts/probe-cursor-pagination.ts) that cursor pagination
 * is real: distinct, non-overlapping pages, each carrying its own next cursor.
 */
export interface LastSearchContext {
  q: string;
  category?: string;
  min_price?: number;
  max_price?: number;
  in_stock_only?: boolean;
  sort?: 'bestseller' | 'newest' | 'price_asc' | 'price_desc' | 'relevance';
  cursor: string | null;
  /** Client-side vendor filter applied to this search (e.g. "Pentra Holdings"). */
  vendor?: string;
  /** Position-to-ID map for the most recent carousel page. Lets the LLM
   *  resolve "the third one" to a product ID for a getProduct call without
   *  names ever appearing in the ToolMessage. */
  productIndex?: Array<{ position: number; id: string; price: number }>;
}

/**
 * Agent state. RenderEvents are intentionally NOT stored here — they're
 * ephemeral, emitted per-request via RenderEventEmitter, and would otherwise
 * inflate the LangGraph checkpointer indefinitely.
 */
export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
  sessionId: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  locale: Annotation<Locale>({
    reducer: (_current, update) => update,
    default: () => 'en',
  }),
  browserId: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  cartSnapshot: Annotation<UICartItem[] | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  /**
   * Replace semantics for now (deliveryContext is always overwritten wholesale,
   * never merged field-by-field by the reducer itself — see stateUpdaterNode,
   * which reads the previous city/date manually before constructing the update).
   * Declared explicitly via Annotation.Root so list-style fields (e.g.
   * viewedProducts) can swap in real merge logic later without restructuring.
   */
  deliveryContext: Annotation<{
    city: string | null;
    date: string | null;
    resolvedCity: string | null;
    ambiguous: boolean;
    alternateZones: string[];
    lastResolutionReason: 'exact' | 'vernacular' | 'ambiguous-defaulted' | 'unknown' | 'invalid-date' | null;
  }>({
    reducer: (_current, update) => update,
    default: () => ({
      city: null,
      date: null,
      resolvedCity: null,
      ambiguous: false,
      alternateZones: [],
      lastResolutionReason: null,
    }),
  }),
  customerName: Annotation<string | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  lastSearchContext: Annotation<LastSearchContext | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
});

export type StateType = typeof AgentState.State;

const uiProductSchema = z.custom<UIProduct>();
const uiCartItemSchema = z.custom<UICartItem>();

export const renderEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('PRODUCT_LIST'),
    products: z.array(uiProductSchema),
    query: z.string(),
  }),
  z.object({
    type: z.literal('PRODUCT_DETAIL'),
    product: uiProductSchema,
  }),
  z.object({
    type: z.literal('CART'),
    items: z.array(uiCartItemSchema),
    total: z.number(),
    itemCount: z.number(),
  }),
  z.object({
    type: z.literal('DELIVERY_QUOTE'),
    city: z.string(),
    fee: z.number(),
    available: z.boolean(),
    etaLabel: z.string(),
    note: z.string().optional(),
  }),
  z.object({
    type: z.literal('CHECKOUT_LINK'),
    checkoutUrl: z.string(),
    orderId: z.string(),
    total: z.number(),
    expiresAt: z.string(),
  }),
  z.object({
    type: z.literal('RECOMMENDATIONS'),
    products: z.array(uiProductSchema),
  }),
  z.object({
    type: z.literal('ERROR'),
    message: z.string(),
    tool: z.string(),
  }),
  z.object({
    type: z.literal('TOOL_ACTIVITY'),
    tool: z.string(),
    label: z.string(),
    status: z.literal('pending'),
  }),
]);

export type RenderEvent = z.infer<typeof renderEventSchema>;
