// A small MP4 for tests: ftyp, then moov holding an mvhd and one video trak (tkhd, mdhd, hdlr, stts), then an mdat that pads the file to `size` bytes.
// It carries the numbers the readers in lib/assets.ts look at (length, picture size, frame rate, a quarter turn) and no picture.
function box(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + body.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, out.length);
  [...type].forEach((c, i) => (out[4 + i] = c.charCodeAt(0)));
  out.set(body, 8);
  return out;
}
const join = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (out.set(p, at), (at += p.length));
  return out;
};

export function mp4Fixture({ ms, width, height, fps, size = 0, turned = false }: { ms: number; width?: number; height?: number; fps?: number; size?: number; turned?: boolean }): Uint8Array {
  const mvhd = new Uint8Array(20);
  new DataView(mvhd.buffer).setUint32(12, 1000);
  new DataView(mvhd.buffer).setUint32(16, ms);
  const ftyp = box('ftyp', new TextEncoder().encode('isom\0\0\0\0'));
  const track: Uint8Array[] = [];
  if (width !== undefined && height !== undefined) {
    const tkhd = new Uint8Array(84);
    const t = new DataView(tkhd.buffer);
    // The matrix (a b u c d v x y w from byte 40): identity, or a quarter turn.
    if (turned) (t.setInt32(44, 0x10000), t.setInt32(52, -0x10000));
    else (t.setInt32(40, 0x10000), t.setInt32(56, 0x10000));
    t.setInt32(72, 0x40000000);
    t.setUint32(76, width * 65536);
    t.setUint32(80, height * 65536);
    const mdhd = new Uint8Array(24);
    new DataView(mdhd.buffer).setUint32(12, 1000);
    new DataView(mdhd.buffer).setUint32(16, ms);
    const hdlr = new Uint8Array(25);
    [...'vide'].forEach((c, i) => (hdlr[8 + i] = c.charCodeAt(0)));
    let stts = new Uint8Array(8);
    if (fps !== undefined) {
      stts = new Uint8Array(16);
      new DataView(stts.buffer).setUint32(4, 1);
      new DataView(stts.buffer).setUint32(8, Math.round((fps * ms) / 1000));
      new DataView(stts.buffer).setUint32(12, 1);
    }
    track.push(box('trak', join(box('tkhd', tkhd), box('mdia', join(box('mdhd', mdhd), box('hdlr', hdlr), box('minf', box('stbl', box('stts', stts))))))));
  }
  const moov = box('moov', join(box('mvhd', mvhd), ...track));
  const head = join(ftyp, moov);
  return join(head, box('mdat', new Uint8Array(Math.max(0, size - head.length - 8))));
}
