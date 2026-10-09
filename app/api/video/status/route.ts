import { experimental_getVideoStatus } from 'ai';
import type { PicsartVideoMetadata } from '@picsart/vercel-ai-provider';
import { readConfig } from '@/lib/server/config';
import { safeMessage, statusErrorReply } from '@/lib/server/errors';
import { httpUrl, notConfigured, rateLimited, unavailable } from '@/lib/server/guards';
import { clientIp, errorReply, readJson, reply, type Reply } from '@/lib/server/http';
import { picsart } from '@/lib/server/picsart';
import { jsonRoute } from '@/lib/server/route';
import { picsartApiKey } from '@/lib/server/secrets';
import { readTicket, type VideoOperation } from '@/lib/server/ticket';
import { parseTicket } from '@/lib/server/validate';
import type { VideoStatusResult } from '@/lib/types';

export const maxDuration = 60;

const INVALID_TICKET = 'This video job can’t be checked. Start a new video.';

async function check(operation: VideoOperation): Promise<Reply> {
  try {
    const status = await experimental_getVideoStatus(picsart.video(operation.modelId), { operation });
    if (status.status === 'pending') return reply(200, { status: 'pending' } satisfies VideoStatusResult);
    if (status.status === 'error') {
      const message = safeMessage(status.error) || 'Picsart couldn’t make this video. Try another prompt or model.';
      return reply(200, { status: 'error', message } satisfies VideoStatusResult);
    }
    const meta = (status.providerMetadata?.picsart as PicsartVideoMetadata | undefined)?.videos?.[0];
    const first = status.videos[0];
    const url = httpUrl(first?.type === 'url' ? first.url : undefined) ?? httpUrl(meta?.url);
    if (!url) {
      return reply(200, { status: 'error', message: 'Picsart finished the job without a video. Start a new video.' } satisfies VideoStatusResult);
    }
    const playgroundUrl = httpUrl(meta?.playgroundUrl) ?? httpUrl(operation.playgroundUrl);
    const body: VideoStatusResult = {
      status: 'completed',
      video: { url },
      ...(playgroundUrl ? { playgroundUrl } : {}),
      ...(typeof meta?.credits === 'number' ? { credits: meta.credits } : {}),
    };
    return reply(200, body);
  } catch (error) {
    return statusErrorReply(error);
  }
}

export const POST = jsonRoute('video-status', async (request) => {
  const config = readConfig();
  const blocked = unavailable(config, 'status');
  if (blocked) return blocked;
  const secret = picsartApiKey();
  if (!secret) return notConfigured();
  const body = await readJson(request);
  if (!body.ok) return body.reply;
  const ticket = parseTicket(body.value);
  if (!ticket.ok) return ticket.reply;
  const operation = readTicket(ticket.value, secret);
  if (!operation || !(await picsart.catalog.getModel(operation.modelId))) return errorReply(400, 'invalid_ticket', INVALID_TICKET);
  return rateLimited(config, 'status', clientIp(request)) ?? check(operation);
});
