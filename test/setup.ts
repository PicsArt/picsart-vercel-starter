import { afterEach, beforeEach, vi } from 'vitest';
import { idempotencyCache } from '@/lib/server/idempotency';
import { rateLimiter } from '@/lib/server/rate-limit';
import { imageGenerate, keyState, TEST_KEY, videoStart, videoStatus } from './fakes';

delete process.env.PICSART_API_KEY;

vi.mock('@/lib/server/picsart', async () => {
  const actual = await vi.importActual<typeof import('@picsart/vercel-ai-provider')>('@picsart/vercel-ai-provider');
  const fakes = await import('./fakes');
  return {
    picsart: {
      listModels: actual.picsart.listModels,
      catalog: actual.picsart.catalog,
      image: fakes.fakeImageModel,
      video: fakes.fakeVideoModel,
    },
  };
});

vi.mock('@/lib/server/secrets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/secrets')>();
  const { keyState: state } = await import('./fakes');
  return { ...actual, picsartApiKey: () => state.current };
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('Network access is disabled in tests.');
  }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  keyState.current = TEST_KEY;
  imageGenerate.mockReset();
  videoStart.mockReset();
  videoStatus.mockReset();
  rateLimiter.reset();
  idempotencyCache.reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
