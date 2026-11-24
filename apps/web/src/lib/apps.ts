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
   * `params.pose` or `params.poseText` and the prompt posePrompt makes, or, for a pose photo, `params.poseRef` and the prompt poseRefPrompt makes. */
  poses?: boolean;
  /** Shows the colour swatches (RECOLOR_COLORS) and a box for the member's own #RRGGBB colours, up to MAX_PICTURES in all (product recolor): Run sends one job per colour, each
   * with its `params.color` (the hex) and the prompt recolorPrompt makes. */
  colors?: boolean;
  /** Shows the listing shots (LISTING_SHOTS) to pick, by group (the listing set): Run sends one job per shot, each with its `params.shot` and the prompt listingShotPrompt makes. */
  shots?: boolean;
  /** Its first slot takes up to MAX_BATCH photos: Run sends one job per photo, each with the same settings, the other slots and one `params.batch`. On the pose generator it takes up
   * to MAX_MODELS model photos, and Run sends one job per photo and pose, photo by photo. */
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
    // Ours too (owner-approved 2026-11-20): one model photo (up to MAX_MODELS since 2026-11-24, a catalogue), the same person in other poses, one job per pose; a fashion app beside the AI model generator, whose models it poses.
    slug: 'pose-generator',
    added: '2026-11-20',
    feature: 'pose_generator',
    name: 'Tạo tư thế người mẫu',
    description: 'Từ một hoặc nhiều ảnh người mẫu (tối đa 6), tạo cùng người mẫu ấy trong tối đa 4 tư thế, mỗi ảnh và mỗi tư thế một ảnh riêng, giữ nguyên người và trang phục.',
    keywords: 'pose, pose generator, model poses',
    category: 'fashion',
    slots: [{ label: 'Người mẫu', inputLabel: 'Ảnh người mẫu', empty: 'Thêm 1 hoặc nhiều ảnh người mẫu (rõ mặt, thấy người)', aiModels: true }],
    poses: true,
    bulk: true,
  },
  {
    // Ours too (owner-approved 2026-11-23): one product photo, one picture per colour of the blank, the print and the rest of the photo kept; mainly print-on-demand apparel.
    slug: 'product-recolor',
    added: '2026-11-24',
    feature: 'product_recolor',
    name: 'Đổi màu sản phẩm',
    description: 'Từ một ảnh sản phẩm (áo, cốc, túi…), tạo một ảnh cho mỗi màu đã chọn, giữ nguyên hình in, chữ, nếp vải, ánh sáng và bối cảnh.',
    keywords: 'recolor, color variants, colour',
    category: 'photo',
    slots: [{ label: 'Sản phẩm', inputLabel: 'Ảnh sản phẩm', empty: 'Thêm 1 ảnh sản phẩm: áo trơn hoặc đã in, cốc, túi…' }],
    colors: true,
  },
  {
    // Ours too (owner-approved 2026-11-23): one product photo, a set of Etsy, Amazon and Shopify listing pictures, one per shot picked, the product kept exactly.
    slug: 'listing-set',
    added: '2026-11-24',
    feature: 'listing_set',
    name: 'Bộ ảnh listing',
    description: 'Từ một ảnh sản phẩm, tạo bộ ảnh đăng bán cho Etsy, Amazon, Shopify: ảnh chính nền trắng, lifestyle, cận cảnh, theo mùa…, sản phẩm giữ y nguyên.',
    keywords: 'listing photos, listing images, Etsy, Amazon, Shopify, lifestyle',
    category: 'photo',
    slots: [{ label: 'Sản phẩm', inputLabel: 'Ảnh sản phẩm', empty: 'Thêm 1 ảnh rõ nét của sản phẩm' }],
    shots: true,
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
  /** How many poses are picked, the member's own words and each pose photo counting as one, on an app with `poses`. */
  poses?: number;
  /** How many of those are pose photos, whose jobs send the person's photo and the pose photo, on an app with `poses`. */
  poseRefs?: number;
  /** How many colours are picked, on an app with `colors`. */
  colors?: number;
  /** How many shots are picked, on an app with `shots`. */
  shots?: number;
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
  if (app.colors && !d.colors) return 'Chọn ít nhất một màu.';
  if (app.shots && !d.shots) return 'Chọn ít nhất một cảnh.';
  const pictures = app.colors ? d.colors! : app.shots ? d.shots! : 0;
  if (pictures > MAX_PICTURES) return `Tối đa ${MAX_PICTURES} ảnh mỗi lần chạy, đang là ${pictures}: bỏ bớt ${app.colors ? 'màu' : 'cảnh'}.`;
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
  const count = jobImages(app, d.images) + ((d.poseRefs ?? 0) > 0 ? 1 : 0);
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

export const slotMax = (app: AppConfig, i: number, maxImages: number): number => (app.bulk && i === 0 ? (app.poses ? MAX_MODELS : MAX_BATCH) : app.slots[i]?.many ? Math.max(1, maxImages - (app.slots.length - 1)) : 1);

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
export const BATCH_FEATURES = ['multi_angle', 'breed_swap', 'pet_portrait', 'mockup_pack', 'name_swap', 'pose_generator', 'background_changer', 'image_upscale', 'background_remover', 'product_recolor', 'listing_set'];
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
/** The most model photos one Run of the pose generator takes: 6 × MAX_POSES = 24 ≤ MAX_BATCH. */
export const MAX_MODELS = 6;
/** The longest own words for a pose, in characters. */
export const MAX_POSE_TEXT = 200;
/** What the pose generator calls a job of the member's own words, on its box and on the job's History card. */
export const OWN_POSE = 'Tư thế tự tả';
/** What the pose generator calls its box of pose photos, and what its History card calls a job of one. */
export const POSE_PHOTOS = 'Ảnh tư thế mẫu';
export const REF_POSE = 'Theo ảnh mẫu';

/** The backgrounds of the pose generator: the value a job keeps as `params.background`, the page's label and the scene the prompt puts the person in (none: the photo's own). The lifestyle scene is
 * one fixed description, so every pose of a Run shares the same background. */
export const POSE_BACKGROUNDS = [
  { value: 'keep', label: 'Giữ nền gốc', scene: null },
  { value: 'white', label: 'Studio trắng', scene: 'a seamless pure white (#FFFFFF) studio backdrop with soft, even lighting and a soft shadow under the feet' },
  { value: 'lifestyle', label: 'Lifestyle', scene: 'a bright minimal interior with a plain warm-white wall, a light wood floor and soft window daylight' },
] as const;

/** The prompt of one pose generator job: the person of the photo, unchanged, in the pose `words` say (a pose's of POSES, or the member's own), on the photo's own background or the `background`'s scene.
 * POST /api/jobs takes no other. */
export const posePrompt = (words: string, background?: string | null): string => {
  const scene = POSE_BACKGROUNDS.find((b) => b.value === background)?.scene;
  return (
    "Keep the person's face, identity, hair, skin, body shape and outfit" +
    (scene ? ' ' : ", and the photo's lighting and background, ") +
    `exactly unchanged, and show the same person in this pose and framing: ${words}. ` +
    (scene ? `Replace the background with ${scene}. ` : '') +
    'Photorealistic, with the same camera quality as the photo. Do not add any text, logos or watermarks.'
  );
};

/** The prompt of one pose generator job of a pose photo: the person of the first image, unchanged, in the pose, body angle and framing of the second image, which is used for the pose only,
 * on the first photo's own background or the `background`'s scene. POST /api/jobs takes no other. */
export const poseRefPrompt = (background?: string | null): string => {
  const scene = POSE_BACKGROUNDS.find((b) => b.value === background)?.scene;
  return (
    "Keep the person in the first image: the face, identity, hair, skin, body shape and outfit" +
    (scene ? ' ' : ", and the first image's lighting and background, ") +
    'exactly unchanged, and show the same person in the pose, body angle and framing of the person in the second image. ' +
    "Use the second image only for the pose: do not copy its person's face, identity, hair, clothes or background. " +
    (scene ? `Replace the background with ${scene}. ` : '') +
    'Photorealistic, with the same camera quality as the first image. Do not add any text, logos or watermarks.'
  );
};

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

/** The most pictures one Run of product recolor (its colours) or the listing set (its shots) makes; POST /api/jobs holds each such Run to it. */
export const MAX_PICTURES = 15;

/** The blank colours product recolor offers, the common print-on-demand ones: the page's label, the hex a job keeps as `params.color` and the English name its prompt takes. */
export const RECOLOR_COLORS: { label: string; hex: string; name: string }[] = [
  { label: 'Đen', hex: '#111111', name: 'black' },
  { label: 'Trắng', hex: '#FFFFFF', name: 'white' },
  { label: 'Navy', hex: '#1F2A44', name: 'navy blue' },
  { label: 'Xám heather', hex: '#9EA3A8', name: 'heather grey' },
  { label: 'Đỏ', hex: '#C8102E', name: 'red' },
  { label: 'Xanh royal', hex: '#1D4F91', name: 'royal blue' },
  { label: 'Xanh lá đậm', hex: '#154734', name: 'forest green' },
  { label: 'Đỏ đô', hex: '#5C1F2B', name: 'maroon' },
  { label: 'Be cát', hex: '#D8C3A5', name: 'sand beige' },
  { label: 'Hồng nhạt', hex: '#F4C2C2', name: 'light pink' },
  { label: 'Xanh nhạt', hex: '#A7C6ED', name: 'light blue' },
  { label: 'Xanh quân đội', hex: '#4B5320', name: 'military green' },
];

/** Whether `s` is a colour as a product recolor job keeps it: #RRGGBB in capitals. */
export const isHexColor = (s: string): boolean => /^#[0-9A-F]{6}$/.test(s);

/** A colour the member typed (RRGGBB, with or without #, any case) as a job keeps it, else null. */
export function parseHexColor(text: string): string | null {
  const hex = `#${text.trim().replace(/^#/, '').toUpperCase()}`;
  return isHexColor(hex) ? hex : null;
}

/** What the page and a History card call a colour: its swatch's name, else "Mã #RRGGBB" for the member's own. */
export const colorLabel = (hex: string): string => RECOLOR_COLORS.find((c) => c.hex === hex)?.label ?? `Mã ${hex}`;

/** The prompt of one product recolor job: only the base colour of the product's own material changes, to `hex` (a swatch's, by its name too, or the member's own), and the
 * print and the rest of the photo stay as they are. POST /api/jobs takes no other. */
export function recolorPrompt(hex: string): string {
  const swatch = RECOLOR_COLORS.find((c) => c.hex === hex);
  return (
    `Recolor only the product's own material (the fabric, ceramic, canvas or other material it is made of) to ${swatch ? `${swatch.name} (hex ${hex})` : `the exact color with hex code ${hex}`}: ` +
    'an even, realistic color, as the same product made in that color would look in this photo. ' +
    'Do not recolor the printed design. Keep every print, graphic, text, logo and label exactly as it is: the same colors, spelling, size and position, with crisp edges, ' +
    'not tinted, darkened, faded or blended into the new color, so it stays as clearly legible as in the original photo; on a dark new color the white and light parts of the print stay bright. ' +
    "Keep everything else pixel-faithful: the product's shape, folds, wrinkles, seams, stitching and fabric texture, its highlights and shadows (shading the new color the same way), " +
    'the lighting, the background, any person or props, and the framing and crop. Do not add any text, logos or watermarks.'
  );
}

/** The shots of the listing set, in the page's two groups: the id a job keeps as `params.shot`, the page's label and the English scene its prompt takes. */
export const LISTING_SHOTS: { id: string; label: string; group: 'basic' | 'seasonal'; scene: string }[] = [
  { id: 'white', label: 'Nền trắng', group: 'basic', scene: 'an Amazon main image, with the product alone, centered, on a pure white (#FFFFFF) background, filling about 85% of the frame, with no props, no text and no other objects' },
  { id: 'lifestyle', label: 'Lifestyle trong nhà', group: 'basic', scene: 'a lifestyle shot in a bright, tasteful home interior where the product is naturally used, placed naturally on a surface in soft daylight, the background softly out of focus' },
  { id: 'detail', label: 'Cận cảnh chi tiết', group: 'basic', scene: "a close-up detail shot of the product's print, material and finish, filling the frame, showing the texture and print quality up close" },
  { id: 'flat-lay', label: 'Flat lay', group: 'basic', scene: 'a flat lay photographed from directly above on a clean neutral surface, with a few small, tasteful props around the product that do not cover it' },
  { id: 'in-hand', label: 'Cầm trên tay', group: 'basic', scene: "the product held in a person's hands, only the hands and wrists in view, so its real size is clear, against a softly blurred background" },
  { id: 'gift', label: 'Gói quà', group: 'basic', scene: 'the product presented as a gift, beside an open gift box with tissue paper and a ribbon on a table, the product fully visible' },
  { id: 'outdoor', label: 'Ngoài trời', group: 'basic', scene: 'an outdoor shot in natural daylight in a fitting setting such as a garden, park or patio, the background softly out of focus' },
  { id: 'in-use', label: 'Trên người mẫu / đang dùng', group: 'basic', scene: 'the product worn or used naturally by a person in a realistic everyday moment, clearly visible and in focus' },
  { id: 'studio-color', label: 'Nền màu studio tối giản', group: 'basic', scene: 'a minimal studio shot on a seamless backdrop of one soft, muted solid color that suits the product, with soft even light, a soft shadow and no props' },
  { id: 'unboxing', label: 'Mở hộp', group: 'basic', scene: 'an unboxing moment: the product being lifted out of an open shipping box with tissue paper, on a table, seen from slightly above' },
  { id: 'christmas', label: 'Giáng sinh', group: 'seasonal', scene: 'a cozy Christmas setting with a decorated tree, warm string lights and a few wrapped presents around the product, nothing covering it' },
  { id: 'autumn', label: 'Halloween / mùa thu', group: 'seasonal', scene: 'a cozy autumn and Halloween setting with pumpkins, fallen leaves and warm light around the product' },
  { id: 'valentine', label: 'Valentine', group: 'seasonal', scene: "a romantic Valentine's Day setting in soft pink and red tones, with a few roses and small hearts around the product" },
  { id: 'summer', label: 'Mùa hè / bãi biển', group: 'seasonal', scene: 'a bright summer setting on a sunny beach, with sand and blue water softly out of focus behind the product' },
  { id: 'parents-day', label: 'Ngày của Mẹ / Ngày của Cha', group: 'seasonal', scene: "a warm Mother's Day or Father's Day gift setting at home, with flowers, a blank greeting card and simple gift wrap beside the product" },
];

/** The prompt of one listing set job: the product of the photo, reproduced exactly, in the scene of `shot` (an id of LISTING_SHOTS). POST /api/jobs takes no other. */
export const listingShotPrompt = (shot: string): string =>
  `Make a professional e-commerce listing photo of the product in [Image1]: ${LISTING_SHOTS.find((s) => s.id === shot)!.scene}. ` +
  'Reproduce the product exactly as it is in [Image1]: the same shape, proportions, colors, material, print, text and spelling, logo and every detail, not redrawn, restyled, recolored, mirrored or simplified. ' +
  'Show a single one of this product, in sharp focus, photorealistic, with natural light and shadows. Do not add any other text, logos, watermarks, price tags or badges.';

/** One job of a batch app, as its params keep it: the view, breed, style, product, name, pose (one of POSES, or the member's own words), colour or shot it made. */
export interface BatchItem {
  view?: string | null;
  breed?: string | null;
  style?: string | null;
  product?: string | null;
  name?: string | null;
  pose?: string | null;
  poseText?: string | null;
  /** The pose photo (an asset id) a job copied the pose of. */
  poseRef?: string | null;
  background?: string | null;
  color?: string | null;
  shot?: string | null;
}

/**
 * What stays picked after a batch Run stopped once `done` of its `runs` were sent, so Run again sends only the rest: each key's items of the jobs not sent.
 * A name with some of its breeds sent is dropped too (picking it again would resend those), and its jobs not sent come back in `left` for the page to name.
 */
export function unsentPicks(runs: BatchItem[], done: number): Record<'view' | 'breed' | 'style' | 'product' | 'name' | 'pose' | 'poseText' | 'poseRef' | 'color' | 'shot', string[]> & { left: BatchItem[] } {
  const started = new Set(runs.slice(0, done).map((r) => r.name).filter(Boolean));
  const rest = runs.slice(done);
  const kept = rest.filter((r) => !r.name || !started.has(r.name));
  const all = (k: keyof BatchItem) => [...new Set(kept.map((r) => r[k]).filter((v): v is string => !!v))];
  return { view: all('view'), breed: all('breed'), style: all('style'), product: all('product'), name: all('name'), pose: all('pose'), poseText: all('poseText'), poseRef: all('poseRef'), color: all('color'), shot: all('shot'), left: rest.filter((r) => !kept.includes(r)) };
}

/** What one job of a batch app made, for its History card's title: the view's, style's, product's, pose's or shot's label (OWN_POSE for the member's own words, REF_POSE for a pose photo),
 * the colour's (colorLabel), the name (with its breed) or the breed; null for any other job. */
export const itemLabel = (p: BatchItem): string | null =>
  (p.view && VIEW_LABELS[p.view]) ||
  (p.style && PET_STYLES.find((s) => s.id === p.style)?.label) ||
  (p.product && MOCKUP_PRODUCTS.find((m) => m.id === p.product)?.label) ||
  (p.pose && poseOf(p.pose)?.label) ||
  (p.poseText && OWN_POSE) ||
  (p.poseRef && REF_POSE) ||
  (p.color && isHexColor(p.color) && colorLabel(p.color)) ||
  (p.shot && LISTING_SHOTS.find((s) => s.id === p.shot)?.label) ||
  (p.name && [p.name, p.breed].filter(Boolean).join(' · ')) ||
  p.breed ||
  null;

/** The prompt of one job of an app that writes its own (breed swap, pet portrait, mockup pack, name swap, pose generator, product recolor, listing set), which POST /api/jobs holds the job to; undefined for any other app.
 * `blank`: the mockup pack's job has the member's blank product photo. */
export function itemPrompt(feature: string, p: BatchItem, blank = false): string | undefined {
  if (feature === 'breed_swap') return breedSwapPrompt(p.breed!);
  if (feature === 'pet_portrait') return petPortraitPrompt(p.style!);
  if (feature === 'mockup_pack') return mockupPrompt(p.product!, blank);
  if (feature === 'name_swap') return nameSwapPrompt(p.name!, p.breed ?? undefined);
  if (feature === 'pose_generator') return p.poseRef ? poseRefPrompt(p.background) : posePrompt(poseOf(p.pose)?.words ?? p.poseText!, p.background);
  if (feature === 'product_recolor') return recolorPrompt(p.color!);
  if (feature === 'listing_set') return listingShotPrompt(p.shot!);
  return undefined;
}
