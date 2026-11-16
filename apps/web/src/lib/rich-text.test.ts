import { describe, expect, it } from 'vitest';
import { inline, parseRich } from './rich-text';

const t = (text: string) => ({ kind: 'text', text });

describe('parseRich', () => {
  it('keeps single line breaks inside a paragraph and splits paragraphs on a blank line', () => {
    expect(parseRich('Dòng một\nDòng hai\n\n  \nĐoạn sau')).toEqual([
      { kind: 'para', lines: [[t('Dòng một')], [t('Dòng hai')]] },
      { kind: 'para', lines: [[t('Đoạn sau')]] },
    ]);
  });

  it('turns "1." lines into an ordered list that keeps its first number, and "-" lines into a bullet list', () => {
    expect(parseRich('Đã xong:\n3. Ba\n4) Bốn\n- Chấm')).toEqual([
      { kind: 'para', lines: [[t('Đã xong:')]] },
      { kind: 'list', ordered: true, start: 3, items: [[[t('Ba')]], [[t('Bốn')]]] },
      { kind: 'list', ordered: false, start: 1, items: [[[t('Chấm')]]] },
    ]);
  });

  it('keeps a line without a marker under the list item above it', () => {
    expect(parseRich('1. Mục một\n   tiếp theo\n2. Mục hai')).toEqual([
      { kind: 'list', ordered: true, start: 1, items: [[[t('Mục một')], [t('tiếp theo')]], [[t('Mục hai')]]] },
    ]);
  });

  it('does not read numbers, prices or dashes inside words as list markers', () => {
    expect(parseRich('1.5 triệu\n-5% giá\n2026 là năm')).toEqual([{ kind: 'para', lines: [[t('1.5 triệu')], [t('-5% giá')], [t('2026 là năm')]] }]);
  });

  it('reads CRLF text like LF text', () => {
    expect(parseRich('a\r\n\r\nb')).toEqual(parseRich('a\n\nb'));
  });

  it('returns nothing for blank text', () => {
    expect(parseRich(' \n\n ')).toEqual([]);
  });
});

describe('inline', () => {
  it('marks **bold** and http(s) links, leaving trailing punctuation outside the link', () => {
    expect(inline('Xem **mẫu mới** tại https://video.vetgroup.net/create. Xong')).toEqual([
      t('Xem '),
      { kind: 'bold', text: 'mẫu mới' },
      t(' tại '),
      { kind: 'link', text: 'https://video.vetgroup.net/create' },
      t('. Xong'),
    ]);
  });

  it('links only http and https, never other schemes', () => {
    expect(inline('javascript:alert(1) ftp://x.vn')).toEqual([t('javascript:alert(1) ftp://x.vn')]);
  });

  it('leaves a lone ** as text', () => {
    expect(inline('a ** b')).toEqual([t('a ** b')]);
  });
});
