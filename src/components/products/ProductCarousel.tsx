'use client';

import { useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { UIProduct } from '@/agent/state.js';
import ProductCard from './ProductCard.js';
import SkeletonCard from './SkeletonCard.js';

interface ProductCarouselProps {
  products: UIProduct[];
  query: string;
  loading?: boolean;
  onAddToCart: (product: UIProduct) => void;
  onViewDetail: (product: UIProduct) => void;
  onBuyNow: (product: UIProduct) => void;
  onSendMessage?: (text: string) => void;
}

const CARD_STEP = 210 + 12; // w-[210px] + gap-3

export default function ProductCarousel({
  products,
  query,
  loading,
  onAddToCart,
  onViewDetail,
  onBuyNow,
  onSendMessage,
}: ProductCarouselProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  const scroll = useCallback((dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -CARD_STEP : CARD_STEP, behavior: 'smooth' });
  }, []);

  const showSkeleton = loading && products.length === 0;
  const isEmpty = !showSkeleton && products.length === 0;
  const showArrows = !showSkeleton && products.length > 1;

  if (isEmpty) {
    return (
      <div className="mt-2 bg-gray-50 dark:bg-[#201C2C] rounded-xl p-4 max-w-sm">
        <p className="text-sm text-gray-700 dark:text-[#F2F0F5] font-body">
          Couldn&apos;t find anything for{' '}
          <span className="font-medium">&ldquo;{query}&rdquo;</span> — want me to try
          something similar?
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={() => onSendMessage?.(`Find alternatives to ${query}`)}
            className={[
              'text-xs px-3 py-1.5 rounded-full font-ui',
              'border border-purple-200 dark:border-[#3A3350] text-purple-700 dark:text-[#B49FDD]',
              'hover:bg-purple-50 dark:hover:bg-[#2A2438] transition-colors duration-150 motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:shadow-focus',
            ].join(' ')}
          >
            Try similar items →
          </button>
          <button
            type="button"
            onClick={() => onSendMessage?.(`Show me popular products similar to ${query}`)}
            className={[
              'text-xs px-3 py-1.5 rounded-full font-ui',
              'border border-gray-200 dark:border-[#3A3350] text-gray-600 dark:text-[#A79FBB]',
              'hover:bg-gray-100 dark:hover:bg-[#2A2438] transition-colors duration-150 motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:shadow-focus',
            ].join(' ')}
          >
            Browse popular items
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <p className="text-xs text-gray-500 dark:text-[#A79FBB] mb-2 font-ui">
        {showSkeleton
          ? 'Searching…'
          : `${products.length} result${products.length !== 1 ? 's' : ''} for "${query}"`}
      </p>

      {/* Carousel track + arrows */}
      <div className="relative">
        {/* Left arrow — hidden on mobile, fades when at start */}
        {showArrows && (
          <button
            type="button"
            onClick={() => scroll('left')}
            aria-label="Scroll products left"
            tabIndex={canScrollLeft ? 0 : -1}
            className={[
              'absolute left-0 top-[calc(50%-8px)] -translate-y-1/2 z-10',
              'hidden sm:flex items-center justify-center',
              'w-8 h-8 rounded-full bg-white dark:bg-[#201C2C]',
              'shadow-md border border-gray-200 dark:border-[#3A3350]',
              'text-gray-600 dark:text-[#A79FBB]',
              'hover:text-gray-900 dark:hover:text-[#F2F0F5]',
              'transition-opacity duration-150 motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:shadow-focus',
              canScrollLeft ? 'opacity-100' : 'opacity-40 cursor-default',
            ].join(' ')}
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
        )}

        {/* Right arrow — hidden on mobile, fades when at end */}
        {showArrows && (
          <button
            type="button"
            onClick={() => scroll('right')}
            aria-label="Scroll products right"
            tabIndex={canScrollRight ? 0 : -1}
            className={[
              'absolute right-0 top-[calc(50%-8px)] -translate-y-1/2 z-10',
              'hidden sm:flex items-center justify-center',
              'w-8 h-8 rounded-full bg-white dark:bg-[#201C2C]',
              'shadow-md border border-gray-200 dark:border-[#3A3350]',
              'text-gray-600 dark:text-[#A79FBB]',
              'hover:text-gray-900 dark:hover:text-[#F2F0F5]',
              'transition-opacity duration-150 motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:shadow-focus',
              canScrollRight ? 'opacity-100' : 'opacity-40 cursor-default',
            ].join(' ')}
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={updateScrollState}
          className="overflow-x-auto flex gap-3 pb-3 snap-x snap-mandatory scrollbar-hide"
        >
          {showSkeleton
            ? [0, 1, 2].map((i) => (
                <div key={i} className="snap-start flex-shrink-0">
                  <SkeletonCard />
                </div>
              ))
            : products.map((product, i) => (
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

        {/* Trailing gradient — matches page background */}
        {(showSkeleton || products.length > 1) && (
          <div className="absolute right-0 top-0 bottom-3 w-14 pointer-events-none bg-gradient-to-l from-white dark:from-[#17141F] to-transparent" />
        )}
      </div>
    </div>
  );
}
