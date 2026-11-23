const A4 = { width: 595, height: 842, margin: 36 }; // points

/** A one-page A4 PDF holding the JPEG (`width` x `height` pixels, 3 channels) scaled to fit inside the margins, top-aligned and centred; the JPEG's bytes go in as they are (DCTDecode). */
export function jpegPdf(jpeg: Uint8Array, width: number, height: number) {
  const scale = Math.min((A4.width - 2 * A4.margin) / width, (A4.height - 2 * A4.margin) / height);
  const [w, h] = [width * scale, height * scale];
  const draw = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${((A4.width - w) / 2).toFixed(2)} ${(A4.height - A4.margin - h).toFixed(2)} cm /Im0 Do Q`;
  const objects: (string | Uint8Array)[][] = [
    ['<< /Type /Catalog /Pages 2 0 R >>'],
    ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`],
    [`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`],
    [`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream'],
  ];
  const parts: Uint8Array[] = [];
  let size = 0;
  const put = (...chunks: (string | Uint8Array)[]) => {
    for (const c of chunks) {
      const b = typeof c === 'string' ? Buffer.from(c, 'latin1') : c;
      parts.push(b);
      size += b.length;
    }
  };
  put('%PDF-1.4\n');
  const offsets = objects.map((o, i) => {
    const at = size;
    put(`${i + 1} 0 obj\n`, ...o, '\nendobj\n');
    return at;
  });
  const xref = size;
  put(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`), `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Uint8Array(Buffer.concat(parts));
}
