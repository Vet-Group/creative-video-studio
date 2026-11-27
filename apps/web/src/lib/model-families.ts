// The model picker's sections, as Fash groups its models: the featured models, then one row per family.
// A family is found from the model id, so a provider twin (seedance-2.0-byteplus, nano-banana-2-vertex) joins its model's family.

export interface Family {
  key: string;
  name: string;
  /** One line under the name. */
  note: string;
}

/** In the order of the list; an id that matches none falls into OTHER. */
const FAMILIES: (Family & { ids: RegExp })[] = [
  { key: 'seedance', name: 'Seedance', note: 'Dòng video của ByteDance', ids: /^seedance/ },
  { key: 'kling', name: 'Kling', note: 'Dòng video của Kuaishou, có Motion Control', ids: /^kling/ },
  { key: 'flux', name: 'FLUX', note: 'Dòng của Black Forest Labs', ids: /^flux/ },
  { key: 'google', name: 'Google', note: 'Gemini, Veo, Nano Banana và Imagen của Google', ids: /^(gemini|veo|nano-banana|virtual-try-on|product-recontext)/ },
  { key: 'xai', name: 'xAI', note: 'Grok Imagine của xAI', ids: /^grok/ },
  { key: 'alibaba', name: 'Alibaba', note: 'Wan và Happy Horse của Alibaba', ids: /^(wan|happy-horse)/ },
  { key: 'minimax', name: 'MiniMax', note: 'Hailuo và H3 của MiniMax', ids: /^minimax/ },
  { key: 'openai', name: 'OpenAI', note: 'GPT Image của OpenAI', ids: /^gpt-image/ },
  { key: 'seedream', name: 'Seedream', note: 'Dòng ảnh của ByteDance', ids: /^seedream/ },
];
const OTHER: Family = { key: 'other', name: 'Khác', note: 'Các mô hình chưa thuộc dòng nào ở trên' };

export const familyOf = (id: string): Family => FAMILIES.find((f) => f.ids.test(id)) ?? OTHER;

/** The models grouped by family, in the order of FAMILIES with OTHER last; each family keeps the models' order. */
export function byFamily<T extends { id: string }>(models: T[]): { family: Family; models: T[] }[] {
  return [...FAMILIES, OTHER].map((family) => ({ family, models: models.filter((m) => familyOf(m.id).key === family.key) })).filter((g) => g.models.length > 0);
}

/** How many models the featured section shows; a list no longer than this is shown flat. */
export const FEATURED = 5;

/** The featured models: the recommended one, then the best scores among the supported ones (the list order on a tie). */
export function featured<T extends { supported: boolean; score?: number; recommended?: boolean }>(models: T[]): T[] {
  return models
    .filter((m) => m.supported)
    .sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended) || (b.score ?? -1) - (a.score ?? -1))
    .slice(0, FEATURED);
}

/**
 * What the picker opens on until the member presses Advanced: the chosen model (kept even when it is not the recommended one) and the top featured
 * model, the recommended one. Null when that would hide fewer than two models, so a short list stays whole (seller survey 2026-11-27: fewer choices).
 */
export function shortList<T extends { id: string; supported: boolean; score?: number; recommended?: boolean }>(models: T[], value: string): T[] | null {
  const top = [...new Set([models.find((m) => m.id === value), featured(models)[0]])].filter((m): m is T => m !== undefined);
  return top.length > 0 && models.length - top.length >= 2 ? top : null;
}
