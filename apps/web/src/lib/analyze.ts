// The reference-video analysis feature (rea-video). Off by default: the /api/analyses routes 404 and the worker
// queue is not created until a deploy sets REA_ANALYZE_ENABLED=1 (Stage 3, once rea-video is installed on the
// worker). Mirrors the worker's reaAnalyzeEnabled (apps/worker/src/analyze.ts); the two tiers read the same env.
export const reaAnalyzeEnabled = (): boolean => process.env.REA_ANALYZE_ENABLED === '1';
