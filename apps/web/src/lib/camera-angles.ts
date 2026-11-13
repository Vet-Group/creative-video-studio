// Create's multi-angle option: one idea, several camera angles. Each picked angle makes its own clip, from the composed prompt plus that angle's sentence.

/** The most angles one Run makes, one clip each. */
export const MAX_ANGLES = 4;

export interface CameraAngle {
  id: string;
  /** What the chip says. */
  label: string;
  /** The English sentence appended to the prompt: the camera only, the product and the picture's text untouched. */
  sentence: string;
}

export const CAMERA_ANGLES: CameraAngle[] = [
  { id: 'close-up', label: 'Cận chi tiết', sentence: 'Shoot the whole clip as a close-up on the product details, with the product unchanged and no on-screen text.' },
  { id: 'wide', label: 'Toàn thân / rộng', sentence: 'Shoot the whole clip as a full-body wide shot that shows the product in context, with the product unchanged and no on-screen text.' },
  { id: 'orbit', label: 'Xoay quanh', sentence: 'The camera makes a slow orbit around the product, with the product unchanged and no on-screen text.' },
  { id: 'top-down', label: 'Từ trên xuống', sentence: 'Shoot the whole clip from a top-down angle looking straight at the product, with the product unchanged and no on-screen text.' },
  { id: 'low', label: 'Góc thấp', sentence: 'Shoot the whole clip from a low angle looking up at the product, with the product unchanged and no on-screen text.' },
  { id: 'eye-level', label: 'Ngang tầm mắt', sentence: 'Shoot the whole clip at eye level from the front of the product, with the product unchanged and no on-screen text.' },
];

/** The prompt of one angle's clip: the composed prompt (closed with a full stop when it is not) and the angle's sentence. */
export function anglePrompt(prompt: string, angle: CameraAngle): string {
  const text = prompt.trim();
  if (!text) return angle.sentence;
  return `${/[.!?…]["'”’)]?$/.test(text) ? text : `${text}.`} ${angle.sentence}`;
}
