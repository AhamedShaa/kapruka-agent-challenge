'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const FAQS = [
  {
    q: 'Which areas in Sri Lanka do you deliver to?',
    a: 'Kasun can check delivery availability and fees for any city in Sri Lanka — just tell me the destination city and I’ll confirm coverage and estimated days.',
  },
  {
    q: 'Can I check out as a guest?',
    a: 'Yes — no account is required. Once you confirm an order, I’ll generate a secure pay link that’s valid for 60 minutes.',
  },
  {
    q: 'Can I add a gift message?',
    a: 'Absolutely. Just tell me what you’d like the card to say and who it’s for, and I’ll attach it to the order.',
  },
  {
    q: 'What payment methods are supported?',
    a: 'Payment happens on Kapruka’s secure checkout page after I generate your order link — it supports major cards and local payment options.',
  },
  {
    q: 'How long is my checkout link valid?',
    a: 'Pay links expire 60 minutes after they’re generated. If yours expires, just ask me and I’ll create a fresh one.',
  },
];

const CHANGELOG = [
  { date: '2026-06-28', text: 'Kasun can now suggest alternatives automatically when a search returns few results.' },
  { date: '2026-06-15', text: 'Faster delivery quotes with live rate lookups per city.' },
  { date: '2026-05-30', text: 'Added gift message support at checkout.' },
];

export default function UpdatesPage(): React.JSX.Element {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div
      className="min-h-screen px-6 py-10"
      style={{ backgroundColor: 'var(--kapruka-bg)', color: 'var(--kapruka-text)', fontFamily: 'var(--kapruka-font-body)' }}
    >
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6" style={{ fontFamily: 'var(--kapruka-font-heading)' }}>
          Updates &amp; FAQ
        </h1>

        <section className="mb-10">
          <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--kapruka-text-muted)' }}>
            Frequently asked questions
          </h2>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--kapruka-border)', backgroundColor: 'var(--kapruka-surface)' }}>
            {FAQS.map((item, i) => {
              const isOpen = openIndex === i;
              return (
                <div key={item.q} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--kapruka-border)' }}>
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium"
                  >
                    {item.q}
                    <ChevronDown
                      className="w-4 h-4 flex-shrink-0 transition-transform"
                      style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', color: 'var(--kapruka-text-muted)' }}
                    />
                  </button>
                  {isOpen && (
                    <p className="px-4 pb-3 text-sm" style={{ color: 'var(--kapruka-text-muted)' }}>
                      {item.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--kapruka-text-muted)' }}>
            What&apos;s new
          </h2>
          <ul className="space-y-3">
            {CHANGELOG.map((entry) => (
              <li key={entry.date} className="flex gap-3 text-sm">
                <span className="flex-shrink-0" style={{ color: 'var(--kapruka-text-muted)' }}>{entry.date}</span>
                <span>{entry.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
