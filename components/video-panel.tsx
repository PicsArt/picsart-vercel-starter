'use client';

import { useEffect, useRef, useState } from 'react';
import { postJson, type ApiError } from '@/lib/client';
import type { ModelOption, VideoStartResult, VideoStatusResult } from '@/lib/types';
import { GenerationForm, validate, type FieldError, type FormValues } from './generation-form';
import { EmptyState, ErrorState, FALLBACK_RATIO, LoadingState, MediaFrame, OutputCard, ResultDetails } from './output';

interface Job {
  ticket: string;
  startedAt: number;
  prompt: string;
  modelName: string;
  ratio: string;
  playgroundUrl?: string;
}

type Output =
  | { kind: 'empty' }
  | { kind: 'starting'; ratio: string; startedAt: number }
  | { kind: 'polling'; job: Job; failures: number; delay: number }
  | { kind: 'done'; job: Job; url: string; playgroundUrl?: string; credits?: number }
  | { kind: 'error'; error: ApiError; action?: 'retry' | 'check'; job?: Job };

const POLL_MS = 5000;
const MAX_FAILURES = 3;
const STORAGE_KEY = 'picsart-studio:video-job';
const RETRYABLE = new Set<ApiError['code']>(['generation_failed', 'upstream_busy']);

function saveJob(job: Job | undefined): void {
  try {
    if (job) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(job));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function savedJob(): Job | undefined {
  try {
    const job = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Job> | null;
    if (job && typeof job.ticket === 'string' && typeof job.startedAt === 'number' && typeof job.prompt === 'string') {
      return { ticket: job.ticket, startedAt: job.startedAt, prompt: job.prompt, modelName: String(job.modelName ?? ''), ratio: String(job.ratio ?? ''), ...(typeof job.playgroundUrl === 'string' ? { playgroundUrl: job.playgroundUrl } : {}) };
    }
  } catch {}
  return undefined;
}

interface Props {
  models: ModelOption[];
  initialModelId: string;
  unavailable: boolean;
  promptMaxLength: number;
  onBusyChange: (busy: boolean) => void;
  onModelChange: (modelId: string) => void;
}

export function VideoPanel({ models, initialModelId, unavailable, promptMaxLength, onBusyChange, onModelChange }: Props) {
  const [values, setValues] = useState<FormValues>({ modelId: initialModelId, prompt: '', aspectRatio: '' });
  const [output, setOutput] = useState<Output>({ kind: 'empty' });
  const [fieldError, setFieldError] = useState<FieldError>();
  const [naturalRatio, setNaturalRatio] = useState<string>();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const busy = output.kind === 'starting' || output.kind === 'polling';

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const job = savedJob();
      if (job) setOutput({ kind: 'polling', job, failures: 0, delay: 0 });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (output.kind !== 'polling') return;
    const { job, failures, delay } = output;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const response = await postJson<VideoStatusResult>('/api/video/status', { ticket: job.ticket });
      if (cancelled) return;
      if (!response.ok) {
        const transient = response.status === 0 || response.status === 429 || response.status >= 500;
        if (transient && failures < MAX_FAILURES) {
          setOutput({ kind: 'polling', job, failures: failures + 1, delay: POLL_MS * (failures + 2) });
          return;
        }
        const gone = response.error.code === 'invalid_ticket' || response.status === 404;
        if (gone) saveJob(undefined);
        setOutput({ kind: 'error', error: response.error, action: gone ? 'retry' : 'check', job });
        return;
      }
      const status = response.data;
      if (status.status === 'pending') {
        setOutput({ kind: 'polling', job, failures: 0, delay: POLL_MS });
        return;
      }
      saveJob(undefined);
      if (status.status === 'completed') {
        setOutput({ kind: 'done', job, url: status.video.url, playgroundUrl: status.playgroundUrl ?? job.playgroundUrl, credits: status.credits });
      } else {
        setOutput({ kind: 'error', error: { code: 'generation_failed', message: status.message }, action: 'retry', job });
      }
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [output]);

  function change(next: FormValues) {
    if (next.modelId !== values.modelId) onModelChange(next.modelId);
    setValues(next);
  }

  async function submit() {
    const problem = validate(values, models, promptMaxLength);
    setFieldError(problem);
    if (problem) return;
    const previous = output;
    const prompt = values.prompt.trim();
    const modelName = models.find((model) => model.id === values.modelId)?.name ?? values.modelId;
    const startedAt = Date.now();
    setOutput({ kind: 'starting', ratio: values.aspectRatio || FALLBACK_RATIO.video, startedAt });
    setNaturalRatio(undefined);
    const response = await postJson<VideoStartResult>(
      '/api/video',
      { modelId: values.modelId, prompt, ...(values.aspectRatio ? { aspectRatio: values.aspectRatio } : {}) },
      { idempotent: true },
    );
    if (response.ok) {
      const job: Job = { ticket: response.data.ticket, startedAt, prompt, modelName, ratio: values.aspectRatio, playgroundUrl: response.data.playgroundUrl };
      saveJob(job);
      setOutput({ kind: 'polling', job, failures: 0, delay: POLL_MS });
    } else if (response.error.field) {
      setFieldError({ field: response.error.field, message: response.error.message });
      setOutput(previous);
    } else {
      setOutput({ kind: 'error', error: response.error, action: RETRYABLE.has(response.error.code) ? 'retry' : undefined });
    }
  }

  function applyExample(prompt: string) {
    setValues((current) => ({ ...current, prompt }));
    setFieldError(undefined);
    promptRef.current?.focus();
  }

  function checkAgain() {
    if (output.kind === 'error' && output.job) setOutput({ kind: 'polling', job: output.job, failures: 0, delay: 0 });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <GenerationForm
        mode="video"
        models={models}
        values={values}
        onChange={change}
        onSubmit={submit}
        busy={busy}
        unavailable={unavailable}
        fieldError={fieldError}
        promptMaxLength={promptMaxLength}
        promptRef={promptRef}
      />
      <OutputCard label="Video result">
        <p aria-live="polite" className="sr-only">
          {busy && 'Generating video…'}
          {output.kind === 'done' && 'Video ready.'}
          {output.kind === 'error' && `Video failed. ${output.error.message}`}
        </p>
        {output.kind === 'empty' && <EmptyState mode="video" onExample={applyExample} disabled={unavailable} />}
        {output.kind === 'starting' && <LoadingState mode="video" ratio={output.ratio} startedAt={output.startedAt} />}
        {output.kind === 'polling' && (
          <LoadingState
            mode="video"
            ratio={output.job.ratio || FALLBACK_RATIO.video}
            startedAt={output.job.startedAt}
            playgroundUrl={output.job.playgroundUrl}
          />
        )}
        {output.kind === 'error' && (
          <ErrorState
            error={output.error}
            action={
              output.action === 'check'
                ? { label: 'Check Again', onClick: checkAgain }
                : output.action === 'retry'
                  ? { label: 'Try Again', onClick: submit }
                  : undefined
            }
          />
        )}
        {output.kind === 'done' && (
          <figure className="flex flex-col gap-4 p-4 sm:p-6">
            <MediaFrame ratio={output.job.ratio || naturalRatio || FALLBACK_RATIO.video}>
              <video
                src={output.url}
                controls
                playsInline
                preload="metadata"
                aria-label={`Generated video: ${output.job.prompt}`}
                className="size-full bg-black object-contain"
                onLoadedMetadata={(event) => setNaturalRatio(`${event.currentTarget.videoWidth}:${event.currentTarget.videoHeight}`)}
              />
            </MediaFrame>
            <ResultDetails
              prompt={output.job.prompt}
              modelName={output.job.modelName}
              credits={output.credits}
              links={[
                ...(output.playgroundUrl ? [{ href: output.playgroundUrl, label: 'Open in AI Playground' }] : []),
                { href: output.url, label: 'Open Original' },
              ]}
            />
          </figure>
        )}
      </OutputCard>
    </div>
  );
}
