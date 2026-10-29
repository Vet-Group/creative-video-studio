// Self-check of the zip writer: parse what it wrote, then have a standard reader list it.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { zipStream } from './zip';

const source = (...chunks: Uint8Array[]) => async () => new ReadableStream<Uint8Array>({ start: (c) => (chunks.forEach((x) => c.enqueue(x)), c.close()) });
const bytesOf = async (s: ReadableStream<Uint8Array>) => new Uint8Array(await new Response(s).arrayBuffer());

/** A reader that understands zip: bsdtar (Windows, macOS), else Python's zipfile (GNU tar on Linux cannot read zip); null when there is none. */
function lister(): ((file: string) => string) | null {
  const tars = [...(process.platform === 'win32' ? [join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')] : []), 'tar'];
  for (const tar of tars) {
    const v = spawnSync(tar, ['--version'], { encoding: 'utf8' });
    if (v.status === 0 && !v.stdout.includes('GNU')) return (file) => spawnSync(tar, ['-tf', file], { encoding: 'utf8' }).stdout;
  }
  for (const py of ['python3', 'python']) {
    if (spawnSync(py, ['--version']).status === 0) return (file) => spawnSync(py, ['-m', 'zipfile', '-l', file], { encoding: 'utf8' }).stdout;
  }
  return null;
}

describe('zipStream', () => {
  const big = new Uint8Array(70_000).map((_, i) => i % 251);
  const parts = [big.subarray(0, 30_000), big.subarray(30_000)];

  it('writes STORE entries with data descriptors that a standard reader lists', async () => {
    const zip = await bytesOf(zipStream([{ name: 'trống.txt', bytes: 0, open: source() }, { name: '20261029-dat-abcd1234.mp4', bytes: big.length, open: source(...parts) }]));
    const v = new DataView(zip.buffer);
    const eocd = zip.length - 22;
    expect(v.getUint32(eocd, true)).toBe(0x06054b50);
    expect(v.getUint16(eocd + 10, true)).toBe(2);
    const cdSize = v.getUint32(eocd + 12, true);
    let p = v.getUint32(eocd + 16, true);
    expect(p + cdSize).toBe(eocd);
    const seen: { name: string; size: number; crc: number }[] = [];
    for (let i = 0; i < 2; i++) {
      expect(v.getUint32(p, true)).toBe(0x02014b50);
      expect(v.getUint16(p + 8, true)).toBe(0x0808);
      expect(v.getUint16(p + 10, true)).toBe(0); // STORE
      const crc = v.getUint32(p + 16, true);
      const size = v.getUint32(p + 24, true);
      expect(v.getUint32(p + 20, true)).toBe(size);
      const n = v.getUint16(p + 28, true);
      const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + n));
      const local = v.getUint32(p + 42, true);
      expect(v.getUint32(local, true)).toBe(0x04034b50);
      const data = local + 30 + v.getUint16(local + 26, true);
      expect(crc32(zip.subarray(data, data + size))).toBe(crc);
      // The data descriptor right after the bytes repeats the CRC and sizes.
      expect([v.getUint32(data + size, true), v.getUint32(data + size + 4, true), v.getUint32(data + size + 12, true)]).toEqual([0x08074b50, crc, size]);
      seen.push({ name, size, crc });
      p += 46 + n;
    }
    expect(seen).toEqual([
      { name: 'trống.txt', size: 0, crc: 0 },
      { name: '20261029-dat-abcd1234.mp4', size: big.length, crc: crc32(big) },
    ]);

    const list = lister();
    if (!list) return console.warn('no zip reader (bsdtar or python) found; the standard-reader check is skipped');
    const dir = mkdtempSync(join(tmpdir(), 'cvs-zip-'));
    try {
      const file = join(dir, 'test.zip');
      writeFileSync(file, zip);
      expect(list(file)).toContain('20261029-dat-abcd1234.mp4');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('errors the stream when a source fails part-way', async () => {
    const failing = async () =>
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array([1, 2, 3]));
          c.error(new Error('S3 went away'));
        },
      });
    await expect(bytesOf(zipStream([{ name: 'a.mp4', bytes: 3, open: failing }]))).rejects.toThrow('S3 went away');
  });

  it('refuses 4 GiB or more before sending anything', () => {
    expect(() => zipStream([{ name: 'a', bytes: 2 ** 32, open: source() }])).toThrow(RangeError);
  });
});
