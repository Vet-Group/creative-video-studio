// The ten apps of the Apps index: what each page shows (upload slots, extra fields) and the rules a Run must meet before it is sent.
// The rules mirror POST /api/jobs: the swaps and Face Swap take exactly 2 images, Jewelry Try-On 2 or more (the pieces, then the person); Background Changer takes a prompt with 1 image, or a reference image as the 2nd, not both and not neither.

import { MOTION_IMAGE_MAX_SEC } from '@cvs/core/models';
import { poseOf, POSES } from './try-on-stock';

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
  /** Stock photos the slot offers in a dialog, from the samples an Admin uploaded: the ones named `<prefix>NN.jpg` of each group, a group with a `label` under its own heading. */
  stock?: { title: string; groups: { label?: string; prefix: string }[] };
  /** Its tile also offers the saved AI models the member may use (the AI model group of Try On's model picker), when there are any. */
  aiModels?: boolean;
}

export interface AppConfig {
  slug: string;
  /** The job feature; the page runs the enabled image model that lists it. */
  feature: string;
  name: string;
  description: string;
  /** Other words the Apps search finds it by: the English names staff use (Face Swap, Try-On, Upscale). */
  keywords?: string;
  category: AppCategory;
  slots: AppSlot[];
  /** A prompt box. `background` (Background Changer) excludes the reference image; `optional` (the two swaps) adds the member's text to the fixed instruction. The other apps send their fixed prompt. */
  prompt?: 'background' | 'optional';
  /** Shows the ratio field (Reframe); the options are the model's own ratios. */
  ratio?: boolean;
  /** Shows the resolution field (Upscale); the options are the keys of the model's prices. */
  resolution?: boolean;
  /** Shows the views (PRODUCT_VIEWS) to pick (the multi-angle app): Run sends one job per view picked, each with its `params.view`. */
  views?: boolean;
  /** Shows the dog breeds (DOG_BREEDS) to pick (the breed swap app): Run sends one job per breed picked, each with its `params.breed` and the prompt breedSwapPrompt makes. */
  breeds?: boolean;
  /** Shows the print styles (PET_STYLES) to pick (the pet portrait app): Run sends one job per style picked, each with its `params.style` and the prompt petPortraitPrompt makes. */
  styles?: boolean;
  /** Shows the products (MOCKUP_PRODUCTS) to pick (the mockup pack): Run sends one job per product picked, each with its `params.product` and the prompt mockupPrompt makes. */
  products?: boolean;
  /** Shows the names box and the breeds as an option (the name swap app): Run sends one job per name, or per name and breed, each with its `params.name` (and `params.breed`) and the prompt nameSwapPrompt makes. */
  names?: boolean;
  /** Shows the poses (POSES, by their pictures) and a box for the member's own words, up to MAX_POSES in all (the pose generator): Run sends one job per pose, each with its
   * `params.pose` or `params.poseText` and the prompt posePrompt makes. */
  poses?: boolean;
  /** Its first slot takes up to MAX_BATCH photos: Run sends one job per photo, each with the same settings, the other slots and one `params.batch`. */
  bulk?: boolean;
  /** An app that is not built yet: its page says so, and why. */
  soon?: string;
  /** The day it went live (ICT, as its changelog entry says): its Apps card shows the New badge for NEW_DAYS days from then. */
  added?: string;
}

/** The template photos of Jewelry Try-On's wearer slot (samples `jewelry-template-<group>-NN.jpg`), in the reference site's order. */
const JEWELRY_TEMPLATES = [
  ['ear', 'Tai'], ['face', 'Mặt'], ['neck', 'Cổ & ngực'], ['beauty', 'Mặt & tay'], ['hand', 'Tay'], ['portrait', 'Chân dung'], ['lifestyle', 'Đời thường'],
].map(([id, label]) => ({ label: label!, prefix: `jewelry-template-${id}-` }));

