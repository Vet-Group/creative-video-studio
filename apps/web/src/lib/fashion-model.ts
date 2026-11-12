// The traits behind the AI model generator and the one fixed English prompt they make. The page sends the prompt and the traits; POST /api/jobs builds the prompt
// again from the traits and refuses a mismatch, so what a saved model records is what was asked for.

/** `label` is what the member reads, `prompt` the English fragment that goes into the prompt. */
export type FashionOption = { id: string; label: string; prompt: string };
/** A niche also names the traits the page pre-selects when it is chosen (the member may still change them). */
export type FashionNiche = FashionOption & { defaults?: Partial<Omit<FashionTraits, 'extra' | 'niche'>> };

export type FashionTraits = {
  gender: string; age: string; ethnicity: string; skinTone: string; body: string; hair: string; framing: string; background: string; expression: string; niche: string;
  /** Free text of at most MAX_EXTRA characters. */
  extra: string;
};
export const MAX_EXTRA = 300;

export const FASHION_OPTIONS = {
  gender: [
    { id: 'female', label: 'Nữ', prompt: 'woman' },
    { id: 'male', label: 'Nam', prompt: 'man' },
  ],
  age: [
    { id: 'young', label: '18-25 tuổi', prompt: 'aged 18 to 25' },
    { id: 'adult', label: '26-40 tuổi', prompt: 'aged 26 to 40' },
    { id: 'mature', label: 'Trên 40 tuổi', prompt: 'aged over 40' },
  ],
  ethnicity: [
    { id: 'vietnamese_sea', label: 'Việt Nam / Đông Nam Á', prompt: 'of Vietnamese or Southeast Asian descent' },
    { id: 'east_asian', label: 'Đông Á', prompt: 'of East Asian descent' },
    { id: 'south_asian', label: 'Nam Á', prompt: 'of South Asian descent' },
    { id: 'black', label: 'Da đen / gốc Phi', prompt: 'of Black or African descent' },
    { id: 'white', label: 'Da trắng', prompt: 'of white European descent' },
    { id: 'latin', label: 'Latin', prompt: 'of Latin American descent' },
    { id: 'middle_eastern', label: 'Trung Đông', prompt: 'of Middle Eastern descent' },
    { id: 'native_american', label: 'Người bản địa Mỹ', prompt: 'of Native American descent' },
    { id: 'pacific_islander', label: 'Đảo Thái Bình Dương', prompt: 'of Pacific Islander descent' },
    { id: 'mixed', label: 'Lai nhiều dòng máu', prompt: 'of mixed heritage' },
  ],
  skinTone: [
    { id: 'auto', label: 'Tự động', prompt: 'with a natural skin tone for the chosen heritage' },
    { id: 'light', label: 'Sáng', prompt: 'with a light skin tone' },
    { id: 'medium', label: 'Trung bình', prompt: 'with a medium skin tone' },
    { id: 'deep', label: 'Sâu', prompt: 'with a deep skin tone' },
  ],
  body: [
    { id: 'slim', label: 'Mảnh', prompt: 'a slim build' },
    { id: 'average', label: 'Vừa', prompt: 'an average build' },
    { id: 'plus', label: 'Plus-size', prompt: 'a plus-size build: keep true plus-size proportions, do not slim or reshape the body' },
  ],
  hair: [
    { id: 'short', label: 'Tóc ngắn', prompt: 'short hair' },
    { id: 'medium', label: 'Tóc vừa', prompt: 'medium-length hair' },
    { id: 'long', label: 'Tóc dài', prompt: 'long hair' },
  ],
  framing: [
    { id: 'half', label: 'Nửa người', prompt: 'half-body portrait, framed from the waist up' },
    { id: 'full', label: 'Toàn thân', prompt: 'full-body shot from head to toe, wearing plain light-blue jeans and plain white sneakers' },
  ],
  background: [
    { id: 'white', label: 'Trắng', prompt: 'white' },
    { id: 'light_gray', label: 'Xám nhạt', prompt: 'light gray' },
    { id: 'beige', label: 'Be', prompt: 'beige' },
  ],
  expression: [
    { id: 'natural', label: 'Tự nhiên', prompt: 'a natural, relaxed expression' },
    { id: 'smile', label: 'Mỉm cười', prompt: 'a warm smile' },
    { id: 'serious', label: 'Nghiêm, kiểu tạp chí', prompt: 'a serious editorial expression' },
  ],
  niche: [
    { id: 'none', label: 'Không chọn', prompt: '' },
    { id: 'native_contemporary', label: 'Người bản địa (hiện đại)', prompt: 'long dark hair worn loose or in simple braids, small turquoise or beaded stud earrings, calm dignified contemporary everyday look', defaults: { ethnicity: 'native_american' } },
    { id: 'black_natural_hair', label: 'Gốc Phi, tóc tự nhiên', prompt: 'natural hair as a defined afro, twist-out, locs or neat box braids, small gold hoops, confident warm smile, lighting that renders the skin tone accurately', defaults: { ethnicity: 'black' } },
    { id: 'melanin', label: 'Melanin', prompt: 'luminous evenly lit deep skin, minimal makeup, short natural coils or a sleek bun, simple gold jewelry, radiant self-assured expression', defaults: { ethnicity: 'black', skinTone: 'deep' } },
    { id: 'heritage', label: 'Di sản / Black History', prompt: 'salt-and-pepper natural hair or gray locs, a groomed beard or a plain solid-color headwrap, proud thoughtful expression, timeless portrait light', defaults: { ethnicity: 'black', age: 'mature' } },
    { id: 'faith', label: 'Đức tin / Phúc âm', prompt: 'neat conservative grooming, soft natural makeup, an optional small plain cross pendant, gentle hopeful smile, bright airy light' },
    { id: 'americana', label: 'Yêu nước / Americana', prompt: 'friendly open face, classic haircut or relaxed waves, everyday heartland casual vibe' },
    { id: 'veteran', label: 'Cựu chiến binh', prompt: 'short neat haircut, trimmed gray beard or clean-shaven, kind weathered face, steady proud expression', defaults: { age: 'mature' } },
    { id: 'game_day', label: 'Fan thể thao', prompt: 'sporty ponytail or short fade, natural grin, casual game-day energy' },
    { id: 'southern', label: 'Miền Nam / đồng quê', prompt: 'sun-kissed skin, loose waves or a side braid, easy friendly smile' },
  ] as FashionNiche[],
} satisfies Record<Exclude<keyof FashionTraits, 'extra'>, FashionOption[]>;

