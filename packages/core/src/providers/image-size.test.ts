import { expect, test } from 'vitest';
import { imageSize } from './image-size';

const bytes = (...parts: (number[] | string)[]) => Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const u32 = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le = (n: number, len: number) => Array.from({ length: len }, (_, i) => (n >> (8 * i)) & 255);
const pad = (n: number) => new Array<number>(n).fill(0);

test('reads the size of a png from its header', () => {
  expect(imageSize(bytes([0x89], 'PNG', [13, 10, 26, 10], u32(13), 'IHDR', u32(1920), u32(1080), pad(10)))).toEqual({ width: 1920, height: 1080 });
});

test('reads the size of a jpeg after other segments, skipping the DHT marker that looks like a frame', () => {
  const app0 = [0xff, 0xe0, 0, 6, 0, 0, 0, 0];
  const dht = [0xff, 0xc4, 0, 4, 0, 0];
  const sof = [0xff, 0xc2, 0, 17, 8, ...[0x03, 0x00], ...[0x04, 0x00], 3, ...pad(9)]; // progressive; height 768, width 1024
  expect(imageSize(bytes([0xff, 0xd8], app0, dht, sof, pad(4)))).toEqual({ width: 1024, height: 768 });
});

test.each([
  ['lossy', 'VP8 ', [...pad(7), 0x9d, 0x01, 0x2a, ...le(800, 2), ...le(600, 2)]],
  ['lossless', 'VP8L', [...le(0, 4), 0x2f, ...le(((600 - 1) << 14) | (800 - 1), 4)]],
  ['extended', 'VP8X', [...le(10, 4), ...pad(4), ...le(800 - 1, 3), ...le(600 - 1, 3)]],
])('reads the size of a %s webp', (_what, fourcc, chunk) => {
  expect(imageSize(bytes('RIFF', [0, 0, 0, 0], 'WEBP', fourcc, chunk, pad(20)))).toEqual({ width: 800, height: 600 });
});

test('skips repeated fill bytes before a jpeg marker, and stops at the end of the data', () => {
  const sof = [0xff, 0xff, 0xff, 0xc0, 0, 17, 8, ...[0x03, 0x00], ...[0x04, 0x00], 3, ...pad(9)];
  expect(imageSize(bytes([0xff, 0xd8], [0xff, 0xe0, 0, 4, 0, 0], sof, pad(4)))).toEqual({ width: 1024, height: 768 });
  expect(imageSize(bytes([0xff, 0xd8], pad(0), new Array<number>(40).fill(0xff)))).toBeUndefined();
});

test('gives up on text, a short buffer and a jpeg without a frame', () => {
  expect(imageSize(bytes('not an image at all, just some text.'))).toBeUndefined();
  expect(imageSize(new Uint8Array(5))).toBeUndefined();
  expect(imageSize(bytes([0xff, 0xd8], [0xff, 0xe0, 0, 4, 0, 0], pad(30)))).toBeUndefined();
});
