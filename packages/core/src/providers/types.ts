import type { ModelConfig, Ratio } from '../models';

export interface SubmitRequest {
  model: ModelConfig;
  prompt: string;
  /** The first image is the main product. */
  imageUrls: string[];
  ratio: Ratio;
  durationSec: number;
}

export interface ProviderStatus {
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  outputUrl?: string;
  error?: string;
  costUsd?: number;
  costSource?: 'reported' | 'estimate';
}

export interface VideoProvider {
  submit(req: SubmitRequest): Promise<{ providerJobId: string }>;
  status(providerJobId: string): Promise<ProviderStatus>;
  // fal cannot cancel a running job, so its adapter returns { supported: false }.
  cancel(providerJobId: string): Promise<{ supported: boolean }>;
}
