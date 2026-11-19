import { expect, test } from 'vitest';
import { parseCsv } from './csv';

test('splits rows on CRLF or LF and fields on commas, dropping a byte order mark and a last line break', () => {
  expect(parseCsv('\uFEFFName,Pet Name\r\n#1001,Max\n#1002,Bella\r\n')).toEqual([['Name', 'Pet Name'], ['#1001', 'Max'], ['#1002', 'Bella']]);
  expect(parseCsv('a,b')).toEqual([['a', 'b']]);
  expect(parseCsv('a,,\n')).toEqual([['a', '', '']]);
  expect(parseCsv('')).toEqual([]);
});

test('reads a quoted field with commas, line breaks and doubled quotes inside it', () => {
  expect(parseCsv('Pet Name,Note\r\n"Max, Jr.","line one\r\nline two"\n"Say ""hi""",x')).toEqual([
    ['Pet Name', 'Note'],
    ['Max, Jr.', 'line one\r\nline two'],
    ['Say "hi"', 'x'],
  ]);
  expect(parseCsv('"",""')).toEqual([['', '']]);
  expect(parseCsv('"unclosed,still\nhere')).toEqual([['unclosed,still\nhere']]);
});

test('keeps a quote inside an unquoted field, and a blank line as one empty field', () => {
  expect(parseCsv('5" mug,ok\n\nlast')).toEqual([['5" mug', 'ok'], [''], ['last']]);
});
