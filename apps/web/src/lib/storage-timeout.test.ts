// The S3 clients' idle limit, against a local server that sends the headers and then stalls the body, as a dropped video range leaves it.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { expect, test } from 'vitest';
import { REQUEST_HANDLER } from './storage';

test('a body that stops coming frees its socket after the idle limit instead of holding it', async () => {
  expect(REQUEST_HANDLER.socketTimeout).toBe(60_000);
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': '1000' });
    res.write(Buffer.alloc(10)); // then nothing more
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    // The same handler with a short limit, so the test does not wait a minute.
    const client = new S3Client({ endpoint: `http://127.0.0.1:${port}`, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: 'a', secretAccessKey: 'b' }, requestHandler: { ...REQUEST_HANDLER, socketTimeout: 300 } });
    const res = await client.send(new GetObjectCommand({ Bucket: 'b', Key: 'k' }));
    const started = Date.now();
    await expect(res.Body!.transformToByteArray()).rejects.toThrow(/timed out after 300 ms of inactivity/);
    expect(Date.now() - started).toBeLessThan(3_000);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}, 10_000);
