import { NextResponse } from 'next/server';

import { getAdapter } from '@/adapters/index.js';
import { logger } from '@/lib/logger.js';

export const runtime = 'nodejs';

const HEALTH_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Health check timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

export async function GET(): Promise<NextResponse> {
  const mode = process.env.COMMERCE_MODE === 'live' ? 'live' : 'mock';

  try {
    const categories = await withTimeout(
      (async () => {
        const adapter = await getAdapter();
        return adapter.listCategories();
      })(),
      HEALTH_TIMEOUT_MS,
    );

    return NextResponse.json({
      ok: true,
      mode,
      sdkReachable: true,
      timestamp: new Date().toISOString(),
      categories: categories.length,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error({ err: error.message, mode }, 'health check failed');

    return NextResponse.json({
      ok: false,
      mode,
      error: error.message,
      sdkReachable: false,
    });
  }
}
