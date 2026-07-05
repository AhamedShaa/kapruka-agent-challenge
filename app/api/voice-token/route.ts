import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger.js';

export const runtime = 'nodejs';

const VOCAL_BRIDGE_URL = 'https://vocalbridgeai.com';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.VOCAL_BRIDGE_API_KEY;
  if (!apiKey) {
    logger.error('VOCAL_BRIDGE_API_KEY is not configured');
    return NextResponse.json({ error: 'Voice is not configured' }, { status: 500 });
  }

  let participantName = 'Kapruka Shopper';
  try {
    const body = (await req.json()) as { participant_name?: string };
    if (body.participant_name) participantName = body.participant_name;
  } catch {
    // no body provided — use default participant name
  }

  const headers: Record<string, string> = {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };
  if (process.env.VOCAL_BRIDGE_AGENT_ID) {
    headers['X-Agent-Id'] = process.env.VOCAL_BRIDGE_AGENT_ID;
  }

  try {
    const response = await fetch(`${VOCAL_BRIDGE_URL}/api/v1/token`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ participant_name: participantName }),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error({ status: response.status, text }, 'voice token request failed');
      return NextResponse.json({ error: 'Failed to get voice token' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error({ err: error.message }, 'voice token request errored');
    return NextResponse.json({ error: 'Failed to get voice token' }, { status: 500 });
  }
}
