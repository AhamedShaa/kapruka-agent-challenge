'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Package } from 'lucide-react';
import type { UIProduct } from '@/agent/state.js';

interface ProductCardProps {
  product: UIProduct;
  index: number;
  onAddToCart: (product: UIProduct) => void;
  onViewDetail: (product: UIProduct) => void;
  onBuyNow: (product: UIProduct) => void;
  variant?: 'list' | 'detail';
}

export default function ProductCard({
  product,
  index,
  onAddToCart,
  onViewDetail,
  onBuyNow,
  variant = 'list',
}: ProductCardProps): React.JSX.Element {
  const [imgError, setImgError] = useState(false);
  const shouldReduce = useReducedMotion();

  const isPageUrl = product.image_url?.includes('/buyonline/');
  const showFallback = imgError || !product.image_url || isPageUrl;

  // §8 badge: vendor name if present, else category. Stock state stacked below.
  const primaryBadge = product.vendor || product.category || null;
  const showOutOfStock = product.in_stock === 'out_of_stock';

  // §8 secondary line: weight if present (vendor is already in badge when available,
  // so weight is the non-duplicate field to surface here).
  const secondaryText = product.weight ?? null;

  if (variant === 'detail') {
    return (
      <motion.div
        className="w-full bg-white dark:bg-[#201C2C] rounded-xl border border-gray-200 dark:border-[#3A3350] shadow-sm dark:shadow-none overflow-hidden flex flex-row transition-[box-shadow,border-color] duration-150 motion-reduce:transition-none hover:shadow-md dark:hover:border-[#A79FBB]"
        initial={shouldReduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduce ? { duration: 0 } : { duration: 0.2 }}
      >
        {/* Left: fixed-width square image */}
        <div className="relative w-32 flex-shrink-0 aspect-square bg-gray-100 dark:bg-[#2A2438] overflow-hidden">
          {showFallback ? (
            <div className={['w-full h-full flex items-center justify-center', showOutOfStock ? 'grayscale' : ''].join(' ')}>
              <Package className="w-8 h-8 text-gray-300 dark:text-[#3A3350]" aria-hidden="true" />
            </div>
          ) : (
            <img
              src={product.image_url}
              alt={product.name}
              loading="lazy"
              className={['w-full h-full object-cover', showOutOfStock ? 'grayscale' : ''].join(' ')}
              onError={() => setImgError(true)}
            />
          )}
          {showOutOfStock && (
            <span className="absolute top-1.5 left-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none bg-red-600 text-white">
              Out of stock
            </span>
          )}
        </div>

        {/* Right: name → price → button */}
        <div className="p-3 flex flex-col flex-1 min-w-0 gap-1">
          <p className="text-sm font-medium text-gray-900 dark:text-[#F2F0F5] line-clamp-2 leading-snug text-left">
            {product.name}
          </p>
          {secondaryText && (
            <p className="text-[11px] text-gray-500 dark:text-[#A79FBB] leading-none font-ui">
              {secondaryText}
            </p>
          )}
          <p className="text-sm font-semibold text-purple-700 dark:text-[#B49FDD] font-ui tabular-nums text-left">
            LKR {product.price.toLocaleString()}
          </p>
          <div className="mt-auto pt-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddToCart(product); }}
              disabled={product.in_stock === 'out_of_stock'}
              className={[
                'text-[11px] font-semibold py-1.5 px-3 rounded-lg',
                'border border-purple-200 dark:border-[#3A3350]',
                'text-purple-700 dark:text-[#B49FDD]',
                'hover:bg-purple-50 dark:hover:bg-[#2A2438]',
                'transition-colors duration-150 motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:shadow-focus',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              Add to cart
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="w-[210px] flex-shrink-0 bg-white dark:bg-[#201C2C] rounded-xl border border-gray-200 dark:border-[#3A3350] shadow-sm dark:shadow-none overflow-hidden flex flex-col transition-[transform,box-shadow,border-color] duration-150 motion-reduce:transition-none hover:shadow-md dark:hover:border-[#A79FBB] hover:-translate-y-0.5"
      initial={shouldReduce || index >= 3 ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduce || index >= 3 ? { duration: 0 } : { delay: index * 0.04, duration: 0.2 }}
    >
      {/* Image — 1:1 aspect, clicking opens detail drawer */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`View details for ${product.name}`}
        className="relative w-full aspect-square overflow-hidden bg-gray-100 dark:bg-[#2A2438] cursor-pointer"
        onClick={() => onViewDetail(product)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onViewDetail(product); }}
      >
        {showFallback ? (
          <div className={['w-full h-full flex items-center justify-center', showOutOfStock ? 'grayscale' : ''].join(' ')}>
            <Package className="w-10 h-10 text-gray-300 dark:text-[#3A3350]" aria-hidden="true" />
          </div>
        ) : (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className={['w-full h-full object-cover', showOutOfStock ? 'grayscale' : ''].join(' ')}
            onError={() => setImgError(true)}
          />
        )}

        {/* §8 badges — top-left overlay */}
        {(primaryBadge || showOutOfStock) && (
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {primaryBadge && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold leading-none bg-white/85 dark:bg-[#201C2C]/85 text-gray-700 dark:text-[#F2F0F5] backdrop-blur-sm">
                {primaryBadge}
              </span>
            )}
            {showOutOfStock && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold leading-none bg-red-600 text-white">
                Out of stock
              </span>
            )}
          </div>
        )}
      </div>

      {/* Card info */}
      <div className="p-3 flex flex-col flex-1 gap-1">
        {/* Name */}
        <p
          className="text-sm font-medium text-gray-900 dark:text-[#F2F0F5] line-clamp-2 leading-snug cursor-pointer"
          onClick={() => onViewDetail(product)}
        >
          {product.name}
        </p>

        {/* Secondary line — weight (or vendor if not in badge) */}
        {secondaryText && (
          <p className="text-[11px] text-gray-500 dark:text-[#A79FBB] leading-none font-ui">
            {secondaryText}
          </p>
        )}

        {/* Price — purple, not yellow (price is information not a CTA) */}
        <p className="text-sm font-semibold text-purple-700 dark:text-[#B49FDD] font-ui tabular-nums">
          LKR {product.price.toLocaleString()}
        </p>

        <div className="mt-auto pt-2 flex gap-1.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onBuyNow(product); }}
            disabled={product.in_stock === 'out_of_stock'}
            className={[
              'flex-1 text-[11px] font-semibold py-1.5 rounded-lg',
              'bg-yellow-500 text-purple-700',
              'hover:bg-yellow-400 transition-colors duration-150 motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:shadow-focus',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            Buy now
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAddToCart(product); }}
            disabled={product.in_stock === 'out_of_stock'}
            className={[
              'flex-1 text-[11px] font-semibold py-1.5 rounded-lg',
              'border border-purple-200 dark:border-[#3A3350]',
              'text-purple-700 dark:text-[#B49FDD]',
              'hover:bg-purple-50 dark:hover:bg-[#2A2438]',
              'transition-colors duration-150 motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:shadow-focus',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            Add to cart
          </button>
        </div>
      </div>
    </motion.div>
  );
}
