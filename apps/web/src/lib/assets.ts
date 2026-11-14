// Server-side helpers for the /api/assets routes.
import { type Asset, findAsset } from '@cvs/db/assets';
import { createDb } from '@cvs/db/client';
import { pool, type Session } from './auth';
import { LIVE_CLIP } from './clips';
import { getObject } from './storage';
import { MAX_BYTES, MAX_FILES } from './upload-limits';

export { MAX_AUDIO_BYTES, MAX_BYTES, MAX_FILES, MAX_VIDEO_BYTES } from './upload-limits';
export const MAX_BODY = MAX_FILES * MAX_BYTES + 64 * 1024;
export const MAX_FILENAME = 255;

export const db = createDb(pool);

export type RouteContext = { params: Promise<{ id: string }> };

/** Where an image asset's tile thumbnail is kept (GET /api/assets/[id]/thumb); the worker's purge removes it with the asset. */
export const thumbKey = (id: string) => `thumbs/${id}`;
/** The thumbnail's longest side: sharp on a large tile at twice the pixel density, a few dozen KB instead of the original's megabytes. */
export const THUMB_SIDE = 512;

/** The most a JSON request body may hold; the forms send a few KB. */
export const MAX_JSON_BYTES = 1_000_000;

/** The JSON body, or null when it is missing, not JSON, or over MAX_JSON_BYTES (counted while streaming, so a huge body never fills the web process's memory). */
export async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > MAX_JSON_BYTES || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let seen = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      seen += value.length;
      if (seen > MAX_JSON_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null; // not JSON, or the client dropped the body midway
  }
}

/** The multipart body as FormData, 'too-large' once it passes MAX_BODY (counted while streaming, so it is never fully buffered), or null when it is not multipart. */
export async function readUploadForm(request: Request): Promise<FormData | 'too-large' | null> {
  if (Number(request.headers.get('content-length')) > MAX_BODY) return 'too-large';
  const contentType = request.headers.get('content-type');
  if (!request.body || !contentType) return null;
  let seen = 0;
  let tooLarge = false;
  const limited = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.length;
        if (seen > MAX_BODY) {
          tooLarge = true;
          throw new Error('request body too large');
        }
        controller.enqueue(chunk);
      },
    }),
  );
  try {
    return await new Response(limited, { headers: { 'content-type': contentType } }).formData();
  } catch {
    return tooLarge ? 'too-large' : null;
  }
}

/** The image type from the file's first bytes (never from the client's name or content type). */
export function sniffImage(b: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | undefined {
  const at = (i: number, text: string) => [...text].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && at(1, 'PNG') && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp';
  return undefined;
}

/** MP4 or MOV from the file's first bytes (an ISO media file starts with an `ftyp` box; QuickTime's brand is `qt  `). */
export function sniffVideo(b: Uint8Array): 'video/mp4' | 'video/quicktime' | undefined {
  if (String.fromCharCode(...b.subarray(4, 8)) !== 'ftyp') return undefined;
  return String.fromCharCode(...b.subarray(8, 12)) === 'qt  ' ? 'video/quicktime' : 'video/mp4';
}

/** The [start, end) of the body of every box of `type` between `from` and `to`; 64-bit sizes (1) and "to the end" (0) are handled. */
function mp4Boxes(b: Uint8Array, from: number, to: number, type: string): [number, number][] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: [number, number][] = [];
  for (let i = from; i + 8 <= to; ) {
    let size = v.getUint32(i);
    let head = 8;
    if (size === 1) {
      if (i + 16 > to) break;
      size = Number(v.getBigUint64(i + 8));
      head = 16;
    } else if (size === 0) size = to - i;
    if (size < head) break;
    if (String.fromCharCode(...b.subarray(i + 4, i + 8)) === type) out.push([i + head, Math.min(i + size, to)]);
    i += size;
  }
  return out;
}

/** The length of an MP4/MOV in ms, from its movie header (the `mvhd` box inside `moov`), or undefined when there is none. */
export function mp4DurationMs(b: Uint8Array): number | undefined {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const find = (from: number, to: number, type: string): [number, number] | undefined => mp4Boxes(b, from, to, type)[0];
  const moov = find(0, b.length, 'moov');
  const mvhd = moov && find(moov[0], moov[1], 'mvhd');
  if (!mvhd) return undefined;
  const [p, end] = mvhd;
  const v1 = b[p] === 1;
  if (p + (v1 ? 32 : 20) > end) return undefined;
  const scale = v.getUint32(p + (v1 ? 20 : 12));
  const duration = v1 ? Number(v.getBigUint64(p + 24)) : v.getUint32(p + 16);
  return scale > 0 && duration > 0 ? Math.round((duration * 1000) / scale) : undefined;
}