type OptionKey = keyof typeof FASHION_OPTIONS;
const OPTION_KEYS = Object.keys(FASHION_OPTIONS) as OptionKey[];

export const DEFAULT_FASHION_TRAITS: FashionTraits = {
  gender: 'female', age: 'adult', ethnicity: 'vietnamese_sea', skinTone: 'auto', body: 'average', hair: 'medium', framing: 'half', background: 'white', expression: 'natural', niche: 'none', extra: '',
};

/** What the prompt always says it must not draw. */
export const FASHION_AVOID = 'Avoid: any text, logos, watermarks, team marks or flags; uniforms, insignia or medals; ceremonial regalia, headdresses or feathers; face paint; props; exaggerated features.';

const optionOf = (key: OptionKey, id: string): FashionOption => (FASHION_OPTIONS[key] as FashionOption[]).find((o) => o.id === id)!;
/** The free text as the prompt carries it: one line, trimmed. */
const cleanExtra = (extra: string) => extra.replace(/\s+/g, ' ').trim();

/** The traits a niche pre-selects once it is chosen; the member may still change them. */
export function withNiche(traits: FashionTraits, niche: string): FashionTraits {
  return { ...traits, ...(FASHION_OPTIONS.niche.find((n) => n.id === niche)?.defaults ?? {}), niche };
}

/** The one English prompt for these traits (valid ones: see parseFashionTraits). */
export function fashionModelPrompt(t: FashionTraits): string {
  const p = (key: OptionKey) => optionOf(key, t[key]).prompt;
  const extra = cleanExtra(t.extra);
  return [
    `Photorealistic studio photo of a fictional adult (clearly 18+) fashion model: a ${p('gender')} ${p('age')} ${p('ethnicity')}, ${p('skinTone')}, with ${p('body')}, ${p('hair')} and ${p('expression')}.`,
    `${p('framing')[0]!.toUpperCase()}${p('framing').slice(1)}.`,
    ...(p('niche') ? [`Styling: ${p('niche')}.`] : []),
    `Wearing a plain white crew-neck t-shirt with no print. Straight-on eye-level camera, soft even studio light, sharp focus, plain seamless ${p('background')} background, 3:4 portrait.`,
    ...(extra ? [`Additional details: ${extra}`] : []),
    FASHION_AVOID,
  ].join(' ');
}

/** The traits from a client's value, with the defaults for any missing one; null when it is not an object, a value is not an option's id, or the extra text is too long or not plain text. */
export function parseFashionTraits(value: unknown): FashionTraits | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const given = value as Record<string, unknown>;
  const out: FashionTraits = { ...DEFAULT_FASHION_TRAITS };
  for (const key of OPTION_KEYS) {
    const id = given[key];
    if (id === undefined) continue;
    if (typeof id !== 'string' || !FASHION_OPTIONS[key].some((o) => o.id === id)) return null;
    out[key] = id;
  }
  if (given.extra !== undefined) {
    if (typeof given.extra !== 'string' || given.extra.length > MAX_EXTRA || /\p{Cc}/u.test(cleanExtra(given.extra))) return null;
    out.extra = cleanExtra(given.extra);
  }
  return out;
}

/** The name a save starts with: gender, age and heritage in the member's words, within the 60 characters a name may have. */
export function fashionModelName(t: FashionTraits): string {
  return (['gender', 'age', 'ethnicity'] as const).map((k) => optionOf(k, t[k]).label).join(' · ').slice(0, 60);
}
