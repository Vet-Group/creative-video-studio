import { MarketingStudio } from '@/components/MarketingStudio';
import { exampleFrom, refillFrom } from '@/lib/reuse';

export default async function MarketingStudioAdvancedPage({ searchParams }: { searchParams: Promise<{ reuse?: string; template?: string; example?: string }> }) {
  const q = await searchParams;
  const from = refillFrom(q) ?? exampleFrom(q);
  return <MarketingStudio key={from} format="advanced" reuse={from} />;
}
