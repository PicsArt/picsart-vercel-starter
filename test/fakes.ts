import {
  InvalidArgumentError,
  type Experimental_VideoModelV4,
  type Experimental_VideoModelV4OperationStartResult,
  type Experimental_VideoModelV4OperationStatusResult,
  type ImageModelV4,
  type ImageModelV4CallOptions,
  type ImageModelV4Result,
} from '@ai-sdk/provider';
import { vi } from 'vitest';

type StartOptions = Parameters<NonNullable<Experimental_VideoModelV4['doStart']>>[0];
type StatusOptions = Parameters<NonNullable<Experimental_VideoModelV4['doStatus']>>[0];

export const TEST_KEY = 'pa-test-key-not-real-0000';
export const keyState: { current: string | undefined } = { current: TEST_KEY };

export const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
  (char) => char.charCodeAt(0),
);
export const IMAGE_URL = 'https://cdn.example.com/generated/image.png';
export const VIDEO_URL = 'https://cdn.example.com/generated/video.mp4';
export const PLAYGROUND_URL = 'https://picsart.com/ai-playground/?generationId=gen-0001';

export const imageGenerate = vi.fn<(modelId: string, options: ImageModelV4CallOptions) => Promise<ImageModelV4Result>>();
export const videoStart = vi.fn<(modelId: string, options: StartOptions) => Promise<Experimental_VideoModelV4OperationStartResult>>();
export const videoStatus = vi.fn<(modelId: string, options: StatusOptions) => Promise<Experimental_VideoModelV4OperationStatusResult>>();

const response = (modelId: string) => ({ timestamp: new Date(0), modelId, headers: undefined });

export function imageSuccess(modelId: string, credits = 0.0001): ImageModelV4Result {
  return {
    images: [PNG],
    warnings: [],
    providerMetadata: {
      picsart: { images: [{ url: IMAGE_URL, generationId: 'gen-0001', playgroundUrl: PLAYGROUND_URL }], credits, balance: 41.5 },
    },
    response: response(modelId),
  };
}

export function videoStarted(modelId: string): Experimental_VideoModelV4OperationStartResult {
  const operation = { modelId, generationId: 'gen-0001', playgroundUrl: PLAYGROUND_URL };
  return {
    operation,
    warnings: [],
    providerMetadata: { picsart: { generationId: operation.generationId, playgroundUrl: PLAYGROUND_URL } },
    response: response(modelId),
  };
}

export function videoPending(modelId: string): Experimental_VideoModelV4OperationStatusResult {
  return { status: 'pending', response: response(modelId) };
}

export function videoCompleted(modelId: string, credits = 0.01): Experimental_VideoModelV4OperationStatusResult {
  return {
    status: 'completed',
    videos: [{ type: 'url', url: VIDEO_URL, mediaType: 'application/octet-stream' }],
    warnings: [],
    providerMetadata: {
      picsart: { videos: [{ url: VIDEO_URL, generationId: 'gen-0001', playgroundUrl: PLAYGROUND_URL, credits }], credits, balance: 41.49 },
    },
    response: response(modelId),
  };
}

export function videoFailed(modelId: string, error: string): Experimental_VideoModelV4OperationStatusResult {
  return { status: 'error', error, response: response(modelId) };
}

export function fakeImageModel(modelId: string): ImageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'picsart.image',
    modelId,
    maxImagesPerCall: Number.MAX_SAFE_INTEGER,
    doGenerate: (options) => imageGenerate(modelId, options),
  };
}

export function fakeVideoModel(modelId: string): Experimental_VideoModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'picsart.video',
    modelId,
    maxVideosPerCall: 1,
    doGenerate: async () => {
      throw new Error('The template never calls doGenerate for video.');
    },
    doStart: (options) => videoStart(modelId, options),
    doStatus: async (options) => {
      const operation = options.operation as { modelId?: unknown; generationId?: unknown } | null;
      const id = operation?.generationId;
      if (operation?.modelId !== modelId || typeof id !== 'string' || id === '.' || id === '..' || /[/\\?#%]/.test(id)) {
        throw new InvalidArgumentError({ argument: 'operation', message: `Pass the operation that experimental_startVideo returned for "${modelId}".` });
      }
      return videoStatus(modelId, options);
    },
  };
}
