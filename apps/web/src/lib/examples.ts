// The sample clips behind the Examples tab and the preset cards. They are fixtures (see public/fixtures/examples/README.md)
// until bake-off clips exist; each stands for one preset. Nothing here is a job, a price or a model option.
export type Aspect = '16:9' | '1:1' | '3:4' | '9:16';

export interface Example {
  id: string;
  title: string;
  presetId: string;
  /** What the tile looks like. It is not a form option: the job form offers only the ratios the models support. */
  aspect: Aspect;
  /** The form ratio "use this sample" sets; absent when the form offers no such ratio, so the form keeps its own. */
  ratio?: '9:16' | '1:1';
  durationSec: number;
  width: number;
  height: number;
  fixture: boolean;
  src: string;
  poster: string;
}

const clip = (n: number, title: string, presetId: string, aspect: Aspect, width: number, height: number): Example => ({
  id: `example-${n}`,
  title,
  presetId,
  aspect,
  ...(aspect === '9:16' || aspect === '1:1' ? { ratio: aspect } : {}),
  durationSec: 5,
  width,
  height,
  fixture: true,
  src: `/fixtures/examples/example-${n}.mp4`,
  poster: `/fixtures/examples/example-${n}.jpg`,
});

// Keep the sizes in step with apps/worker/src/example-fixtures.test.ts.
export const EXAMPLES: Example[] = [
  clip(1, 'Tiến gần nhẹ nhàng', 'gentle-push-in', '9:16', 180, 320),
  clip(2, 'Xoay quanh chậm', 'slow-orbit', '1:1', 240, 240),
  clip(3, 'Đặt trên bàn đời thường', 'lifestyle-table', '9:16', 180, 320),
  clip(4, 'Ánh sáng quét nhẹ', 'light-sweep', '1:1', 240, 240),
  clip(5, 'Sản phẩm bay lên', 'floating-reveal', '9:16', 180, 320),
  clip(6, 'Cầm trên tay', 'handheld-product', '9:16', 180, 320),
  clip(7, 'Toàn cảnh trượt ngang', 'light-sweep', '16:9', 320, 180),
  clip(8, 'Cận cảnh chi tiết', 'gentle-push-in', '3:4', 240, 320),
  clip(9, 'Bàn làm việc ngang', 'lifestyle-table', '16:9', 320, 180),
  clip(10, 'Treo trên giá', 'handheld-product', '3:4', 240, 320),
];

/** The uploaded sample named `name` (lib/samples.ts) when it exists, else `fallback`; by default the name is the fallback's file name. */
export function sampleSrc(have: ReadonlySet<string>, fallback: string, name = fallback.slice(fallback.lastIndexOf('/') + 1)): string {
  return have.has(name) ? `/api/samples/${name}` : fallback;
}

/** The uploaded samples named `<prefix><n>.<ext>` (n = 1, 2, ...), in number order: the fixed sample tiles of a gallery. */
export function numberedSamples(have: ReadonlySet<string>, prefix: string, ext: 'jpg' | 'mp4'): string[] {
  const n = (name: string) => Number(name.slice(prefix.length, -ext.length - 1));
  return [...have].filter((name) => name.startsWith(prefix) && name.endsWith(`.${ext}`) && /^[1-9]\d*$/.test(name.slice(prefix.length, -ext.length - 1))).sort((a, b) => n(a) - n(b));
}

export const exampleForPreset = (presetId: string): Example | undefined => EXAMPLES.find((e) => e.presetId === presetId);

/** Deals the tiles into columns, each to the currently shortest one, so the columns end level and every tile keeps its aspect ratio. */
export function splitColumns(items: Example[], count: number): Example[][] {
  const columns: Example[][] = Array.from({ length: count }, () => []);
  const heights = new Array<number>(count).fill(0);
  for (const item of items) {
    const shortest = heights.indexOf(Math.min(...heights));
    columns[shortest]!.push(item);
    heights[shortest]! += item.height / item.width;
  }
  return columns;
}
