import type { CommercePort } from '@/core/ports/commerce.port.js';
import { logger } from '@/lib/logger.js';
import { KaprukaAdapter, type CommerceMode } from './kapruka.adapter.js';

let _adapter: KaprukaAdapter | null = null;

function resolveMode(): CommerceMode {
  return process.env.COMMERCE_MODE === 'live' ? 'live' : 'mock';
}

/**
 * One adapter instance per process — ensures a single KaprukaLocal instance
 * (one cart, one cache, one rate-limit counter).
 */
export async function getAdapter(): Promise<CommercePort> {
  if (!_adapter) {
    _adapter = await KaprukaAdapter.create(resolveMode());
  }
  return _adapter;
}

/**
 * Explicit coarse-grained reset — tears down the current adapter's connection
 * and drops the singleton so the next getAdapter() rebuilds from scratch.
 * NOT used by the adapter's own per-call reconnect path (kapruka.adapter.ts's
 * callTool/callToolWithRaw): swapping the singleton here would leave any
 * reference already captured for the in-flight request (route.ts, reactiveTurn.ts
 * both grab `adapter` once per request) pointing at an abandoned instance.
 * Intended for out-of-band triggers (ops/health-check tooling) instead.
 */
export async function resetAdapter(): Promise<void> {
  const old = _adapter;
  _adapter = null;
  if (old) {
    await old.shutdown().catch((err: unknown) => {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'error shutting down adapter during reset');
    });
  }
}