export const APPS: AppConfig[] = [
  {
    slug: 'character-swap',
    feature: 'character_swap',
    name: 'Đổi nhân vật',
    description: 'Thay toàn bộ người trong ảnh bằng một người khác.',
    keywords: 'character swap',
    category: 'fashion',
    slots: [
      { label: 'Nhân vật mới', inputLabel: 'Ảnh nhân vật mới', empty: 'Thêm 1 ảnh người sẽ xuất hiện trong kết quả' },
      { label: 'Ảnh cần thay người', inputLabel: 'Ảnh cần thay người', empty: 'Thêm 1 ảnh có người cần thay' },
    ],
    prompt: 'optional',
  },
  {
    slug: 'model-swap',
    feature: 'model_swap',
    name: 'Đổi người mẫu',
    description: 'Thay người trong ảnh bằng một người mẫu khác. Trang phục và bối cảnh giữ nguyên.',
    keywords: 'model swap',
    category: 'fashion',
    slots: [
      { label: 'Người mẫu mới', inputLabel: 'Ảnh người mẫu mới', empty: 'Thêm 1 ảnh người mẫu mới' },
      { label: 'Ảnh cần thay người mẫu', inputLabel: 'Ảnh cần thay người mẫu', empty: 'Thêm 1 ảnh sản phẩm có người mẫu cần thay' },
    ],
    prompt: 'optional',
  },
  {
    slug: 'background-changer',
    feature: 'background_changer',
    name: 'Đổi nền',
    description: 'Nền mới từ một mô tả hoặc một ảnh tham chiếu.',
    keywords: 'background changer, change background',
    category: 'photo',
    slots: [
      { label: 'Ảnh', inputLabel: 'Ảnh cần đổi nền', empty: 'Thêm 1 hoặc nhiều ảnh' },
      { label: 'Ảnh nền tham chiếu (tuỳ chọn)', inputLabel: 'Ảnh nền tham chiếu', empty: 'Thêm 1 ảnh nền nếu muốn', optional: true },
    ],
    prompt: 'background',
    bulk: true,
  },
  {
    slug: 'reframe',
    feature: 'reframe',
    name: 'Đổi khung hình',
    description: 'Mở rộng mọi ảnh sang tỉ lệ khung hình mới bằng AI.',
    keywords: 'reframe, aspect ratio, outpaint',
    category: 'photo',
    slots: [{ label: 'Ảnh', inputLabel: 'Ảnh cần đổi khung', empty: 'Thêm 1 ảnh' }],
    ratio: true,
  },
  {
    slug: 'image-upscale',
    feature: 'image_upscale',
    name: 'Tăng độ phân giải',
    description: 'Phóng mọi ảnh lên tới 4K mà không mất chi tiết.',
    keywords: 'image upscale, upscaler, 4K',
    category: 'photo',
    slots: [{ label: 'Ảnh', inputLabel: 'Ảnh cần tăng độ phân giải', empty: 'Thêm 1 hoặc nhiều ảnh' }],
    resolution: true,
    bulk: true,
  },
  {
    slug: 'face-swap',
    feature: 'face_swap',
    name: 'Đổi khuôn mặt',
    description: 'Chỉ đổi khuôn mặt. Mọi thứ khác giữ nguyên.',
    keywords: 'face swap',
    category: 'fashion',
    slots: [
      { label: 'Khuôn mặt nguồn', inputLabel: 'Ảnh khuôn mặt nguồn', empty: 'Thêm 1 ảnh có khuôn mặt muốn dùng' },
      { label: 'Ảnh cần đổi khuôn mặt', inputLabel: 'Ảnh cần đổi khuôn mặt', empty: 'Thêm 1 ảnh có khuôn mặt cần thay' },
    ],
  },
  {
    slug: 'background-remover',
    feature: 'background_remover',
    name: 'Xoá nền',
    description: 'Xoá mọi nền chỉ với một lần bấm. Ảnh PNG trong suốt.',
    keywords: 'background remover, remove background, cutout',
    category: 'photo',
    slots: [{ label: 'Ảnh', inputLabel: 'Ảnh cần xoá nền', empty: 'Thêm 1 hoặc nhiều ảnh' }],
    bulk: true,
  },
  {
    slug: 'motion-control',
    feature: 'motion_control',
    name: 'Điều khiển chuyển động',
    description: 'Chép chuyển động từ một video sang nhân vật của bạn.',
    keywords: 'motion control',
    category: 'video',
    // Its form is its own (AppPage's MotionForm): one image slot and one video slot.
    slots: [],
  },
  {
    slug: 'media-optimizer',
    feature: 'media_optimizer',
    name: 'Tối ưu media',
    description: 'Nén, đổi cỡ và đổi định dạng ảnh ngay trên thiết bị, miễn phí. Chưa hỗ trợ video.',
    keywords: 'media optimizer, compress, resize, convert',
    category: 'utility',
    slots: [],
  },
  {
    // Ours, not on the live page: last, so the live apps keep their places.
    slug: 'jewelry-try-on',
    feature: 'jewelry_try_on',
    name: 'Thử trang sức',
    description: 'Đeo trang sức của bạn lên ảnh người mẫu, giữ đúng từng chi tiết.',
    keywords: 'jewelry try on, try-on, thử đồ',
    category: 'fashion',
    slots: [
      { label: 'Trang sức', inputLabel: 'Ảnh trang sức', empty: 'Thêm 1 hoặc nhiều món trang sức, chụp rõ trên nền trơn', many: true },
      { label: 'Người đeo', inputLabel: 'Ảnh người đeo', empty: 'Thêm 1 ảnh người sẽ đeo trang sức', stock: { title: 'Chọn mẫu', groups: JEWELRY_TEMPLATES } },
    ],
    resolution: true,
  },
  {
    slug: 'lingerie-try-on',
    feature: 'lingerie_try_on',
    name: 'Thử đồ lót',
    description: 'Mặc đồ lót của bạn lên người mẫu, giữ đúng chất liệu ren, lưới và satin.',
    keywords: 'lingerie try on, try-on',
    category: 'fashion',
    slots: [
      { label: 'Đồ lót', inputLabel: 'Ảnh đồ lót', empty: 'Thêm 1 hoặc nhiều món đồ lót, chụp rõ trên nền trơn', many: true },
      { label: 'Người mẫu', inputLabel: 'Ảnh người mẫu', empty: 'Thêm 1 ảnh người mẫu', stock: { title: 'Chọn người mẫu', groups: [{ prefix: 'lingerie-model-m' }] } },
    ],
    prompt: 'optional',
    ratio: true,
    resolution: true,
  },
  {
    // Ours too, and the only app with its own page (components/FashionModelApp.tsx): the traits are its form, so it has no upload slot.
    slug: 'ai-fashion-model',
    added: '2026-11-12',
    feature: 'fashion_model',
    name: 'Tạo người mẫu AI',
    description: 'Chọn đặc điểm để tạo người mẫu hư cấu, lưu lại và dùng trong Thử đồ, Tạo ảnh và Tạo video.',
    keywords: 'AI fashion model generator',
    category: 'fashion',
    slots: [],
  },
  {
    // Ours too: the sides of a product from its front photo, as reference images that help a video model keep an all-over print.
    slug: 'multi-angle',
    added: '2026-11-18',
    feature: 'multi_angle',
    name: 'Ảnh nhiều góc',
    description: 'Từ một ảnh sản phẩm, tạo ảnh mặt sau, hai bên hoặc góc 3/4, mỗi góc một ảnh riêng.',
    keywords: 'multi angle, product views',
    category: 'photo',
    slots: [{ label: 'Sản phẩm', inputLabel: 'Ảnh sản phẩm', empty: 'Thêm 1 ảnh mặt trước của sản phẩm' }],
    views: true,
  },
  {
    // Ours too (the pet pack, 2026-11-19): one design or photo with a dog, the same picture with another breed per job, so a seller lists one design for many breeds.
    slug: 'breed-swap',
    added: '2026-11-19',
    feature: 'breed_swap',
    name: 'Đổi giống chó hàng loạt',
    description: 'Từ một ảnh có chó (mockup, thiết kế hay ảnh chụp), tạo một ảnh cho mỗi giống chó đã chọn, giữ nguyên chữ và bố cục.',
    keywords: 'breed swap, dog',
    category: 'photo',
    slots: [{ label: 'Ảnh gốc', inputLabel: 'Ảnh gốc có chó', empty: 'Thêm 1 mockup, thiết kế hoặc ảnh chụp có một chú chó' }],
    breeds: true,
  },
  {
    // Ours too (the pet apps, 2026-11-19): one pet photo, one print-ready design per style, for a seller's custom pet portrait products.
    slug: 'pet-portrait',
    added: '2026-11-19',
    feature: 'pet_portrait',
    name: 'Chân dung thú cưng',
    description: 'Từ một ảnh thú cưng, tạo một thiết kế in sẵn nền trắng cho mỗi phong cách đã chọn: màu nước, hoạt hình, nét mực, chân dung hoàng gia và hơn nữa.',
    keywords: 'pet portrait',
    category: 'photo',
    slots: [{ label: 'Thú cưng', inputLabel: 'Ảnh thú cưng', empty: 'Thêm 1 ảnh chụp rõ mặt của một thú cưng' }],
    styles: true,
  },
  {
    // Ours too: one design, one product mockup per product, or the design on the seller's own blank product photo.
    slug: 'mockup-pack',
    added: '2026-11-19',
    feature: 'mockup_pack',
    name: 'Mockup hàng loạt',
    description: 'Từ một thiết kế, tạo một ảnh mockup cho mỗi sản phẩm đã chọn: thảm tròn, ornament, áo thun, cốc, chăn và tranh canvas.',
    keywords: 'mockup pack, mockups',
    category: 'photo',
    slots: [
      { label: 'Thiết kế', inputLabel: 'Ảnh thiết kế', empty: 'Thêm 1 thiết kế, tốt nhất là PNG nền trong hoặc nền trắng' },
      { label: 'Sản phẩm trơn (tuỳ chọn)', inputLabel: 'Ảnh sản phẩm trơn', empty: 'Thêm 1 ảnh sản phẩm trơn của bạn nếu muốn in lên đúng sản phẩm đó', optional: true },
    ],
    products: true,
  },
  {
    // Ours too: one personalized design, one picture per customer name (and breed), so a seller lists one design for many names.
    slug: 'name-swap',
    added: '2026-11-19',
    feature: 'name_swap',
    name: 'Đổi tên hàng loạt',
    description: 'Từ một thiết kế có tên, tạo một ảnh cho mỗi tên mới, giữ nguyên phông chữ, màu và vị trí; có thể đổi cả giống chó.',
    keywords: 'name swap, personalized',
    category: 'photo',
    slots: [{ label: 'Thiết kế có tên', inputLabel: 'Ảnh thiết kế có tên', empty: 'Thêm 1 thiết kế hoặc mockup có một tên in trên đó' }],
    names: true,
  },
  {
    // Ours too (owner-approved 2026-11-20): one model photo, the same person in other poses, one job per pose; a fashion app beside the AI model generator, whose models it poses.
    slug: 'pose-generator',
    added: '2026-11-20',
    feature: 'pose_generator',
    name: 'Tạo tư thế người mẫu',
    description: 'Từ một ảnh người mẫu, tạo cùng người mẫu ấy trong tối đa 4 tư thế, mỗi tư thế một ảnh riêng, giữ nguyên người và trang phục.',
    keywords: 'pose, pose generator, model poses',
    category: 'fashion',
    slots: [{ label: 'Người mẫu', inputLabel: 'Ảnh người mẫu', empty: 'Ảnh người mẫu (rõ mặt, thấy người)', aiModels: true }],
    poses: true,
  },
  {
    // Ours too, with its own page (components/SmartRemakeApp.tsx) and off unless both REA flags are on (visibleApps). It spends no job: a remake is video spend
    // of its own (api/remakes), so it borrows the `video` feature rather than add one whose per-feature cap would never apply.
    slug: 'smart-remake',
    added: '2026-11-13',
    feature: 'video',
    name: 'Smart Remake',
    description: 'Giữ mạch truyện của một video mẫu và đặt sản phẩm của bạn vào các cảnh. Chỉ cần một video và một ảnh sản phẩm.',
    category: 'video',
    slots: [],
  },
];

