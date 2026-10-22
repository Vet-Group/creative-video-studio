// Next runs this once at server start. In dev it makes sure the MinIO bucket exists.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV === 'production') return;
  const { ensureBucket } = await import('./lib/storage');
  await ensureBucket().catch((e) => console.warn('Could not prepare the MinIO bucket (is `pnpm services:up` running?):', e instanceof Error ? e.message : e));
}
