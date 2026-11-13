/**
 * The entries of the model picker that are one model at other resolutions (ids `x`, `x-480p`, `x-1080p`), the chosen one included, lowest resolution first. An entry that stands for a
 * duplicate pair (migration 0078: the listed row is the cheaper twin, `seedance-2.5-byteplus` for `seedance-2.5-image`) matches through the ids of its whole pair.
 */
const baseId = (id: string): string => id.replace(/-(1080p|480p)$/, '');

export function resolutionVariants<T extends { id: string; resolution: string | null; supported: boolean; pairIds: string[] }>(models: T[], chosen: T): T[] {
  const bases = new Set(chosen.pairIds.map(baseId));
  return models
    .filter((m) => m.resolution && m.pairIds.some((id) => bases.has(baseId(id))) && (m.supported || m.id === chosen.id))
    .sort((a, b) => parseInt(a.resolution!) - parseInt(b.resolution!));
}
