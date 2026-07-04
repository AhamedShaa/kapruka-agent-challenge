'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export interface BuyNowFormValues {
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  recipientCity: string;
  deliveryDate: string;
  senderName: string;
  senderPhone: string;
  giftMessage: string;
}

interface BuyNowModalProps {
  isOpen: boolean;
  productName: string;
  prefill: { recipientName?: string; recipientCity?: string };
  isSubmitting: boolean;
  onSubmit: (values: BuyNowFormValues) => void;
  onClose: () => void;
}

function tomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function BuyNowModal({
  isOpen,
  productName,
  prefill,
  isSubmitting,
  onSubmit,
  onClose,
}: BuyNowModalProps): React.JSX.Element {
  const [form, setForm] = useState<BuyNowFormValues>({
    recipientName: prefill.recipientName ?? '',
    recipientPhone: '',
    recipientAddress: '',
    recipientCity: prefill.recipientCity ?? '',
    deliveryDate: tomorrowDate(),
    senderName: '',
    senderPhone: '',
    giftMessage: '',
  });

  function set(field: keyof BuyNowFormValues, value: string): void {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const required: (keyof BuyNowFormValues)[] = [
    'recipientName', 'recipientPhone', 'recipientAddress',
    'recipientCity', 'deliveryDate', 'senderName', 'senderPhone',
  ];
  const canSubmit = required.every((k) => form[k].trim().length > 0);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (canSubmit) onSubmit(form);
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/50 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Delivery details"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', damping: 30, stiffness: 350 }}
          >
            <div
              className="bg-white dark:bg-[#201C2C] rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-[#3A3350]">
                <div>
                  <p className="text-xs text-gray-500 dark:text-[#A79FBB] font-ui">Buy now</p>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-[#F2F0F5] font-ui truncate max-w-[280px]">
                    {productName}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="text-gray-400 dark:text-[#A79FBB] hover:text-gray-600 dark:hover:text-[#F2F0F5] transition-colors duration-150"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
                {/* Recipient */}
                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold text-gray-500 dark:text-[#A79FBB] uppercase tracking-wide font-ui">
                    Recipient
                  </legend>
                  <Field label="Full name" required>
                    <input
                      type="text"
                      value={form.recipientName}
                      onChange={(e) => set('recipientName', e.target.value)}
                      placeholder="e.g. Nimal Perera"
                      className={inputCls}
                      required
                    />
                  </Field>
                  <Field label="Phone" required>
                    <input
                      type="tel"
                      value={form.recipientPhone}
                      onChange={(e) => set('recipientPhone', e.target.value)}
                      placeholder="e.g. 0771234567"
                      className={inputCls}
                      required
                    />
                  </Field>
                  <Field label="Address" required>
                    <input
                      type="text"
                      value={form.recipientAddress}
                      onChange={(e) => set('recipientAddress', e.target.value)}
                      placeholder="Street / building number"
                      className={inputCls}
                      required
                    />
                  </Field>
                  <Field label="City" required>
                    <input
                      type="text"
                      value={form.recipientCity}
                      onChange={(e) => set('recipientCity', e.target.value)}
                      placeholder="e.g. Colombo"
                      className={inputCls}
                      required
                    />
                  </Field>
                </fieldset>

                {/* Delivery */}
                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold text-gray-500 dark:text-[#A79FBB] uppercase tracking-wide font-ui">
                    Delivery
                  </legend>
                  <Field label="Delivery date" required>
                    <input
                      type="date"
                      value={form.deliveryDate}
                      min={tomorrowDate()}
                      onChange={(e) => set('deliveryDate', e.target.value)}
                      className={inputCls}
                      required
                    />
                  </Field>
                  <Field label="Gift message (optional)">
                    <input
                      type="text"
                      value={form.giftMessage}
                      onChange={(e) => set('giftMessage', e.target.value)}
                      placeholder="Happy birthday!"
                      className={inputCls}
                    />
                  </Field>
                </fieldset>

                {/* Sender */}
                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold text-gray-500 dark:text-[#A79FBB] uppercase tracking-wide font-ui">
                    Sender (you)
                  </legend>
                  <Field label="Your name" required>
                    <input
                      type="text"
                      value={form.senderName}
                      onChange={(e) => set('senderName', e.target.value)}
                      placeholder="Your full name"
                      className={inputCls}
                      required
                    />
                  </Field>
                  <Field label="Your phone" required>
                    <input
                      type="tel"
                      value={form.senderPhone}
                      onChange={(e) => set('senderPhone', e.target.value)}
                      placeholder="e.g. 0771234567"
                      className={inputCls}
                      required
                    />
                  </Field>
                </fieldset>

                <button
                  type="submit"
                  disabled={!canSubmit || isSubmitting}
                  className={[
                    'w-full py-3 rounded-xl text-sm font-semibold font-ui',
                    'bg-yellow-500 text-purple-700',
                    'hover:bg-yellow-400',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                    'transition-colors duration-150 motion-reduce:transition-none',
                    'focus-visible:outline-none focus-visible:shadow-focus',
                  ].join(' ')}
                >
                  {isSubmitting ? 'Creating order…' : 'Create order →'}
                </button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-600 dark:text-[#A79FBB] font-ui">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls = [
  'w-full rounded-lg px-3 py-2 text-sm font-body',
  'border border-gray-200 dark:border-[#3A3350]',
  'bg-white dark:bg-[#2A2438]',
  'text-gray-900 dark:text-[#F2F0F5]',
  'placeholder:text-gray-400 dark:placeholder:text-[#5A5370]',
  'focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-[#B49FDD]',
  'transition-colors duration-150',
].join(' ');
