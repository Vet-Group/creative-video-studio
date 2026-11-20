import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { SharedVideos } from './SharedVideos';

const tee = { id: 'an-1', title: 'Áo thun trơn', sharedAt: '2026-11-15T10:00:00Z', sourceAssetId: 'vid-1', durationS: 11.4, sceneCount: 3 };
const pick = async () => undefined;

test('the shelf shows each shared video as a card with its preview, title, length and scene count, the one on view marked', () => {
  const html = renderToStaticMarkup(<SharedVideos busy={false} currentId="an-1" onPick={pick} initial={[tee, { ...tee, id: 'an-2', title: 'Hoodie', sourceAssetId: 'vid-2', durationS: null }]} />);
  expect(html).toContain('Video mẫu');
  expect(html).toContain('Chọn một video mẫu, thêm ảnh sản phẩm của bạn');
  expect(html.match(/<video[^>]*preload="metadata"/g)).toHaveLength(2);
  expect(html).not.toContain('/content'); // a card's video loads only once it scrolls into view
  expect(html).toContain('Áo thun trơn');
  expect(html).toContain('11.4 giây · 3 cảnh');
  expect(html).toContain('Hoodie');
  expect(html).toContain('>3 cảnh<'); // no length when the analysis has none
  expect(html.match(/aria-current="true"/g)).toHaveLength(1);
});

test('the shelf renders nothing while no video is shared', () => {
  expect(renderToStaticMarkup(<SharedVideos busy={false} onPick={pick} />)).toBe('');
});
