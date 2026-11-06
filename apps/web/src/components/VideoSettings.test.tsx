// The video settings block: a group named by its visible title, around whatever controls the page puts in it.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { VideoSettings } from './VideoSettings';

test('the block is a group labelled by its visible title and holds its controls in order', () => {
  const html = renderToStaticMarkup(
    <VideoSettings>
      <span>one</span>
      <span>two</span>
    </VideoSettings>,
  );
  const id = html.match(/aria-labelledby="([^"]+)"/)![1];
  expect(html).toContain('role="group"');
  expect(html).toContain(`<p id="${id}" class="video-settings-title">Cài đặt video</p>`);
  expect(html.indexOf('one')).toBeLessThan(html.indexOf('two'));
});
