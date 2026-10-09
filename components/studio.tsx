'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Mode, ModelOption } from '@/lib/types';
import { ExternalLink } from './output';
import { ImagePanel } from './image-panel';
import { VideoPanel } from './video-panel';

interface Availability {
  configured: boolean;
  enabled: boolean;
  videoEnabled: boolean;
}

interface Props {
  initialTab: Mode;
  initialModel?: string;
  imageModels: ModelOption[];
  videoModels: ModelOption[];
  availability: Availability;
  promptMaxLength: number;
}

const TABS: Array<{ mode: Mode; label: string }> = [
  { mode: 'image', label: 'Image' },
  { mode: 'video', label: 'Video' },
];

const TITLES: Record<Mode, string> = { image: 'Generate Images · Picsart Studio', video: 'Generate Videos · Picsart Studio' };

function pickModel(models: ModelOption[], requested: string | undefined): string {
  return models.find((model) => model.id === requested)?.id ?? models[0]?.id ?? '';
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status" className="mb-6 rounded-xl border border-warning/30 bg-warning-surface px-4 py-3.5 text-sm sm:px-5">
      <p className="font-medium text-warning">{title}</p>
      <div className="mt-1 text-pretty text-foreground/80">{children}</div>
    </div>
  );
}

export function Studio({ initialTab, initialModel, imageModels, videoModels, availability, promptMaxLength }: Props) {
  const [tab, setTab] = useState<Mode>(initialTab);
  const [busy, setBusy] = useState<Record<Mode, boolean>>({ image: false, video: false });
  const [initialModels] = useState<Record<Mode, string>>(() => ({
    image: pickModel(imageModels, initialTab === 'image' ? initialModel : undefined),
    video: pickModel(videoModels, initialTab === 'video' ? initialModel : undefined),
  }));
  const selected = useRef<Record<Mode, string>>({ ...initialModels });
  const tabRefs = useRef<Record<Mode, HTMLButtonElement | null>>({ image: null, video: null });

  const syncUrl = useCallback((mode: Mode) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', mode);
    if (selected.current[mode]) url.searchParams.set('model', selected.current[mode]);
    else url.searchParams.delete('model');
    window.history.replaceState(null, '', url);
  }, []);

  useEffect(() => {
    document.title = TITLES[tab];
  }, [tab]);

  const select = (mode: Mode) => {
    setTab(mode);
    syncUrl(mode);
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((item) => item.mode === tab);
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = TABS[(moves[event.key] + TABS.length) % TABS.length].mode;
    select(next);
    tabRefs.current[next]?.focus();
  };

  const onImageBusy = useCallback((value: boolean) => setBusy((current) => ({ ...current, image: value })), []);
  const onVideoBusy = useCallback((value: boolean) => setBusy((current) => ({ ...current, video: value })), []);
  const onImageModel = useCallback((modelId: string) => {
    selected.current.image = modelId;
    syncUrl('image');
  }, [syncUrl]);
  const onVideoModel = useCallback((modelId: string) => {
    selected.current.video = modelId;
    syncUrl('video');
  }, [syncUrl]);

  const unavailable = !availability.enabled || !availability.configured;

  return (
    <div>
      {!availability.enabled ? (
        <Notice title="Generation Is Paused">The owner of this demo turned generation off for now. Try again later.</Notice>
      ) : !availability.configured ? (
        <Notice title="Add Your Picsart API Key">
          Set <code className="font-mono text-[0.8125rem]">PICSART_API_KEY</code> in <code className="font-mono text-[0.8125rem]">.env.local</code>{' '}
          or in your Vercel project’s environment variables, then restart the server.{' '}
          <ExternalLink inline href="https://picsart.com/api-platform/docs/authentication">
            Create a Key
          </ExternalLink>
        </Notice>
      ) : null}

      <div role="tablist" aria-label="Media type" className="mb-4 inline-flex rounded-lg border border-border bg-surface p-1">
        {TABS.map(({ mode, label }) => {
          const active = tab === mode;
          return (
            <button
              key={mode}
              ref={(node) => {
                tabRefs.current[mode] = node;
              }}
              type="button"
              role="tab"
              id={`tab-${mode}`}
              aria-selected={active}
              aria-controls={`panel-${mode}`}
              tabIndex={active ? 0 : -1}
              onClick={() => select(mode)}
              onKeyDown={onTabKeyDown}
              className={`inline-flex min-h-11 min-w-24 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors sm:min-h-8 ${
                active ? 'bg-background text-foreground shadow-card' : 'text-muted hover:text-foreground'
              }`}
            >
              {label}
              {busy[mode] && (
                <>
                  <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-ring motion-reduce:animate-none" />
                  <span className="sr-only">(in progress)</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="panel-image" aria-labelledby="tab-image" hidden={tab !== 'image'}>
        <ImagePanel
          models={imageModels}
          initialModelId={initialModels.image}
          unavailable={unavailable}
          promptMaxLength={promptMaxLength}
          onBusyChange={onImageBusy}
          onModelChange={onImageModel}
        />
      </div>
      <div role="tabpanel" id="panel-video" aria-labelledby="tab-video" hidden={tab !== 'video'}>
        {availability.enabled && availability.configured && !availability.videoEnabled && (
          <Notice title="Video Is Off">This demo generates images only right now. Switch to the Image tab to keep creating.</Notice>
        )}
        <VideoPanel
          models={videoModels}
          initialModelId={initialModels.video}
          unavailable={unavailable || !availability.videoEnabled}
          promptMaxLength={promptMaxLength}
          onBusyChange={onVideoBusy}
          onModelChange={onVideoModel}
        />
      </div>
    </div>
  );
}
