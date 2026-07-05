import type { ReactNode } from 'react';

export interface ResponseCardRow {
  label: string;
  value: string;
  valueClass?: string;
}

interface ResponseCardProps {
  icon: ReactNode;
  title: string;
  rows?: ResponseCardRow[];
  variant?: 'default' | 'error';
  footer?: ReactNode;
}

const VARIANT = {
  default: {
    border: 'border-l-purple-500 dark:border-l-[#B49FDD]',
    bg:     'bg-purple-50 dark:bg-[#201C2C]',
    title:  'text-purple-900 dark:text-[#B49FDD]',
  },
  error: {
    border: 'border-l-error-500',
    bg:     'bg-error-50 dark:bg-[#2A2438]',
    title:  'text-error-700 dark:text-[#F2F0F5]',
  },
} as const;

export default function ResponseCard({
  icon,
  title,
  rows = [],
  variant = 'default',
  footer,
}: ResponseCardProps): React.JSX.Element {
  const v = VARIANT[variant];

  return (
    <div
      className={[
        'border-l-[3px] rounded-r-xl px-4 py-3.5 w-full',
        v.border,
        v.bg,
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className={`flex-shrink-0 ${v.title}`} aria-hidden="true">
          {icon}
        </span>
        <p className={`text-sm font-semibold font-ui ${v.title}`}>{title}</p>
      </div>

      {/* Key-value rows */}
      {rows.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between items-baseline gap-4">
              <span className="text-xs text-gray-500 dark:text-[#A79FBB]">{row.label}</span>
              <span
                className={[
                  'text-xs font-semibold text-gray-900 dark:text-[#F2F0F5] text-right font-ui tabular-nums',
                  row.valueClass ?? '',
                ].join(' ')}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Optional footer (CTAs, notes, animated elements) */}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}
