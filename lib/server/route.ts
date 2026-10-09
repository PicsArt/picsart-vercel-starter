import 'server-only';
import { generationErrorReply } from './errors';
import { toResponse, type Reply } from './http';

export function jsonRoute(scope: string, handler: (request: Request) => Promise<Reply>) {
  return async (request: Request): Promise<Response> => {
    try {
      return toResponse(await handler(request));
    } catch (error) {
      return toResponse(generationErrorReply(scope, error));
    }
  };
}
