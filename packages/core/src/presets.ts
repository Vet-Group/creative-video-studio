export interface Preset {
  id: string;
  /** Vietnamese UI label. */
  label: string;
  /** English prompt sent to the video model. */
  prompt: string;
  isBakeoffSafe: boolean;
}

const KEEP =
  'Keep the product, its shape, colours and any printed text exactly unchanged. Do not add any text, logos or watermarks. ' +
  'No people\'s faces unless asked. Smooth, stable camera. No audio.';

export const PRESETS: Preset[] = [
  {
    id: 'gentle-push-in',
    label: 'Tiến gần nhẹ nhàng',
    prompt: `Slow, gentle push-in toward the product on a clean, plain background with soft even lighting. ${KEEP}`,
    isBakeoffSafe: true,
  },
  {
    id: 'slow-orbit',
    label: 'Xoay quanh chậm',
    prompt: `The camera slowly orbits around the product, showing it from a few angles on a clean background. ${KEEP}`,
    isBakeoffSafe: false,
  },
  {
    id: 'lifestyle-table',
    label: 'Đặt trên bàn đời thường',
    prompt: `The product sits on a tidy wooden table in a bright, cozy room, with a slow subtle camera drift and natural daylight. ${KEEP}`,
    isBakeoffSafe: false,
  },
  {
    id: 'light-sweep',
    label: 'Ánh sáng quét nhẹ',
    prompt: `A soft band of light slowly sweeps across the product, adding gentle highlights and reflections, with a nearly still camera. ${KEEP}`,
    isBakeoffSafe: false,
  },
  {
    id: 'floating-reveal',
    label: 'Sản phẩm bay lên',
    prompt: `The product floats up slowly into frame and settles in the centre against a soft gradient background, with a gentle camera rise. ${KEEP}`,
    isBakeoffSafe: false,
  },
  {
    id: 'handheld-product',
    label: 'Cầm trên tay',
    prompt: `A hand holds the product and turns it slightly toward the camera in soft indoor light, with subtle hand-held motion. Show only the hand, never a face. ${KEEP}`,
    isBakeoffSafe: false,
  },
];

export const BAKEOFF_PRESET: Preset = PRESETS.find((p) => p.isBakeoffSafe) ?? PRESETS[0]!;
