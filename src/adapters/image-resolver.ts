import { logger } from '@/lib/logger.js';
import { storeProductImage } from '@/lib/productImageCache.js';

const FETCH_TIMEOUT_MS = 5_000;

const OG_IMAGE_PATTERN = /<meta\s+property="og:image"\s+content="([^"]+)"/i;
const OG_DESCRIPTION_PATTERN = /<meta\s+property="og:description"\s+content="([^"]+)"/i;
const META_DESCRIPTION_PATTERN = /<meta\s+name="description"\s+content="([^"]+)"/i;
const OG_TITLE_PATTERN = /<meta\s+property="og:title"\s+content="([^"]+)"/i;
const JSON_LD_PATTERN = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

export interface ResolvedProductPageData {
  image_url: string | null;
  description: string | null;
  vendor: string | null;
  category: string | null;
  name: string | null;
  price: number | null;
  /** Derived from JSON-LD offers[].availability (schema.org InStock/
   *  LimitedAvailability/OutOfStock URL) — null if absent or unrecognized,
   *  never guessed. */
  in_stock: 'in_stock' | 'low_stock' | 'out_of_stock' | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isProductLd(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const type = value['@type'];
  return type === 'Product' || (Array.isArray(type) && type.includes('Product'));
}

/** schema.org `brand` can be a plain string or a Brand/Organization object with a `name`. */
function extractBrandName(brand: unknown): string | null {
  if (typeof brand === 'string') return brand;
  if (isRecord(brand) && typeof brand.name === 'string') return brand.name;
  return null;
}

/** schema.org `offers` can be a single Offer object or an array of them
 *  (confirmed live: Kapruka product pages use an array with one entry) —
 *  the first entry is the one that matters here. */
function extractFirstOffer(offers: unknown): Record<string, unknown> | null {
  const offer = Array.isArray(offers) ? offers[0] : offers;
  return isRecord(offer) ? offer : null;
}

function extractOfferPrice(offer: Record<string, unknown> | null): number | null {
  if (!offer) return null;
  const raw = offer.price;
  const price = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  return Number.isFinite(price) ? price : null;
}

/** schema.org availability is a URL like "http://schema.org/InStock" — matched
 *  by suffix rather than parsed as a URL since some pages omit the scheme. */
function extractOfferStock(offer: Record<string, unknown> | null): ResolvedProductPageData['in_stock'] {
  const availability = offer && typeof offer.availability === 'string' ? offer.availability : '';
  if (/InStock$/i.test(availability)) return 'in_stock';
  if (/LimitedAvailability$/i.test(availability)) return 'low_stock';
  if (/OutOfStock$/i.test(availability)) return 'out_of_stock';
  return null;
}

/**
 * Product detail pages carry 2-3 JSON-LD <script> blocks (Organization,
 * Product, FAQPage) — find the Product one. Confirmed live across both
 * failing catalogs tested (EF_PC_* and CHOCOLATES0*) to carry a clean,
 * full description plus brand/category/image with no HTML-tag stripping
 * needed, unlike the visible page markup.
 */
function extractFromJsonLd(html: string): Partial<ResolvedProductPageData> {
  for (const match of html.matchAll(JSON_LD_PATTERN)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    if (!isProductLd(parsed)) continue;

    const offer = extractFirstOffer(parsed.offers);

    return {
      description: typeof parsed.description === 'string' ? parsed.description.trim() : null,
      image_url: typeof parsed.image === 'string' ? parsed.image : null,
      vendor: extractBrandName(parsed.brand),
      category: typeof parsed.category === 'string' ? parsed.category : null,
      name: typeof parsed.name === 'string' ? parsed.name.trim() : null,
      price: extractOfferPrice(offer),
      in_stock: extractOfferStock(offer),
    };
  }
  return {};
}

/** Regex fallback for pages where JSON-LD is missing or malformed — og:image
 *  first, og:description/meta description second (both are the same lower-
 *  quality SEO blurb; whichever matches first is fine). */
function extractFromMeta(html: string): Partial<ResolvedProductPageData> {
  const image = html.match(OG_IMAGE_PATTERN);
  const description = html.match(OG_DESCRIPTION_PATTERN) ?? html.match(META_DESCRIPTION_PATTERN);
  const title = html.match(OG_TITLE_PATTERN);
  return {
    image_url: image ? image[1] : null,
    description: description ? description[1] : null,
    name: title ? title[1] : null,
  };
}

const pageDataCache = new Map<string, ResolvedProductPageData | null>();

/**
 * Fallback product data for products get_product has no detail record for
 * (docs/LIVE_SYSTEM_AUDIT.md: ~48% of live search results, not limited to
 * any one ID prefix). Every search result still carries its own
 * /buyonline/.../kid/... detail page URL (NormalizedProduct.product_page_url)
 * — one fetch of that page yields image, description, vendor, and category
 * all at once via its JSON-LD Product schema, with og:image/og:description
 * as a regex fallback if JSON-LD is absent. No prefix blacklist: this runs
 * purely when get_product already failed, regardless of why.
 */
export async function resolveProductFromPage(
  productPageUrl: string,
  productId: string,
): Promise<ResolvedProductPageData | null> {
  const cached = pageDataCache.get(productId);
  if (cached !== undefined) return cached;

  try {
    const res = await fetch(productPageUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      pageDataCache.set(productId, null);
      logger.warn({ productId, productPageUrl, status: res.status }, 'product page fallback fetch failed');
      return null;
    }

    const html = await res.text();
    const fromLd = extractFromJsonLd(html);
    const fromMeta = extractFromMeta(html);

    const data: ResolvedProductPageData = {
      image_url: fromLd.image_url ?? fromMeta.image_url ?? null,
      description: fromLd.description ?? fromMeta.description ?? null,
      vendor: fromLd.vendor ?? null,
      category: fromLd.category ?? null,
      name: fromLd.name ?? fromMeta.name ?? null,
      price: fromLd.price ?? null,
      in_stock: fromLd.in_stock ?? null,
    };

    if (!data.image_url && !data.description) {
      pageDataCache.set(productId, null);
      logger.warn({ productId, productPageUrl }, 'product page fallback found no usable fields');
      return null;
    }

    pageDataCache.set(productId, data);
    if (data.image_url) storeProductImage(productId, data.image_url);
    logger.info({ productId, hasImage: !!data.image_url, hasDescription: !!data.description }, 'product page fallback resolved data');
    return data;
  } catch (err) {
    pageDataCache.set(productId, null);
    logger.warn(
      { productId, productPageUrl, err: err instanceof Error ? err.message : String(err) },
      'product page fallback fetch threw',
    );
    return null;
  }
}
