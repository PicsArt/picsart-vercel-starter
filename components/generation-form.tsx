'use client';

import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import type { Mode, ModelOption } from '@/lib/types';
import { ChevronIcon, Spinner } from './icons';

export interface FormValues {
  modelId: string;
  prompt: string;
  aspectRatio: string;
}

export interface FieldError {
  field: 'prompt' | 'modelId' | 'aspectRatio';
  message: string;
}

export function validate(values: FormValues, models: ModelOption[], promptMaxLength: number): FieldError | undefined {
  if (!models.some((model) => model.id === values.modelId)) return { field: 'modelId', message: 'Choose a model.' };
  const prompt = values.prompt.trim();
  if (!prompt) return { field: 'prompt', message: 'Describe what to generate.' };
  if (prompt.length > promptMaxLength) return { field: 'prompt', message: `Shorten the prompt to ${promptMaxLength} characters or fewer.` };
  return undefined;
}

const subscribeNever = () => () => {};

function useIsMac(): boolean | null {
  return useSyncExternalStore(subscribeNever, () => /Mac|iPhone|iPad/.test(navigator.userAgent), () => null);
}

const PLACEHOLDERS: Record<Mode, string> = {
  image: 'A ceramic mug on a marble table, soft morning light…',
  video: 'Steam rising from a ceramic mug, slow push-in…',
};

const KIND_LABEL: Record<Mode, string> = { image: 'text-to-image', video: 'text-to-video' };

const controlClass =
  'w-full rounded-lg border border-border-strong bg-background text-base text-foreground shadow-[0_1px_1px_rgb(0_0_0/0.03)] transition-[border-color,box-shadow] hover:border-subtle aria-invalid:border-danger sm:text-sm';

interface Props {
  mode: Mode;
  models: ModelOption[];
  values: FormValues;
  onChange: (values: FormValues) => void;
  onSubmit: () => void;
  busy: boolean;
  unavailable: boolean;
  fieldError?: FieldError;
  promptMaxLength: number;
  promptRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function GenerationForm({ mode, models, values, onChange, onSubmit, busy, unavailable, fieldError, promptMaxLength, promptRef }: Props) {
  const modelRef = useRef<HTMLSelectElement>(null);
  const ratioRef = useRef<HTMLSelectElement>(null);
  const isMac = useIsMac();
  const model = models.find((option) => option.id === values.modelId);
  const ids = { model: `${mode}-model`, prompt: `${mode}-prompt`, ratio: `${mode}-ratio` };
  const errorId = (field: FieldError['field']) => (fieldError?.field === field ? `${mode}-${field}-error` : undefined);
  const promptLength = values.prompt.trim().length;
  const label = mode === 'image' ? 'Generate Image' : 'Generate Video';

  useEffect(() => {
    if (!fieldError) return;
    const target = { prompt: promptRef.current, modelId: modelRef.current, aspectRatio: ratioRef.current }[fieldError.field];
    target?.focus();
  }, [fieldError, promptRef]);

  function changeModel(modelId: string) {
    const next = models.find((option) => option.id === modelId);
    const aspectRatio = next?.aspectRatios.includes(values.aspectRatio) ? values.aspectRatio : '';
    onChange({ ...values, modelId, aspectRatio });
  }

  function submitOnShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onSubmit();
      }}
      className="rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5"
    >
      <fieldset disabled={unavailable} className="flex flex-col gap-5 disabled:opacity-60">
        <legend className="sr-only">{mode === 'image' ? 'Image settings' : 'Video settings'}</legend>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={ids.model} className="text-sm font-medium">
              Model
            </label>
            <span className="text-xs text-muted tabular-nums">
              {models.length} {KIND_LABEL[mode]} {models.length === 1 ? 'model' : 'models'}
            </span>
          </div>
          <div className="relative">
            <select
              ref={modelRef}
              id={ids.model}
              name="model"
              value={values.modelId}
              onChange={(event) => changeModel(event.target.value)}
              aria-invalid={fieldError?.field === 'modelId' || undefined}
              aria-describedby={errorId('modelId')}
              translate="no"
              className={`${controlClass} h-11 appearance-none pr-9 pl-3 sm:h-10`}
            >
              {models.length === 0 && <option value="">No models available</option>}
              {models.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <ChevronIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
          </div>
          {fieldError?.field === 'modelId' && (
            <p id={errorId('modelId')} className="text-sm text-danger">
              {fieldError.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={ids.prompt} className="text-sm font-medium">
              Prompt
            </label>
            <span className={`text-xs tabular-nums ${promptLength > promptMaxLength ? 'text-danger' : 'text-muted'}`}>
              {promptLength}/{promptMaxLength}
            </span>
          </div>
          <textarea
            ref={promptRef}
            id={ids.prompt}
            name="prompt"
            rows={5}
            value={values.prompt}
            onChange={(event) => onChange({ ...values, prompt: event.target.value })}
            onKeyDown={submitOnShortcut}
            placeholder={PLACEHOLDERS[mode]}
            autoComplete="off"
            aria-invalid={fieldError?.field === 'prompt' || undefined}
            aria-describedby={errorId('prompt')}
            className={`${controlClass} min-h-32 resize-y px-3 py-2.5 leading-relaxed placeholder:text-subtle`}
          />
          {fieldError?.field === 'prompt' && (
            <p id={errorId('prompt')} className="text-sm text-danger">
              {fieldError.message}
            </p>
          )}
        </div>

        {model && model.aspectRatios.length > 0 && (
          <div className="flex flex-col gap-2">
            <label htmlFor={ids.ratio} className="text-sm font-medium">
              Aspect Ratio
            </label>
            <div className="relative">
              <select
                ref={ratioRef}
                id={ids.ratio}
                name="aspectRatio"
                value={values.aspectRatio}
                onChange={(event) => onChange({ ...values, aspectRatio: event.target.value })}
                aria-invalid={fieldError?.field === 'aspectRatio' || undefined}
                aria-describedby={errorId('aspectRatio')}
                className={`${controlClass} h-11 appearance-none pr-9 pl-3 tabular-nums sm:h-10`}
              >
                <option value="">Model Default</option>
                {model.aspectRatios.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>
              <ChevronIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
            </div>
            {fieldError?.field === 'aspectRatio' && (
              <p id={errorId('aspectRatio')} className="text-sm text-danger">
                {fieldError.message}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <button
            type="submit"
            disabled={busy}
            aria-describedby={`${mode}-shortcut`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-60 sm:h-10"
          >
            {busy && <Spinner />}
            {label}
          </button>
          <p id={`${mode}-shortcut`} className="text-center text-xs text-muted">
            {isMac === null ? (
              <span className="invisible">Press Enter</span>
            ) : (
              <>
                Press{' '}
                <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-sans text-[0.6875rem] text-foreground">
                  {isMac ? '⌘' : 'Ctrl'}&nbsp;Enter
                </kbd>{' '}
                in the prompt to generate
              </>
            )}
          </p>
        </div>
      </fieldset>
    </form>
  );
}
