'use client';

import { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Search,
  Package,
  Bell,
  Settings,
  Moon,
  ArrowLeft,
} from 'lucide-react';
import { useTheme } from 'next-themes';

type SidebarView = 'nav' | 'settings' | 'subscriptions' | 'faq';

const TOAST_MSG: Record<string, string> = {
  chats:  "Your chat history is brewing — coming soon!",
  search: "Browse search is on the way. For now, just ask me!",
};

interface NavItem {
  key: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: 'true' }>;
  panelView: SidebarView | null;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'chats',         label: 'Chats',               Icon: MessageSquare, panelView: null             },
  { key: 'search',        label: 'Search',               Icon: Search,        panelView: null             },
  { key: 'subscriptions', label: 'Manage Subscriptions', Icon: Package,       panelView: 'subscriptions'  },
  { key: 'faq',           label: 'Updates & FAQ',        Icon: Bell,          panelView: 'faq'            },
];

export default function Sidebar(): React.JSX.Element {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [view, setView] = useState<SidebarView>('nav');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('kasun_sidebar_collapsed');
    setIsCollapsed(stored !== 'false');
  }, []);

  // Collapse when user clicks outside the sidebar
  useEffect(() => {
    if (isCollapsed) return;
    function handleClickOutside(e: MouseEvent): void {
      if (asideRef.current && !asideRef.current.contains(e.target as Node)) {
        setIsCollapsed(true);
        window.localStorage.setItem('kasun_sidebar_collapsed', 'true');
        setView('nav');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCollapsed]);

  function expand(): void {
    setIsCollapsed(false);
    window.localStorage.setItem('kasun_sidebar_collapsed', 'false');
  }

  function toggleCollapse(): void {
    const next = !isCollapsed;
    setIsCollapsed(next);
    window.localStorage.setItem('kasun_sidebar_collapsed', String(next));
    if (next) setView('nav');
  }

  function showToast(key: string): void {
    setToast(key);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }

  function handleNavClick(key: string, panelView: SidebarView | null): void {
    if (panelView) {
      if (isCollapsed) expand();
      setView(panelView);
    } else {
      showToast(key);
    }
  }

  function openSettings(): void {
    if (isCollapsed) expand();
    setView('settings');
  }

  const W = isCollapsed ? 'w-14' : 'w-64';

  const itemCls = (active = false) =>
    [
      'w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg',
      'transition-colors duration-150 motion-reduce:transition-none',
      'focus-visible:outline-none focus-visible:shadow-focus',
      active
        ? 'bg-purple-50 dark:bg-[#2A2438] text-purple-700 dark:text-[#B49FDD]'
        : 'text-gray-500 dark:text-[#A79FBB] hover:text-gray-900 dark:hover:text-[#F2F0F5] hover:bg-gray-50 dark:hover:bg-[#2A2438]',
      isCollapsed ? 'justify-center' : '',
    ].join(' ');

  return (
    <>
      <aside
        ref={asideRef}
        className={[
          'hidden md:flex flex-col flex-shrink-0 h-full',
          'bg-white dark:bg-[#201C2C] border-r border-gray-100 dark:border-[#3A3350]',
          'transition-[width] duration-200 ease-in-out overflow-x-hidden',
          W,
        ].join(' ')}
        aria-label="Navigation"
      >
        {/* Logo — click to toggle collapse */}
        <button
          type="button"
          onClick={toggleCollapse}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!isCollapsed}
          className={[
            'h-14 flex items-center flex-shrink-0 gap-2.5 w-full',
            'border-b border-gray-50 dark:border-[#3A3350]',
            'hover:bg-gray-50 dark:hover:bg-[#2A2438]',
            'transition-colors duration-150 motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:shadow-focus',
            isCollapsed ? 'justify-center px-0' : 'px-3',
          ].join(' ')}
        >
          {/* Logo mark — swap src for real asset once placed in public/ */}
          <div
            className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #402970, #FFB800)' }}
            aria-hidden="true"
          >
            <img src="/kapruka-logo.png" alt="" className="w-full h-full object-contain" />
          </div>
          {!isCollapsed && (
            <span className="flex-1 font-semibold text-sm text-gray-900 dark:text-[#F2F0F5] font-body tracking-tight truncate text-left">
              Kapruka
            </span>
          )}
        </button>

        {/* Scrollable content area — nav or one of the content panels */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {view === 'settings' ? (
            <SettingsPanel isCollapsed={isCollapsed} onBack={() => setView('nav')} />
          ) : view === 'subscriptions' ? (
            <SubscriptionsPanel isCollapsed={isCollapsed} onBack={() => setView('nav')} />
          ) : view === 'faq' ? (
            <FaqPanel isCollapsed={isCollapsed} onBack={() => setView('nav')} />
          ) : (
            <nav className="flex flex-col gap-0.5 px-2" aria-label="Main">
              {NAV_ITEMS.map(({ key, label, Icon, panelView }) => (
                <button
                  key={key}
                  type="button"
                  title={isCollapsed ? label : undefined}
                  onClick={() => handleNavClick(key, panelView)}
                  className={itemCls()}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                  {!isCollapsed && (
                    <span className="text-sm font-ui truncate">{label}</span>
                  )}
                </button>
              ))}
            </nav>
          )}
        </div>

        {/* Settings — always at bottom, separated by a top border */}
        {view === 'nav' && (
          <div className="flex-shrink-0 border-t border-gray-100 dark:border-[#3A3350] px-2 py-2">
            <button
              type="button"
              title={isCollapsed ? 'Settings' : undefined}
              onClick={openSettings}
              className={itemCls()}
            >
              <Settings className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              {!isCollapsed && (
                <span className="text-sm font-ui">Settings</span>
              )}
            </button>
          </div>
        )}
      </aside>

      {/* Coming-soon toast — fixed so it escapes the sidebar's overflow:hidden */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 left-20 z-50 bg-gray-900 text-white text-sm rounded-xl px-4 py-2.5 shadow-lg pointer-events-none max-w-[240px]"
        >
          {TOAST_MSG[toast]}
        </div>
      )}
    </>
  );
}

