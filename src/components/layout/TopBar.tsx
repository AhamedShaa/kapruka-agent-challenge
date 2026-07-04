'use client';

import { ShoppingCart } from 'lucide-react';

interface TopBarProps {
  cartCount: number;
  onCartOpen: () => void;
}

export default function TopBar({ cartCount, onCartOpen }: TopBarProps): React.JSX.Element {
  return (
    <header
      className="h-14 flex-shrink-0 flex items-center justify-between px-4 bg-white dark:bg-[#201C2C] shadow-xs dark:shadow-none dark:border-b dark:border-[#3A3350] z-10"
      role="banner"
    >
      {/* Logo */}
      <div className="flex items-baseline gap-1.5">
        <span className="font-semibold text-base text-gray-900 dark:text-[#F2F0F5] font-ui tracking-tight">
          Kasun
        </span>
        <span className="text-xs text-gray-400 dark:text-[#A79FBB] font-ui hidden sm:inline">
          by Kapruka
        </span>
      </div>

      {/* Cart button */}
      <button
        type="button"
        onClick={onCartOpen}
        aria-label={`Cart — ${cartCount} item${cartCount !== 1 ? 's' : ''}`}
        className={[
          'relative p-2 rounded-full',
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
    </header>
  );
}
