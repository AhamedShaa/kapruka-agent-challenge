import type { CommercePort } from '@/core/ports/commerce.port.js';
import { KaprukaAdapter, type CommerceMode } from './kapruka.adapter.js';

let _adapter: CommercePort | null = null;

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
