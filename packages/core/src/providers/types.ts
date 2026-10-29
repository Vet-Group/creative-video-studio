import type { ImageModelConfig, ModelConfig, Ratio } from '../models';

export interface SubmitRequest {
  model: ModelConfig;
  prompt: string;
  /** The first image is the main product. */
  imageUrls: string[];
  /** 'auto' only for Motion Control, whose output follows its reference video. */
  ratio: Ratio | 'auto';
  durationSec: number;
  /** Native audio on; only the endpoints of AUDIO_USD_PER_SECOND read it, and the others stay silent. */
  audio?: boolean;
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

export interface ImageSubmitRequest {
  model: ImageModelConfig;
  prompt: string;
  /** The first image is the main one; Try On sends the person first, then the garment. */
  imageUrls: string[];
  /** One of the model's ratios, or 'auto'. */
  ratio: string;
  /** A key of the model's imagePrices. */
  resolution: string;
  /** Only GPT Image reads it ('auto', 'low', 'medium' or 'high'); the price is estimated at 'high', which is also the default. */
  quality?: string;
  /** One of the model's thinking levels (lowercase, as fal takes them); absent leaves the provider's default. The price per image does not change with it. */
  thinking?: string;
}

/** Image prices depend on the resolution, so polling needs it as well as the id. */
export interface ImageProviderJob {
  providerJobId: string;
  model: ImageModelConfig;
  resolution: string;
}

/** Like VideoProvider; a succeeded status carries the cost of the one image. */
export interface ImageProvider {
  submit(req: ImageSubmitRequest): Promise<{ providerJobId: string }>;
  status(job: ImageProviderJob): Promise<ProviderStatus>;
  cancel(job: ImageProviderJob): Promise<{ supported: boolean }>;
}
