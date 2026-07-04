'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus, Trash2, Package } from 'lucide-react';
import { useState } from 'react';
import type { UICartItem } from '@/agent/state.js';

interface CartDrawerProps {
  items: UICartItem[];
  total: number;
  isOpen: boolean;
  onClose: () => void;
  onCheckout: () => void;
  onQuantityChange: (productId: string, newQuantity: number) => void;
  onRemove: (productId: string) => void;
}

function CartItemImage({ url, name }: { url: string | null; name: string }): React.JSX.Element {
  const [err, setErr] = useState(false);
  if (!url || err) {
    return (
      <div className="w-12 h-12 bg-gray-100 dark:bg-[#2A2438] rounded-lg flex-shrink-0 flex items-center justify-center" aria-hidden="true">
        <Package className="w-5 h-5 text-gray-300 dark:text-[#3A3350]" aria-hidden="true" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      loading="lazy"
      className="w-12 h-12 rounded-lg flex-shrink-0 object-cover bg-gray-100 dark:bg-[#2A2438]"
      onError={() => setErr(true)}
    />
  );
}

const ICON_BTN =
  'w-7 h-7 flex items-center justify-center rounded border border-gray-200 dark:border-[#3A3350] text-gray-500 dark:text-[#A79FBB] hover:bg-gray-50 dark:hover:bg-[#2A2438] transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:shadow-focus';

export default function CartDrawer({
  items,
  total,
  isOpen,
  onClose,
  onCheckout,
  onQuantityChange,
  onRemove,
}: CartDrawerProps): React.JSX.Element {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Scrim */}
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer */}
          <motion.div
            className="fixed inset-y-0 right-0 w-full md:max-w-sm bg-white dark:bg-[#201C2C] shadow-lg dark:shadow-none dark:border-l dark:border-[#3A3350] z-50 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Shopping cart"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-[#3A3350]">
              <h2 className="font-semibold text-gray-900 dark:text-[#F2F0F5] font-ui">
                Cart
                {items.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400 dark:text-[#A79FBB]">
                    {items.length} item{items.length !== 1 ? 's' : ''}
                  </span>
                )}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close cart"
                className="p-1.5 rounded-full text-gray-400 dark:text-[#A79FBB] hover:text-gray-700 dark:hover:text-[#F2F0F5] hover:bg-gray-100 dark:hover:bg-[#2A2438] transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:shadow-focus"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <p className="text-sm text-gray-400 dark:text-[#A79FBB] font-body">Your cart is empty.</p>
                  <p className="text-xs text-gray-300 dark:text-[#3A3350] mt-1 font-body">
                    Ask Kasun to find something for you.
                  </p>
                </div>
              ) : (
                items.map((item) => (
                  <div key={item.productId} className="flex items-start gap-3">
                    <CartItemImage url={item.image_url ?? null} name={item.name} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-[#F2F0F5] truncate font-body">
                        {item.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-[#A79FBB] mt-0.5 font-ui tabular-nums">
                        LKR {item.price.toLocaleString()} each
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <button
                          type="button"
                          onClick={() => onQuantityChange(item.productId, item.quantity - 1)}
                          className={ICON_BTN}
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-3 h-3" aria-hidden="true" />
                        </button>
                        <span className="text-xs text-gray-700 dark:text-[#F2F0F5] w-5 text-center font-ui tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onQuantityChange(item.productId, item.quantity + 1)}
                          className={ICON_BTN}
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-3 h-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove(item.productId)}
                          aria-label={`Remove ${item.name}`}
                          className="ml-1 p-1 text-gray-400 dark:text-[#A79FBB] hover:text-error-500 rounded transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:shadow-focus"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-[#F2F0F5] flex-shrink-0 font-ui tabular-nums">
                      LKR {(item.price * item.quantity).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="px-5 py-4 border-t border-gray-100 dark:border-[#3A3350] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900 dark:text-[#F2F0F5] font-ui">Total</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-[#F2F0F5] font-ui tabular-nums">
                    LKR {total.toLocaleString()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onCheckout}
                  className={[
                    'w-full py-3 rounded-xl text-sm font-semibold font-ui',
                    'bg-yellow-500 text-purple-700',
                    'transition-colors duration-150 motion-reduce:transition-none hover:bg-yellow-400',
                    'focus-visible:outline-none focus-visible:shadow-focus',
                  ].join(' ')}
                >
                  Ask Kasun to checkout →
                </button>
                <p className="text-[11px] text-gray-400 dark:text-[#A79FBB] text-center font-ui">
                  Kasun will walk you through payment
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
