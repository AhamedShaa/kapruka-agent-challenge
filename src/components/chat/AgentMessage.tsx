'use client';

interface AgentMessageProps {
  children: React.ReactNode;
  showAvatar?: boolean;
}

function KasunAvatar(): React.JSX.Element {
  return (
    <div
      className="w-7 h-7 rounded-full bg-yellow-500 flex items-center justify-center flex-shrink-0 mt-0.5"
      aria-hidden="true"
    >
      <span className="text-purple-700 text-[11px] font-bold font-ui select-none">K</span>
    </div>
  );
}

export default function AgentMessage({
  children,
  showAvatar = false,
}: AgentMessageProps): React.JSX.Element {
  return (
    <div className="flex items-start gap-2">
      {/* Avatar or spacer — spacer keeps bubbles left-aligned across the full run */}
      {showAvatar ? <KasunAvatar /> : <div className="w-7 flex-shrink-0" aria-hidden="true" />}

      <div
        className={[
          'bg-white dark:bg-[#201C2C] border border-gray-100 dark:border-[#3A3350]',
          'rounded-2xl rounded-bl-sm',
          'px-4 py-2.5',
          'font-body text-sm leading-relaxed text-gray-800 dark:text-[#F2F0F5]',
          'max-w-[85%]',
        ].join(' ')}
      >
        {children}
      </div>
    </div>
  );
}
