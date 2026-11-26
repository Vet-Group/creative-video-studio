// Next runs this once at server start. In dev it makes sure the MinIO bucket exists; in production, with BILLING_AUTO_CLOSE=1, it runs the monthly billing close.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV === 'production') {
    if (process.env.BILLING_AUTO_CLOSE !== '1') return;
    const { autoCloseLastMonth } = await import('./lib/billing');
    // Hourly, because the close is due from 08:00 ICT on day 1 and is retried later that month if the server was down; it does nothing once a month is closed.
    const run = () =>
      autoCloseLastMonth()
        .then((r) => r.did === 'closed' && console.log(`billing: closed ${r.month} automatically; Lark:`, JSON.stringify(r.lark)))
        .catch((e) => console.error('billing: automatic close failed:', e instanceof Error ? e.message : e));
    setTimeout(run, 60_000).unref();
    setInterval(run, 3_600_000).unref();
    return;
  }
  const { ensureBucket } = await import('./lib/storage');
  await ensureBucket().catch((e) => console.warn('Could not prepare the MinIO bucket (is `pnpm services:up` running?):', e instanceof Error ? e.message : e));
}
