import type {
  NormalizedProduct,
  NormalizedCartItem,
  NormalizedDeliveryCheck,
  NormalizedDeliveryCheckWithContext,
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
    vendor: p.vendor ?? null,
    weight: p.weight ?? null,
    international_shipping: p.international_shipping,
  };
}

/** NormalizedCartItem has no nullable fields — straight field copy dropping `subtotal`. image_url is optional and client-enriched. */
export function normalizedToUICartItem(item: NormalizedCartItem): UICartItem {
  return {
    productId: item.productId,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    image_url: item.image_url ?? null,
  };
}

/**
 * Flattens NormalizedDeliveryCheck's tri-state `availability` into a primary
 * boolean for the UI, with `etaLabel` carrying the nuance as display text.
 * All four availability states are reachable now that _rawMarkdown is
 * threaded through from the live API via the kapruka-mcp patch.
 *
 * City display falls back to resolutionContext.resolvedAs when quote.city
 * is null — this happens when the rich text extraction path ran but the
 * "Delivery to X on DATE" header regex didn't match (e.g. degraded branch).
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

  const cityForDisplay =
    d.city
    ?? (d as NormalizedDeliveryCheckWithContext).resolutionContext?.resolvedAs
    ?? 'your area';

  return {
    city: cityForDisplay,
    available,
    fee: d.fee ?? 0,
    etaLabel,
    note: d.note,
  };
}
