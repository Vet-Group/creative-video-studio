import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { TrayJob } from '@/lib/api';
import { navGroups } from '@/lib/sidebar';
import { CommandPalette, paletteKey } from './CommandPalette';

const jobs = [
  { id: 'j1', status: 'succeeded', feature: 'image', format: null, createdAt: '2026-11-20T03:00:00Z', text: 'một chiếc áo trắng' },
  { id: 'j2', status: 'failed', feature: 'video', format: null, createdAt: '2026-11-20T02:00:00Z', text: null },
] as unknown as TrayJob[];
vi.mock('./jobs', async (orig) => ({ ...(await orig<typeof import('./jobs')>()), useJobs: () => ({ jobs }) }));

const render = (admin: boolean) => renderToStaticMarkup(<CommandPalette open onClose={() => undefined} pages={navGroups(admin).flatMap((g) => g.items)} mac={false} />);
const key = (k: string, mods: { ctrlKey?: boolean; metaKey?: boolean } = {}) => ({ key: k, ctrlKey: false, metaKey: false, ...mods });

test('↑ and ↓ move the active option round the ends, Enter opens it here and Ctrl or ⌘ with Enter in a new tab; other keys stay with the box', () => {
  expect(paletteKey(key('ArrowDown'), 0, 3)).toEqual({ active: 1 });
  expect(paletteKey(key('ArrowDown'), 2, 3)).toEqual({ active: 0 });
  expect(paletteKey(key('ArrowUp'), 0, 3)).toEqual({ active: 2 });
  expect(paletteKey(key('ArrowUp'), 2, 3)).toEqual({ active: 1 });
  expect(paletteKey(key('Enter'), 1, 3)).toEqual({ open: 'here' });
  expect(paletteKey(key('Enter', { ctrlKey: true }), 1, 3)).toEqual({ open: 'tab' });
  expect(paletteKey(key('Enter', { metaKey: true }), 1, 3)).toEqual({ open: 'tab' });
  expect(paletteKey(key('a'), 1, 3)).toBeNull();
  expect(paletteKey(key('Home'), 1, 3)).toBeNull(); // the caret's, in the text
  expect(paletteKey(key('Enter'), 0, 0)).toBeNull(); // nothing matched: nothing to open
});

test('the box is a combobox over a listbox of options whose first is active, grouped as pages, apps and recent jobs', () => {
  const html = render(false);
  const listId = html.match(/id="([^"]+)" role="listbox"/)![1];
  expect(html).toMatch(new RegExp(`role="combobox"[^>]*aria-controls="${listId}"`));
  const activeId = html.match(/aria-activedescendant="([^"]+)"/)![1];
  expect(html).toContain(`<a id="${activeId}" role="option" aria-selected="true" tabindex="-1" href="/explore">`); // out of the tab order: the box keeps the focus
  expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
  expect(html).toMatch(/role="combobox"[^>]*aria-expanded="true"/);
  expect(html).toContain('<p class="palette-empty" role="status"></p>'); // the live region is there, empty while there are results
  expect([...html.matchAll(/class="palette-group"[^>]*>([^<]+)</g)].map((m) => m[1])).toEqual(['Trang', 'Ứng dụng', 'Lượt tạo gần đây']);
  // A finished job opens in the Library, a failed one on its page, as the tray's links do; the member's words are shown.
  expect(html).toContain('href="/library?item=j1"');
  expect(html).toContain('một chiếc áo trắng');
  expect(html).toContain('href="/create"');
  expect(html).toContain('href="/apps/background-changer"');
});

test('the Admin pages are offered only to an Admin, as in the sidebar', () => {
  expect(render(false)).not.toContain('/admin/overview');
  expect(render(true)).toContain('href="/admin/overview"');
});
