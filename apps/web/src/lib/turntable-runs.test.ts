import { TURNTABLE_VIEWS } from '@cvs/core/turntable';
import { expect, test } from 'vitest';
import type { TrayJob } from './api';
import { turntableRuns } from './turntable-runs';

const job = (id: string, view: string, over: Partial<TrayJob> = {}) => ({ id, feature: 'multi_angle', batch: 'run', view, status: 'succeeded', inputAssetIds: ['photo'], ...over }) as TrayJob;
const seven = (batch = 'run', photo = 'photo') => TURNTABLE_VIEWS.map((v) => job(`${batch}-${v}`, v, { batch, inputAssetIds: [photo] }));

test('finds a Run that asked for all 7 views and keys it by its last card in the list', () => {
  const list = [...seven(), job('run-top', 'top')];
  const runs = turntableRuns(list);
  expect([...runs.keys()]).toEqual(['run-top']);
  expect(runs.get('run-top')).toMatchObject({ batch: 'run', photo: 'photo' });
  expect(runs.get('run-top')!.jobs).toHaveLength(8);
});

test('leaves out a Run with fewer than 7 views, another app, a job without a Run and a photo-less job, and keeps Runs apart by Run and photo', () => {
  const cut = seven('cut').slice(0, 6);
  const other = seven('pets').map((j) => ({ ...j, feature: 'pet_portrait' }));
  const plain = seven('plain').map((j) => ({ ...j, batch: null }));
  const twoPhotos = [...seven('same', 'p1'), ...seven('same', 'p2').slice(0, 3)];
  const runs = turntableRuns([...cut, ...other, ...plain, ...twoPhotos, ...seven('b')]);
  expect([...runs.values()].map((r) => `${r.batch}/${r.photo}`)).toEqual(['same/p1', 'b/photo']);
});

test('keeps failed views in the Run, so the page can name them', () => {
  const list = seven().map((j) => (j.view === 'back' ? { ...j, status: 'failed' } : j)) as TrayJob[];
  expect([...turntableRuns(list).values()][0]!.jobs.find((j) => j.view === 'back')!.status).toBe('failed');
});