/** The apps the member is offered: Smart Remake only when its flags are on (the server reads them), as every list of apps shows it. */
export const visibleApps = (smartRemake: boolean): AppConfig[] => APPS.filter((a) => smartRemake || a.slug !== 'smart-remake');

/** The apps whose results are jobs of their own feature, so the Library can filter by one (Smart Remake borrows `video`, and has none). */
export const JOB_APPS: AppConfig[] = APPS.filter((a) => a.feature !== 'video');

export const appBySlug = (slug: string): AppConfig | undefined => APPS.find((a) => a.slug === slug);

export const NEW_DAYS = 14;
/** Whether an app went live less than NEW_DAYS days before `now` (its `added` day starts at midnight ICT). */
export const isNewApp = (app: Pick<AppConfig, 'added'>, now = Date.now()): boolean => !!app.added && now - Date.parse(`${app.added}T00:00:00+07:00`) < NEW_DAYS * 86_400_000;

/** Lower case without accents or stroked d, so a search typed without diacritics still matches. */
export const fold = (s: string): string => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');

/** The apps of one category (or all) whose name, description or keywords contain the search text. */
export function filterApps(category: AppCategory | 'all', search: string, smartRemake = false): AppConfig[] {
  const q = fold(search.trim());
  return visibleApps(smartRemake).filter((a) => (category === 'all' || a.category === category) && fold(`${a.name} ${a.description} ${a.keywords ?? ''}`).includes(q));
}

