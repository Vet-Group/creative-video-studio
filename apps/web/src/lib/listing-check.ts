// Marketplace main-image checks and the Amazon fix.
// Rules and the edge-ring measure follow dlazy-ai/ecommerce-skills skills/platform-compliance (MIT, Copyright (c) 2026 dlazy);
// the near-white flood fill, its 65% guard and the content box follow rlvb/posewear src/amazon.js @292954ff (MIT, fork of atuizz/posewear).

export type Market = 'amazon' | 'tiktok' | 'temu' | 'shopee' | 'shopify';
type Rule = { label: string; white: boolean; tolerance: number; coverage: number; minSide: number; goodSide: number; fill: number; alpha: boolean; square: boolean | 'square-or-3:4'; maxBytes: number; formats: string[] };

/** The published main-image rules as dlazy's table has them; a marketplace can change its own, so the panel says to check its page. */
export const MARKETS: Record<Market, Rule> = {
  amazon: { label: 'Amazon', white: true, tolerance: 2, coverage: 0.98, minSide: 1000, goodSide: 1600, fill: 0.85, alpha: false, square: false, maxBytes: 10 * 1024 * 1024, formats: ['image/jpeg', 'image/png'] },
  tiktok: { label: 'TikTok Shop', white: false, tolerance: 8, coverage: 0, minSide: 800, goodSide: 1600, fill: 0.6, alpha: false, square: 'square-or-3:4', maxBytes: 5 * 1024 * 1024, formats: ['image/jpeg', 'image/png'] },
  temu: { label: 'Temu', white: true, tolerance: 6, coverage: 0.95, minSide: 800, goodSide: 1350, fill: 0.7, alpha: false, square: true, maxBytes: 3 * 1024 * 1024, formats: ['image/jpeg', 'image/png'] },
  shopee: { label: 'Shopee', white: false, tolerance: 10, coverage: 0, minSide: 500, goodSide: 1024, fill: 0.55, alpha: false, square: true, maxBytes: 2 * 1024 * 1024, formats: ['image/jpeg', 'image/png'] },
  shopify: { label: 'Shopify', white: false, tolerance: 12, coverage: 0, minSide: 1024, goodSide: 2048, fill: 0, alpha: true, square: false, maxBytes: 20 * 1024 * 1024, formats: ['image/jpeg', 'image/png', 'image/webp'] },
};
export const MARKET_IDS = Object.keys(MARKETS) as Market[];

/** What the pixels say, once per picture: the edge ring's distance from pure white, the product's share of the longer side, any transparency. */
export type Measure = { width: number; height: number; edge: number[]; fill: number; alpha: boolean };

/** The outer 2% of each side, sampled about 200 times along it (dlazy's border_ring). */
function edgeRing(d: Uint8ClampedArray, w: number, h: number): number[][] {
  const band = Math.max(1, Math.floor(Math.min(w, h) * 0.02));
  const out: number[][] = [];
  const at = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    out.push([d[i]!, d[i + 1]!, d[i + 2]!]);
  };
  for (let y = 0; y < band; y++) for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 200))) (at(x, y), at(x, h - 1 - y));
  for (let x = 0; x < band; x++) for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 200))) (at(x, y), at(w - 1 - x, y));
  return out;
}

/** The box around what differs from the background `base` by more than `near` in a channel (sampled), with a margin of `margin` of the longer side, or null when nothing does; rlvb's contentBox on white. */
export function contentBox(d: Uint8ClampedArray, w: number, h: number, margin = 0.01, base = [255, 255, 255], near = 5) {
  let [minX, minY, maxX, maxY] = [w, h, -1, -1];
  const step = Math.max(1, Math.floor(Math.max(w, h) / 700));
  for (let y = 0; y < h; y += step)
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (Math.abs(d[i]! - base[0]!) > near || Math.abs(d[i + 1]! - base[1]!) > near || Math.abs(d[i + 2]! - base[2]!) > near) [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
    }
  if (maxX < 0) return null;
  const pad = Math.round(Math.max(w, h) * margin);
  const [x, y] = [Math.max(0, minX - pad), Math.max(0, minY - pad)];
  return { x, y, width: Math.min(w, maxX + pad + 1) - x, height: Math.min(h, maxY + pad + 1) - y };
}