// ─── Shared panel header ──────────────────────────────────────────────────────

interface PanelProps { isCollapsed: boolean; onBack: () => void; }

function PanelHeader({ label, isCollapsed, onBack }: PanelProps & { label: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 mb-1">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to navigation"
        className={[
          'p-1 rounded-lg text-gray-400 dark:text-[#A79FBB]',
          'hover:text-gray-700 dark:hover:text-[#F2F0F5] hover:bg-gray-100 dark:hover:bg-[#2A2438]',
          'transition-colors duration-150 motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:shadow-focus',
        ].join(' ')}
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      {!isCollapsed && (
        <h2 className="text-[11px] font-semibold text-gray-400 dark:text-[#A79FBB] font-ui uppercase tracking-widest truncate">
          {label}
        </h2>
      )}
    </div>
  );
}

// ─── Settings panel ──────────────────────────────────────────────────────────

function SettingsPanel({ isCollapsed, onBack }: PanelProps): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="px-2 py-1">
      <PanelHeader label="Settings" isCollapsed={isCollapsed} onBack={onBack} />
      {!isCollapsed && (
        <div className="px-1 space-y-4">
          <div className="flex items-center justify-between px-1.5 py-1">
            <div className="flex items-center gap-2.5">
              <Moon className="w-4 h-4 text-gray-400 dark:text-[#A79FBB]" aria-hidden="true" />
              <span className="text-sm text-gray-700 dark:text-[#F2F0F5] font-ui">Dark mode</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isDark}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={[
                'relative w-9 h-5 rounded-full transition-colors duration-200',
                isDark ? 'bg-purple-600' : 'bg-gray-200',
                'focus-visible:outline-none focus-visible:shadow-focus',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute top-1 w-3 h-3 rounded-full bg-white shadow-sm transition-transform duration-200',
                  isDark ? 'left-1 translate-x-4' : 'left-1',
                ].join(' ')}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Manage Subscriptions panel ───────────────────────────────────────────────

function SubscriptionsPanel({ isCollapsed, onBack }: PanelProps): React.JSX.Element {
  return (
    <div className="px-2 py-1">
      <PanelHeader label="Manage Subscriptions" isCollapsed={isCollapsed} onBack={onBack} />
      {!isCollapsed && (
        <div className="px-3 py-2 space-y-3">
          <p className="text-sm text-gray-700 dark:text-[#F2F0F5] font-ui leading-relaxed">
            Kapruka works on guest checkout — no account, no subscription, no hassle.
          </p>
          <p className="text-sm text-gray-500 dark:text-[#A79FBB] font-ui leading-relaxed">
            Each order is self-contained: you pick a product, choose delivery, and you&apos;re done.
            If you were looking for a &ldquo;manage subscriptions&rdquo; page — good news, there&apos;s
            nothing to manage. Every order stands alone.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Updates & FAQ panel ─────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: 'Where does Kapruka deliver?',
    a: 'Across all of Sri Lanka — mainland cities and islands. Standard delivery is 1–3 business days; remote areas may take a day longer. Same-day delivery is available on select products in Colombo.',
  },
  {
    q: 'Do I need an account to order?',
    a: 'No. Kapruka uses guest checkout — enter your delivery details at checkout and you\'re done. No sign-up, no password.',
  },
  {
    q: 'How do I pay?',
    a: 'Major credit and debit cards, plus online banking. All payments go through Kapruka\'s secure checkout page.',
  },
  {
    q: 'Can I add a gift message?',
    a: 'Yes — when you\'re ready to order, just let me know and I\'ll make sure we include a note. You can also add one directly on the Kapruka checkout page.',
  },
  {
    q: 'What languages do you understand?',
    a: 'English, Sinhala, and Tanglish (Sinhala written in English letters). Just write to me however feels natural and I\'ll reply in kind.',
  },
];

function FaqPanel({ isCollapsed, onBack }: PanelProps): React.JSX.Element {
  return (
    <div className="px-2 py-1">
      <PanelHeader label="Updates & FAQ" isCollapsed={isCollapsed} onBack={onBack} />
      {!isCollapsed && (
        <div className="px-1 pb-2 space-y-4">
          {FAQ_ITEMS.map(({ q, a }) => (
            <div key={q} className="px-1.5 space-y-1">
              <p className="text-xs font-semibold text-gray-800 dark:text-[#F2F0F5] font-ui">{q}</p>
              <p className="text-xs text-gray-500 dark:text-[#A79FBB] font-ui leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
