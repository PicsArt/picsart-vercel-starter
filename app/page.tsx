import type { Metadata } from 'next';
import Link from 'next/link';
import { Studio } from '@/components/studio';
import { readConfig } from '@/lib/server/config';
import { loadModels } from '@/lib/server/models';
import { picsartApiKey } from '@/lib/server/secrets';
import type { Mode } from '@/lib/types';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function tabOf(value: string | string[] | undefined): Mode {
  return value === 'video' ? 'video' : 'image';
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return { title: tabOf((await searchParams).tab) === 'video' ? 'Generate Videos · Picsart Studio' : 'Generate Images · Picsart Studio' };
}

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const config = readConfig();
  const [imageModels, videoModels] = await Promise.all([
    loadModels('image', config.imageModels),
    loadModels('video', config.videoModels),
  ]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-[max(1rem,env(safe-area-inset-left))] sm:px-6 lg:px-8">
      <header className="flex items-center justify-between gap-4 py-5">
        <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-md font-semibold tracking-tight sm:min-h-6">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6">
            <rect width="24" height="24" rx="6" className="fill-foreground" />
            <path d="M12 5.5l1.6 4.9 4.9 1.6-4.9 1.6-1.6 4.9-1.6-4.9L5.5 12l4.9-1.6z" className="fill-background" />
          </svg>
          <span>Studio</span>
        </Link>
        <a
          href="https://ai-sdk.dev/providers/community-providers"
          className="flex min-h-11 items-center rounded-md px-1 text-sm text-muted transition-colors hover:text-foreground sm:min-h-6"
        >
          AI SDK Docs
        </a>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 pb-12 outline-none">
        <div className="pt-4 pb-8 sm:pt-8">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Image & Video Studio</h1>
          <p className="mt-2 max-w-xl text-base text-pretty text-muted">
            Describe a scene, pick a <span translate="no">Picsart</span> model & generate. Every request runs on the server through the AI&nbsp;SDK.
          </p>
        </div>
        <Studio
          initialTab={tabOf(params.tab)}
          initialModel={typeof params.model === 'string' ? params.model : undefined}
          imageModels={imageModels.map((model) => model.option)}
          videoModels={videoModels.map((model) => model.option)}
          availability={{ configured: Boolean(picsartApiKey()), enabled: config.enabled, videoEnabled: config.videoEnabled }}
          promptMaxLength={config.promptMaxLength}
        />
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm text-muted">
        <p>
          Powered by{' '}
          <a href="https://picsart.com" translate="no" className="font-medium text-foreground underline-offset-4 hover:underline">
            Picsart
          </a>
        </p>
        <p>
          Built with the{' '}
          <a href="https://ai-sdk.dev" className="text-foreground underline-offset-4 hover:underline">
            AI&nbsp;SDK
          </a>{' '}
          &{' '}
          <a href="https://nextjs.org" translate="no" className="text-foreground underline-offset-4 hover:underline">
            Next.js
          </a>
        </p>
      </footer>
    </div>
  );
}
