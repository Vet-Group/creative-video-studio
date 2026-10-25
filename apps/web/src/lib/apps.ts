// The nine apps of the Apps index: what each page shows (upload slots, extra fields, About text) and the rules a Run must meet before it is sent.
// The rules mirror POST /api/jobs: the swaps and Face Swap take exactly 2 images; Background Changer takes a prompt with 1 image, or a reference image as the 2nd, not both and not neither.

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
}

export interface AppAbout {
  title: string;
  intro: string;
  /** Each step: a bold lead and its text. */
  steps: [string, string][];
  notes: string[];
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
  about: AppAbout;
}

const PHOTO_NOTE = 'Chỉ dùng ảnh công ty có quyền sử dụng, và chỉ với người đã đồng ý.';
const BUDGET_NOTE = 'Ảnh và ứng dụng có ngân sách riêng, tách khỏi ngân sách video. Nút Chạy ghi chi phí ước tính của một lần chạy; chi phí thật nằm trên ảnh trong Thư viện.';

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
    about: {
      title: 'Đổi nhân vật chỉ với một lần chạy',
      intro: 'Ứng dụng thay toàn bộ người trong ảnh đích bằng người trong ảnh nhân vật mới, giữ nguyên bối cảnh. Hợp với ảnh thời trang và quảng cáo cần đổi người nhưng không đổi cảnh.',
      steps: [
        ['Tải nhân vật mới.', 'Một ảnh người sẽ xuất hiện trong kết quả: khuôn mặt, dáng người và trang phục đều lấy từ ảnh này.'],
        ['Tải ảnh đích.', 'Ảnh có người cần thay. Kết quả giữ bối cảnh của ảnh này.'],
        ['Thêm mô tả (tuỳ chọn).', 'Một câu nếu muốn dặn thêm; nó được ghép vào chỉ dẫn cố định của ứng dụng.'],
        ['Chạy.', 'Nhấn Chạy; ảnh mới nằm trong tab Lịch sử và trong Thư viện, mục Ứng dụng.'],
      ],
      notes: [PHOTO_NOTE, BUDGET_NOTE],
    },
  },
  {
    slug: 'model-swap',
    feature: 'model_swap',
    name: 'Đổi người mẫu',
    description: 'Thay người mẫu trong ảnh bằng người khác, giữ nguyên trang phục và bối cảnh.',
    category: 'fashion',
    slots: [
      { label: 'Người mẫu mới', inputLabel: 'Ảnh người mẫu mới', empty: 'Thêm 1 ảnh người mẫu mới' },
      { label: 'Ảnh đích', inputLabel: 'Ảnh đích', empty: 'Thêm 1 ảnh sản phẩm có người mẫu cần thay' },
    ],
    prompt: 'optional',
    about: {
      title: 'Đổi người mẫu mà vẫn giữ sản phẩm',
      intro: 'Ứng dụng thay người mẫu trong ảnh đích bằng người mẫu mới, còn trang phục, dáng và bối cảnh giữ nguyên. Hợp với ảnh sản phẩm cần nhiều gương mặt.',
      steps: [
        ['Tải người mẫu mới.', 'Một ảnh rõ mặt và dáng, ánh sáng đều.'],
        ['Tải ảnh đích.', 'Ảnh sản phẩm có người mẫu cần thay. Trang phục, dáng và bối cảnh của ảnh này được giữ.'],
        ['Thêm mô tả (tuỳ chọn).', 'Một câu nếu muốn dặn thêm; nó được ghép vào chỉ dẫn cố định của ứng dụng.'],
        ['Chạy.', 'Nhấn Chạy và theo dõi trong tab Lịch sử.'],
      ],
      notes: [PHOTO_NOTE, BUDGET_NOTE],
    },
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
    about: {
      title: 'Đổi nền ảnh bằng AI',
      intro: 'Ứng dụng giữ nguyên người hoặc sản phẩm và thay nền bằng một cảnh mới. Bạn mô tả cảnh bằng chữ, hoặc tải một ảnh nền làm mẫu.',
      steps: [
        ['Tải ảnh.', 'Ảnh có người hoặc sản phẩm cần giữ.'],
        ['Mô tả hoặc thêm ảnh nền.', 'Viết mô tả nền mới, hoặc tải một ảnh nền tham chiếu. Chọn một trong hai, không dùng cả hai.'],
        ['Chạy.', 'Nhấn Chạy; kết quả nằm trong tab Lịch sử.'],
      ],
      notes: ['Mô hình nhận mô tả hoặc ảnh tham chiếu, không nhận cả hai cùng lúc.', PHOTO_NOTE, BUDGET_NOTE],
    },
  },
  {
    slug: 'reframe',
    feature: 'reframe',
    name: 'Đổi khung hình',
    description: 'Mở rộng ảnh sang tỉ lệ khung hình mới bằng AI.',
    category: 'photo',
    slots: [{ label: 'Ảnh', inputLabel: 'Ảnh cần đổi khung', empty: 'Thêm 1 ảnh' }],
    ratio: true,
    about: {
      title: 'Đổi khung hình mà không cắt ảnh',
      intro: 'Ứng dụng kéo rộng phần rìa của ảnh để vừa tỉ lệ mới, thay vì cắt bớt.',
      steps: [
        ['Tải ảnh.', 'Một ảnh cần đổi tỉ lệ.'],
        ['Chọn tỉ lệ.', 'Danh sách tỉ lệ lấy từ mô hình đang bật.'],
        ['Chạy.', 'Nhấn Chạy; ảnh mới nằm trong tab Lịch sử.'],
      ],
      notes: [PHOTO_NOTE, BUDGET_NOTE],
    },
  },
  {
    slug: 'image-upscale',
    feature: 'image_upscale',
    name: 'Tăng độ phân giải',
    description: 'Phóng ảnh lên đến 4K mà không mất chi tiết.',
    category: 'photo',
    slots: [{ label: 'Ảnh', inputLabel: 'Ảnh cần tăng độ phân giải', empty: 'Thêm 1 ảnh' }],
    resolution: true,
    about: {
      title: 'Tăng độ phân giải cho ảnh',
      intro: 'Ứng dụng phóng to ảnh và làm rõ chi tiết, đến độ phân giải bạn chọn.',
      steps: [
        ['Tải ảnh.', 'Một ảnh cần phóng to.'],
        ['Chọn độ phân giải.', 'Các mức lấy từ mô hình đang bật; giá mỗi mức ghi trên nút Chạy.'],
        ['Chạy.', 'Nhấn Chạy; ảnh mới nằm trong tab Lịch sử.'],
      ],
      notes: ['Kết quả không vượt quá 24 megapixel.', PHOTO_NOTE, BUDGET_NOTE],
    },
  },
  {
    slug: 'face-swap',
    feature: 'face_swap',
    name: 'Đổi khuôn mặt',
    description: 'Chỉ đổi khuôn mặt, mọi thứ khác giữ nguyên.',
    category: 'fashion',
    slots: [
      { label: 'Khuôn mặt nguồn', inputLabel: 'Ảnh khuôn mặt nguồn', empty: 'Thêm 1 ảnh có khuôn mặt muốn dùng' },
      { label: 'Ảnh đích', inputLabel: 'Ảnh đích', empty: 'Thêm 1 ảnh cần đổi khuôn mặt' },
    ],
    about: {
      title: 'Đổi khuôn mặt trong ảnh',
      intro: 'Ứng dụng đặt khuôn mặt từ ảnh nguồn lên người trong ảnh đích. Dáng, trang phục và bối cảnh không đổi.',
      steps: [
        ['Tải khuôn mặt nguồn.', 'Một ảnh rõ mặt, nhìn thẳng.'],
        ['Tải ảnh đích.', 'Ảnh cần đổi khuôn mặt.'],
        ['Chạy.', 'Nhấn Chạy; ảnh mới nằm trong tab Lịch sử.'],
      ],
      notes: [PHOTO_NOTE, BUDGET_NOTE],
    },
  },
  {
    slug: 'background-remover',
    feature: 'background_remover',
    name: 'Xoá nền',
    description: 'Xoá nền ảnh chỉ với một cú nhấn, ra ảnh PNG trong suốt.',
    category: 'photo',
    slots: [{ label: 'Ảnh', inputLabel: 'Ảnh cần xoá nền', empty: 'Thêm 1 ảnh' }],
    about: {
      title: 'Xoá nền ảnh',
      intro: 'Ứng dụng tách người hoặc sản phẩm khỏi nền và trả về ảnh PNG có nền trong suốt.',
      steps: [
        ['Tải ảnh.', 'Một ảnh có chủ thể rõ ràng.'],
        ['Chạy.', 'Nhấn Chạy; ảnh PNG nằm trong tab Lịch sử và trong Thư viện, mục Ứng dụng.'],
      ],
      notes: [PHOTO_NOTE, BUDGET_NOTE],
    },
  },
  {
    slug: 'motion-control',
    feature: 'motion_control',
    name: 'Điều khiển chuyển động',
    description: 'Chép chuyển động từ một video sang nhân vật của bạn.',
    category: 'video',
    // Its form is its own (AppPage's MotionForm): one image slot and one video slot.
    slots: [],
    about: {
      title: 'Điều khiển chuyển động',
      intro: 'Ứng dụng dùng Kling V3 Motion Control: nhân vật trong ảnh của bạn làm lại đúng các động tác của một video mẫu. Video kết quả dài bằng video mẫu.',
      steps: [
        ['Tải ảnh nhân vật.', 'Một ảnh rõ người, thấy cả thân càng tốt.'],
        ['Tải video chuyển động.', 'Video MP4 hoặc MOV dài 3 đến 30 giây, tối đa 20 MB, có một người làm động tác rõ ràng.'],
        ['Chạy.', 'Prompt là tuỳ chọn. Video kết quả nằm trong tab Lịch sử và trong Thư viện, mục Ứng dụng.'],
      ],
      notes: [PHOTO_NOTE, 'Video kết quả không có tiếng. Chi phí tính theo số giây của video mẫu, làm tròn lên.', BUDGET_NOTE],
    },
  },
  {
    slug: 'media-optimizer',
    feature: 'media_optimizer',
    name: 'Tối ưu media',
    description: 'Nén, đổi cỡ và đổi định dạng ảnh và video trong một lượt.',
    category: 'utility',
    slots: [],
    soon: 'Ứng dụng này sẽ có trong bản cập nhật kế tiếp.',
    about: { title: '', intro: '', steps: [], notes: [] },
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
  if (d.videoMs === null) return 'Tải lên video chuyển động.';
  const allowed = d.model.durationsSec;
  if (!allowed.includes(Math.ceil(d.videoMs / 1000))) return `Video chuyển động phải dài từ ${allowed[0]} đến ${allowed.at(-1)} giây.`;
  return null;
}

/** The asset ids of a Run, slot by slot, and the prompt the body carries (only Background Changer sends one). */
export function appInputs(app: AppConfig, d: Pick<AppDraft, 'images' | 'prompt'>): { assetIds: string[]; prompt?: string } {
  const assetIds = d.images.flat().map((i) => i.id);
  const written = d.prompt.trim();
  return app.prompt && written ? { assetIds, prompt: written } : { assetIds };
}
