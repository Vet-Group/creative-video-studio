// Try On's stock photos, as Fash's pickers offer them (studio-batch.min.js and the page's #tryon-backgrounds, read 2026-10-29). An Admin uploads
// the photos as samples: `try-on-stock-model-<n>.jpg` with its poses `try-on-stock-model-<n>-pose-<p>.jpg`, `try-on-stock-<category>.jpg` with its
// garments `try-on-stock-<category>-<n>.jpg`, and `try-on-bg-<value>.jpg`. A picker shows only what was uploaded.

/** Fash's garment categories, in its order. */
export const GARMENT_CATEGORIES = [
  { id: 'accessories', label: 'Phụ kiện' },
  { id: 'top', label: 'Áo' },
  { id: 'bottom', label: 'Quần' },
  { id: 'shoes', label: 'Giày' },
] as const;

/** Fash's named backgrounds, in its order; the names stay as on Fash, as the sample details show them. */
export const BACKGROUNDS = [
  ['seamless-white', 'Seamless White'], ['warm-sand', 'Warm Sand'], ['pastel', 'Pastel'], ['editorial-grey', 'Editorial Grey'], ['colored-gel', 'Colored Gel'],
  ['terracotta-wall', 'Terracotta Wall'], ['gallery', 'Gallery'], ['arched-corridor', 'Arched Corridor'], ['brutalist', 'Brutalist'], ['concrete-steps', 'Concrete Steps'],
  ['glass-facade', 'Glass Facade'], ['marble-hall', 'Marble Hall'], ['desert-modernism', 'Desert Modernism'], ['poolside-edge', 'Poolside Edge'], ['palm-garden', 'Palm Garden'],
  ['citrus-grove', 'Citrus Grove'], ['greenhouse', 'Greenhouse'], ['boardwalk', 'Boardwalk'], ['beach-midday', 'Beach Midday'], ['marina', 'Marina'],
  ['santorini', 'Santorini'], ['industrial-alley', 'Industrial Alley'], ['subway-platform', 'Subway Platform'], ['rooftop-city', 'Rooftop City'],
  ['london-townhouse', 'London Townhouse'], ['paris-street', 'Paris Street'], ['milan-arcade', 'Milan Arcade'], ['new-york', 'New York Streets'],
] as const;

const num = (name: string) => Number(/(\d+)\.jpg$/.exec(name)?.[1] ?? 0);
const ofPattern = (have: Set<string>, re: RegExp) => [...have].filter((n) => re.test(n)).sort((a, b) => num(a) - num(b));

/** The stock models (their first photo), in number order. */
export const stockModels = (have: Set<string>) => ofPattern(have, /^try-on-stock-model-\d+\.jpg$/);
/** A stock model's poses. */
export const posesOf = (have: Set<string>, model: string) => ofPattern(have, new RegExp(`^${model.replace(/\.jpg$/, '')}-pose-\\d+\\.jpg$`));
/** A category's garments. */
export const garmentsOf = (have: Set<string>, category: string) => ofPattern(have, new RegExp(`^try-on-stock-${category}-\\d+\\.jpg$`));
/** The uploaded backgrounds with their names. */
export const backgroundsIn = (have: Set<string>) => BACKGROUNDS.filter(([value]) => have.has(`try-on-bg-${value}.jpg`)).map(([value, label]) => ({ name: `try-on-bg-${value}.jpg`, label }));

/** Fash's Try On poses, in its order (studio-batch.min.js, read 2026-11-18): the value, the label and the words the prompt gives the model. A pose's preview,
 * by the model's gender, is the sample `try-on-pose-<woman|man>-<value>.jpg`; a pose without one is not offered. */
