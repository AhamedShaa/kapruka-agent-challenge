'use client';

import type { UIProduct } from '@/agent/state.js';
import ProductCard from './ProductCard.js';
import SkeletonCard from './SkeletonCard.js';

interface ProductCarouselProps {
  products: UIProduct[];
  query: string;
  loading?: boolean;
  onAddToCart: (product: UIProduct) => void;
  onViewDetail: (product: UIProduct) => void;
}

export default function ProductCarousel({
  products,
  query,
  loading,
  onAddToCart,
  onViewDetail,
}: ProductCarouselProps): React.JSX.Element {
  const showSkeleton = loading && products.length === 0;

  return (
    <div className="mt-2">
      <p className="text-xs text-gray-500 mb-2">
        {showSkeleton ? 'Searching…' : `${products.length} result${products.length !== 1 ? 's' : ''} for "${query}"`}
      </p>
      <div className="overflow-x-auto flex gap-3 pb-2 scrollbar-hide">
        {showSkeleton
          ? [0, 1, 2].map((i) => <SkeletonCard key={i} />)
          : products.map((product, i) => (
              <ProductCard
                key={product.id}
                product={product}
                index={i}
                onAddToCart={onAddToCart}
                onViewDetail={onViewDetail}
              />
            ))}
      </div>
    </div>
  );
}
