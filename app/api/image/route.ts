import { generateImage, type GenerateImageResult } from 'ai';
import type { PicsartImageMetadata, PicsartItemMetadata } from '@picsart/vercel-ai-provider';
import { readConfig } from '@/lib/server/config';
import { generationErrorReply } from '@/lib/server/errors';
import { httpUrl, rateLimited, unavailable } from '@/lib/server/guards';
import { clientIp, readJson, reply, type Reply } from '@/lib/server/http';
import { withIdempotency } from '@/lib/server/idempotency';
import { findModel } from '@/lib/server/models';
import { picsart } from '@/lib/server/picsart';
import { jsonRoute } from '@/lib/server/route';
import { checkModel, parseGenerationInput, type GenerationInput } from '@/lib/server/validate';
import type { ImageResult } from '@/lib/types';

export const maxDuration = 300;

function totalCredits(calls: GenerateImageResult['calls']): number | undefined {
  const reported = calls
    .map((call) => (call.providerMetadata?.picsart as PicsartImageMetadata | undefined)?.credits)
    .filter((credits): credits is number => typeof credits === 'number');
  return reported.length > 0 ? reported.reduce((sum, credits) => sum + credits, 0) : undefined;
}

async function generate(input: GenerationInput): Promise<Reply> {
  try {
    const { images, calls } = await generateImage({
      model: picsart.image(input.modelId),
      prompt: input.prompt,
      n: 1,
      maxRetries: 0,
      ...(input.aspectRatio ? { aspectRatio: input.aspectRatio as `${number}:${number}` } : {}),
    });
    const item = images[0]?.providerMetadata?.picsart as PicsartItemMetadata | undefined;
    const url = httpUrl(item?.url);
    if (!url) throw new Error('Picsart returned no image URL.');
    const playgroundUrl = httpUrl(item?.playgroundUrl);
    const credits = totalCredits(calls);
    const body: ImageResult = {
      image: { url },
      modelId: input.modelId,
      ...(playgroundUrl ? { playgroundUrl } : {}),
      ...(credits !== undefined ? { credits } : {}),
    };
    return reply(200, body);
  } catch (error) {
    return generationErrorReply('image', error);
  }
}

export const POST = jsonRoute('image', async (request) => {
  const config = readConfig();
  const blocked = unavailable(config, 'image');
  if (blocked) return blocked;
  const body = await readJson(request);
  if (!body.ok) return body.reply;
  const input = parseGenerationInput(body.value, config.promptMaxLength);
  if (!input.ok) return input.reply;
  const model = checkModel(await findModel('image', input.value.modelId, config.imageModels), input.value);
  if (!model.ok) return model.reply;
  const ip = clientIp(request);
  return withIdempotency(request, `image:${ip}`, () => rateLimited(config, 'image', ip) ?? generate(input.value));
});
