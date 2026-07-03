'use client';

import { useState } from 'react';
import type { RenderEvent, UIProduct } from '@/agent/state.js';
import ProductCarousel from '@/components/products/ProductCarousel.js';
import ProductDetailDrawer from '@/components/products/ProductDetailDrawer.js';
import DeliveryCard from '@/components/delivery/DeliveryCard.js';
import CheckoutPanel from '@/components/checkout/CheckoutPanel.js';

/**
 * Subcomponent so useState can live outside the switch-case in RenderEventView.
 * Starts open; the X button closes it in-place without unmounting the message.
 */
function ProductDetailEvent({
  product,
  onAddToCart,
}: {
  product: UIProduct;
  onAddToCart: (p: UIProduct) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(true);
  return (
    <ProductDetailDrawer
      product={open ? product : null}
      onClose={() => setOpen(false)}
      onAddToCart={onAddToCart}
    />
  );
}

interface RenderEventViewProps {
  event: RenderEvent;
  isStreaming?: boolean;
  onAddToCart: (product: UIProduct) => void;
  onViewDetail: (product: UIProduct) => void;
  onSendMessage: (text: string) => void;
}

export default function RenderEventView({
  event,
  isStreaming,
  onAddToCart,
  onViewDetail,
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
        />
      );

    case 'PRODUCT_DETAIL':
      return <ProductDetailEvent product={event.product} onAddToCart={onAddToCart} />;

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
        <div className="flex flex-wrap gap-2 mt-2">
          {event.products.slice(0, 3).map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onSendMessage(`Tell me more about ${product.name}`)}
              className="inline-flex items-center border border-gray-200 rounded-full text-xs px-3 py-1 gap-1 hover:bg-gray-50 transition-colors text-gray-700"
            >
              {product.name.length > 30 ? `${product.name.slice(0, 30)}…` : product.name}
            </button>
          ))}
        </div>
      );

    case 'ERROR':
      return <p className="text-sm text-red-500 mt-1">{event.message}</p>;

    default:
      return null;
  }
}
