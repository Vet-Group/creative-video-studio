import { MarketingStudio } from '@/components/MarketingStudio';

export default async function MarketingStudioPage({ searchParams }: { searchParams: Promise<{ reuse?: string }> }) {
  const { reuse } = await searchParams;
  return <MarketingStudio key={reuse} reuse={typeof reuse === 'string' ? reuse : undefined} />;
}
