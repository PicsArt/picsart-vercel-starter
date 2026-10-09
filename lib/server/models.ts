import 'server-only';
import type { CatalogModel, CatalogParam } from '@picsart/vercel-ai-provider';
import type { Mode, ModelOption } from '@/lib/types';
import { picsart } from './picsart';

const INPUT_TYPE: Record<Mode, string> = { image: 't2i', video: 't2v' };
const RATIO = /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/;

export interface DemoModel {
  option: ModelOption;
  catalog: CatalogModel;
}

function takesPromptOnly(model: CatalogModel): boolean {
  return model.params.prompt?.kind === 'text'
    && Object.entries(model.params).every(([key, param]) => key === 'prompt' || !param.required);
}

function aspectRatios(param: CatalogParam | undefined): string[] {
  if (param?.kind !== 'enum') return [];
  return (param.options ?? []).map((option) => String(option.id)).filter((id) => RATIO.test(id));
}

export async function loadModels(mode: Mode, allowlist?: string[]): Promise<DemoModel[]> {
  const listed = (await picsart.listModels({ mode })).filter((model) => model.inputType === INPUT_TYPE[mode]);
  const details = await Promise.all(listed.map((model) => picsart.catalog.getModel(model.id)));
  const models = details
    .filter((model): model is CatalogModel => model !== undefined && takesPromptOnly(model))
    .map((model) => ({
      option: { id: model.id, name: model.name, aspectRatios: aspectRatios(model.params.aspectRatio) },
      catalog: model,
    }));
  if (!allowlist) return models;
  return allowlist.flatMap((id) => models.filter((model) => model.option.id === id));
}

export async function findModel(mode: Mode, id: string, allowlist?: string[]): Promise<DemoModel | undefined> {
  return (await loadModels(mode, allowlist)).find((model) => model.option.id === id);
}

export function shortestDuration(model: CatalogModel): number | undefined {
  const param = model.params.duration;
  if (param?.kind === 'range') return param.min !== undefined && param.min > 0 ? param.min : undefined;
  if (param?.kind !== 'enum') return undefined;
  const seconds = (param.options ?? []).map((option) => Number(option.id)).filter((value) => Number.isFinite(value) && value > 0);
  return seconds.length > 0 ? Math.min(...seconds) : undefined;
}
