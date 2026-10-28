// The ten apps of the Apps index: what each page shows (upload slots, extra fields) and the rules a Run must meet before it is sent.
// The rules mirror POST /api/jobs: the swaps and Face Swap take exactly 2 images, Jewelry Try-On 2 or more (the pieces, then the person); Background Changer takes a prompt with 1 image, or a reference image as the 2nd, not both and not neither.

export type AppCategory = 'fashion' | 'photo' | 'video' | 'utility';
export const CATEGORIES: { id: AppCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'fashion', label: 'Thời trang' },
  { id: 'photo', label: 'Chỉnh ảnh' },
  { id: 'video', label: 'Video' },
  { id: 'utility', label: 'Tiện ích' },
];

export interface AppSlot {
  /** Visible name; also names the group for screen readers. */
  label: string;
  /** The accessible name of the file input. */
  inputLabel: string;
  empty: string;
  optional?: boolean;
  /** Takes several images: up to the model's limit less one for each other slot (Jewelry Try-On's pieces). */
  many?: boolean;
}

export interface AppConfig {
  slug: string;
  /** The job feature; the page runs the enabled image model that lists it. */
  feature: string;
  name: string;
  description: string;
  category: AppCategory;
  slots: AppSlot[];
  /** A prompt box. `background` (Background Changer) excludes the reference image; `optional` (the two swaps) adds the member's text to the fixed instruction. The other apps send their fixed prompt. */
  prompt?: 'background' | 'optional';
  /** Shows the ratio field (Reframe); the options are the model's own ratios. */
  ratio?: boolean;
  /** Shows the resolution field (Upscale); the options are the keys of the model's prices. */
  resolution?: boolean;
  /** An app that is not built yet: its page says so, and why. */
  soon?: string;
}

export const APPS: AppConfig[] = [
  {
    slug: 'character-swap',
    feature: 'character_swap',
    name: 'Đổi nhân vật',
    description: 'Thay toàn bộ người trong ảnh bằng một người khác.',
    category: 'fashion',
    slots: [
      { label: 'Nhân vật mới', inputLabel: 'Ảnh nhân vật mới', empty: 'Thêm 1 ảnh người sẽ xuất hiện trong kết quả' },
      { label: 'Ảnh đích', inputLabel: 'Ảnh đích', empty: 'Thêm 1 ảnh có người cần thay' },
    ],
    prompt: 'optional',
  },
  {
    slug: 'model-swap',
    feature: 'model_swap',
    name: 'Đổi người mẫu',
    description: 'Thay người trong ảnh bằng một người mẫu khác. Trang phục và bối cảnh giữ nguyên.',
    category: 'fashion',
    slots: [
      { label: 'Người mẫu mới', inputLabel: 'Ảnh người mẫu mới', empty: 'Thêm 1 ảnh người mẫu mới' },
      { label: 'Ảnh đích', inputLabel: 'Ảnh đích', empty: 'Thêm 1 ảnh sản phẩm có người mẫu cần thay' },
    ],
    prompt: 'optional',
  },
  {
    slug: 'background-changer',
    feature: 'background_changer',
    name: 'Đổi nền',
    description: 'Nền mới từ một mô tả hoặc một ảnh tham chiếu.',
    category: 'photo',
    slots: [
      { label: 'Ảnh', inputLabel: 'Ảnh cần đổi nền', empty: 'Thêm 1 ảnh' },
      { label: 'Ảnh nền tham chiếu (tuỳ chọn)', inputLabel: 'Ảnh nền tham chiếu', empty: 'Thêm 1 ảnh nền nếu muốn', optional: true },
    ],
    prompt: 'background',
  },
  {
    slug: 'reframe',
    feature: 'reframe',
    name: 'Đổi khung hình',
    description: 'Mở rộng mọi ảnh sang tỉ lệ khung hình mới bằng AI.',
    category: 'photo',
    slots: [{ label: 'Ảnh', inputLabel: 'Ảnh cần đổi khung', empty: 'Thêm 1 ảnh' }],
    ratio: true,
  },
  {
    slug: 'image-upscale',
    feature: 'image_upscale',
    name: 'Tăng độ phân giải',
    description: 'Phóng mọi ảnh lên tới 4K mà không mất chi tiết.',
    category: 'photo',
    slots: [{ label: 'Ảnh', inputLabel: 'Ảnh cần tăng độ phân giải', empty: 'Thêm 1 ảnh' }],
    resolution: true,
  },
  {
    slug: 'face-swap',
    feature: 'face_swap',
    name: 'Đổi khuôn mặt',
    description: 'Chỉ đổi khuôn mặt. Mọi thứ khác giữ nguyên.',
    category: 'fashion',
    slots: [
      { label: 'Khuôn mặt nguồn', inputLabel: 'Ảnh khuôn mặt nguồn', empty: 'Thêm 1 ảnh có khuôn mặt muốn dùng' },
      { label: 'Ảnh đích', inputLabel: 'Ảnh đích', empty: 'Thêm 1 ảnh cần đổi khuôn mặt' },
    ],
  },
  {
    slug: 'background-remover',
    feature: 'background_remover',
    name: 'Xoá nền',
    description: 'Xoá mọi nền chỉ với một lần bấm. Ảnh PNG trong suốt.',
    category: 'photo',
    slots: [{ label: 'Ảnh', inputLabel: 'Ảnh cần xoá nền', empty: 'Thêm 1 ảnh' }],
  },
  {
    slug: 'motion-control',
    feature: 'motion_control',
    name: 'Điều khiển chuyển động',
    description: 'Chép chuyển động từ một video sang nhân vật của bạn.',
    category: 'video',
    // Its form is its own (AppPage's MotionForm): one image slot and one video slot.
    slots: [],
  },
  {
    slug: 'media-optimizer',
    feature: 'media_optimizer',
    name: 'Tối ưu media',
    description: 'Nén, đổi cỡ và đổi định dạng ảnh và video trong một lượt.',
    category: 'utility',
    slots: [],
    soon: 'Ứng dụng này sẽ có trong bản cập nhật kế tiếp.',
  },
  {
    // Ours, not on the live page: last, so the live apps keep their places.
    slug: 'jewelry-try-on',
    feature: 'jewelry_try_on',
    name: 'Thử trang sức',
    description: 'Đeo trang sức của bạn lên ảnh người mẫu, giữ đúng từng chi tiết.',
    category: 'fashion',
    slots: [
      { label: 'Trang sức', inputLabel: 'Ảnh trang sức', empty: 'Thêm 1 hoặc nhiều món trang sức, chụp rõ trên nền trơn', many: true },
      { label: 'Người đeo', inputLabel: 'Ảnh người đeo', empty: 'Thêm 1 ảnh người sẽ đeo trang sức' },
    ],
    resolution: true,
  },
];