export const POSES = [
  { value: 'front', label: 'Mặt trước', words: 'standing straight and facing the camera, arms relaxed at the sides, full body' },
  { value: 'hand-on-hip', label: 'Tay chống hông', words: 'standing facing the camera with one hand on the hip and the weight on one leg, full body' },
  { value: 'three-quarter', label: 'Xoay 3/4', words: 'standing turned three-quarters to the side with the face towards the camera, full body' },
  { value: 'arms-crossed', label: 'Khoanh tay', words: 'facing the camera with the arms crossed, framed from the thighs up' },
  { value: 'side-walk', label: 'Bước ngang', words: 'walking across the frame in side view, mid-stride, full body' },
  { value: 'back-view', label: 'Quay lưng', words: 'standing with the back to the camera, full body' },
  { value: 'over-shoulder', label: 'Ngoái qua vai', words: 'standing turned away and looking back at the camera over the shoulder, full body' },
  { value: 'side-profile', label: 'Nghiêng một bên', words: 'standing in side profile, full body' },
  { value: 'hand-in-pocket', label: 'Tay đút túi', words: 'standing facing the camera with one hand in a pocket, full body' },
  { value: 'hand-in-hair', label: 'Tay vuốt tóc', words: 'standing with one hand touching the hair, full body' },
  { value: 'seated', label: 'Ngồi trên bục', words: 'sitting on a plain white block and facing the camera, full body' },
  { value: 'crouch', label: 'Ngồi xổm', words: 'crouching low and facing the camera with the forearms on the knees, full body' },
  { value: 'collar-touch', label: 'Chạm cổ áo', words: 'standing facing the camera with one hand touching the collar, full body' },
  { value: 'waist-up', label: 'Nửa người', words: 'facing the camera, framed from the thighs up' },
  { value: 'reclining', label: 'Nằm nghiêng', words: 'lying on the floor on one side, propped on one elbow, full body' },
  { value: 'beauty-close-up', label: 'Cận mặt', words: 'a close-up of the face and shoulders, facing the camera' },
  { value: 'profile-close-up', label: 'Cận mặt nghiêng', words: 'a close-up of the face turned to the side' },
  { value: 'power-stride', label: 'Sải bước', words: 'walking towards the camera with a confident stride, full body' },
  { value: 'back-glance-down', label: 'Quay lưng nhìn xuống', words: 'standing with the back to the camera, the head turned to the side and glancing down, full body' },
  { value: 'floor-sit', label: 'Ngồi bệt', words: 'sitting on the floor with the knees up and one arm resting on them, full body' },
  { value: 'side-sit-lean', label: 'Ngồi chống tay', words: 'sitting on the floor with the legs to one side, leaning on one arm, full body' },
  { value: 'kneel', label: 'Quỳ một gối', words: 'kneeling on one knee and facing the camera, full body' },
  { value: 'low-angle', label: 'Góc máy thấp', words: 'standing with the feet apart, seen from a low camera angle, full body' },
  { value: 'arm-overhead', label: 'Tay đặt trên đầu', words: 'one hand on the head and the other on the hip, framed from the thighs up' },
  { value: 'lean-forward', label: 'Cúi người tới trước', words: 'leaning forward with the hands on the knees and facing the camera, full body' },
  { value: 'head-down-attitude', label: 'Cúi đầu cá tính', words: 'hands in the pockets, the chin slightly down and the eyes on the camera, framed from the thighs up' },
  { value: 'walk-away-look-back', label: 'Bước đi ngoái lại', words: 'walking away from the camera and looking back over the shoulder, full body' },
  { value: 'perched-cross-leg', label: 'Ngồi vắt chân', words: 'perched on a plain block with the legs crossed, full body' },
  { value: 'plinth-lean', label: 'Tựa bục cao', words: 'leaning against a tall plain plinth with the ankles crossed, full body' },
] as const;
export const poseOf = (value: string | null | undefined) => POSES.find((p) => p.value === value);

