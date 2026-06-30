'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus, Trash2 } from 'lucide-react';
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
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-y-0 right-0 w-[320px] max-w-full bg-white shadow-xl z-50 flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-gray-900">Cart ({items.length})</h2>
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {items.length === 0 ? (
                <p className="text-sm text-gray-400 text-center mt-8">Your cart is empty.</p>
              ) : (
                items.map((item) => (
                  <div key={item.productId} className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">LKR {item.price.toLocaleString()} each</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <button
                          type="button"
                          onClick={() => onQuantityChange(item.productId, item.quantity - 1)}
                          className="w-5 h-5 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs text-gray-700 w-4 text-center">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => onQuantityChange(item.productId, item.quantity + 1)}
                          className="w-5 h-5 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove(item.productId)}
                          className="ml-1.5 text-gray-400 hover:text-red-500"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 flex-shrink-0">
                      LKR {(item.price * item.quantity).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>

            {items.length > 0 && (
              <div className="p-4 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900">Total</span>
                  <span className="text-sm font-bold text-gray-900">
                    LKR {total.toLocaleString()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onCheckout}
                  className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors"
                >
                  Checkout
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
