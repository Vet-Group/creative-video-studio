export interface Preset {
  id: string;
  /** Vietnamese UI label. */
  label: string;
  /** English prompt sent to the video model. */
  prompt: string;
  isBakeoffSafe: boolean;
}

// Audio is off through each adapter's request parameter, not through this text.
export const KEEP =
  'Keep the product, its shape, colours and any printed text exactly unchanged. Do not add any text, logos or watermarks. ' +
  'No faces. Smooth, stable camera.';

export const PRESETS: Preset[] = [
  {
    id: 'gentle-push-in',
    label: 'Cận cảnh lấp lánh',
    prompt: `An extreme macro close-up of the product filling the frame, with a nearly still camera that drifts only very slightly. Bright, sparkling highlights glint and shimmer across its surfaces, set against a softly blurred background of glittering bokeh in warm, low light. Keep the product, its shape, colours and any printed text exactly unchanged. Do not add any text, logos or watermarks. No faces. Smooth, stable camera.`,
    isBakeoffSafe: true,
  },
  {
    id: 'slow-orbit',
    label: 'Xoay chậm tại chỗ',
    prompt: `The product slowly rotates in place, as if on a turntable, while the camera holds still at eye level. A dark, plain backdrop and a warm, low-key side light pick out its form, with soft highlights moving across the surface as it turns. Keep the product, its shape, colours and any printed text exactly unchanged. Do not add any text, logos or watermarks. No faces. Smooth, stable camera.`,
    isBakeoffSafe: false,
  },
  {
    id: 'lifestyle-table',
    label: 'Đặt trên bàn đời thường',
    prompt: `The product sits on a rustic, dark wooden table with everyday props softly blurred around it, in warm, moody indoor light. The camera holds still at a close, slightly high angle with a shallow depth of field, keeping the product sharp and centred. Keep the product, its shape, colours and any printed text exactly unchanged. Do not add any text, logos or watermarks. No faces. Smooth, stable camera.`,
    isBakeoffSafe: false,
  },
  {
    id: 'light-sweep',
    label: 'Lướt gần lấp lánh',
    prompt: `The camera glides slowly and smoothly closer to the product, which rests on a dark, polished wooden surface. Warm, dim light catches its edges, so small sparkling highlights travel and twinkle across it as the view shifts, with a shallow depth of field and a softly blurred background. Keep the product, its shape, colours and any printed text exactly unchanged. Do not add any text, logos or watermarks. No faces. Smooth, stable camera.`,
    isBakeoffSafe: false,
  },
  {
    id: 'floating-reveal',
    label: 'Sản phẩm lơ lửng',
    prompt: `The product hovers in mid-air at the centre of the frame above a small round opening in a seamless, warm pastel floor, bobbing very gently. Two small golden rods slide across the floor, tip into the opening and disappear, then come back out and slide apart. The camera stays still, and soft, even studio lighting keeps the scene clean and minimal. Keep the product, its shape, colours and any printed text exactly unchanged. Do not add any text, logos or watermarks. No faces. Smooth, stable camera.`,
    isBakeoffSafe: false,
  },
  {
    id: 'handheld-product',
    label: 'Cầm trên tay',
    prompt: `A hand holds the product steady, facing the camera as in the image, in soft indoor light with subtle hand-held motion. Show only the hand. ${KEEP}`,
    isBakeoffSafe: false,
  },
];

export const BAKEOFF_PRESET: Preset = PRESETS.find((p) => p.isBakeoffSafe) ?? PRESETS[0]!;
