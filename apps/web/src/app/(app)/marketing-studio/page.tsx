import { MarketingStudio } from '@/components/MarketingStudio';
import { marketingWizardDefault } from '@/lib/marketing-wizard';
import { exampleFrom, refillFrom } from '@/lib/reuse';

export default async function MarketingStudioPage({ searchParams }: { searchParams: Promise<{ reuse?: string; template?: string; example?: string; recipe?: string }> }) {
  const q = await searchParams;
  const from = refillFrom(q) ?? exampleFrom(q);
  return <MarketingStudio key={from} reuse={from} recipe={q.recipe === '1'} wizardDefault={await marketingWizardDefault()} />;
}
