'use client';

import { useEffect, useState } from 'react';
import { EXAMPLES, formatCredits, formatElapsed, type ApiError } from '@/lib/client';
import type { ErrorCode, Mode } from '@/lib/types';
import { AlertIcon, ExternalIcon, ImageIcon, Spinner, VideoIcon } from './icons';

export const FALLBACK_RATIO: Record<Mode, string> = { image: '1:1', video: '16:9' };

const ERROR_TITLES: Partial<Record<ErrorCode, string>> = {
  out_of_credits: 'Out of Credits',
  rate_limited: 'Limit Reached',
  demo_disabled: 'Generation Paused',
  video_disabled: 'Video Is Off',
  not_configured: 'API Key Needed',
  upstream_auth: 'API Key Declined',
  upstream_busy: 'Picsart Is Busy',
  status_failed: 'Status Unavailable',
  invalid_ticket: 'Job Not Found',
  unknown_model: 'Model Unavailable',
  invalid_request: 'Request Not Accepted',
};

export function OutputCard({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <section aria-label={label} className="min-w-0 rounded-xl border border-border bg-surface shadow-card">
      {children}
    </section>
  );
}

export function MediaFrame({ ratio, children, loading = false }: { ratio: string; children?: React.ReactNode; loading?: boolean }) {
  const [width, height] = ratio.split(':').map(Number);
  const value = width > 0 && height > 0 ? width / height : 1;
  return (
    <div
      className={`relative mx-auto w-full overflow-hidden rounded-lg border border-border bg-surface-strong ${loading ? 'shimmer delayed-reveal' : ''}`}
      style={{ aspectRatio: `${width} / ${height}`, maxWidth: `min(100%, calc(32rem * ${value}))` }}
    >
      {children}
    </div>
  );
}

export function EmptyState({ mode, onExample, disabled }: { mode: Mode; onExample: (prompt: string) => void; disabled: boolean }) {
  const Icon = mode === 'image' ? ImageIcon : VideoIcon;
  return (
    <div className="flex min-h-[22rem] flex-col items-center justify-center px-6 py-10 text-center lg:min-h-[34rem]">
      <div className="flex size-12 items-center justify-center rounded-full border border-border bg-background text-muted">
        <Icon />
      </div>
      <h2 className="mt-4 text-base font-medium">{mode === 'image' ? 'Your image appears here' : 'Your video appears here'}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-pretty text-muted">
        {mode === 'image'
          ? 'Pick a model, describe a scene & press Generate Image.'
          : 'Pick a model, describe a shot & press Generate Video. Videos take a few minutes.'}
      </p>
      <div className="mt-6 flex max-w-md flex-col items-center gap-2">
        <p className="text-xs font-medium tracking-wide text-subtle uppercase">Try an Example</p>
        <ul className="flex flex-wrap justify-center gap-2">
          {EXAMPLES[mode].map((example) => (
            <li key={example}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onExample(example)}
                className="min-h-11 rounded-full border border-border bg-background px-3.5 text-left text-sm text-muted transition-colors enabled:hover:border-border-strong enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-8"
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export function LoadingState({ mode, ratio, startedAt, playgroundUrl }: { mode: Mode; ratio: string; startedAt: number; playgroundUrl?: string }) {
  const now = useNow(true);
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <MediaFrame ratio={ratio} loading />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Spinner />
          {mode === 'image' ? 'Generating image…' : 'Generating video…'}
          <span className="font-normal text-muted tabular-nums">{formatElapsed(now - startedAt)}</span>
        </p>
        {playgroundUrl && <ExternalLink href={playgroundUrl}>Open in AI Playground</ExternalLink>}
      </div>
      {mode === 'video' && (
        <p className="text-sm text-pretty text-muted">
          Videos usually take a few minutes. The job keeps running if you switch tabs or reload this page.
        </p>
      )}
    </div>
  );
}

export function ErrorState({ error, action }: { error: ApiError; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex min-h-[22rem] flex-col items-center justify-center px-6 py-10 text-center lg:min-h-[34rem]">
      <div className="flex size-12 items-center justify-center rounded-full bg-danger-surface text-danger">
        <AlertIcon />
      </div>
      <h2 className="mt-4 text-base font-medium">{ERROR_TITLES[error.code] ?? 'Generation Failed'}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-pretty break-words text-muted">{error.message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-border-strong bg-background px-4 text-sm font-medium transition-colors hover:bg-surface-strong sm:min-h-9"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function ExternalLink({ href, children, inline = false }: { href: string; children: React.ReactNode; inline?: boolean }) {
  const className = inline
    ? 'font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground'
    : 'inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-foreground underline-offset-4 hover:underline sm:min-h-6';
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <ExternalIcon className={inline ? 'ml-1 inline-block size-3.5 align-[-2px]' : undefined} />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

export function ResultDetails({
  prompt,
  modelName,
  credits,
  links,
}: {
  prompt: string;
  modelName: string;
  credits?: number;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <figcaption className="flex flex-col gap-3">
      <p className="line-clamp-3 text-sm text-pretty break-words">{prompt}</p>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex gap-1.5">
          <dt className="text-muted">Model</dt>
          <dd translate="no" className="font-medium">
            {modelName}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted">Cost</dt>
          <dd className="font-medium tabular-nums">{credits === undefined ? 'Not reported' : formatCredits(credits)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-x-5">
        {links.map((link) => (
          <ExternalLink key={link.label} href={link.href}>
            {link.label}
          </ExternalLink>
        ))}
      </div>
    </figcaption>
  );
}
