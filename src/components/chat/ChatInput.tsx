'use client';

import { useRef } from 'react';
import { ArrowUp } from 'lucide-react';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);

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
    <div className="flex items-end gap-2">
      <textarea
        ref={ref}
        rows={1}
        placeholder="Message Kasun…"
        disabled={disabled}
        className="flex-1 resize-none rounded-xl border border-gray-200 focus:border-gray-400 focus:outline-none transition-colors px-4 py-3 text-sm leading-relaxed max-h-24 overflow-y-auto disabled:opacity-50"
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
        className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-lg flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ArrowUp className="w-4 h-4" />
      </button>
    </div>
  );
}
