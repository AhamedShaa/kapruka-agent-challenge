'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import type { RenderEvent, UIProduct } from '@/agent/state.js';
import ProductCarousel from '@/components/products/ProductCarousel.js';
import ProductCard from '@/components/products/ProductCard.js';
import RecommendationCarousel from '@/components/products/RecommendationCarousel.js';
import DeliveryCard from '@/components/delivery/DeliveryCard.js';
import CheckoutPanel from '@/components/checkout/CheckoutPanel.js';
import ResponseCard from '@/components/ui/ResponseCard.js';

interface RenderEventViewProps {
  event: RenderEvent;
  isStreaming?: boolean;
  onAddToCart: (product: UIProduct, qty?: number) => void;
  onViewDetail: (product: UIProduct) => void;
  onBuyNow: (product: UIProduct, qty?: number) => void;
  onSendMessage: (text: string) => void;
}

export default function RenderEventView({
  event,
  isStreaming,
  onAddToCart,
  onViewDetail,
  onBuyNow,
  onSendMessage,
}: RenderEventViewProps): React.JSX.Element | null {
  switch (event.type) {
    case 'PRODUCT_LIST':
      return (
        <ProductCarousel
          products={event.products}
          query={event.query}
          loading={isStreaming}
          onAddToCart={onAddToCart}
          onViewDetail={onViewDetail}
          onBuyNow={onBuyNow}
          onSendMessage={onSendMessage}
        />
      );

    case 'PRODUCT_DETAIL':
      return (
        <div className="w-[210px]">
          <ProductCard
            product={event.product}
            index={0}
            variant="detail"
            onAddToCart={(p) => onAddToCart(p)}
            onViewDetail={() => undefined}
            onBuyNow={() => undefined}
          />
        </div>
      );

    case 'CART':
      return null;

    case 'DELIVERY_QUOTE':
      return (
        <DeliveryCard
          city={event.city}
          fee={event.fee}
          available={event.available}
          etaLabel={event.etaLabel}
          note={event.note ?? ''}
        />
      );

    case 'CHECKOUT_LINK':
      return (
        <CheckoutPanel
          checkoutUrl={event.checkoutUrl}
          orderId={event.orderId}
          total={event.total}
          expiresAt={event.expiresAt}
        />
      );

    case 'RECOMMENDATIONS':
      if (event.products.length === 0) return null;
      return (
        <RecommendationCarousel
          products={event.products}
          onAddToCart={onAddToCart}
          onViewDetail={onViewDetail}
          onBuyNow={onBuyNow}
        />
      );

    case 'ERROR':
      /* Formatted error — never raw MCP/Zod text — in a ResponseCard error variant */
      return (
        <ResponseCard
          variant="error"
          icon={<AlertCircle className="w-4 h-4" />}
          title="Something went wrong"
          rows={[{ label: 'Details', value: event.message }]}
        />
      );

    case 'TOOL_ACTIVITY':
      /* Checkout is the highest-anxiety moment — show a prominent progress card */
      if (event.tool === 'create_order') {
        return (
          <ResponseCard
            icon={
              <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
            }
            title="Confirming with Kapruka…"
            footer={
              <p className="text-xs text-gray-400 font-ui">
                This usually takes a few seconds — hang tight.
              </p>
            }
          />
        );
      }
      /* All other tool activities: small inline indicator */
      return (
        <p className="text-xs text-gray-400 dark:text-[#A79FBB] flex items-center gap-1.5 font-ui">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-[#3A3350] animate-pulse motion-reduce:animate-none" />
          {event.label}
        </p>
      );

    default:
      return null;
  }
}
