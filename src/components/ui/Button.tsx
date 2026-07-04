'use client';

import { forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  // Yellow fill, purple-700 text — NEVER white on yellow (contrast failure)
  primary:
    'bg-yellow-500 text-purple-700 hover:bg-yellow-400',
  secondary:
    'bg-white text-purple-700 border border-purple-200 hover:bg-purple-50',
  ghost:
    'bg-transparent text-purple-700 hover:bg-purple-50',
  destructive:
    'bg-error-500 text-white hover:bg-error-700',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-md min-w-[4rem]',
  md: 'px-4 py-2 text-sm rounded-lg min-w-[5rem]',
  lg: 'px-6 py-3 text-base rounded-lg min-w-[6rem]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = 'primary', size = 'md', loading = false, disabled, className = '', children, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          'relative inline-flex items-center justify-center font-medium',
          'transition-colors duration-150 motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:shadow-focus',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(' ')}
        {...props}
      >
        {/* Text is invisible (not removed) while loading so the button keeps its width */}
        <span className={loading ? 'invisible' : undefined}>{children}</span>
        {loading && (
          <span
            className="absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4"
                className="opacity-25"
              />
              <path
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                className="opacity-75"
              />
            </svg>
          </span>
        )}
      </button>
    );
  },
);