/** What a page has chosen, as the Run needs it: the images of each slot (in the order of `slots`), the prompt text and the model. */
export interface AppDraft {
  images: { id: string }[][];
  prompt: string;
  /** null while the model list loads; `failed` when it could not be loaded. */
  models: { maxImages: number }[] | null;
  failed: boolean;
  /** How many views are picked, on an app with `views`. */
  views?: number;
  /** How many breeds are picked, on an app with `breeds` (or `names`, where they are optional). */
  breeds?: number;
  /** How many styles are picked, on an app with `styles`. */
  styles?: number;
  /** How many products are picked, on an app with `products`. */
  products?: number;
  /** The names box, on an app with `names`. */
  names?: string;
  /** How many poses are picked, the member's own words counting as one, on an app with `poses`. */
  poses?: number;
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
  if (app.views && !d.views) return 'Chọn ít nhất một góc.';
  if (app.breeds && !d.breeds) return 'Chọn ít nhất một giống chó.';
  if (app.styles && !d.styles) return 'Chọn ít nhất một phong cách.';
  if (app.products && !d.products) return 'Chọn ít nhất một sản phẩm.';
  if (app.poses && !d.poses) return 'Chọn ít nhất một tư thế, hoặc tự tả một tư thế.';
  if (app.poses && d.poses! > MAX_POSES) return `Tối đa ${MAX_POSES} tư thế mỗi lần chạy, đang là ${d.poses}: bỏ bớt một tư thế.`;
  // The blank is one product, so its mockup is that one only.
  if (app.products && d.images[1]!.length > 0 && d.products! > 1) return 'Có ảnh sản phẩm trơn thì chỉ chọn một sản phẩm: đúng loại trong ảnh đó.';
  if (app.names) {
    const { names, problem } = parseNames(d.names ?? '');
    const jobs = names.length * Math.max(1, d.breeds ?? 0);
    if (problem) return problem;
    if (jobs > MAX_BATCH) return `Tối đa ${MAX_BATCH} ảnh mỗi lần chạy, đang là ${jobs}: bớt tên hoặc giống chó.`;
  }
  if (app.prompt === 'background') {
    const reference = d.images[1]!.length > 0;
    const written = d.prompt.trim() !== '';
    if (reference && written) return 'Chọn mô tả nền hoặc ảnh nền tham chiếu, không dùng cả hai.';
    if (!reference && !written) return 'Nhập mô tả nền mới hoặc tải lên ảnh nền tham chiếu.';
  }
  const count = jobImages(app, d.images);
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
  /** Whose orientation the character keeps; 'image' caps the reference video at MOTION_IMAGE_MAX_SEC. Default 'video'. */
  orientation?: 'video' | 'image';
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
  if (d.orientation === 'image' && Math.ceil(d.videoMs / 1000) > MOTION_IMAGE_MAX_SEC) return `Khi nhân vật giữ hướng của ảnh, video chuyển động chỉ dài tối đa ${MOTION_IMAGE_MAX_SEC} giây. Hãy cắt ngắn video hoặc chọn "Theo video".`;
  return null;
}

