// A STORE-only zip writer (no compression: the media is already compressed), streamed entry by entry so memory stays flat.
// Each entry has a data descriptor (flag bit 3) because its CRC is known only after its bytes went by, and UTF-8 names (bit 11). Zip32 only.
// It runs in the browser too (Media Optimizer's listing .zip), so it carries its own CRC-32; the server passes zlib's, about three times faster.

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

/** The CRC-32 of `data`, continued from `crc` (the CRC of the bytes before it), as zlib's crc32 computes it. */
export function crc32(data: Uint8Array, crc = 0): number {
  let c = ~crc;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

/** `base`, or with -2, -3 and so on before its extension when `taken` already holds it; the name returned is added to `taken`. */
export function uniqueName(taken: Set<string>, base: string): string {
  let name = base;
  for (let n = 2; taken.has(name); n++) name = base.replace(/(\.[^.]*)?$/, `-${n}$1`);
  taken.add(name);
  return name;
}

export interface ZipEntry {
  name: string;
  /** The size the caller expects; the sum is checked against the zip32 limit before anything is sent. */
  bytes: number;
  open: () => Promise<ReadableStream<Uint8Array>>;
}

export const ZIP32_LIMIT = 2 ** 32;
const FLAGS = 0x0808;

function record(size: number, fill: (v: DataView) => void): Uint8Array {
  const b = new Uint8Array(size);
  fill(new DataView(b.buffer));
  return b;
}

async function* parts(entries: ZipEntry[], time: number, date: number, crcOf: typeof crc32): AsyncGenerator<Uint8Array> {
  const central: Uint8Array[] = [];
  let offset = 0;
  const sent = (n: number) => {
    offset += n;
    if (offset >= ZIP32_LIMIT) throw new RangeError('the zip passed 4 GiB');
  };
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const at = offset;
    const local = record(30 + name.length, (v) => {
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, FLAGS, true);
      v.setUint16(10, time, true);
      v.setUint16(12, date, true);
      v.setUint16(26, name.length, true);
    });
    local.set(name, 30);
    yield local;
    sent(local.length);
    let crc = 0;
    let size = 0;
    const reader = (await entry.open()).getReader();
    let done = false;
    try {
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        crc = crcOf(r.value, crc);
        size += r.value.length;
        yield r.value;
        sent(r.value.length);
      }
      done = true;
    } finally {
      if (!done) await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    const descriptor = record(16, (v) => {
      v.setUint32(0, 0x08074b50, true);
      v.setUint32(4, crc, true);
      v.setUint32(8, size, true);
      v.setUint32(12, size, true);
    });
    yield descriptor;
    sent(descriptor.length);
    const head = record(46 + name.length, (v) => {
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, 20, true);
      v.setUint16(8, FLAGS, true);
      v.setUint16(12, time, true);
      v.setUint16(14, date, true);
      v.setUint32(16, crc, true);
      v.setUint32(20, size, true);
      v.setUint32(24, size, true);
      v.setUint16(28, name.length, true);
      v.setUint32(42, at, true);
    });
    head.set(name, 46);
    central.push(head);
  }
  const start = offset;
  for (const head of central) {
    yield head;
    sent(head.length);
  }
  yield record(22, (v) => {
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, entries.length, true);
    v.setUint16(10, entries.length, true);
    v.setUint32(12, offset - start, true);
    v.setUint32(16, start, true);
  });
}

/** The entries as one zip stream. A source that fails part-way errors the stream, so the browser marks the download failed instead of keeping a cut zip. `crcOf`: zlib's crc32 on the server. */
export function zipStream(entries: ZipEntry[], now = new Date(), crcOf = crc32): ReadableStream<Uint8Array> {
  if (entries.length >= 0xffff) throw new RangeError('a zip32 holds fewer than 65535 entries');
  if (entries.reduce((sum, e) => sum + e.bytes, 0) >= ZIP32_LIMIT) throw new RangeError('a zip32 holds less than 4 GiB');
  // MS-DOS time and date are local with no zone: Vietnam time (UTC+7, no daylight saving), what the members' clocks show, whatever the server's zone.
  const ict = new Date(now.getTime() + 7 * 3600_000);
  const time = (ict.getUTCHours() << 11) | (ict.getUTCMinutes() << 5) | (ict.getUTCSeconds() >> 1);
  const date = ((Math.max(ict.getUTCFullYear(), 1980) - 1980) << 9) | ((ict.getUTCMonth() + 1) << 5) | ict.getUTCDate();
  const it = parts(entries, time, date, crcOf);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const r = await it.next();
        if (r.done) controller.close();
        else controller.enqueue(r.value);
      } catch (e) {
        controller.error(e);
      }
    },
    async cancel() {
      await it.return(undefined);
    },
  });
}

/** Blobs as one zip Blob (in the browser), each under its name with any slash made a hyphen, and a repeated name -2, -3 and so on. */
export async function zipBlobs(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const taken = new Set<string>();
  const entries = files.map((f) => ({ name: uniqueName(taken, f.name.replace(/[\\/]/g, '-')), bytes: f.blob.size, open: async () => f.blob.stream() }));
  return new Blob([await new Response(zipStream(entries)).arrayBuffer()], { type: 'application/zip' });
}
