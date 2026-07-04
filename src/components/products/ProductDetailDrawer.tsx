'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, Globe } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { UIProduct } from '@/agent/state.js';

interface ProductDetailDrawerProps {
  product: UIProduct | null;
  onClose: () => void;
  onAddToCart: (product: UIProduct, qty: number) => void;
  onBuyNow: (product: UIProduct, qty: number) => void;
}

export default function ProductDetailDrawer({
  product,
  onClose,
  onAddToCart,
  onBuyNow,
}: ProductDetailDrawerProps): React.JSX.Element {
  const [qty, setQty] = useState(1);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setQty(1);
    setImgError(false);
  }, [product?.id]);

  const isOutOfStock = product?.in_stock === 'out_of_stock';
  const isLowStock = product?.in_stock === 'low_stock';

  return (
    <AnimatePresence>
      {product && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-y-0 right-0 w-[380px] max-w-full bg-white dark:bg-[#201C2C] shadow-xl dark:shadow-none dark:border-l dark:border-[#3A3350] z-50 flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-[#3A3350] flex-shrink-0">
              <span className="text-sm font-medium text-gray-500 dark:text-[#A79FBB] font-ui">
                Product details
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close product details"
                className="text-gray-400 dark:text-[#A79FBB] hover:text-gray-600 dark:hover:text-[#F2F0F5] transition-colors duration-150"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Hero image */}
              {!product.image_url || imgError ? (
                <div className="w-full aspect-square bg-gray-100 dark:bg-[#2A2438] flex items-center justify-center">
                  <Package className="w-16 h-16 text-gray-300 dark:text-[#3A3350]" />
                </div>
              ) : (
                <img
                  src={product.image_url}
                  alt={product.name}
                  loading="lazy"
                  className="w-full aspect-square object-cover"
                  onError={() => setImgError(true)}
                />
              )}

              <div className="p-4 space-y-3">
                {/* Stock badges */}
                {(isOutOfStock || isLowStock) && (
                  <div className="flex gap-2">
                    {isOutOfStock && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        Out of stock
                      </span>
                    )}
                    {isLowStock && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        Low stock
                      </span>
                    )}
                  </div>
                )}

                {/* Name */}
                <h2 className="text-[20px] leading-[28px] font-semibold text-gray-900 dark:text-[#F2F0F5]">
                  {product.name}
                </h2>

                {/* Price */}
                <p className="text-[18px] leading-[24px] font-bold tabular-nums font-ui text-purple-700 dark:text-[#B49FDD]">
                  LKR {product.price.toLocaleString()}
                </p>

                {/* Vendor badge */}
                {product.vendor && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-[#B49FDD]">
                    {product.vendor}
                  </span>
                )}

                {/* Metadata: weight + international shipping */}
                {(product.weight || (product.international_shipping !== null && product.international_shipping !== undefined)) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-[#A79FBB]">
                    {product.weight && (
                      <span>Weight: {product.weight}</span>
                    )}
                    {product.international_shipping !== null && product.international_shipping !== undefined && (
                      <span className="flex items-center gap-1">
                        <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                        {product.international_shipping ? 'Ships internationally' : 'Sri Lanka only'}
                      </span>
                    )}
                  </div>
                )}

                {/* Description */}
                {product.description && (
                  <p className="text-sm text-gray-600 dark:text-[#A79FBB] leading-relaxed font-body">
                    {product.description}
                  </p>
                )}

                {/* Quantity stepper */}
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-[#D0C8E8] font-ui">Qty</span>
                  <div className="flex items-center border border-gray-200 dark:border-[#3A3350] rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      disabled={qty <= 1}
                      aria-label="Decrease quantity"
                      className="w-9 h-9 flex items-center justify-center text-lg text-gray-600 dark:text-[#D0C8E8] hover:bg-gray-50 dark:hover:bg-[#2A2438] disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
                    >
                      −
                    </button>
                    <span className="w-10 text-center text-sm font-semibold font-ui text-gray-900 dark:text-[#F2F0F5] select-none">
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQty((q) => q + 1)}
                      disabled={isOutOfStock}
                      aria-label="Increase quantity"
                      className="w-9 h-9 flex items-center justify-center text-lg text-gray-600 dark:text-[#D0C8E8] hover:bg-gray-50 dark:hover:bg-[#2A2438] disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="p-4 border-t border-gray-100 dark:border-[#3A3350] flex flex-col gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => { onAddToCart(product, qty); onClose(); }}
                disabled={isOutOfStock}
                className={[
                  'w-full rounded-xl py-3 font-semibold text-sm font-ui',
                  'border-2 border-purple-600 text-purple-600',
                  'dark:border-[#B49FDD] dark:text-[#B49FDD]',
                  'hover:bg-purple-50 dark:hover:bg-purple-900/20',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  'transition-colors duration-150 motion-reduce:transition-none',
                  'focus-visible:outline-none focus-visible:shadow-focus',
                ].join(' ')}
              >
                Add to cart ({qty})
              </button>
              <button
                type="button"
                onClick={() => { onBuyNow(product, qty); onClose(); }}
                disabled={isOutOfStock}
                className={[
                  'w-full rounded-xl py-3 font-semibold text-sm font-ui',
                  'bg-yellow-500 text-purple-700',
                  'hover:bg-yellow-400',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  'transition-colors duration-150 motion-reduce:transition-none',
                  'focus-visible:outline-none focus-visible:shadow-focus',
                ].join(' ')}
              >
                Buy now ({qty})
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
