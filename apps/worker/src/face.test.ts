import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { faceMatch } from './face';

const file = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
const fixture = (name: string) => file(`./fixtures/face/${name}.jpg`);

describe('faceMatch', () => {
  test('the same person, mirrored and cropped, scores as a match', async () => {
    const m = await faceMatch(fixture('person-a'), fixture('person-a-flipped'));
    expect(m).toHaveProperty('score');
    expect((m as { score: number }).score).toBeGreaterThanOrEqual(0.5);
  }, 60_000);

  test("another person scores below SFace's same-person threshold, rounded to 2 decimals", async () => {
    const m = (await faceMatch(fixture('person-a'), fixture('person-b'))) as { score: number };
    expect(m.score).toBeLessThan(0.363);
    expect(m.score).toBe(Math.round(m.score * 100) / 100);
  }, 60_000);

  test('names the photo that has no face', async () => {
    expect(await faceMatch(fixture('person-a'), fixture('no-face'))).toEqual({ noFace: 'result' });
    expect(await faceMatch(fixture('no-face'), fixture('person-a'))).toEqual({ noFace: 'model' });
  }, 60_000);

  test('the model files are the ones the README names', () => {
    const readme = file('../models/README.md').toString();
    for (const name of ['face_detection_yunet_2023mar.onnx', 'face_recognition_sface_2021dec_int8.onnx']) {
      expect(readme).toContain(createHash('sha256').update(file(`../models/${name}`)).digest('hex'));
    }
  });
});