/**
 * The first video track's picture size and frame rate, from its boxes in `moov`: `tkhd` (size, swapped when the matrix turns it a quarter), `mdhd` (time scale and
 * length) and `stts` (sample count), so fps is the average rate. Undefined when there is no readable video track; `fps` is null when only that part is unreadable.
 */
export function mp4VideoInfo(b: Uint8Array): { width: number; height: number; fps: number | null } | undefined {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const first = (from: number, to: number, type: string) => mp4Boxes(b, from, to, type)[0];
  const moov = first(0, b.length, 'moov');
  if (!moov) return undefined;
  for (const [ts, te] of mp4Boxes(b, moov[0], moov[1], 'trak')) {
    const mdia = first(ts, te, 'mdia');
    const hdlr = mdia && first(mdia[0], mdia[1], 'hdlr');
    if (!mdia || !hdlr || hdlr[0] + 12 > hdlr[1] || String.fromCharCode(...b.subarray(hdlr[0] + 8, hdlr[0] + 12)) !== 'vide') continue;
    const tkhd = first(ts, te, 'tkhd');
    if (!tkhd) continue;
    const p = tkhd[0];
    const wide = b[p] === 1;
    const m = p + (wide ? 52 : 40); // the matrix: a b u c d v x y w, 16.16 fixed point
    const at = p + (wide ? 88 : 76);
    if (at + 8 > tkhd[1]) continue;
    let width = Math.round(v.getUint32(at) / 65536);
    let height = Math.round(v.getUint32(at + 4) / 65536);
    if (v.getInt32(m) === 0 && v.getInt32(m + 16) === 0) [width, height] = [height, width];
    if (width <= 0 || height <= 0) continue;
    const mdhd = first(mdia[0], mdia[1], 'mdhd');
    const minf = first(mdia[0], mdia[1], 'minf');
    const stbl = minf && first(minf[0], minf[1], 'stbl');
    const stts = stbl && first(stbl[0], stbl[1], 'stts');
    let fps: number | null = null;
    if (mdhd && stts && stts[0] + 8 <= stts[1]) {
      const w1 = b[mdhd[0]] === 1;
      const scale = v.getUint32(mdhd[0] + (w1 ? 20 : 12));
      const length = w1 ? Number(v.getBigUint64(mdhd[0] + 24)) : v.getUint32(mdhd[0] + 16);
      let samples = 0;
      for (let e = 0, n = v.getUint32(stts[0] + 4); e < n && stts[0] + 8 + e * 8 + 8 <= stts[1]; e++) samples += v.getUint32(stts[0] + 8 + e * 8);
      if (scale > 0 && length > 0 && samples > 0) fps = (samples * scale) / length;
    }
    return { width, height, fps };
  }
  return undefined;
}

/** MP3 (an ID3 tag, or an MPEG Layer III frame header) or WAV (`RIFF....WAVE`) from the file's first bytes: reference audio on Create video. */
export function sniffAudio(b: Uint8Array): 'audio/mpeg' | 'audio/wav' | undefined {
  const text = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (text(0, 4) === 'RIFF' && text(8, 4) === 'WAVE') return 'audio/wav';
  if (text(0, 3) === 'ID3' || mp3Frame(b, 0)) return 'audio/mpeg';
  return undefined;
}

/** An MPEG Layer III frame header at `i`: 11 sync bits, then the layer bits 01. */
const mp3Frame = (b: Uint8Array, i: number) => b[i] === 0xff && ((b[i + 1] ?? 0) & 0xe6) === 0xe2;
const MP3_KBPS = { mpeg1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], mpeg2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };

/**
 * The length of a WAV or MP3 in ms, or undefined when its header gives none. WAV: the `data` chunk over the `fmt ` byte rate. MP3: the frame count of
 * a Xing or Info header, else the bytes after the first frame header over its bit rate (a constant bit rate file). shortcut: a variable bit rate file
 * with only a VBRI header is measured as constant rate, so its length can be off; fal checks the lengths again, so measure the frames if one is refused.
 */
