import { ImageGeneration } from '@/components/ImageGeneration';
import { refillFrom } from '@/lib/reuse';

export default async function ImageGenerationPage({ searchParams }: { searchParams: Promise<{ reuse?: string; template?: string }> }) {
  const from = refillFrom(await searchParams);
  return <ImageGeneration key={from} reuse={from} />;
}
