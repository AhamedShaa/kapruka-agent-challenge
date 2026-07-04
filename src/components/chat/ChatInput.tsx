'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';

const PLACEHOLDERS = [
  'Search for a birthday gift…',
  'Find flowers for delivery in Colombo…',
  'Show me chocolate boxes under LKR 2000…',
];

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) return;

    const id = setInterval(
      () => setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length),
      4000,
    );
    return () => clearInterval(id);
  }, []);

  function submit(): void {
    const text = ref.current?.value.trim();
    if (!text || disabled) return;
    onSend(text);
    if (ref.current) {
      ref.current.value = '';
      ref.current.style.height = 'auto';
    }
  }

  return (
    <div className="relative flex items-end">
      <textarea
        ref={ref}
        rows={1}
        placeholder={PLACEHOLDERS[placeholderIdx]}
        disabled={disabled}
        className={[
          'w-full resize-none pl-5 pr-14 py-3.5',
          'rounded-full border border-gray-200 dark:border-[#3A3350]',
          'bg-white dark:bg-[#201C2C]',
          'text-sm leading-relaxed text-gray-900 dark:text-[#F2F0F5]',
          'placeholder:text-gray-400 dark:placeholder:text-[#A79FBB]',
          'transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none',
          'hover:border-gray-400 dark:hover:border-[#A79FBB]',
          'focus-visible:outline-none focus-visible:shadow-focus',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'max-h-24 overflow-y-auto scrollbar-hide',
        ].join(' ')}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = 'auto';
          el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        aria-label="Send message"
        className={[
          'absolute right-2 bottom-2',
          'w-9 h-9 rounded-full',
          'bg-yellow-500 text-purple-700',
          'flex items-center justify-center flex-shrink-0',
          'transition-colors duration-150 motion-reduce:transition-none',
          'hover:bg-yellow-400',
          'focus-visible:outline-none focus-visible:shadow-focus',
          'disabled:opacity-40 disabled:cursor-not-allowed',
        ].join(' ')}
      >
        <ArrowUp className="w-4 h-4" />
      </button>
    </div>
  );
}