export function measure(d: Uint8ClampedArray, width: number, height: number): Measure {
  const ring = edgeRing(d, width, height);
  // The product is what differs from the wall by more than 18 (dlazy's subject_bbox), the wall's colour being the edge's median: a light grey wall is not the product.
  const base = [0, 1, 2].map((c) => ring.map((p) => p[c]!).sort((a, b) => a - b)[ring.length >> 1] ?? 255);
  const box = contentBox(d, width, height, 0, base, 18); // the product itself: a margin would add to its share
  return { width, height, edge: ring.map((p) => 255 - Math.min(...p)), fill: box ? Math.max(box.width / width, box.height / height) : 0, alpha: false };
}

export type Level = 'ok' | 'warn' | 'fail' | 'look';
export type Check = { level: Level; text: string };

/** One marketplace's verdict on a picture: what the pixels can tell, then the line a person must look at. */
export function checkFor(market: Market, m: Measure, file: { type: string; size: number }): Check[] {
  const r = MARKETS[market];
  const out: Check[] = [];
  if (r.white) {
    const white = m.edge.filter((v) => v <= r.tolerance).length / Math.max(1, m.edge.length);
    out.push(white >= r.coverage ? { level: 'ok', text: 'Nền trắng tinh ở mép ảnh' } : { level: 'fail', text: `Nền chưa trắng tinh: ${Math.round(white * 100)}% mép ảnh đạt, cần ${Math.round(r.coverage * 100)}%` });
  }
  const side = Math.max(m.width, m.height);
  out.push(side >= r.goodSide ? { level: 'ok', text: `Cạnh dài ${side} px` } : side >= r.minSide ? { level: 'warn', text: `Cạnh dài ${side} px, nên từ ${r.goodSide} px` } : { level: 'fail', text: `Cạnh dài ${side} px, cần ít nhất ${r.minSide} px` });
  if (r.square) {
    const ratio = m.width / m.height;
    const fits = Math.abs(ratio - 1) <= 0.02 || (r.square === 'square-or-3:4' && Math.abs(ratio - 0.75) <= 0.02);
    out.push(fits ? { level: 'ok', text: r.square === true ? 'Ảnh vuông 1:1' : 'Tỉ lệ 1:1 hoặc 3:4' } : { level: 'fail', text: r.square === true ? 'Cần ảnh vuông 1:1' : 'Cần tỉ lệ 1:1 hoặc 3:4' });
  }
  if (r.fill) out.push(!m.fill ? { level: 'look', text: 'Không tách được sản phẩm khỏi nền: tự xem lại khung ảnh' } : m.fill >= r.fill - 0.03 ? { level: 'ok', text: `Sản phẩm chiếm khoảng ${Math.round(m.fill * 100)}% khung` } : { level: 'warn', text: `Sản phẩm chỉ chiếm khoảng ${Math.round(m.fill * 100)}% khung, nên từ ${Math.round(r.fill * 100)}%` });
  if (m.alpha && !r.alpha) out.push({ level: 'fail', text: 'Ảnh có vùng trong suốt: sàn có thể đổi thành nền đen' });
  out.push(r.formats.includes(file.type) ? { level: 'ok', text: `Định dạng ${file.type.split('/')[1]!.toUpperCase().replace('JPEG', 'JPG')}` } : { level: 'fail', text: 'Định dạng chưa đúng, hãy xuất JPG' });
  out.push(file.size <= r.maxBytes ? { level: 'ok', text: `Dung lượng dưới ${r.maxBytes / 1024 / 1024} MB` } : { level: 'fail', text: `Dung lượng quá ${r.maxBytes / 1024 / 1024} MB` });
  out.push({ level: 'look', text: 'Tự xem lại: không chữ, logo thừa, hình mờ, viền hay ghép nhiều ảnh' });
  return out;
}

/** Near white: bright and close to grey (rlvb's nearWhite). */
const nearWhite = (r: number, g: number, b: number) => Math.min(r, g, b) >= 236 && Math.max(r, g, b) - Math.min(r, g, b) <= 16;

