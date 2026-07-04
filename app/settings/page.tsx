'use client';

import { useState } from 'react';

const LANGUAGES = ['English', 'Sinhala', 'Tanglish'] as const;
type Language = (typeof LANGUAGES)[number];

export default function SettingsPage(): React.JSX.Element {
  const [notifications, setNotifications] = useState(true);
  const [language, setLanguage] = useState<Language>('English');

  return (
    <div
      className="min-h-screen px-6 py-10"
      style={{ backgroundColor: 'var(--kapruka-bg)', color: 'var(--kapruka-text)', fontFamily: 'var(--kapruka-font-body)' }}
    >
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6" style={{ fontFamily: 'var(--kapruka-font-heading)' }}>
          Settings
        </h1>

        <section
          className="rounded-xl p-5 mb-6 flex items-center justify-between"
          style={{ backgroundColor: 'var(--kapruka-surface)', border: '1px solid var(--kapruka-border)' }}
        >
          <div>
            <p className="font-medium text-sm">Notifications</p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--kapruka-text-muted)' }}>
              Get updates about your orders and deals.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={notifications}
            onClick={() => setNotifications((v) => !v)}
            className="w-11 h-6 rounded-full relative flex-shrink-0 transition-colors"
            style={{ backgroundColor: notifications ? 'var(--kapruka-primary)' : 'var(--kapruka-border)' }}
          >
            <span
              className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
              style={{
                backgroundColor: 'var(--kapruka-surface)',
                transform: notifications ? 'translateX(22px)' : 'translateX(2px)',
              }}
            />
          </button>
        </section>

        <section
          className="rounded-xl p-5"
          style={{ backgroundColor: 'var(--kapruka-surface)', border: '1px solid var(--kapruka-border)' }}
        >
          <p className="font-medium text-sm mb-1">Language</p>
          <p className="text-sm mb-3" style={{ color: 'var(--kapruka-text-muted)' }}>
            Choose how Kasun talks to you.
          </p>
          <div className="flex gap-2">
            {LANGUAGES.map((lang) => {
              const isActive = language === lang;
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: isActive ? 'var(--kapruka-primary)' : 'transparent',
                    color: isActive ? 'var(--kapruka-primary-fg)' : 'var(--kapruka-text-muted)',
                    border: `1px solid ${isActive ? 'var(--kapruka-primary)' : 'var(--kapruka-border)'}`,
                  }}
                >
                  {lang}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
