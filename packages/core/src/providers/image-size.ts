/** Width and height of a jpeg, png or webp (the types the app accepts) from its bytes, or undefined when they cannot be read. */
export function imageSize(b: Uint8Array): { width: number; height: number } | undefined {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b.length < 30) return undefined;
  if (tag(1, 'PNG')) return { width: v.getUint32(16), height: v.getUint32(20) };
  if (tag(0, 'RIFF') && tag(8, 'WEBP')) {
    if (tag(12, 'VP8X')) return { width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)) };
    if (tag(12, 'VP8L')) {
      const bits = v.getUint32(21, true);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
    if (tag(12, 'VP8 ')) return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
    return undefined;
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    // Walk the segments to the first start-of-frame marker (C0-CF except C4, C8 and CC).
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) return undefined;
      while (b[i + 1] === 0xff) i++; // fill bytes may repeat before a marker
      if (i + 9 >= b.length) return undefined;
      const m = b[i + 1]!;
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { height: v.getUint16(i + 5), width: v.getUint16(i + 7) };
      i += m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) ? 2 : 2 + v.getUint16(i + 2);
    }
  }
  return undefined;
}
