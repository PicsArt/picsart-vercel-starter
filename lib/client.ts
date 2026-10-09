import type { ErrorBody } from './types';

export type ApiError = ErrorBody['error'];
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiError };

function requestKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function postJson<T>(url: string, body: unknown, options: { idempotent?: boolean } = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.idempotent) headers['Idempotency-Key'] = requestKey();
  try {
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const data: unknown = await response.json().catch(() => undefined);
    if (response.ok && data !== undefined) return { ok: true, data: data as T };
    const error = (data as Partial<ErrorBody> | undefined)?.error;
    return {
      ok: false,
      status: response.status,
      error: error ?? { code: 'generation_failed', message: 'The server sent an unexpected answer. Try again.' },
    };
  } catch {
    return { ok: false, status: 0, error: { code: 'generation_failed', message: 'The connection dropped. Check it & try again.' } };
  }
}

const creditFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });

export function formatCredits(credits: number): string {
  return `${creditFormat.format(credits)} ${credits === 1 ? 'credit' : 'credits'}`;
}

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function ratioValue(ratio: string | undefined, fallback: string): string {
  const [width, height] = (ratio || fallback).split(':');
  return `${width} / ${height}`;
}

export const EXAMPLES = {
  image: [
    'A ceramic mug on a marble table, soft morning light',
    'A paper-cut illustration of a lighthouse at dusk',
    'An isometric greenhouse full of plants, studio lighting',
  ],
  video: [
    'Steam rising from a ceramic mug, slow push-in',
    'Waves rolling onto a black sand beach at sunset',
    'A paper boat drifting down a rainy street',
  ],
} as const;