/** Fash's model catalog (#tryon-model-catalog, read 2026-11-18): a portrait per model, the sample `try-on-portrait-<gender>-<name>.jpg`, with what its filters read. */
export const PORTRAITS = [
  { name: 'adut', gender: 'woman', age: 'young', ethnicity: 'black', body: 'slim' },
  { name: 'ayo', gender: 'woman', age: 'young', ethnicity: 'black', body: 'slim' },
  { name: 'isla', gender: 'woman', age: 'young', ethnicity: 'white', body: 'slim' },
  { name: 'mina', gender: 'woman', age: 'mature', ethnicity: 'asian', body: 'slim' },
  { name: 'noor', gender: 'woman', age: 'young', ethnicity: 'middle-eastern', body: 'slim' },
  { name: 'ottilie', gender: 'woman', age: 'adult', ethnicity: 'black white', body: 'slim' },
  { name: 'rin', gender: 'woman', age: 'young', ethnicity: 'asian', body: 'slim' },
  { name: 'saskia', gender: 'woman', age: 'young', ethnicity: 'white', body: 'slim' },
  { name: 'arnav', gender: 'man', age: 'young', ethnicity: 'south-asian', body: 'slim' },
  { name: 'elias', gender: 'man', age: 'young', ethnicity: 'white', body: 'slim' },
  { name: 'henrik', gender: 'man', age: 'mature', ethnicity: 'white', body: 'slim' },
  { name: 'idris', gender: 'man', age: 'adult', ethnicity: 'black', body: 'slim' },
  { name: 'kai', gender: 'man', age: 'young', ethnicity: 'asian latin', body: 'slim' },
  { name: 'malakai', gender: 'man', age: 'young', ethnicity: 'black', body: 'slim' },
  { name: 'rafi', gender: 'man', age: 'young', ethnicity: 'middle-eastern', body: 'slim' },
  { name: 'theo', gender: 'man', age: 'young', ethnicity: 'white', body: 'slim' },
  { name: 'aanya', gender: 'woman', age: 'young', ethnicity: 'south-asian', body: 'slim' },
  { name: 'amara', gender: 'woman', age: 'adult', ethnicity: 'black', body: 'average' },
  { name: 'camila', gender: 'woman', age: 'young', ethnicity: 'latin', body: 'slim' },
  { name: 'elena', gender: 'woman', age: 'young', ethnicity: 'white', body: 'slim' },
  { name: 'elsa', gender: 'woman', age: 'young', ethnicity: 'white', body: 'slim' },
  { name: 'freya', gender: 'woman', age: 'adult', ethnicity: 'white', body: 'average' },
  { name: 'grace', gender: 'woman', age: 'mature', ethnicity: 'black', body: 'average' },
  { name: 'hana', gender: 'woman', age: 'mature', ethnicity: 'asian', body: 'average' },
  { name: 'hannah', gender: 'woman', age: 'young', ethnicity: 'white', body: 'plus-size' },
  { name: 'imani', gender: 'woman', age: 'young', ethnicity: 'black', body: 'slim' },
  { name: 'ingrid', gender: 'woman', age: 'mature', ethnicity: 'white', body: 'slim' },
  { name: 'leila', gender: 'woman', age: 'young', ethnicity: 'middle-eastern', body: 'average' },
  { name: 'lucia', gender: 'woman', age: 'mature', ethnicity: 'latin', body: 'average' },
  { name: 'mei', gender: 'woman', age: 'adult', ethnicity: 'asian', body: 'slim' },
  { name: 'nadia', gender: 'woman', age: 'mature', ethnicity: 'middle-eastern', body: 'plus-size' },
  { name: 'priya', gender: 'woman', age: 'adult', ethnicity: 'south-asian', body: 'plus-size' },
  { name: 'sora', gender: 'woman', age: 'young', ethnicity: 'asian', body: 'slim' },
  { name: 'valeria', gender: 'woman', age: 'adult', ethnicity: 'latin', body: 'plus-size' },
  { name: 'yasmin', gender: 'woman', age: 'adult', ethnicity: 'middle-eastern', body: 'slim' },
  { name: 'zuri', gender: 'woman', age: 'young', ethnicity: 'black', body: 'plus-size' },
  { name: 'adrian', gender: 'man', age: 'young', ethnicity: 'white', body: 'slim' },
  { name: 'arjun', gender: 'man', age: 'young', ethnicity: 'south-asian', body: 'slim' },
  { name: 'diego', gender: 'man', age: 'adult', ethnicity: 'latin', body: 'slim' },
  { name: 'finn', gender: 'man', age: 'young', ethnicity: 'white', body: 'plus-size' },
  { name: 'hiroshi', gender: 'man', age: 'mature', ethnicity: 'asian', body: 'slim' },
  { name: 'jalen', gender: 'man', age: 'young', ethnicity: 'black', body: 'slim' },
  { name: 'jun', gender: 'man', age: 'young', ethnicity: 'asian', body: 'slim' },
  { name: 'karim', gender: 'man', age: 'adult', ethnicity: 'middle-eastern', body: 'plus-size' },
  { name: 'kenji', gender: 'man', age: 'adult', ethnicity: 'asian', body: 'average' },
  { name: 'kwame', gender: 'man', age: 'adult', ethnicity: 'black', body: 'average' },
  { name: 'luca', gender: 'man', age: 'adult', ethnicity: 'white', body: 'slim' },
  { name: 'lukas', gender: 'man', age: 'young', ethnicity: 'white', body: 'slim' },
  { name: 'malik', gender: 'man', age: 'young', ethnicity: 'black', body: 'plus-size' },
  { name: 'mateo', gender: 'man', age: 'young', ethnicity: 'latin', body: 'average' },
  { name: 'omar', gender: 'man', age: 'young', ethnicity: 'middle-eastern', body: 'average' },
  { name: 'rafael', gender: 'man', age: 'mature', ethnicity: 'latin', body: 'average' },
  { name: 'rohan', gender: 'man', age: 'adult', ethnicity: 'south-asian', body: 'plus-size' },
  { name: 'samuel', gender: 'man', age: 'mature', ethnicity: 'black', body: 'slim' },
  { name: 'tariq', gender: 'man', age: 'mature', ethnicity: 'middle-eastern', body: 'average' },
  { name: 'thomas', gender: 'man', age: 'mature', ethnicity: 'white', body: 'average' },
] as const;
type Portrait = (typeof PORTRAITS)[number];
export const portraitName = (p: Portrait) => `try-on-portrait-${p.gender}-${p.name}.jpg`;
/** The catalog's filters and their choices, as Fash's Gender, Age, Ethnicity and Body; a model may carry two ethnicities. */
export const PORTRAIT_FILTERS = [
  { key: 'gender', label: 'Giới tính', all: 'Mọi giới tính', options: [['woman', 'Nữ'], ['man', 'Nam']] },
  { key: 'age', label: 'Độ tuổi', all: 'Mọi độ tuổi', options: [['young', 'Trẻ'], ['adult', 'Trưởng thành'], ['mature', 'Trung niên']] },
  { key: 'ethnicity', label: 'Sắc tộc', all: 'Mọi sắc tộc', options: [['asian', 'Châu Á'], ['south-asian', 'Nam Á'], ['middle-eastern', 'Trung Đông'], ['black', 'Da màu'], ['white', 'Da trắng'], ['latin', 'Mỹ Latinh']] },
  { key: 'body', label: 'Dáng người', all: 'Mọi dáng người', options: [['slim', 'Mảnh'], ['average', 'Vừa'], ['plus-size', 'Đầy đặn']] },
] as const;
export type PortraitFilter = Partial<Record<(typeof PORTRAIT_FILTERS)[number]['key'], string>>;
/** The uploaded portraits that pass every chosen filter, in Fash's order. */
export const portraitsIn = (have: Set<string>, f: PortraitFilter) =>
  PORTRAITS.filter((p) => have.has(portraitName(p)) && PORTRAIT_FILTERS.every(({ key }) => !f[key] || p[key].split(' ').includes(f[key]!)));
/** A portrait sample's gender, which picks the pose previews; null for any other photo. */
export const portraitGender = (sample: string): 'woman' | 'man' | null => (/^try-on-portrait-(woman|man)-/.exec(sample)?.[1] as 'woman' | 'man' | undefined) ?? null;
