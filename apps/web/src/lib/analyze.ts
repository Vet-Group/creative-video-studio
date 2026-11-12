// The reference-video analysis feature (rea-video). Off by default: the /api/analyses routes 404 and the worker
// queue is not created until a deploy sets REA_ANALYZE_ENABLED=1 (Stage 3, once rea-video is installed on the
// worker). Mirrors the worker's reaAnalyzeEnabled (apps/worker/src/analyze.ts); the two tiers read the same env.
export const reaAnalyzeEnabled = (): boolean => process.env.REA_ANALYZE_ENABLED === '1';

// rea-video's `format` is a short label the model may return localized (English or, seen in spikes, Chinese). Map the
// common ones to Vietnamese; fall back to the model's own text when it is something we have not labelled.
const FORMAT_LABELS: Record<string, string> = {
  'product showcase': 'Giới thiệu sản phẩm',
  商品展示: 'Giới thiệu sản phẩm',
  unboxing: 'Mở hộp',
  开箱: 'Mở hộp',
  review: 'Đánh giá',
  测评: 'Đánh giá',
  tutorial: 'Hướng dẫn',
  教程: 'Hướng dẫn',
  ugc: 'UGC',
  vlog: 'Vlog',
  lifestyle: 'Phong cách sống',
  testimonial: 'Lời chứng thực',
  advertisement: 'Quảng cáo',
  广告: 'Quảng cáo',
};

export const formatLabel = (format: string): string => {
  const k = format.trim();
  return FORMAT_LABELS[k.toLowerCase()] ?? FORMAT_LABELS[k] ?? format;
};
