import type {
  NormalizedProduct,
  NormalizedCartItem,
  NormalizedDeliveryCheck,
} from '@/adapters/normalizers/types.js';
import type { UIProduct, UICartItem, UIDeliveryQuote } from '@/agent/state.js';

/**
 * Flattens a NormalizedProduct's nullable fields into the non-null shape the
 * product UI components expect. Nulls degrade to display-safe defaults —
 * the agent layer keeps the real nulls; only this mapper's output reaches React.
 */
export function normalizedToUIProduct(p: NormalizedProduct): UIProduct {
  return {
    id: p.id,
    name: p.name ?? '(unnamed item)',
    price: p.price ?? 0,
    image_url: p.image_url ?? '',
    category: p.category ?? '',
    description: p.description ?? '',
    visual_description: p.visual_description ?? '',
    in_stock: p.in_stock,
  };
}

/** NormalizedCartItem has no nullable fields — this is a straight field copy, dropping `subtotal`. */
export function normalizedToUICartItem(item: NormalizedCartItem): UICartItem {
  return {
    productId: item.productId,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
  };
}

/**
 * Flattens NormalizedDeliveryCheck's tri-state `availability` into a primary
 * boolean for the UI, with `etaLabel` carrying the nuance as display text.
 * In practice `availability` only ever resolves to 'available' or 'unknown'
 * here (rawText, which 'available_later'/'unavailable' depend on, is never
 * available to the adapter — see normalizer-design notes) — etaLabel still
 * covers all four states defensively.
 */
export function normalizedToUIDeliveryQuote(
  d: NormalizedDeliveryCheck & { note: string },
): UIDeliveryQuote {
  const available = d.availability === 'available';

  const etaLabel = (() => {
    switch (d.availability) {
      case 'available':
        return 'Delivery available';
      case 'available_later':
        return d.nextAvailableDate ? `Available from ${d.nextAvailableDate}` : 'Available later';
      case 'unavailable':
        return 'Not available for delivery';
      case 'unknown':
      default:
        return 'Delivery details unavailable';
    }
  })();

  return {
    city: d.city ?? 'your area',
    available,
    fee: d.fee ?? 0,
    etaLabel,
    note: d.note,
  };
}
