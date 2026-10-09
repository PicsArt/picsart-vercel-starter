import 'server-only';
import type { ErrorBody, ErrorCode } from '@/lib/types';

export interface Reply {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

const MAX_BODY_BYTES = 16 * 1024;

export function reply(status: number, body: unknown, headers?: Record<string, string>): Reply {
  return { status, body, ...(headers ? { headers } : {}) };
}

export function errorReply(
  status: number,
  code: ErrorCode,
  message: string,
  options: { field?: ErrorBody['error']['field']; headers?: Record<string, string> } = {},
): Reply {
  const body: ErrorBody = { error: { code, message, ...(options.field ? { field: options.field } : {}) } };
  return reply(status, body, options.headers);
}

export function toResponse({ status, body, headers }: Reply): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; reply: Reply }> {
  const tooLarge = errorReply(413, 'invalid_request', 'The request is too large. Shorten the prompt and try again.');
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return { ok: false, reply: tooLarge };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { ok: false, reply: tooLarge };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reply: errorReply(400, 'invalid_request', 'Send the request as JSON.') };
  }
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

export function describeWindow(seconds: number): string {
  for (const [unit, size] of [['day', 86_400], ['hour', 3600], ['minute', 60]] as const) {
    if (seconds >= size && seconds % size === 0) return seconds === size ? unit : plural(seconds / size, unit);
  }
  return seconds === 1 ? 'second' : plural(seconds, 'second');
}

export function describeWait(seconds: number): string {
  if (seconds < 90) return plural(seconds, 'second');
  if (seconds < 90 * 60) return plural(Math.ceil(seconds / 60), 'minute');
  return plural(Math.ceil(seconds / 3600), 'hour');
}
