import 'server-only';
import { z } from 'zod';
import type { DemoModel } from './models';
import { errorReply, type Reply } from './http';

export interface GenerationInput {
  modelId: string;
  prompt: string;
  aspectRatio?: string;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; reply: Reply };

const generationSchema = z.object({
  modelId: z.string().trim().min(1).max(200),
  prompt: z.string().max(100_000),
  aspectRatio: z.string().trim().max(20).optional(),
});

const statusSchema = z.object({ ticket: z.string().min(1).max(4096) });

export function parseGenerationInput(value: unknown, promptMaxLength: number): Parsed<GenerationInput> {
  const parsed = generationSchema.safeParse(value);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === 'modelId') return { ok: false, reply: errorReply(400, 'invalid_request', 'Choose a model.', { field: 'modelId' }) };
    if (field === 'aspectRatio') return { ok: false, reply: errorReply(400, 'invalid_request', 'Choose an aspect ratio from the list.', { field: 'aspectRatio' }) };
    return { ok: false, reply: errorReply(400, 'invalid_request', 'Describe what to generate.', { field: 'prompt' }) };
  }
  const prompt = parsed.data.prompt.trim();
  if (!prompt) return { ok: false, reply: errorReply(400, 'invalid_request', 'Describe what to generate.', { field: 'prompt' }) };
  if (prompt.length > promptMaxLength) {
    return {
      ok: false,
      reply: errorReply(400, 'invalid_request', `Shorten the prompt to ${promptMaxLength} characters or fewer.`, { field: 'prompt' }),
    };
  }
  const aspectRatio = parsed.data.aspectRatio || undefined;
  return { ok: true, value: { modelId: parsed.data.modelId, prompt, ...(aspectRatio ? { aspectRatio } : {}) } };
}

export function checkModel(model: DemoModel | undefined, input: GenerationInput): Parsed<DemoModel> {
  if (!model) return { ok: false, reply: errorReply(400, 'unknown_model', 'Choose a model from the list.', { field: 'modelId' }) };
  if (input.aspectRatio && !model.option.aspectRatios.includes(input.aspectRatio)) {
    return { ok: false, reply: errorReply(400, 'invalid_request', 'Choose an aspect ratio this model supports.', { field: 'aspectRatio' }) };
  }
  return { ok: true, value: model };
}

export function parseTicket(value: unknown): Parsed<string> {
  const parsed = statusSchema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data.ticket }
    : { ok: false, reply: errorReply(400, 'invalid_ticket', 'Send the ticket from the video you started.') };
}
