// The sample clips behind the Examples tab and the preset cards. They are fixtures (see public/fixtures/examples/README.md)
// until bake-off clips exist; each stands for one preset. Nothing here is a job, a price or a model option.
export interface Example {
  id: string;
  title: string;
  presetId: string;
  ratio: '9:16' | '1:1';
  durationSec: number;
  width: number;
  height: number;
  fixture: boolean;
  src: string;
  poster: string;
}

const clip = (n: number, title: string, presetId: string, ratio: Example['ratio'], width: number, height: number): Example => ({
  id: `example-${n}`,
  title,
  presetId,
  ratio,
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
];

export const exampleForPreset = (presetId: string): Example | undefined => EXAMPLES.find((e) => e.presetId === presetId);
