export type Mode = 'image' | 'video';

export interface ModelOption {
  id: string;
  name: string;
  aspectRatios: string[];
}

export type ErrorCode =
  | 'demo_disabled'
  | 'video_disabled'
  | 'not_configured'
  | 'invalid_request'
  | 'unknown_model'
  | 'rate_limited'
  | 'out_of_credits'
  | 'upstream_auth'
  | 'upstream_busy'
  | 'generation_failed'
  | 'invalid_ticket'
  | 'status_failed';

export interface ErrorBody {
  error: { code: ErrorCode; message: string; field?: 'prompt' | 'modelId' | 'aspectRatio' };
}

export interface ImageResult {
  image: { url: string };
  modelId: string;
  playgroundUrl?: string;
  credits?: number;
}

export interface VideoStartResult {
  ticket: string;
  playgroundUrl?: string;
}

export type VideoStatusResult =
  | { status: 'pending' }
  | { status: 'completed'; video: { url: string }; playgroundUrl?: string; credits?: number }
  | { status: 'error'; message: string };
