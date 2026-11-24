// Model consistency score for the pose generator: YuNet finds the face and its 5 landmarks, SFace turns the aligned face into a 128-d feature, and the score is the cosine
// of the model photo's feature and the result's. Models and licences: apps/worker/models/README.md.
import { fileURLToPath } from 'node:url';
import * as ort from 'onnxruntime-web';
import sharp from 'sharp';

export type FaceMatch = { score: number } | { noFace: 'model' | 'result' };

const MODELS = fileURLToPath(new URL('../models/', import.meta.url));
const SIZE = 640;
/** The detector's own cut-off, as in OpenCV's FaceDetectorYN. */
const MIN_FACE_SCORE = 0.8;
/** Where the five landmarks (eyes, nose, mouth corners) sit in the 112x112 crop SFace was trained on. */
const TEMPLATE = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]] as const;

type Image = { data: Buffer; w: number; h: number };
type Point = readonly [number, number];

// One thread, and no graph warnings in the log: the worker scores one image at a time, before it settles the job.
ort.env.wasm.numThreads = 1;
let sessions: Promise<[ort.InferenceSession, ort.InferenceSession]> | undefined;
function load() {
  const options = { logSeverityLevel: 3 as const };
  // A failed load is not kept, so the next job tries again.
  return (sessions ??= Promise.all([ort.InferenceSession.create(`${MODELS}face_detection_yunet_2023mar.onnx`, options), ort.InferenceSession.create(`${MODELS}face_recognition_sface_2021dec_int8.onnx`, options)]).catch((e) => {
    sessions = undefined;
    throw e;
  }));
}

async function decode(bytes: Buffer): Promise<Image> {
  const { data, info } = await sharp(bytes).rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** The best face of the image (its 5 landmarks, in image pixels), or null. YuNet gets the image letterboxed into 640x640 as BGR floats, as OpenCV feeds it. */
async function detect(det: ort.InferenceSession, img: Image): Promise<Point[] | null> {
  const s = Math.min(SIZE / img.w, SIZE / img.h);
  const w = Math.round(img.w * s);
  const h = Math.round(img.h * s);
  const { data } = await sharp(img.data, { raw: { width: img.w, height: img.h, channels: 3 } }).resize(w, h).extend({ right: SIZE - w, bottom: SIZE - h, background: '#000' }).raw().toBuffer({ resolveWithObject: true });
  const plane = SIZE * SIZE;
  const t = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    t[i] = data[i * 3 + 2]!;
    t[plane + i] = data[i * 3 + 1]!;
    t[2 * plane + i] = data[i * 3]!;
  }
  const out = await det.run({ input: new ort.Tensor('float32', t, [1, 3, SIZE, SIZE]) });
  let best: { score: number; kps: Point[] } | null = null;
  for (const st of [8, 16, 32]) {
    const cols = SIZE / st;
    const cls = out[`cls_${st}`]!.data as Float32Array;
    const obj = out[`obj_${st}`]!.data as Float32Array;
    const kp = out[`kps_${st}`]!.data as Float32Array;
    for (let i = 0; i < cols * cols; i++) {
      const score = Math.sqrt(Math.min(1, Math.max(0, cls[i]!)) * Math.min(1, Math.max(0, obj[i]!)));
      if (score < MIN_FACE_SCORE || (best && score <= best.score)) continue;
      const r = Math.floor(i / cols);
      const c = i % cols;
      best = { score, kps: [0, 1, 2, 3, 4].map((n) => [((kp[i * 10 + 2 * n]! + c) * st) / s, ((kp[i * 10 + 2 * n + 1]! + r) * st) / s] as const) };
    }
  }
  return best?.kps ?? null;
}

/** The least-squares similarity (Umeyama) that maps src onto dst, as [a, -b, tx, b, a, ty]. */
function similarity(src: readonly Point[], dst: readonly Point[]): number[] {
  const n = src.length;
  const mean = (p: readonly Point[], k: 0 | 1) => p.reduce((sum, q) => sum + q[k], 0) / n;
  const sx = mean(src, 0);
  const sy = mean(src, 1);
  const dx = mean(dst, 0);
  const dy = mean(dst, 1);
  let num1 = 0;
  let num2 = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const ux = src[i]![0] - sx;
    const uy = src[i]![1] - sy;
    const vx = dst[i]![0] - dx;
    const vy = dst[i]![1] - dy;
    num1 += ux * vx + uy * vy;
    num2 += ux * vy - uy * vx;
    den += ux * ux + uy * uy;
  }
  const a = num1 / den;
  const b = num2 / den;
  return [a, -b, dx - (a * sx - b * sy), b, a, dy - (b * sx + a * sy)];
}

/** The 112x112 face crop by the inverse of the similarity, bilinear, as RGB floats in 0..255 (what SFace takes). */
function align(img: Image, m: number[]): Float32Array {
  const [a, , tx, b, , ty] = m as [number, number, number, number, number, number];
  const det = a * a + b * b;
  const t = new Float32Array(3 * 112 * 112);
  const px = (x: number, y: number, ch: number) => (x < 0 || y < 0 || x >= img.w || y >= img.h ? 0 : img.data[(y * img.w + x) * 3 + ch]!);
  for (let y = 0; y < 112; y++) {
    for (let x = 0; x < 112; x++) {
      const X = x - tx;
      const Y = y - ty;
      const u = (a * X + b * Y) / det;
      const v = (-b * X + a * Y) / det;
      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const fx = u - x0;
      const fy = v - y0;
      for (let ch = 0; ch < 3; ch++) {
        t[ch * 112 * 112 + y * 112 + x] = px(x0, y0, ch) * (1 - fx) * (1 - fy) + px(x0 + 1, y0, ch) * fx * (1 - fy) + px(x0, y0 + 1, ch) * (1 - fx) * fy + px(x0 + 1, y0 + 1, ch) * fx * fy;
      }
    }
  }
  return t;
}

/** The unit-length SFace feature of the image's best face, or null when it has none. */
async function feature([det, rec]: [ort.InferenceSession, ort.InferenceSession], bytes: Buffer): Promise<number[] | null> {
  const img = await decode(bytes);
  const kps = await detect(det, img);
  if (!kps) return null;
  const out = await rec.run({ data: new ort.Tensor('float32', align(img, similarity(kps, TEMPLATE)), [1, 3, 112, 112]) });
  const f = Array.from(out.fc1!.data as Float32Array);
  const norm = Math.hypot(...f);
  return f.map((v) => v / norm);
}

/** How alike the face in `result` is to the face in `model`: the cosine of their features, 2 decimals (same person: 0.5 and up, others: 0.2 and below). A photo without a detectable face is named. */
export async function faceMatch(model: Buffer, result: Buffer): Promise<FaceMatch> {
  const s = await load();
  const m = await feature(s, model);
  if (!m) return { noFace: 'model' };
  const r = await feature(s, result);
  if (!r) return { noFace: 'result' };
  return { score: Math.round(m.reduce((sum, v, i) => sum + v * r[i]!, 0) * 100) / 100 };
}
