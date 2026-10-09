import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { JSONValue } from 'ai';

const TTL_MS = 6 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;
const MAX_TICKET_LENGTH = 4096;

export type VideoOperation = { modelId: string; generationId: string } & { [key: string]: JSONValue };

function signature(payload: string, secret: string): string {
  const key = createHmac('sha256', secret).update('picsart-template/video-ticket/v1').digest();
  return createHmac('sha256', key).update(payload).digest('base64url');
}

function isShortString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

function isOperation(value: unknown): value is VideoOperation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { modelId, generationId } = value as Record<string, unknown>;
  return isShortString(modelId) && isShortString(generationId);
}

export function issueTicket(operation: JSONValue, secret: string, now: number = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ operation, issuedAt: now })).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

export function readTicket(ticket: string, secret: string, now: number = Date.now()): VideoOperation | undefined {
  if (ticket.length > MAX_TICKET_LENGTH) return undefined;
  const [payload, given, ...rest] = ticket.split('.');
  if (!payload || !given || rest.length > 0) return undefined;
  const expected = Buffer.from(signature(payload, secret));
  const actual = Buffer.from(given);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const { operation, issuedAt } = parsed as { operation?: unknown; issuedAt?: unknown };
  if (typeof issuedAt !== 'number' || issuedAt > now + CLOCK_SKEW_MS || now - issuedAt > TTL_MS) return undefined;
  return isOperation(operation) ? operation : undefined;
}
