'use client';

interface UserMessageProps {
  children: React.ReactNode;
}

export default function UserMessage({ children }: UserMessageProps): React.JSX.Element {
  return (
    <div className="flex justify-end">
      <div
        className={[
          'bg-purple-500 text-white',
          'rounded-2xl rounded-br-sm',   /* sharp bottom-right — the "tail" corner */
          'px-4 py-2.5',
          'font-body text-sm leading-relaxed',
          'max-w-[80%] whitespace-pre-wrap',
        ].join(' ')}
      >
        {children}
      </div>
    </div>
  );
}
