import { describe, expect, it } from 'vitest';
import { PRODUCT_VIEWS } from './models';
import { turntableKey } from './queue';
import { TURNTABLE_VIEWS, turntableState } from './turntable';

const jobs = (views: string[], status = 'succeeded') => views.map((view) => ({ view, status }));

describe('the 360 turntable views', () => {
  it('are the 7 horizontal views in the order the camera goes round, without the top', () => {
    expect(TURNTABLE_VIEWS).toEqual(['three-quarter-right', 'right', 'back-three-quarter-right', 'back', 'back-three-quarter-left', 'left', 'three-quarter-left']);
    expect(TURNTABLE_VIEWS.map((id) => PRODUCT_VIEWS.find((v) => v.id === id)!.horizontal)).toEqual([45, 90, 135, 180, 225, 270, 315]);
  });

  it('add the two back three-quarter views to the app between the 3/4 views and the top', () => {
    expect(PRODUCT_VIEWS.map((v) => v.id)).toEqual(['back', 'left', 'right', 'three-quarter-left', 'three-quarter-right', 'back-three-quarter-right', 'back-three-quarter-left', 'top']);
    expect(PRODUCT_VIEWS.filter((v) => v.id.startsWith('back-three')).map((v) => [v.horizontal, v.vertical])).toEqual([[135, 0], [225, 0]]);
  });

  it('keep a Run at a deterministic storage key', () => {
    expect(turntableKey('b1', 'a1')).toBe('turntables/b1-a1.mp4');
  });
});

describe('turntableState', () => {
  it('is ready when every horizontal view succeeded, whatever else the Run holds', () => {
    expect(turntableState([...jobs(TURNTABLE_VIEWS as string[]), ...jobs(['top'], 'failed')])).toEqual({ complete: true, ready: true, missing: [], pending: false });
  });

  it('names the views that are not done, in order, and tells a Run still working from one that stopped', () => {
    const six = TURNTABLE_VIEWS.filter((v) => v !== 'back' && v !== 'right');
    expect(turntableState(jobs(six))).toEqual({ complete: false, ready: false, missing: ['right', 'back'], pending: false });
    const failed = [...jobs(six), { view: 'back', status: 'failed' }, { view: 'right', status: 'timed_out' }];
    expect(turntableState(failed)).toEqual({ complete: true, ready: false, missing: ['right', 'back'], pending: false });
    expect(turntableState([...jobs(six), { view: 'back', status: 'failed' }, { view: 'right', status: 'running' }])).toMatchObject({ complete: true, missing: ['right', 'back'], pending: true });
  });

  it('counts a retried view once it succeeded, and an empty Run as not complete', () => {
    const retried = [...jobs(TURNTABLE_VIEWS as string[]), { view: 'back', status: 'failed' }];
    expect(turntableState(retried).ready).toBe(true);
    expect(turntableState([])).toMatchObject({ complete: false, ready: false, missing: TURNTABLE_VIEWS });
  });
});
