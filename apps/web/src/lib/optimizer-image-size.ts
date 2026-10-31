// Read only bounded container metadata, before asking the browser to allocate decoded pixels.
export function optimizerImageSize(b: Uint8Array, type: string): { width: number; height: number } | undefined {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (i: number, text: string) => [...text].every((c, n) => b[i + n] === c.charCodeAt(0));
  if (type === 'image/png') {
    if (b.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => b[i] === n) || v.getUint32(8) !== 13 || !tag(12, 'IHDR')) return;
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  if (type === 'image/jpeg') {
    if (b[0] !== 255 || b[1] !== 216) return;
    for (let i = 2; i < b.length;) {
      if (b[i++] !== 255) return;
      while (b[i] === 255) i++;
      const marker = b[i++];
      if (marker === undefined || marker === 0 || marker === 0xda || marker === 0xd9) return;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (marker === 0xd8 || i + 2 > b.length) return;
      const length = v.getUint16(i);
      if (length < 2 || i + length > b.length) return;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        if (length < 8) return;
        const components = b[i + 7]!;
        if (!components || length !== 8 + 3 * components) return;
        return { height: v.getUint16(i + 3), width: v.getUint16(i + 5) };
      }
      i += length;
    }
    return;
  }
  if (type !== 'image/webp' || b.length < 20 || !tag(0, 'RIFF') || !tag(8, 'WEBP') || v.getUint32(4, true) + 8 !== b.length) return;
  let size: { width: number; height: number } | undefined;
  for (let i = 12; i < b.length;) {
    if (i + 8 > b.length) return;
    const length = v.getUint32(i + 4, true), start = i + 8;
    const end = start + length + (length & 1);
    if (end > b.length) return;
    let frame: { width: number; height: number } | undefined;
    if (tag(i, 'VP8X')) {
      if (i !== 12 || length !== 10 || (b[start]! & 0xc1) || b[start + 1] || b[start + 2] || b[start + 3]) return;
      const uint24 = (p: number) => b[p]! | (b[p + 1]! << 8) | (b[p + 2]! << 16);
      size = { width: 1 + uint24(start + 4), height: 1 + uint24(start + 7) };
    } else if (tag(i, 'VP8L')) {
      if (length < 5 || b[start] !== 0x2f) return;
      const bits = v.getUint32(start + 1, true);
      if (bits >>> 29) return;
      frame = { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
    } else if (tag(i, 'VP8 ')) {
      if (length < 10 || (b[start]! & 1) || !tag(start + 3, '\x9d\x01\x2a')) return;
      frame = { width: v.getUint16(start + 6, true) & 0x3fff, height: v.getUint16(start + 8, true) & 0x3fff };
    }
    if (tag(i, 'ANMF')) {
      if (!size || length < 16) return;
      const uint24 = (p: number) => b[p]! | (b[p + 1]! << 8) | (b[p + 2]! << 16);
      const x = 2 * uint24(start), y = 2 * uint24(start + 3);
      if (x + 1 + uint24(start + 6) > size.width || y + 1 + uint24(start + 9) > size.height) return;
    }
    if (frame) {
      if (size && (frame.width > size.width || frame.height > size.height)) return;
      size ??= frame;
    }
    i = end;
  }
  return size;
}