export const appBySlug = (slug: string): AppConfig | undefined => APPS.find((a) => a.slug === slug);

/** Lower case without accents or stroked d, so a search typed without diacritics still matches. */
export const fold = (s: string): string => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');

/** The apps of one category (or all) whose name or description contains the search text. */
export function filterApps(category: AppCategory | 'all', search: string): AppConfig[] {
  const q = fold(search.trim());
  return APPS.filter((a) => (category === 'all' || a.category === category) && fold(`${a.name} ${a.description}`).includes(q));
}

/** What a page has chosen, as the Run needs it: the images of each slot (in the order of `slots`), the prompt text and the model. */
export interface AppDraft {
  images: { id: string }[][];
  prompt: string;
  /** null while the model list loads; `failed` when it could not be loaded. */
  models: { maxImages: number }[] | null;
  failed: boolean;
}

/** The first thing that stops Run, in the order the form is filled; null when it can go. */
export function appReason(app: AppConfig, d: AppDraft): string | null {
  if (d.models === null) return 'Đang tải danh sách mô hình...';
  if (d.failed) return 'Không tải được danh sách mô hình.';
  const model = d.models[0];
  if (!model) return 'Ứng dụng này chưa được Admin bật';
  for (const [i, slot] of app.slots.entries()) {
    if (!slot.optional && d.images[i]!.length === 0) return `Tải lên ảnh: ${slot.label}.`;
  }
  if (app.prompt === 'background') {
    const reference = d.images[1]!.length > 0;
    const written = d.prompt.trim() !== '';
    if (reference && written) return 'Chọn mô tả nền hoặc ảnh nền tham chiếu, không dùng cả hai.';
    if (!reference && !written) return 'Nhập mô tả nền mới hoặc tải lên ảnh nền tham chiếu.';
  }
  const count = d.images.reduce((n, list) => n + list.length, 0);
  if (count > model.maxImages) return `Mô hình này nhận tối đa ${model.maxImages} ảnh.`;
  return null;
}

/** What Motion Control has chosen: the character image, the reference video's length (null until one is uploaded) and the model's allowed lengths. */
export interface MotionDraft {
  image: boolean;
  videoMs: number | null;
  /** null while the model list loads; `failed` when it could not be loaded. */
  model: { durationsSec: number[] } | null | undefined;
  failed: boolean;
}

/** The first thing that stops a Motion Control Run, in the order the form is filled; null when it can go. */
export function motionReason(d: MotionDraft): string | null {
  if (d.model === null) return 'Đang tải danh sách mô hình...';
  if (d.failed) return 'Không tải được danh sách mô hình.';
  if (!d.model) return 'Ứng dụng này chưa được Admin bật';
  if (!d.image) return 'Tải lên ảnh: Nhân vật.';
  if (d.videoMs === null) return 'Tải lên video mẫu.';
  const allowed = d.model.durationsSec;
  if (!allowed.includes(Math.ceil(d.videoMs / 1000))) return `Video mẫu phải dài từ ${allowed[0]} đến ${allowed.at(-1)} giây.`;
  return null;
}

/** The asset ids of a Run, slot by slot, and the prompt the body carries (only Background Changer sends one). */
/** How many images slot `i` takes with a model that accepts `maxImages`. */
export const slotMax = (app: AppConfig, i: number, maxImages: number): number => (app.slots[i]?.many ? Math.max(1, maxImages - (app.slots.length - 1)) : 1);

/** Puts a job's images back in the slots they were sent from: one per slot, except a `many` slot, which takes all those between its neighbours. */
export function splitImages<T>(app: AppConfig, images: T[]): T[][] {
  const k = app.slots.findIndex((s) => s.many);
  if (k < 0) return app.slots.map((_, i) => images.slice(i, i + 1));
  const after = app.slots.length - 1 - k;
  return app.slots.map((_, i) => {
    if (i === k) return images.slice(k, images.length - after);
    const j = i < k ? i : images.length - (app.slots.length - i); // the slots after it take the last images
    return j < 0 ? [] : images.slice(j, j + 1);
  });
}

export function appInputs(app: AppConfig, d: Pick<AppDraft, 'images' | 'prompt'>): { assetIds: string[]; prompt?: string } {
  const assetIds = d.images.flat().map((i) => i.id);
  const written = d.prompt.trim();
  return app.prompt && written ? { assetIds, prompt: written } : { assetIds };
}
