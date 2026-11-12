import { notFound } from 'next/navigation';
import { AnalyzeView } from '@/components/AnalyzeView';
import { reaAnalyzeEnabled } from '@/lib/analyze';
import { reaRemakeEnabled } from '@/lib/remake';

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ analysis?: string | string[] }> }) {
  if (!reaAnalyzeEnabled()) notFound();
  const { analysis } = await searchParams;
  // An analysis id to open (a shared link): an id-shaped value only, which the API still checks belongs to the member.
  const initialId = typeof analysis === 'string' && /^[\w-]{1,64}$/.test(analysis) ? analysis : undefined;
  return <AnalyzeView initialId={initialId} remakeEnabled={reaRemakeEnabled()} />;
}