/** The stock photos of a slot that exist, group by group: the sample names `<prefix>NN.jpg` (or png, webp) in number order. Missing files simply do not show. */
export function stockGroups(slot: AppSlot, have: ReadonlySet<string>): { label?: string; names: string[] }[] {
  return (slot.stock?.groups ?? [])
    .map((g) => ({
      label: g.label,
      names: [...have].filter((n) => n.startsWith(g.prefix) && /^\d+\.(jpg|png|webp)$/.test(n.slice(g.prefix.length))).sort((a, b) => parseInt(a.slice(g.prefix.length)) - parseInt(b.slice(g.prefix.length))),
    }))
    .filter((g) => g.names.length > 0);
}

/** The asset ids of a Run, slot by slot, and the prompt the body carries (only Background Changer sends one). */
/** How many images slot `i` takes with a model that accepts `maxImages`. */
/** How many photos one job of the app sends: a bulk app's job takes one photo of its first slot. */
export const jobImages = (app: AppConfig, images: unknown[][]): number => images.reduce<number>((n, list, i) => n + (app.bulk && i === 0 ? Math.min(list.length, 1) : list.length), 0);

export const slotMax = (app: AppConfig, i: number, maxImages: number): number => (app.bulk && i === 0 ? MAX_BATCH : app.slots[i]?.many ? Math.max(1, maxImages - (app.slots.length - 1)) : 1);

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

/** What the multi-angle app calls each of PRODUCT_VIEWS. */
export const VIEW_LABELS: Record<string, string> = {
  back: 'Mặt sau', left: 'Bên trái', right: 'Bên phải', 'three-quarter-left': 'Góc 3/4 trái', 'three-quarter-right': 'Góc 3/4 phải', top: 'Nhìn từ trên',
};

/** The views the multi-angle app starts with: the back and both sides, which the front photo shows least. */
export const DEFAULT_VIEWS = ['back', 'left', 'right'];

/** What a Run of `runs` jobs at `unit` USD each costs, with the 4 decimals of a job's estimate; undefined while the price is unknown. */
export const runTotal = (unit: string | undefined, runs: number): string | undefined => (unit === undefined ? undefined : (Number(unit) * runs).toFixed(4));

/** The breeds the breed swap app offers, the most popular first. Sellers list them by these English names, so the page shows them as they are and a job keeps one as `params.breed`. */
export const DOG_BREEDS = [
  'Golden Retriever', 'Labrador Retriever', 'French Bulldog', 'German Shepherd', 'Poodle', 'Bulldog', 'Beagle', 'Rottweiler', 'Dachshund', 'Pembroke Welsh Corgi',
  'Australian Shepherd', 'Yorkshire Terrier', 'Boxer', 'Siberian Husky', 'Cavalier King Charles Spaniel', 'Bernese Mountain Dog', 'Miniature Schnauzer', 'Shih Tzu',
  'Pomeranian', 'Boston Terrier', 'Havanese', 'Shetland Sheepdog', 'Chihuahua', 'Pug', 'Border Collie',
];

