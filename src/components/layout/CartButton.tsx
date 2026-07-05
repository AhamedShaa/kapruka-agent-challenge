'use client';

import { ShoppingCart } from 'lucide-react';

interface CartButtonProps {
  cartCount: number;
  onCartOpen: () => void;
}

export default function CartButton({ cartCount, onCartOpen }: CartButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onCartOpen}
      aria-label={`Cart — ${cartCount} item${cartCount !== 1 ? 's' : ''}`}
      className={[
        'fixed top-3 right-4 z-50 p-2 rounded-full',
        'text-gray-500 dark:text-[#A79FBB] hover:text-gray-900 dark:hover:text-[#F2F0F5]',
        'transition-colors duration-150 motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:shadow-focus',
      ].join(' ')}
    >
      <ShoppingCart className="w-5 h-5" aria-hidden="true" />
      {cartCount > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-0.5 bg-yellow-500 text-purple-700 text-[10px] font-bold font-ui rounded-full flex items-center justify-center tabular-nums"
          aria-hidden="true"
        >
          {cartCount > 9 ? '9+' : cartCount}
        </span>
      )}
    </button>
  );
}
