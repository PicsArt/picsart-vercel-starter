'use client';

import { useEffect, useRef, useState } from 'react';
import { postJson, type ApiError } from '@/lib/client';
import type { ImageResult, ModelOption } from '@/lib/types';
import { GenerationForm, validate, type FieldError, type FormValues } from './generation-form';
import { EmptyState, ErrorState, FALLBACK_RATIO, LoadingState, MediaFrame, OutputCard, ResultDetails } from './output';

type Output =
  | { kind: 'empty' }
  | { kind: 'loading'; ratio: string; startedAt: number }
  | { kind: 'done'; result: ImageResult; prompt: string; modelName: string; ratio: string }
  | { kind: 'error'; error: ApiError; retry: boolean };

const RETRYABLE = new Set<ApiError['code']>(['generation_failed', 'upstream_busy']);

interface Props {
  models: ModelOption[];
  initialModelId: string;
  unavailable: boolean;
  promptMaxLength: number;
  onBusyChange: (busy: boolean) => void;
  onModelChange: (modelId: string) => void;
}

export function ImagePanel({ models, initialModelId, unavailable, promptMaxLength, onBusyChange, onModelChange }: Props) {
  const [values, setValues] = useState<FormValues>({ modelId: initialModelId, prompt: '', aspectRatio: '' });
  const [output, setOutput] = useState<Output>({ kind: 'empty' });
  const [fieldError, setFieldError] = useState<FieldError>();
  const [naturalRatio, setNaturalRatio] = useState<string>();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const busy = output.kind === 'loading';

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

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
    const ratio = values.aspectRatio || FALLBACK_RATIO.image;
    setOutput({ kind: 'loading', ratio, startedAt: Date.now() });
    setNaturalRatio(undefined);
    const response = await postJson<ImageResult>(
      '/api/image',
      { modelId: values.modelId, prompt, ...(values.aspectRatio ? { aspectRatio: values.aspectRatio } : {}) },
      { idempotent: true },
    );
    if (response.ok) {
      setOutput({ kind: 'done', result: response.data, prompt, modelName, ratio: values.aspectRatio });
    } else if (response.error.field) {
      setFieldError({ field: response.error.field, message: response.error.message });
      setOutput(previous);
    } else {
      setOutput({ kind: 'error', error: response.error, retry: RETRYABLE.has(response.error.code) });
    }
  }

  function applyExample(prompt: string) {
    setValues((current) => ({ ...current, prompt }));
    setFieldError(undefined);
    promptRef.current?.focus();
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <GenerationForm
        mode="image"
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
      <OutputCard label="Image result">
        <p aria-live="polite" className="sr-only">
          {output.kind === 'loading' && 'Generating image…'}
          {output.kind === 'done' && 'Image ready.'}
          {output.kind === 'error' && `Image failed. ${output.error.message}`}
        </p>
        {output.kind === 'empty' && <EmptyState mode="image" onExample={applyExample} disabled={unavailable} />}
        {output.kind === 'loading' && <LoadingState mode="image" ratio={output.ratio} startedAt={output.startedAt} />}
        {output.kind === 'error' && (
          <ErrorState error={output.error} action={output.retry ? { label: 'Try Again', onClick: submit } : undefined} />
        )}
        {output.kind === 'done' && (
          <figure className="flex flex-col gap-4 p-4 sm:p-6">
            <MediaFrame ratio={output.ratio || naturalRatio || FALLBACK_RATIO.image}>
              {/* eslint-disable-next-line @next/next/no-img-element -- generated images come from Picsart's CDN */}
              <img
                src={output.result.image.url}
                alt={output.prompt}
                className="size-full object-contain"
                onLoad={(event) => setNaturalRatio(`${event.currentTarget.naturalWidth}:${event.currentTarget.naturalHeight}`)}
              />
            </MediaFrame>
            <ResultDetails
              prompt={output.prompt}
              modelName={output.modelName}
              credits={output.result.credits}
              links={[
                ...(output.result.playgroundUrl ? [{ href: output.result.playgroundUrl, label: 'Open in AI Playground' }] : []),
                { href: output.result.image.url, label: 'Open Original' },
              ]}
            />
          </figure>
        )}
      </OutputCard>
    </div>
  );
}
