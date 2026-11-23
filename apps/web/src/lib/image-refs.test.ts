import { describe, expect, it } from 'vitest';
import { imageToken, insertImageToken } from './image-refs';

describe('imageToken', () => {
  it('counts the Nth attached image from 1, as the adapters read it', () => {
    expect(imageToken(1)).toBe('[Image1]');
    expect(imageToken(3)).toBe('[Image3]');
  });
});

describe('insertImageToken', () => {
  it('puts the token at the caret and leaves the caret just after it', () => {
    expect(insertImageToken('put on a table', 1, 3, 3)).toEqual({ text: 'put [Image1] on a table', caret: 12 });
    expect(insertImageToken('put on a table', 2, 4, 4)).toEqual({ text: 'put [Image2] on a table', caret: 13 });
  });
  it('spaces the token from a word on either side', () => {
    expect(insertImageToken('wear', 1, 4, 4)).toEqual({ text: 'wear [Image1]', caret: 13 });
    expect(insertImageToken('wear on', 2, 5, 5)).toEqual({ text: 'wear [Image2] on', caret: 14 });
    expect(insertImageToken('wear on', 2, 4, 4)).toEqual({ text: 'wear [Image2] on', caret: 13 });
    expect(insertImageToken('a, b', 1, 1, 1)).toEqual({ text: 'a [Image1], b', caret: 10 });
  });
  it('replaces a selection', () => {
    expect(insertImageToken('the PRODUCT here', 2, 4, 11)).toEqual({ text: 'the [Image2] here', caret: 12 });
  });
  it('inserts into an empty prompt, and at the end when the caret is past it', () => {
    expect(insertImageToken('', 1, 0, 0)).toEqual({ text: '[Image1]', caret: 8 });
    expect(insertImageToken('hi', 1, 99, 99)).toEqual({ text: 'hi [Image1]', caret: 11 });
  });
  it('refuses a result over the limit and takes one that just fits', () => {
    expect(insertImageToken('abcd', 1, 4, 4, 12)).toBeNull();
    expect(insertImageToken('abc', 1, 3, 3, 12)).toEqual({ text: 'abc [Image1]', caret: 12 });
    expect(insertImageToken('abcdefgh', 1, 4, 8, 13)).toEqual({ text: 'abcd [Image1]', caret: 13 }); // the replaced selection frees its room
    expect(insertImageToken('abcdefgh', 1, 4, 8, 12)).toBeNull();
  });
});
