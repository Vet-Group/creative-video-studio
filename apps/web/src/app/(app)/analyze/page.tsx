import { notFound } from 'next/navigation';
import { AnalyzeView } from '@/components/AnalyzeView';
import { reaAnalyzeEnabled } from '@/lib/analyze';
import { reaRemakeEnabled } from '@/lib/remake';

export default function AnalyzePage() {
  if (!reaAnalyzeEnabled()) notFound();
  return <AnalyzeView remakeEnabled={reaRemakeEnabled()} />;
}
