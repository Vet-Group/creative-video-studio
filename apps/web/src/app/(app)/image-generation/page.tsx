import { ImageGeneration } from '@/components/ImageGeneration';

export default async function ImageGenerationPage({ searchParams }: { searchParams: Promise<{ reuse?: string }> }) {
  const { reuse } = await searchParams;
  return <ImageGeneration key={reuse} reuse={typeof reuse === 'string' ? reuse : undefined} />;
}
