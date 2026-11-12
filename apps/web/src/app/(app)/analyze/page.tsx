import { notFound } from 'next/navigation';
import { AnalyzeView } from '@/components/AnalyzeView';
import { reaAnalyzeEnabled } from '@/lib/analyze';

export default function AnalyzePage() {
  if (!reaAnalyzeEnabled()) notFound();
  return <AnalyzeView />;
}
