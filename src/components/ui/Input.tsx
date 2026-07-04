'use client';

import { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  errorMessage?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ error = false, errorMessage, className = '', ...props }, ref) {
    return (
      <div className="flex flex-col gap-1">
        <input
          ref={ref}
          className={[
            'w-full px-4 py-2.5 text-sm rounded-md border bg-white',
            'text-gray-900 placeholder:text-gray-400',
            'transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:shadow-focus',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50',
            error
              ? 'border-error-500 bg-error-50 hover:border-error-500'
              : 'border-gray-200 hover:border-gray-400',
            className,
          ].join(' ')}
          aria-invalid={error ? 'true' : undefined}
          {...props}
        />
        {error && errorMessage && (
          <p className="text-xs text-error-500" role="alert">
            {errorMessage}
          </p>
        )}
      </div>
    );
  },
);
