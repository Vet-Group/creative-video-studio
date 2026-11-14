import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SettingsBoundary } from './SettingsBoundary';

// Server rendering never runs an error boundary's catch, so the thrown-child path is covered by its two pieces: the state it sets and what it renders then.
describe('SettingsBoundary', () => {
  it('renders its child while nothing failed', () => {
    expect(renderToStaticMarkup(<SettingsBoundary open={false} onFail={() => {}}><p>dialog</p></SettingsBoundary>)).toBe('<p>dialog</p>');
  });

  it('turns a failed load into an empty fallback', () => {
    expect(SettingsBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    const boundary = new SettingsBoundary({ open: false, onFail: () => {}, children: <p>dialog</p> });
    boundary.state = { failed: true };
    expect(boundary.render()).toBeNull();
  });
});
