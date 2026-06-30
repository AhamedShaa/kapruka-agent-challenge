'use client';

import { useEffect, useState } from 'react';

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

export default function CheckoutPanel({
  checkoutUrl,
  orderId,
  total,
  expiresAt,
}: CheckoutPanelProps): React.JSX.Element {
  const expiryMs = new Date(expiresAt).getTime();
  const [remaining, setRemaining] = useState(() => expiryMs - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(expiryMs - Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [expiryMs]);

  const isUrgent = remaining < 5 * 60 * 1000;
  const expired = remaining <= 0;

  return (
    <div className="border-2 border-blue-200 rounded-xl p-4 max-w-sm mt-2 bg-white">
      <p className="font-semibold text-gray-900 text-sm">Order ready!</p>
      <p className="text-xs text-gray-500 mt-1">Order ID: {orderId}</p>
      <p className="text-sm font-bold text-gray-900 mt-1">LKR {total.toLocaleString()}</p>

      <p className={`text-xs mt-2 font-medium ${isUrgent ? 'text-red-500' : 'text-gray-500'}`}>
        {expired ? 'Link expired' : `Expires in ${formatCountdown(remaining)}`}
      </p>

      {!expired && (
        <button
          type="button"
          onClick={() => window.open(checkoutUrl, '_blank')}
          className="mt-3 w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          Pay Now →
        </button>
      )}
      <p className="text-xs text-gray-400 mt-2 text-center">No account needed</p>
    </div>
  );
}
