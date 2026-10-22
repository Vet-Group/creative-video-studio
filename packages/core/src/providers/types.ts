import type { ModelConfig, Ratio } from '../models';

export interface SubmitRequest {
  model: ModelConfig;
  prompt: string;
  /** The first image is the main product. */
  imageUrls: string[];
  ratio: Ratio;
  durationSec: number;
}

/** fal's queue URLs include the model endpoint, so polling needs the model as well as the id. */
export interface ProviderJob {
  providerJobId: string;
  model: ModelConfig;
}

export type CostSource = 'reported' | 'estimate';

export type ProviderStatus =
  | { state: 'queued' | 'running' }
  | { state: 'succeeded'; outputUrl: string; costUsd: number; costSource: CostSource }
  | { state: 'failed' | 'canceled'; error: string; costUsd: number; costSource: CostSource };

export interface VideoProvider {
  submit(req: SubmitRequest): Promise<{ providerJobId: string }>;
  status(job: ProviderJob): Promise<ProviderStatus>;
  // fal cannot cancel a running job, so its adapter returns { supported: false }.
  cancel(job: ProviderJob): Promise<{ supported: boolean }>;
}
