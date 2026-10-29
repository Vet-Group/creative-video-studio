import { ImageGeneration } from '@/components/ImageGeneration';
import { exampleFrom, refillFrom } from '@/lib/reuse';

export default async function ImageGenerationPage({ searchParams }: { searchParams: Promise<{ reuse?: string; template?: string; example?: string; model?: string }> }) {
  const q = await searchParams;
  const from = refillFrom(q) ?? exampleFrom(q);
  const model = typeof q.model === 'string' ? q.model : undefined;
  return <ImageGeneration key={`${from ?? ''}|${model ?? ''}`} reuse={from} model={model} />;
}
