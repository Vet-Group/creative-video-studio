// A lazy card leaves its poster off until it comes near the screen (the effect that sets it does not run on the server), so a long grid no longer fetches
// every still on open; a card that is not lazy, and a still with no loop, keep theirs from the first paint.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { CardMedia } from './CardMedia';

const loop = { video: '/api/samples/a.mp4', poster: '/api/samples/a.jpg' };

test('a loop shows its poster at once unless the card is lazy', () => {
  expect(renderToStaticMarkup(<CardMedia {...loop} />)).toContain('poster="/api/samples/a.jpg"');
  const lazy = renderToStaticMarkup(<CardMedia {...loop} lazy />);
  expect(lazy).toContain('src="/api/samples/a.mp4"');
  expect(lazy).not.toContain('poster=');
});

test('a still with no loop keeps the browser lazy loading it already had', () => {
  expect(renderToStaticMarkup(<CardMedia video={null} poster="/api/samples/a.jpg" lazy />)).toContain('loading="lazy"');
});