/** The prompt of one breed swap job: only the dog changes, to `breed`, and the rest of the picture (a product mockup, a design or a photo) stays as it is. POST /api/jobs takes no other. */
export const breedSwapPrompt = (breed: string): string =>
  `Replace only the dog in the image with ${/^[AEIOU]/.test(breed) ? 'an' : 'a'} ${breed}, with the coat, colours and markings typical of the breed. ` +
  'Keep the new dog in the same pose, at the same size and in the same position as the original dog, facing the same way. ' +
  'Keep everything else exactly unchanged: every text, name and number, the layout, the background, the product and its shape, the lighting and the art style. ' +
  'A photo stays a photo and an illustration stays an illustration in the same style. Do not add any text, logos or watermarks.';

/** The batch apps: a Run sends one job per item picked (or per photo, on a `bulk` app), all with one `params.batch` id (a UUID), by which History's Reuse and
 * "Chọn cả lô" find the whole Run. */
export const BATCH_FEATURES = ['multi_angle', 'breed_swap', 'pet_portrait', 'mockup_pack', 'name_swap', 'pose_generator', 'background_changer', 'image_upscale', 'background_remover'];
export const isBatchId = (s: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

/** The most jobs one Run of a batch app sends (the name swap app's names, or its names times its breeds, can reach it); POST /api/jobs holds every Run to it. */
export const MAX_BATCH = 25;

/** The print styles of the pet portrait app: the id a job keeps as `params.style`, the page's label and the English words its prompt takes. */
export const PET_STYLES: { id: string; label: string; look: string }[] = [
  { id: 'watercolor', label: 'Màu nước', look: 'a soft watercolor painting with gentle washes of color, light paper texture and loose, flowing edges' },
  { id: 'cartoon', label: 'Hoạt hình', look: 'a cute cartoon illustration with bold clean outlines, flat bright colors and a slightly larger head' },
  { id: 'line-art', label: 'Nét mực đen', look: 'black ink line art only: clean, confident lines, with no color, no gray and no filled shading' },
  { id: 'royal', label: 'Chân dung hoàng gia', look: 'a royal Renaissance oil portrait, the pet wearing a red velvet cloak with an ermine collar and a gold chain, in rich classical light' },
  { id: 'pop-art', label: 'Pop art', look: 'bold 1960s pop art screen print with flat saturated colors, strong black outlines and halftone dots' },
  { id: 'flat-vector', label: 'Vector phẳng', look: 'a minimal flat vector illustration made of a few solid color shapes, with crisp edges and no gradients or texture' },
  { id: 'pencil', label: 'Phác chì', look: 'a detailed graphite pencil sketch with fine hatching and soft shading, in shades of gray only' },
  { id: 'oil', label: 'Sơn dầu', look: 'a classic oil painting with rich colors and visible, textured brushstrokes' },
];

/** The prompt of one pet portrait job: the pet of the photo in `style` (an id of PET_STYLES), as a design ready to print. POST /api/jobs takes no other. */
export const petPortraitPrompt = (style: string): string =>
  `Turn the pet in the photo into a print-ready design in this style: ${PET_STYLES.find((s) => s.id === style)!.look}. ` +
  "Keep the pet's likeness exactly: its face, markings, coat colors and pattern, eye color and ear shape, as far as the style's colors allow, so its owner knows it at once. " +
  'Show this one pet only, centered, with nothing of its head or ears cut off. ' +
  'Use a plain pure white background with no scenery, shadow or vignette. No text, no letters, no frame, no border, no signature and no watermark. ' +
  'Clean, sharp edges, ready to print on a product.';

/** The most poses one Run of the pose generator makes, its own words included. */
export const MAX_POSES = 4;
/** The longest own words for a pose, in characters. */
export const MAX_POSE_TEXT = 200;
/** What the pose generator calls a job of the member's own words, on its box and on the job's History card. */
export const OWN_POSE = 'Tư thế tự tả';

/** The prompt of one pose generator job: the person of the photo, unchanged, in the pose `words` say (a pose's of POSES, or the member's own). POST /api/jobs takes no other. */
export const posePrompt = (words: string): string =>
  "Keep the person's face, identity, hair, skin, body shape and outfit, and the photo's lighting and background, exactly unchanged, " +
  `and show the same person in this pose and framing: ${words}. Photorealistic, with the same camera quality as the photo. Do not add any text, logos or watermarks.`;

/** The products of the mockup pack: the id a job keeps as `params.product`, the page's label, what the product is and the scene of its mockup. */
export const MOCKUP_PRODUCTS: { id: string; label: string; product: string; scene: string }[] = [
  { id: 'round-rug', label: 'Thảm tròn 3D', product: 'round rug', scene: 'lying flat on a wooden floor in a cozy living room, seen from slightly above, the design covering the whole round face of the rug' },
  { id: 'ornament', label: 'Ornament kính tròn', product: 'round glass Christmas ornament', scene: 'hanging from a ribbon on a decorated Christmas tree with warm, blurred lights behind it, the design printed on its front' },
  { id: 'tshirt', label: 'Áo thun cổ tròn', product: 'crewneck t-shirt', scene: 'laid flat on a plain light surface and photographed from directly above, the design printed on the center of the chest' },
  { id: 'mug', label: 'Cốc sứ 11 oz', product: 'white 11 oz ceramic mug', scene: 'standing on a wooden table in soft daylight with its handle to the right, the design printed on the side facing the camera and following its curve' },
  { id: 'blanket', label: 'Chăn lông', product: 'fleece throw blanket', scene: 'draped over a sofa in a bright living room, the design printed across the whole blanket and following its folds' },
  { id: 'canvas', label: 'Tranh canvas', product: 'stretched canvas print', scene: 'hanging on a plain wall above a console table in soft natural light, the design filling the whole canvas' },
];

const KEEP_DESIGN = 'Use the design exactly as it is: the same colors, text and spelling, layout and proportions, not redrawn, cropped, mirrored or added to.';

/** The prompt of one mockup pack job: the design of the first image on `product` (an id of MOCKUP_PRODUCTS) in its scene, or, with `blank`, on the member's own blank product photo (the second image) kept as it is. POST /api/jobs takes no other. */
export function mockupPrompt(product: string, blank: boolean): string {
  const p = MOCKUP_PRODUCTS.find((m) => m.id === product)!;
  return blank
    ? `Put the design from the first image on the ${p.product} in the second image. Keep that product exactly as it is: its shape, size, color, material, angle, background and lighting. ${KEEP_DESIGN} ` +
        "Fit the design to the product's printable surface, following its curves and folds, with natural shading over the print. Do not add any other text, logos or watermarks."
    : `Make a realistic product photo of a ${p.product} ${p.scene}, using the design in the image. ${KEEP_DESIGN} ` +
        "Keep the product's real shape and proportions, with natural light and shadows and the texture of its material showing through the print. Show one product only and do not add any other text, logos or watermarks.";
}

/** The longest name the name swap app takes, in characters. */
export const MAX_NAME = 20;

/** A name as the name swap box and POST /api/jobs take it: NFC, trimmed, inner spaces as one. */
export const cleanName = (line: string): string => line.normalize('NFC').trim().replace(/\s+/g, ' ');

/** Whether a clean name may go into the prompt: up to MAX_NAME Latin letters (Vietnamese ones too), digits, spaces, apostrophes and hyphens, with a letter or digit. No emoji, quotes or other symbols. */
export const nameOk = (name: string): boolean => [...name].length <= MAX_NAME && /^[\p{Script=Latin}̀-ͯ0-9 '’-]+$/u.test(name) && /[\p{Script=Latin}0-9]/u.test(name);

/** The names of the name swap box, one per line: cleaned, blank lines and repeats dropped, and the first thing wrong with them (null when a Run can take them). */
export function parseNames(text: string): { names: string[]; problem: string | null } {
  const names = [...new Set(text.split('\n').map(cleanName).filter(Boolean))];
  const wrong = names.find((n) => !nameOk(n));
  const problem =
    names.length === 0
      ? 'Nhập ít nhất một tên.'
      : wrong !== undefined
        ? [...wrong].length > MAX_NAME
          ? `Tên "${wrong}" dài quá ${MAX_NAME} ký tự.`
          : `Tên "${wrong}" chỉ được có chữ cái, chữ số, khoảng trắng, dấu nháy đơn và gạch nối.`
        : names.length > MAX_BATCH
          ? `Tối đa ${MAX_BATCH} tên mỗi lần chạy, đang có ${names.length}.`
          : null;
  return { names, problem };
}

/** The column of a CSV header that most likely holds the names: one of a pet's name, else one called name or tên, else the first with either in it, else the first column. */
export function nameColumn(header: string[]): number {
  const h = header.map((x) => x.normalize('NFC').trim().toLowerCase());
  const tests = [(x: string) => /pet|thú cưng/.test(x) && /name|tên/.test(x), (x: string) => x === 'name' || x === 'tên', (x: string) => /name|tên/.test(x)];
  for (const t of tests) {
    const i = h.findIndex(t);
    if (i >= 0) return i;
  }
  return 0;
}

/** The names of `column` in a CSV's rows under its header, as the name swap box takes them (parseNames: cleaned, blank and repeated ones dropped): the first MAX_BATCH
 * that nameOk takes, the values it refuses (`invalid`), and how many good names were left out past MAX_BATCH (`over`). */
export function csvNames(rows: string[][], column: number): { names: string[]; invalid: string[]; over: number } {
  const all = parseNames(rows.slice(1).map((r) => cleanName(r[column] ?? '')).join('\n')).names; // cleaned first: a line break in a cell is a space
  const ok = all.filter(nameOk);
  return { names: ok.slice(0, MAX_BATCH), invalid: all.filter((n) => !nameOk(n)), over: Math.max(0, ok.length - MAX_BATCH) };
}

/** The prompt of one name swap job: only the personalized name changes, to `name` (one nameOk takes), and with `breed` (one of DOG_BREEDS) the dog too. POST /api/jobs takes no other. */
export const nameSwapPrompt = (name: string, breed?: string): string =>
  `Replace only the personalized name in the image with the name "${name}", spelled exactly like that, letter for letter, with every accent mark. ` +
  'Write it in exactly the same font, size, color, outline, curve and position as the old name; if it is longer or shorter, keep it centered on the same spot and shrink it only as much as needed to fit the same space. ' +
  (breed ? `Also replace the dog with ${/^[AEIOU]/.test(breed) ? 'an' : 'a'} ${breed}, with the coat, colours and markings typical of the breed, in the same pose, at the same size and in the same position, facing the same way. ` : '') +
  'Keep everything else exactly unchanged: the artwork, every other text and number, the layout, the background, the product and its shape, the lighting and the style. Do not add any other text, logos or watermarks.';

/** One job of a batch app, as its params keep it: the view, breed, style, product, name or pose (one of POSES, or the member's own words) it made. */
export interface BatchItem {
  view?: string | null;
  breed?: string | null;
  style?: string | null;
  product?: string | null;
  name?: string | null;
  pose?: string | null;
  poseText?: string | null;
}

/**
 * What stays picked after a batch Run stopped once `done` of its `runs` were sent, so Run again sends only the rest: each key's items of the jobs not sent.
 * A name with some of its breeds sent is dropped too (picking it again would resend those), and its jobs not sent come back in `left` for the page to name.
 */
export function unsentPicks(runs: BatchItem[], done: number): Record<'view' | 'breed' | 'style' | 'product' | 'name' | 'pose' | 'poseText', string[]> & { left: BatchItem[] } {
  const started = new Set(runs.slice(0, done).map((r) => r.name).filter(Boolean));
  const rest = runs.slice(done);
  const kept = rest.filter((r) => !r.name || !started.has(r.name));
  const all = (k: keyof BatchItem) => [...new Set(kept.map((r) => r[k]).filter((v): v is string => !!v))];
  return { view: all('view'), breed: all('breed'), style: all('style'), product: all('product'), name: all('name'), pose: all('pose'), poseText: all('poseText'), left: rest.filter((r) => !kept.includes(r)) };
}

/** What one job of a batch app made, for its History card's title: the view's, style's, product's or pose's label (OWN_POSE for the member's own words), the name (with its breed)
 * or the breed; null for any other job. */
export const itemLabel = (p: BatchItem): string | null =>
  (p.view && VIEW_LABELS[p.view]) ||
  (p.style && PET_STYLES.find((s) => s.id === p.style)?.label) ||
  (p.product && MOCKUP_PRODUCTS.find((m) => m.id === p.product)?.label) ||
  (p.pose && poseOf(p.pose)?.label) ||
  (p.poseText && OWN_POSE) ||
  (p.name && [p.name, p.breed].filter(Boolean).join(' · ')) ||
  p.breed ||
  null;

/** The prompt of one job of an app that writes its own (breed swap, pet portrait, mockup pack, name swap, pose generator), which POST /api/jobs holds the job to; undefined for any other app.
 * `blank`: the mockup pack's job has the member's blank product photo. */
export function itemPrompt(feature: string, p: BatchItem, blank = false): string | undefined {
  if (feature === 'breed_swap') return breedSwapPrompt(p.breed!);
  if (feature === 'pet_portrait') return petPortraitPrompt(p.style!);
  if (feature === 'mockup_pack') return mockupPrompt(p.product!, blank);
  if (feature === 'name_swap') return nameSwapPrompt(p.name!, p.breed ?? undefined);
  if (feature === 'pose_generator') return posePrompt(poseOf(p.pose)?.words ?? p.poseText!);
  return undefined;
}
