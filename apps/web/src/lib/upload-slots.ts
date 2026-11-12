// The form slots an uploaded photo can belong to (assets.slot), for the uploaded-photos picker's tabs (owner decision 2026-11-06). Migration 0077 fills
// the slot of earlier uploads from the first job that used them; an upload records the slot it was made from, and a job records the slots of its inputs.

/** Each slot's key and the name its tab shows. */
export const UPLOAD_SLOTS = {
  garment: 'Trang phục',
  model: 'Người mẫu',
  background: 'Bối cảnh',
  product: 'Sản phẩm',
  packaging: 'Bao bì',
  reference: 'Ảnh tham chiếu',
  video: 'Ảnh tạo video',
  'end-frame': 'Khung hình cuối',
  image: 'Ảnh tạo ảnh',
  illustration: 'Ảnh minh hoạ',
} as const;

export type UploadSlot = keyof typeof UPLOAD_SLOTS;

export const isUploadSlot = (s: unknown): s is UploadSlot => typeof s === 'string' && Object.hasOwn(UPLOAD_SLOTS, s);

/** The slots whose picker also offers the saved AI models: a person (model) or a general picture (reference, video, image), and a box of no slot at all (Create's). Not a garment, background, product, packaging, end frame or illustration. */
export const AI_MODEL_SLOTS: readonly (UploadSlot | undefined)[] = [undefined, 'model', 'reference', 'video', 'image'];

/** The slot of a form's upload box by its label, which may end in the optional suffix; undefined for a label of no slot. */
export function slotOfLabel(label: string): UploadSlot | undefined {
  const name = label.replace(/ \(tuỳ chọn\)$/, '');
  return (Object.keys(UPLOAD_SLOTS) as UploadSlot[]).find((k) => UPLOAD_SLOTS[k] === name);
}