/** Turns the near-white background reached from the edges into pure white, in place. Puts the pixels back and returns false when over 65% of the middle would go (a white product on white), as rlvb's floodWhiten does. */
export function whitenBackground(d: Uint8ClampedArray, w: number, h: number): boolean {
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let [head, tail] = [0, 0];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p] || !nearWhite(d[p * 4]!, d[p * 4 + 1]!, d[p * 4 + 2]!)) return;
    seen[p] = 1;
    queue[tail++] = p;
  };
  for (let x = 0; x < w; x++) (push(x, 0), push(x, h - 1));
  for (let y = 0; y < h; y++) (push(0, y), push(w - 1, y));
  while (head < tail) {
    const p = queue[head++]!;
    const [x, y] = [p % w, Math.floor(p / w)];
    push(x + 1, y), push(x - 1, y), push(x, y + 1), push(x, y - 1);
  }
  let [all, hit] = [0, 0];
  for (let y = Math.floor(h * 0.3); y < Math.floor(h * 0.7); y += 2) for (let x = Math.floor(w * 0.3); x < Math.floor(w * 0.7); x += 2) (all++, (hit += seen[y * w + x]!));
  if (!tail || (all && hit / all > 0.65)) return false;
  for (let i = 0; i < tail; i++) d.fill(255, queue[i]! * 4, queue[i]! * 4 + 4);
  return true;
}

/** The pixels of `image` at most `side` px on its longer side, drawn on white (a marketplace would not keep a transparent PNG clear); `alpha` says whether any pixel was see-through before the white went under. */
function pixelsOf(image: CanvasImageSource & { width: number; height: number }, side: number) {
  const scale = Math.min(1, side / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const clear = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let alpha = false;
  for (let i = 3; i < clear.length && !alpha; i += 4) alpha = clear[i]! < 255;
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  return { canvas, ctx, scale, alpha, data: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

/** The measure of a picked picture, from a copy at most 1200 px long (the edge and the product's share do not need more); the size is the picture's own. */
export function measureImage(image: CanvasImageSource & { width: number; height: number }): Measure {
  const { canvas, data, alpha } = pixelsOf(image, 1200);
  try {
    return { ...measure(data.data, data.width, data.height), width: image.width, height: image.height, alpha };
  } finally {
    canvas.width = canvas.height = 0;
  }
}

/** Amazon's main image: the near-white background made pure white, the product's box at 85% of a 2000 × 2000 JPEG on white, and the checks of the result. */
export const AMAZON_SIDE = 2000;
export async function amazonMainImage(image: CanvasImageSource & { width: number; height: number }): Promise<{ blob: Blob; checks: Check[] }> {
  // 2400 px is more than the 1700 px the product ends at, so nothing that shows is lost, and the fill stays light on a 16 MP photo.
  const src = pixelsOf(image, 2400);
  const out = document.createElement('canvas');
  try {
    const { width: w, height: h } = src.data;
    if (whitenBackground(src.data.data, w, h)) src.ctx.putImageData(src.data, 0, 0);
    // The product itself fills 85%; its 1% margin (soft edges) is drawn around it, centred on the product. Nothing but white: the whole picture is the product.
    const whole = { x: 0, y: 0, width: w, height: h };
    const [inner, box] = [contentBox(src.data.data, w, h, 0) ?? whole, contentBox(src.data.data, w, h) ?? whole];
    const scale = (AMAZON_SIDE * MARKETS.amazon.fill) / Math.max(inner.width, inner.height);
    out.width = out.height = AMAZON_SIDE;
    const ctx = out.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, AMAZON_SIDE, AMAZON_SIDE);
    const at = (start: number, size: number, from: number) => AMAZON_SIDE / 2 - (start + size / 2 - from) * scale;
    ctx.drawImage(src.canvas, box.x, box.y, box.width, box.height, at(inner.x, inner.width, box.x), at(inner.y, inner.height, box.y), box.width * scale, box.height * scale);
    const blob = await new Promise<Blob | null>((done) => out.toBlob(done, 'image/jpeg', 0.92));
    if (!blob) throw new Error('Trình duyệt không hỗ trợ định dạng đã chọn.');
    const made = ctx.getImageData(0, 0, AMAZON_SIDE, AMAZON_SIDE);
    // The result's own edge is the white margin and always passes: the background is judged on the picture's edge after the white fill, where a wall that stayed grey or a cut-off product shows.
    const checks = checkFor('amazon', { ...measure(made.data, AMAZON_SIDE, AMAZON_SIDE), edge: measure(src.data.data, w, h).edge }, blob);
    // The product's own pixels were stretched past twice their size: the 2000 px are there, the detail may not be.
    const grown = scale * src.scale;
    if (grown > 2) checks.splice(checks.length - 1, 0, { level: 'warn', text: `Ảnh gốc nhỏ nên sản phẩm được phóng to ${grown.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} lần, có thể mờ` });
    return { blob, checks };
  } finally {
    src.canvas.width = src.canvas.height = 0;
    out.width = out.height = 0;
  }
}
