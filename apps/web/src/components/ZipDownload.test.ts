import { expect, test } from 'vitest';
import { span } from './ZipDownload';

test('a Shift click spans from the last item clicked to this one, both ends in, in either direction', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  expect(span(order, 'b', 'd')).toEqual(['b', 'c', 'd']);
  expect(span(order, 'd', 'b')).toEqual(['b', 'c', 'd']);
  expect(span(order, 'c', 'c')).toEqual(['c']);
});

test('with no earlier click, or one that left the page, it is the one item', () => {
  expect(span(['a', 'b'], null, 'b')).toEqual(['b']);
  expect(span(['a', 'b'], 'gone', 'b')).toEqual(['b']);
  expect(span([], 'a', 'b')).toEqual(['b']);
});
