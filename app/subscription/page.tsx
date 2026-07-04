export default function SubscriptionPage(): React.JSX.Element {
  const tiers = [
    { name: 'Kasun Plus', price: 'Rs. 990/mo', perks: ['Priority delivery quotes', 'Faster checkout links', 'Early access to deals'] },
    { name: 'Kasun Pro', price: 'Rs. 1,990/mo', perks: ['Everything in Plus', 'Dedicated gift concierge', 'Free gift wrapping'] },
  ];

  return (
    <div
      className="min-h-screen px-6 py-10"
      style={{ backgroundColor: 'var(--kapruka-bg)', color: 'var(--kapruka-text)', fontFamily: 'var(--kapruka-font-body)' }}
    >
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-1" style={{ fontFamily: 'var(--kapruka-font-heading)' }}>
          Manage Subscription
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--kapruka-text-muted)' }}>
          You currently have no active plan.
        </p>

        <div
          className="rounded-xl p-5 mb-8"
          style={{ backgroundColor: 'var(--kapruka-surface)', border: '1px solid var(--kapruka-border)' }}
        >
          <p className="font-medium">No active plan</p>
          <p className="text-sm mt-1" style={{ color: 'var(--kapruka-text-muted)' }}>
            You&apos;re on the free tier. Upgrade below to unlock perks.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className="rounded-xl p-5 opacity-60 cursor-not-allowed"
              style={{ backgroundColor: 'var(--kapruka-surface)', border: '1px solid var(--kapruka-border)' }}
            >
              <p className="font-semibold" style={{ fontFamily: 'var(--kapruka-font-heading)' }}>{tier.name}</p>
              <p className="text-sm mt-1" style={{ color: 'var(--kapruka-primary)' }}>{tier.price}</p>
              <ul className="mt-3 space-y-1 text-sm" style={{ color: 'var(--kapruka-text-muted)' }}>
                {tier.perks.map((perk) => (
                  <li key={perk}>• {perk}</li>
                ))}
              </ul>
              <button
                type="button"
                disabled
                className="mt-4 w-full rounded-lg py-2 text-sm font-medium cursor-not-allowed"
                style={{ backgroundColor: 'var(--kapruka-primary)', color: 'var(--kapruka-primary-fg)' }}
              >
                Coming soon
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
