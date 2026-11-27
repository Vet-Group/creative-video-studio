// Draft → HD: a cheap video row and its bigger sibling, which takes the same photos and prompt. A clip made on the draft row offers
// an HD remake button on its History card: Create reopens with the clip's inputs on the sibling, and the member sees the price before running it.

type Hd = { id: string; short: string; name: string };

const TURBO_1080: Hd = { id: 'minimax-h3-max-turbo-1080p', short: '1080p', name: 'MiniMax H3 Max Turbo 1080p' };
const MAX_1080: Hd = { id: 'minimax-h3-max-1080p', short: '1080p', name: 'MiniMax H3 Max 1080p' };
const REF_1080: Hd = { id: 'minimax-h3-max-reference-1080p', short: '1080p', name: 'MiniMax H3 Max Reference 1080p' };

const HD: Record<string, Hd> = {
  'minimax-h3-max-turbo-480p': TURBO_1080,
  'minimax-h3-max-turbo': TURBO_1080,
  'minimax-h3-max-480p': MAX_1080,
  'minimax-h3-max': MAX_1080,
  'minimax-h3-max-reference-480p': REF_1080,
  'minimax-h3-max-reference': REF_1080,
  'veo-3.1-lite': { id: 'veo-3.1', short: 'Veo 3.1', name: 'Veo 3.1' },
};

/** The HD sibling of a draft video row, if it has one. */
export const hdOf = (modelId: string): Hd | undefined => HD[modelId];

/** The name of an HD sibling row, for the form's note when that row is gone. */
export const hdName = (modelId: string): string | undefined => Object.values(HD).find((h) => h.id === modelId)?.name;

/** Create Video refilled from a finished draft clip, on its HD sibling. */
export function hdHref(job: { id: string; feature: string; status: string; modelId: string }): string | undefined {
  const hd = job.feature === 'video' && job.status === 'succeeded' ? HD[job.modelId] : undefined;
  return hd && `/create?reuse=${encodeURIComponent(job.id)}&model=${encodeURIComponent(hd.id)}`;
}