export function audioDurationMs(b: Uint8Array, mime: string): number | undefined {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const text = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (mime === 'audio/wav') {
    let byteRate = 0;
    for (let i = 12; i + 8 <= b.length; ) {
      const size = v.getUint32(i + 4, true);
      if (text(i, 4) === 'fmt ' && i + 20 <= b.length) byteRate = v.getUint32(i + 16, true);
      if (text(i, 4) === 'data') return byteRate > 0 && size > 0 ? Math.round((Math.min(size, b.length - i - 8) * 1000) / byteRate) : undefined;
      i += 8 + size + (size % 2);
    }
    return undefined;
  }
  // An ID3v2 tag first: its size is 4 bytes of 7 bits each, plus a footer when the flag says so.
  let p = text(0, 3) === 'ID3' && b.length >= 10 ? 10 + ((b[6]! & 0x7f) << 21) + ((b[7]! & 0x7f) << 14) + ((b[8]! & 0x7f) << 7) + (b[9]! & 0x7f) + (b[5]! & 0x10 ? 10 : 0) : 0;
  while (p + 4 <= b.length && !mp3Frame(b, p)) p++;
  if (p + 4 > b.length) return undefined;
  const version = (b[p + 1]! >> 3) & 3; // 3: MPEG 1, 2: MPEG 2, 0: MPEG 2.5, 1: reserved
  const [rate, sampling] = [b[p + 2]! >> 4, (b[p + 2]! >> 2) & 3];
  if (version === 1 || sampling === 3 || rate === 0 || rate === 15) return undefined;
  const mpeg1 = version === 3;
  const hz = [44100, 48000, 32000][sampling]! / (mpeg1 ? 1 : version === 2 ? 2 : 4);
  const mono = b[p + 3]! >> 6 === 3;
  const xing = p + 4 + (mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17);
  if (['Xing', 'Info'].includes(text(xing, 4)) && xing + 12 <= b.length && v.getUint32(xing + 4) & 1) return Math.round((v.getUint32(xing + 8) * (mpeg1 ? 1152 : 576) * 1000) / hz);
  return Math.round(((b.length - p) * 8) / (mpeg1 ? MP3_KBPS.mpeg1 : MP3_KBPS.mpeg2)[rate]!);
}

/**
 * The asset for a signed-in user: 404 when it does not exist, 403 unless the user owns it, is an Admin, or it belongs to a Library clip (its video, poster
 * or input images), is the photo of a company or store choice (user_choices) or of a shared AI model (fashion_models), which every member sees.
 */
export async function readableAsset(session: Session, id: string): Promise<{ asset: Asset; error?: never } | { asset?: never; error: Response }> {
  const asset = await findAsset(db, id);
  if (!asset) return { error: Response.json({ error: 'not found' }, { status: 404 }) };
  if (asset.ownerId !== session.user.id && session.user.role !== 'admin') {
    const inLibrary = await pool.query(
      `select 1 from jobs j where ${LIVE_CLIP} and ($1 in (j.output_asset_id, j.poster_asset_id) or $1 = any(j.input_asset_ids))
       union all select 1 from user_choices c where c.image_asset_id = $1 and (c.is_company or c.store_id is not null)
       union all select 1 from fashion_models f where f.asset_id = $1 and f.shared and f.deleted_at is null limit 1`,
      [id],
    );
    if (!inLibrary.rowCount) return { error: Response.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { asset };
}

/** `bytes=a-b`, `bytes=a-` or `bytes=-n` against a size: undefined when absent or not understood (serve everything), null when unsatisfiable. */
function parseRange(header: string | null, size: number): { start: number; end: number } | null | undefined {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!m || (!m[1] && !m[2])) return undefined;
  if (m[1] && m[2] && Number(m[2]) < Number(m[1])) return undefined; // RFC 9110: an inverted range is invalid, so it is ignored
  const start = m[1] ? Number(m[1]) : Math.max(size - Number(m[2]), 0);
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  return start <= end && start < size ?{ start, end } : null;
}

/** Streams the object out of MinIO with `Range` support, as an inline image/video or an attachment. */
/** `cache` is the Cache-Control value: nothing is cached unless the caller says so; `etag` goes out as is. */
export async function streamAsset(request: Request, asset: Pick<Asset, 's3Key' | 'bytes' | 'mime' | 'filename'>, disposition: 'inline' | 'attachment', cache = 'private, no-store', etag?: string): Promise<Response> {
  const range = parseRange(request.headers.get('range'), asset.bytes);
  if (range === null) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${asset.bytes}` } });
  const headers: Record<string, string> = {
    'content-type': asset.mime,
    'accept-ranges': 'bytes',
    'content-disposition': `${disposition}; filename="${asset.filename.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(asset.filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    'cache-control': cache,
    ...(etag ? { etag } : {}),
    'x-content-type-options': 'nosniff',
  };
  if (!range) {
    return new Response(await getObject(asset.s3Key, undefined, request.signal), { headers: { ...headers, 'content-length': String(asset.bytes) } });
  }
  headers['content-length'] = String(range.end - range.start + 1);
  headers['content-range'] = `bytes ${range.start}-${range.end}/${asset.bytes}`;
  return new Response(await getObject(asset.s3Key, `bytes=${range.start}-${range.end}`, request.signal), { status: 206, headers });
}
