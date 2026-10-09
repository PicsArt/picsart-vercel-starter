import 'server-only';
import {
  APICallError,
  InvalidArgumentError,
  LoadAPIKeyError,
  NoSuchModelError,
  RetryError,
  UnsupportedFunctionalityError,
} from 'ai';
import { notConfigured } from './guards';
import { errorReply, type Reply } from './http';
import { picsartApiKey, redact } from './secrets';

const MAX_MESSAGE_LENGTH = 300;

export function safeMessage(text: string): string {
  const clean = redact(text, picsartApiKey()).replace(/\s+/g, ' ').trim();
  return clean.length > MAX_MESSAGE_LENGTH ? `${clean.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : clean;
}

function unwrap(error: unknown): unknown {
  return RetryError.isInstance(error) ? error.lastError : error;
}

function picsartCode(error: APICallError): string | undefined {
  const data = error.data as { code?: unknown } | undefined;
  return typeof data?.code === 'string' ? data.code : undefined;
}

function log(scope: string, error: unknown): void {
  const details = APICallError.isInstance(error) ? { statusCode: error.statusCode, code: picsartCode(error) } : {};
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? safeMessage(error.message) : '';
  console.error(`[${scope}]`, name, message, details);
}

export function generationErrorReply(scope: string, thrown: unknown): Reply {
  const error = unwrap(thrown);
  log(scope, error);
  if (APICallError.isInstance(error)) {
    if (picsartCode(error) === 'NOT_ENOUGH_AVAILABLE_CREDITS') {
      return errorReply(402, 'out_of_credits', 'This demo is out of Picsart credits. Try again later, or deploy your own copy with your API key.');
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return errorReply(502, 'upstream_auth', 'Picsart declined this deployment’s API key. Check PICSART_API_KEY in the project settings.');
    }
    if (error.statusCode === 429) return errorReply(503, 'upstream_busy', 'Picsart is busy right now. Try again in a minute.');
  }
  if (LoadAPIKeyError.isInstance(error)) return notConfigured();
  if (NoSuchModelError.isInstance(error)) return errorReply(400, 'unknown_model', 'That model is no longer available. Choose another model.', { field: 'modelId' });
  if (InvalidArgumentError.isInstance(error) || UnsupportedFunctionalityError.isInstance(error)) {
    return errorReply(400, 'invalid_request', `The model can’t take this request: ${safeMessage(error.message)}`);
  }
  return errorReply(502, 'generation_failed', 'The generation didn’t finish. Try again, or choose another model.');
}

export function statusErrorReply(thrown: unknown): Reply {
  const error = unwrap(thrown);
  log('video-status', error);
  if (InvalidArgumentError.isInstance(error) || NoSuchModelError.isInstance(error)) {
    return errorReply(400, 'invalid_ticket', 'This video job can’t be checked. Start a new video.');
  }
  if (LoadAPIKeyError.isInstance(error)) return notConfigured();
  if (APICallError.isInstance(error) && error.statusCode === 404) {
    return errorReply(404, 'status_failed', 'Picsart has no record of this video job. Start a new video.');
  }
  return errorReply(502, 'status_failed', 'The video’s status is unavailable right now. Check again in a moment.');
}
