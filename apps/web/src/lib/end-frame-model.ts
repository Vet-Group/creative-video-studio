import { withCredit } from '@/components/ModelPicker';

interface Candidate {
  id: string;
  label: string;
  isMock: boolean;
  pairIds: string[];
  supported: boolean;
  endFrame: boolean;
  score: number;
  estimateUsd: string;
  audioEstimateUsd: string | null;
  creditUsd: string | null;
}

/**
 * The model a clip with an end frame runs on: `baseId` (the chosen or default model) when it takes one, else the best-scored supported model that does and that the picker does not lock
 * for its provider's credit (priced as the picker prices it, with audio when `audio` is on); undefined when there is none.
 */
export function endFrameModel<M extends Candidate>(models: M[], baseId: string, audio: boolean): M | undefined {
  const base = models.find((m) => m.id === baseId || m.pairIds.includes(baseId));
  if (base?.endFrame && base.supported) return base;
  return models
    .filter((m) => m.endFrame && m.supported && !withCredit({ id: m.id, label: m.label, isMock: m.isMock, supported: true, estimateUsd: audio && m.audioEstimateUsd != null ? m.audioEstimateUsd : m.estimateUsd, creditUsd: m.creditUsd }).locked)
    .sort((a, b) => b.score - a.score)[0];
}
