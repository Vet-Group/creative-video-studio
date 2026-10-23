// inputs.json: the 10 sample images, written by B.3 (fetch-inputs.sh) and read by run.ts and anonymise.ts.
//   { "images": [ { "file": "01-mug.jpg", "category": "mockup" | "product", "sourceKey": "<MinIO key>", "smallText": true } ] }
// `file` is relative to the folder holding inputs.json. Image n in the plan is images[n - 1]; the canary is image 1.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join } from 'node:path';
import type { ReadImage } from '@cvs/core/providers/http';

export type Category = 'mockup' | 'product';
export interface InputImage {
  file: string;
  category: Category;
  /** Where B.3 read the image in MinIO. */
  sourceKey: string;
  /** Optional; B.3 expects at least 2 images with small text. */
  smallText?: boolean;
}
export interface Inputs {
  images: InputImage[];
}

const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
export const IMAGE_COUNT = 10;
const HALF = IMAGE_COUNT / 2;

/** Throws on the first problem. Pure: it does not look at the disk. */
export function parseInputs(raw: unknown): Inputs {
  const images = (raw as { images?: unknown } | null)?.images;
  if (!Array.isArray(images)) throw new Error('inputs.json: "images" must be an array');
  if (images.length !== IMAGE_COUNT) throw new Error(`inputs.json: ${images.length} images; exactly ${IMAGE_COUNT} are required`);
  const seen = new Set<string>();
  const out = images.map((v, i): InputImage => {
    const at = `inputs.json: images[${i}]`;
    const im = v as Partial<InputImage> | null;
    if (!im || typeof im.file !== 'string' || !im.file) throw new Error(`${at}.file must be a non-empty string`);
    if (isAbsolute(im.file) || /^([a-zA-Z]:|[\\/])/.test(im.file) || im.file.split(/[\\/]/).includes('..')) throw new Error(`${at}.file must stay inside the inputs folder`);
    if (!TYPES[extname(im.file).toLowerCase()]) throw new Error(`${at}.file must be a .jpg, .png or .webp file`);
    if (seen.has(im.file)) throw new Error(`${at}.file repeats ${im.file}`);
    seen.add(im.file);
    if (im.category !== 'mockup' && im.category !== 'product') throw new Error(`${at}.category must be "mockup" or "product"`);
    if (typeof im.sourceKey !== 'string' || !im.sourceKey) throw new Error(`${at}.sourceKey must be a non-empty string`);
    if (im.smallText !== undefined && typeof im.smallText !== 'boolean') throw new Error(`${at}.smallText must be a boolean`);
    return { file: im.file, category: im.category, sourceKey: im.sourceKey, ...(im.smallText === undefined ? {} : { smallText: im.smallText }) };
  });
  const mockups = out.filter((i) => i.category === 'mockup').length;
  if (mockups !== HALF) throw new Error(`inputs.json: ${mockups} mockups and ${IMAGE_COUNT - mockups} product photos; ${HALF} of each are required`);
  for (const [name, start] of [['first', 0], ['second', HALF]] as const) {
    const cats = new Set(out.slice(start, start + HALF).map((i) => i.category));
    if (cats.size !== 2) throw new Error(`inputs.json: the ${name} half of ${HALF} images must mix mockups and product photos`);
  }
  return { images: out };
}

/** Reads and validates inputs.json, and checks that every image file exists. */
export function loadInputs(path: string): { inputs: Inputs; dir: string } {
  const dir = dirname(path);
  const inputs = parseInputs(JSON.parse(readFileSync(path, 'utf8')));
  for (const im of inputs.images) if (!existsSync(join(dir, im.file))) throw new Error(`inputs.json: ${im.file} is missing from ${dir}`);
  return { inputs, dir };
}

/** The provider-facing URL of image n (1-based); readImage turns it back into bytes. */
export const imageUrl = (inputs: Inputs, image: number): string => `input:${inputs.images[image - 1]!.file}`;

export const contentTypeOf = (file: string): string => TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';

/** The adapters' `readImage`: reads `input:<file>` from the inputs folder. */
export const localReadImage =
  (dir: string): ReadImage =>
  async (url) => {
    if (!url.startsWith('input:')) throw new Error(`cannot read image URL scheme ${url.split(':')[0]}`);
    const file = url.slice('input:'.length);
    return { bytes: readFileSync(join(dir, file)), contentType: contentTypeOf(file) };
  };
