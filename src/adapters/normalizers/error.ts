import { isRetryableError } from '@/adapters/kapruka.adapter.js';
import type { NormalizedError } from './types.js';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const USER_SAFE_MESSAGES: Record<NormalizedError['code'], string> = {
  VALIDATION_ERROR: 'Some details in that request were invalid.',
  NOT_FOUND: "We couldn't find that.",
  RATE_LIMITED: 'Too many requests right now — please try again in a moment.',
  NETWORK_ERROR: "We're having trouble reaching the Kapruka server. Please try again.",
  UNKNOWN: 'Something went wrong. Please try again.',
};

/**
 * Extracts per-field Pydantic validation lines, e.g.:
 *   params.cart
 *     List should have at least 1 item after validation, not 0 [type=too_short, ...]
 * Confirmed format from fixtures/raw/create-order-error-*.raw.txt.
 */
function extractPydanticDetails(raw: string): Record<string, unknown> | null {
  const regex = /^(params(?:\.[a-zA-Z0-9_]+)+)\n\s+(.+?)\s*\[type=([a-z_]+)/gm;
  const details: Record<string, unknown> = {};
  let match: RegExpExecArray | null;
  let found = false;

  while ((match = regex.exec(raw)) !== null) {
    found = true;
    details[match[1]] = { reason: match[2].trim(), type: match[3] };
  }

  return found ? details : null;
}

/** Case A (Section 4): the SDK call threw a JS exception, with no response text to parse. */
export function normalizeException(err: unknown, tool: string): NormalizedError {
  const raw = errorMessage(err);
  const lower = raw.toLowerCase();

  let code: NormalizedError['code'];
  let retryable: boolean;
  let details: Record<string, unknown> | null = null;

  if (lower.includes('validation error')) {
    code = 'VALIDATION_ERROR';
    retryable = false;
    details = extractPydanticDetails(raw);
  } else if (lower.includes('rate limit exceeded')) {
    code = 'RATE_LIMITED';
    retryable = true;
  } else if (isRetryableError(err)) {
    code = 'NETWORK_ERROR';
    retryable = true;
  } else {
    code = 'UNKNOWN';
    retryable = false;
  }

  return { ok: false, code, message: USER_SAFE_MESSAGES[code], tool, retryable, details, raw };
}

const STRUCTURED_ERROR_CODE_MAP: Record<string, NormalizedError['code']> = {
  order_not_found: 'NOT_FOUND',
};

/** Case B (Section 4): the SDK call succeeded, but the response content itself is an error. */
export function normalizeErrorResponse(rawText: string, tool: string): NormalizedError {
  // 1. KaprukaLocal's own {error, tool, suggestion} JSON envelope.
  try {
    const parsed: unknown = JSON.parse(rawText);
    if (isRecord(parsed) && typeof parsed.error === 'string') {
      const code: NormalizedError['code'] = parsed.error.toLowerCase().includes('rate limit exceeded')
        ? 'RATE_LIMITED'
        : 'UNKNOWN';
      const details = typeof parsed.suggestion === 'string' ? { suggestion: parsed.suggestion } : null;

      return {
        ok: false,
        code,
        message: USER_SAFE_MESSAGES[code],
        tool,
        retryable: code === 'RATE_LIMITED',
        details,
        raw: rawText,
      };
    }
  } catch {
    // Not JSON — fall through to the text-based patterns below.
  }

  // 2. "Error (code): message" plain text pattern — confirmed format from fixtures/raw/track-order-not-found.raw.txt.
  const structuredMatch = rawText.match(/^Error \(([a-z_]+)\):\s*(.+)/i);
  if (structuredMatch) {
    const sourceCode = structuredMatch[1].toLowerCase();
    const code = STRUCTURED_ERROR_CODE_MAP[sourceCode] ?? 'UNKNOWN';

    return {
      ok: false,
      code,
      message: USER_SAFE_MESSAGES[code],
      tool,
      retryable: false,
      details: { sourceCode },
      raw: rawText,
    };
  }

  // 3. Unstructured "not found" fallback (no machine-readable code).
  if (rawText.toLowerCase().includes('not found')) {
    return { ok: false, code: 'NOT_FOUND', message: USER_SAFE_MESSAGES.NOT_FOUND, tool, retryable: false, details: null, raw: rawText };
  }

  // 4. Unrecognized response shape.
  return { ok: false, code: 'UNKNOWN', message: USER_SAFE_MESSAGES.UNKNOWN, tool, retryable: false, details: null, raw: rawText };
}
