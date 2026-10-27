import { MarketingStudio } from '@/components/MarketingStudio';

export default async function MarketingStudioAdvancedPage({ searchParams }: { searchParams: Promise<{ reuse?: string }> }) {
  const { reuse } = await searchParams;
  return <MarketingStudio key={reuse} format="advanced" reuse={typeof reuse === 'string' ? reuse : undefined} />;
}
