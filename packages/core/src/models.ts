export type Ratio = '9:16' | '1:1';

export interface ModelConfig {
  id: string;
  provider: 'fal' | 'replicate' | 'mock';
  /** The provider's model path. */
  endpoint: string;
  label: string;
  ratios: Ratio[];
  durationsSec: number[];
  maxImages: number;
  /** For example '1080p'. */
  outputResolution: string;
  usdPerSecond: number;
  /** The response field that carries the billed amount; null when the API returns none. */
  billedAmountField: string | null;
  /** Where each fact above was read: field name to source URL and read date. */
  sources: Record<string, { url: string; readAt: string }>;
}

/** The USD a Run of `durationSec` reserves at the model's price, as a 4-decimal string (a mock job books 0 in the ledger regardless). */
export const estimateUsd = (usdPerSecond: number | string, durationSec: number): string => (Number(usdPerSecond) * durationSec).toFixed(4);
