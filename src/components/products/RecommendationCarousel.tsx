'use client';

import type { UIProduct } from '@/agent/state.js';
import ProductCard from './ProductCard.js';

interface RecommendationCarouselProps {
  products: UIProduct[];
  onAddToCart: (product: UIProduct) => void;
  onViewDetail: (product: UIProduct) => void;
  onBuyNow: (product: UIProduct) => void;
}

export default function RecommendationCarousel({
  products,
  onAddToCart,
  onViewDetail,
  onBuyNow,
}: RecommendationCarouselProps): React.JSX.Element {
  // Spec: cap at 5 cards at the component level, never change the backend contract
  const display = products.slice(0, 5);

  return (
    <div className="relative mt-2">
      <div className="overflow-x-auto flex gap-3 pb-3 snap-x snap-mandatory scrollbar-hide">
        {display.map((product, i) => (
          <div key={product.id} className="snap-start flex-shrink-0">
            <ProductCard
              product={product}
              index={i}
              onAddToCart={onAddToCart}
              onViewDetail={onViewDetail}
              onBuyNow={onBuyNow}
            />
          </div>
        ))}
      </div>
      {/* Trailing fade — must match page background */}
      {display.length > 1 && (
        <div className="absolute right-0 top-0 bottom-3 w-14 pointer-events-none bg-gradient-to-l from-white dark:from-[#17141F] to-transparent" />
      )}
    </div>
  );
}
