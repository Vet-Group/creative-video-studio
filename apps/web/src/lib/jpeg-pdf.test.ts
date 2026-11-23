import sharp from 'sharp';
import { expect, test } from 'vitest';
import { jpegPdf } from './jpeg-pdf';

test('wraps a JPEG in a one-page A4 PDF whose xref offsets, startxref and image size are right', async () => {
  const jpeg = await sharp({ create: { width: 800, height: 1200, channels: 3, background: '#c33' } }).jpeg().toBuffer();
  const pdf = Buffer.from(jpegPdf(jpeg, 800, 1200));
  const text = pdf.toString('latin1'); // one byte per character, so string indexes are byte offsets
  expect(text.startsWith('%PDF-')).toBe(true);
  expect(text.endsWith('%%EOF\n')).toBe(true);

  const xref = text.indexOf('\nxref\n') + 1;
  expect(Number(/startxref\n(\d+)\n/.exec(text)![1])).toBe(xref);
  const entries = text.slice(xref).split('\n').slice(3, 8); // the 5 objects after the free entry
  expect(entries).toHaveLength(5);
  entries.forEach((line, i) => {
    expect(line).toMatch(/^\d{10} 00000 n $/);
    expect(text.startsWith(`${i + 1} 0 obj\n`, Number(line.slice(0, 10)))).toBe(true);
  });
  expect(text).toContain('/Size 6');

  expect(text).toContain('/MediaBox [0 0 595 842]');
  expect(text).toContain('/Width 800 /Height 1200');
  expect(text).toContain('/Filter /DCTDecode');
  expect(text).toContain(`/Length ${jpeg.length} >>\nstream\n`);
  expect(pdf.includes(jpeg)).toBe(true);
  // 800 x 1200 fits the 770 pt of height inside the margins: 513.33 x 770, centred.
  expect(text).toContain('q 513.33 0 0 770.00 40.83 36.00 cm /Im0 Do Q');
});
