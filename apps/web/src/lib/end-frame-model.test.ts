import { expect, test } from 'vitest';
import { endFrameModel } from './end-frame-model';

const model = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: id, isMock: false, pairIds: [id], supported: true, endFrame: true, score: 50, estimateUsd: '1.0000', audioEstimateUsd: null as string | null, creditUsd: null as string | null, ...extra });

test('keeps the base model when it takes an end frame, whatever scores better', () => {
  const list = [model('a', { score: 10 }), model('b', { score: 90 })];
  expect(endFrameModel(list, 'a', false)?.id).toBe('a');
  expect(endFrameModel(list, 'a-twin', false)?.id).toBe('b'); // an id the list does not hold has no base
  expect(endFrameModel([model('a', { pairIds: ['a', 'a-twin'], score: 10 }), model('b', { score: 90 })], 'a-twin', false)?.id).toBe('a'); // a pair's twin is its entry
});

test('else takes the best-scored supported model that takes an end frame', () => {
  const list = [model('plain', { endFrame: false, score: 99 }), model('low', { score: 20 }), model('high', { score: 80 }), model('off', { score: 95, supported: false })];
  expect(endFrameModel(list, 'plain', false)?.id).toBe('high');
  expect(endFrameModel(list, '', false)?.id).toBe('high');
});

test('skips a model its provider credit locks, priced with audio when audio is on', () => {
  // 0.5 left: the silent price 0.4 fits, the audio price 0.6 does not.
  const list = [model('plain', { endFrame: false }), model('best', { score: 80, estimateUsd: '0.4000', audioEstimateUsd: '0.6000', creditUsd: '0.5' }), model('next', { score: 40 })];
  expect(endFrameModel(list, 'plain', false)?.id).toBe('best');
  expect(endFrameModel(list, 'plain', true)?.id).toBe('next');
  // A model with no audio price is priced as it is, with audio on too.
  expect(endFrameModel([model('plain', { endFrame: false }), model('mute', { estimateUsd: '0.4000', creditUsd: '0.5' })], 'plain', true)?.id).toBe('mute');
});

test('is undefined when no model takes an end frame, or all are unsupported or locked', () => {
  expect(endFrameModel([model('plain', { endFrame: false })], 'plain', false)).toBeUndefined();
  expect(endFrameModel([model('off', { supported: false })], 'off', false)).toBeUndefined();
  expect(endFrameModel([model('plain', { endFrame: false }), model('locked', { estimateUsd: '2.0000', creditUsd: '1' })], 'plain', false)).toBeUndefined();
  expect(endFrameModel([], '', false)).toBeUndefined();
});
