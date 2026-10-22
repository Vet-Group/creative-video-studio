// Needs the compose MinIO: `pnpm services:up`.
// shortcut: checks reachability via MinIO's unauthenticated health endpoint, not the S3 credentials; step 0.3 adds a signed S3 round trip.
import { expect, test } from 'vitest';

try {
  process.loadEnvFile('../../.env');
} catch {
  // No .env file; S3_ENDPOINT must come from the environment.
}
const endpoint = process.env.S3_ENDPOINT;
if (!endpoint) throw new Error('S3_ENDPOINT is not set; copy .env.example to .env');

test('reaches the dev MinIO on the compose port', async () => {
  expect(new URL(endpoint).port).toBe(process.env.CVS_S3_PORT ?? '9400');
  const res = await fetch(new URL('/minio/health/live', endpoint));
  expect(res.status).toBe(200);
});
