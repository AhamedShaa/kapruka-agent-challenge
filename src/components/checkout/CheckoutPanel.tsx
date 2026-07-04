'use client';

import { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import ResponseCard from '@/components/ui/ResponseCard.js';

interface CheckoutPanelProps {
  checkoutUrl: string;
  orderId: string;
  total: number;
  expiresAt: string;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function AnimatedCheckmark(): React.JSX.Element {
  const shouldReduce = useReducedMotion();

  return (
    <div className="flex justify-center mb-3">
      <svg
        width="52"
        height="52"
        viewBox="0 0 52 52"
        fill="none"
        aria-hidden="true"
      >
        {/* Static background circle */}
        <circle cx="26" cy="26" r="24" fill="#f8f4ff" />
        {/* Animated circle outline */}
        <motion.circle
          cx="26"
          cy="26"
          r="22"
          stroke="#7a3dd8"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: shouldReduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={shouldReduce ? { duration: 0 } : { duration: 0.3, ease: 'easeOut' }}
        />
        {/* Checkmark stroke draws in after the circle */}
        <motion.path
          d="M16 26 L23 33 L36 19"
          stroke="#402970"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          initial={{ pathLength: shouldReduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={
            shouldReduce
              ? { duration: 0 }
              : { duration: 0.4, ease: 'easeOut', delay: 0.2 }
          }
        />
      </svg>
    </div>
  );
}

export default function CheckoutPanel({
  checkoutUrl,
  orderId,
  total,
  expiresAt,
}: CheckoutPanelProps): React.JSX.Element {
  const expiryMs = new Date(expiresAt).getTime();
  const [remaining, setRemaining] = useState(() => expiryMs - Date.now());

  useEffect(() => {
    const id = setInterval(() => setRemaining(expiryMs - Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiryMs]);

  const isUrgent = remaining < 5 * 60 * 1000;
  const expired = remaining <= 0;

  return (
    <ResponseCard
      icon={<CheckCircle className="w-4 h-4" />}
      title="Order ready to pay"
      rows={[
        { label: 'Order ID', value: orderId },
        { label: 'Total', value: `LKR ${total.toLocaleString()}`, valueClass: 'text-purple-700 text-sm' },
        {
          label: 'Link expires',
          value: expired ? 'Expired' : formatCountdown(remaining),
          valueClass: isUrgent ? 'text-error-500' : undefined,
        },
      ]}
      footer={
        <div className="flex flex-col gap-2">
          <AnimatedCheckmark />
          {!expired ? (
            <button
              type="button"
              onClick={() => window.open(checkoutUrl, '_blank')}
              className={[
                'w-full py-2.5 rounded-lg text-sm font-semibold font-ui',
                'bg-yellow-500 text-purple-700',
                'transition-colors duration-150 motion-reduce:transition-none hover:bg-yellow-400',
                'focus-visible:outline-none focus-visible:shadow-focus',
              ].join(' ')}
            >
              Pay Now →
            </button>
          ) : (
            <p className="text-xs text-error-500 text-center font-ui">
              This link has expired — ask Kasun to create a new order.
            </p>
          )}
          <p className="text-[11px] text-gray-400 text-center font-ui">No account needed</p>
        </div>
      }
    />
  );
}
