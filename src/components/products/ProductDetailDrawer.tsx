'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Package } from 'lucide-react';
import { useState } from 'react';
import type { UIProduct } from '@/agent/state.js';

interface ProductDetailDrawerProps {
  product: UIProduct | null;
  onClose: () => void;
  onAddToCart: (product: UIProduct) => void;
}

export default function ProductDetailDrawer({
  product,
  onClose,
  onAddToCart,
}: ProductDetailDrawerProps): React.JSX.Element {
  const [imgError, setImgError] = useState(false);

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
            className="fixed inset-y-0 right-0 w-[360px] max-w-full bg-white shadow-xl z-50 flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <span className="text-sm font-medium text-gray-500">Product details</span>
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {imgError ? (
                <div className="w-full h-56 bg-gray-100 rounded-xl flex items-center justify-center">
                  <Package className="w-12 h-12 text-gray-300" />
                </div>
              ) : (
                <img
                  src={product.image_url}
                  alt={product.name}
                  loading="lazy"
                  className="w-full h-56 object-cover rounded-xl"
                  onError={() => setImgError(true)}
                />
              )}

              <h2 className="text-lg font-semibold text-gray-900 mt-3">{product.name}</h2>
              <p className="text-xl font-bold text-emerald-600 mt-1">
                LKR {product.price.toLocaleString()}
              </p>

              {(product.visual_description || product.description) && (
                <p className="text-sm text-gray-600 mt-3 leading-relaxed">
                  {product.visual_description || product.description}
                </p>
              )}
            </div>

            <div className="p-4 border-t">
              <button
                type="button"
                onClick={() => {
                  onAddToCart(product);
                  onClose();
                }}
                className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-blue-700 transition-colors"
              >
                Add to Cart
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
