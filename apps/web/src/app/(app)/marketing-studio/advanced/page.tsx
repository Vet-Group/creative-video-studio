import { MarketingStudio } from '@/components/MarketingStudio';
import { refillFrom } from '@/lib/reuse';

export default async function MarketingStudioAdvancedPage({ searchParams }: { searchParams: Promise<{ reuse?: string; template?: string }> }) {
  const from = refillFrom(await searchParams);
  return <MarketingStudio key={from} format="advanced" reuse={from} />;
}
