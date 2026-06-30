'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Package } from 'lucide-react';
import type { UIProduct } from '@/agent/state.js';

interface ProductCardProps {
  product: UIProduct;
  index: number;
  onAddToCart: (product: UIProduct) => void;
  onViewDetail: (product: UIProduct) => void;
}

export default function ProductCard({
  product,
  index,
  onAddToCart,
  onViewDetail,
}: ProductCardProps): React.JSX.Element {
  const [imgError, setImgError] = useState(false);

  // search_products returns the product page URL in image_url, not an actual image file.
  // get_product returns the real CDN image. Show placeholder for page URLs to avoid
  // a failed network request.
  const isPageUrl = product.image_url?.includes('/buyonline/');
  const showFallback = imgError || !product.image_url || isPageUrl;

  return (
    <motion.div
      className="w-[200px] flex-shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
    >
      {showFallback ? (
        <div className="h-[140px] bg-gray-100 rounded-t-xl flex items-center justify-center">
          <Package className="w-8 h-8 text-gray-300" />
        </div>
      ) : (
        <img
          src={product.image_url}
          alt={product.name}
          loading="lazy"
          className="h-[140px] w-full object-cover rounded-t-xl"
          onError={() => setImgError(true)}
        />
      )}

      <div className="p-3 flex flex-col flex-1">
        <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{product.name}</p>
        <p className="text-sm font-semibold text-emerald-600 mt-1">
          LKR {product.price.toLocaleString()}
        </p>
        <div className="flex items-center gap-1 mt-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${product.in_stock ? 'bg-emerald-500' : 'bg-gray-300'}`}
          />
          <span className={`text-xs ${product.in_stock ? 'text-emerald-500' : 'text-gray-400'}`}>
            {product.in_stock ? 'In stock' : 'Out of stock'}
          </span>
        </div>
        <div className="flex gap-1.5 mt-2">
          <button
            type="button"
            onClick={() => onAddToCart(product)}
            className="flex-1 bg-blue-600 text-white text-xs rounded-lg px-2 py-1.5 font-medium hover:bg-blue-700 transition-colors"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => onViewDetail(product)}
            className="flex-1 border border-gray-200 text-xs rounded-lg px-2 py-1.5 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Details
          </button>
        </div>
      </div>
    </motion.div>
  );
}
