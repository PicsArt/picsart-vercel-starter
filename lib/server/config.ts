import 'server-only';

type Env = Record<string, string | undefined>;

export interface DemoConfig {
  enabled: boolean;
  videoEnabled: boolean;
  promptMaxLength: number;
  windowSeconds: number;
  imageLimit: number;
  videoLimit: number;
  statusLimit: number;
  videoShortest: boolean;
  imageModels?: string[];
  videoModels?: string[];
}

export const DEFAULTS = {
  promptMaxLength: 1000,
  windowSeconds: 3600,
  imageLimit: 10,
  videoLimit: 2,
  statusLimit: 1000,
} as const;

function flag(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
  if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
  return fallback;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function idList(value: string | undefined): string[] | undefined {
  const ids = value?.split(',').map((id) => id.trim()).filter(Boolean) ?? [];
  return ids.length > 0 ? [...new Set(ids)] : undefined;
}

export function readConfig(env: Env = process.env): DemoConfig {
  return {
    enabled: flag(env.PICSART_DEMO_ENABLED, true),
    videoEnabled: flag(env.PICSART_DEMO_VIDEO_ENABLED, true),
    promptMaxLength: positiveInteger(env.PICSART_DEMO_PROMPT_MAX_LENGTH, DEFAULTS.promptMaxLength),
    windowSeconds: positiveInteger(env.PICSART_DEMO_WINDOW_SECONDS, DEFAULTS.windowSeconds),
    imageLimit: positiveInteger(env.PICSART_DEMO_IMAGE_LIMIT, DEFAULTS.imageLimit),
    videoLimit: positiveInteger(env.PICSART_DEMO_VIDEO_LIMIT, DEFAULTS.videoLimit),
    statusLimit: positiveInteger(env.PICSART_DEMO_STATUS_LIMIT, DEFAULTS.statusLimit),
    videoShortest: flag(env.PICSART_DEMO_VIDEO_SHORTEST, true),
    imageModels: idList(env.PICSART_DEMO_IMAGE_MODELS),
    videoModels: idList(env.PICSART_DEMO_VIDEO_MODELS),
  };
}
