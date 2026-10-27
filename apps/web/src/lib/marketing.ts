/** A choice on the Marketing Studio page: a Vietnamese name and one-line description for the member, and an English scene phrase for the model. */
export type MarketingChoice = { id: string; name: string; desc: string; phrase: string };

/** How the clip opens: the reference site's six hooks (owner, 2026-10-26: match it), each with its sample loop marketing-hook-<id>.mp4. */
export const HOOKS: MarketingChoice[] = [
  { id: 'blizzard', name: 'Bão tuyết', desc: 'Bão tuyết bất ngờ quét qua khung hình', phrase: 'The clip opens as a sudden snowstorm sweeps across the scene, then clears to reveal the creator in the outfit.' },
  { id: 'flip-fail', name: 'Lộn nhào hụt', desc: 'Một cú lộn nhào hụt, rồi vào thẳng phần khoe đồ', phrase: 'The clip opens with the creator trying a playful flip that fails, then laughing and showing the outfit.' },
  { id: 'dramatic-arrival', name: 'Xuất hiện ấn tượng', desc: 'Sản phẩm lao vào cảnh và đáp xuống nguyên vẹn', phrase: 'The product crashes dramatically into the scene and lands intact in front of the creator.' },
  { id: 'product-catch', name: 'Bắt lấy sản phẩm', desc: 'Bắt lấy sản phẩm trong một khoảnh khắc đầy năng lượng', phrase: 'The creator catches the product thrown into frame with an energetic, surprised reaction.' },
  { id: 'product-drop', name: 'Sản phẩm rơi xuống', desc: 'Sản phẩm rơi từ trên xuống khung hình', phrase: 'The product drops into frame from above and the creator picks it up to show it.' },
  { id: 'strange-mic', name: 'Micro kỳ lạ', desc: 'Một chiếc micro kỳ lạ bật lên trước mặt', phrase: 'An oddly shaped microphone pops up in front of the creator, who starts talking about the product.' },
];

/** Where the clip is set: the reference site's eleven locations, each with its sample loop marketing-location-<id>.mp4. */
export const LOCATIONS: MarketingChoice[] = [
  { id: 'airplane-wing', name: 'Cánh máy bay', desc: 'Ngồi trên cánh máy bay, cao trên những tầng mây', phrase: 'a seat on an airplane wing high above the clouds' },
  { id: 'bathroom', name: 'Phòng tắm', desc: 'Phòng tắm hiện đại, sạch sẽ và tối giản', phrase: 'a clean, minimal modern bathroom' },
  { id: 'bedroom', name: 'Phòng ngủ', desc: 'Phòng ngủ ấm cúng, ánh sáng tự nhiên dịu nhẹ', phrase: 'a cozy bedroom with soft natural light from a window' },
  { id: 'car-roof', name: 'Cửa sổ trời ô tô', desc: 'Nhô lên qua cửa sổ trời, nhìn lên bầu trời', phrase: 'an open car sunroof, looking up at the sky' },
  { id: 'gym', name: 'Phòng tập', desc: 'Phòng tập với dụng cụ phía sau', phrase: 'a fitness studio with equipment in the background' },
  { id: 'in-car', name: 'Trong xe', desc: 'Trong xe, thấy bảng điều khiển và kính lái phía sau', phrase: 'the inside of a car, with the dashboard and windshield behind' },
  { id: 'kitchen', name: 'Nhà bếp', desc: 'Nhà bếp hiện đại với ánh sáng ấm', phrase: 'a modern kitchen in warm light' },
  { id: 'office', name: 'Văn phòng', desc: 'Góc làm việc gọn gàng, chuyên nghiệp', phrase: 'a tidy, professional desk workspace' },
  { id: 'outdoor', name: 'Ngoài trời', desc: 'Không gian ngoài trời xanh mát, ánh sáng ban ngày', phrase: 'a green open-air space in daylight' },
  { id: 'rooftop', name: 'Sân thượng', desc: 'Sân thượng giữa phố, đường chân trời thành phố phía sau', phrase: 'an urban rooftop with the city skyline behind' },
  { id: 'street', name: 'Đường phố', desc: 'Đường phố nhộn nhịp ban ngày', phrase: 'a lively city street in the daytime' },
];

/** How the clip is framed, from the chosen ratio; the try-on instruction used to say "vertical" whatever the ratio. */
const FRAMES: Record<string, string> = { '9:16': 'vertical 9:16 frame', '16:9': 'horizontal 16:9 frame', '1:1': 'square 1:1 frame' };

/** The fixed try-on instruction: who and what must stay true to the photos, and the shots a try-on clip needs (the whole look, a product close-up, the fit in motion). */
const instruction = (ratio?: string | null) =>
  `UGC try-on video, ${(ratio && FRAMES[ratio]) ?? (ratio ? `${ratio} frame` : 'vertical frame')}, filmed handheld on a phone by a real creator. ` +
  "The creator in [Image1] wears or holds the product in [Image2]; keep their face, hair and body and the product's shape, colours, print and details exactly as in the photos. " +
  'Show the whole look, a close-up of the product, then a natural move or turn that shows the fit. Soft natural light, authentic energy. No on-screen text, logos or watermarks.';

/**
 * The one English prompt a Marketing Studio run sends: the fixed try-on instruction for the ratio, then the hook and the location when chosen, then the
 * member's own text as creator notes. An unknown or empty hook or location id adds nothing. `audio` adds the sound rule (UGC_SOUND or SILENT); left out,
 * the prompt says nothing about sound.
 */
export function marketingPrompt({ hook, location, prompt, audio, ratio }: { hook?: string | null; location?: string | null; prompt?: string | null; audio?: boolean; ratio?: string | null }): string {
  const h = HOOKS.find((c) => c.id === hook);
  const l = LOCATIONS.find((c) => c.id === location);
  const text = prompt?.trim();
  return [instruction(ratio), h?.phrase, l && `Set in ${l.phrase}.`, text && `Creator notes: ${text}`, audio === undefined ? null : audio ? UGC_SOUND : SILENT].filter(Boolean).join(' ');
}

/** Sound of a UGC clip with audio on: what a phone records, as on the reference site's UGC clips. */
const UGC_SOUND = "Natural sound recorded on the phone: the room's ambience and the creator's short, casual spoken reaction to the product, with no background music.";
const SILENT = 'The video is completely silent: no speech, no music and no sound.';

/** The most reference images an Advanced run takes, as on the reference site; each model's own max_images may be lower. */
export const ADVANCED_MAX_IMAGES = 7;
/** The page's limits on the brief and the script: with the longest fixed part (about 600 characters) the prompt stays under the API's 2000. A script of
 * roughly two spoken words per second fills a 15 s clip at about 200 characters. */
export const ADVANCED_MAX_BRIEF = 1000;
export const ADVANCED_MAX_SCRIPT = 300;
/** UGC's prompt limit: with the longest ratio, hook, location and sound rule the rest of the prompt is about 770 characters, and the API takes 2000
 * (marketing.test.ts checks the worst case). */
export const UGC_MAX_BRIEF = 1200;

/**
 * The one English prompt a Marketing Studio Advanced run sends. The member's brief is the source of truth, the reference images are named
 * [Image1]..[ImageN] (each adapter rewrites them for its schema), the hook and the location follow when chosen, then one dialogue rule:
 * audio off is silent; a script is spoken word for word and nothing else; with no script there is speech only when the brief asks for it.
 */
export function advancedPrompt({ brief, images, hook, location, script, audio }: { brief: string; images: number; hook?: string | null; location?: string | null; script?: string | null; audio: boolean }): string {
  const h = HOOKS.find((c) => c.id === hook);
  const l = LOCATIONS.find((c) => c.id === location);
  const refs = Array.from({ length: images }, (_, i) => `[Image${i + 1}]`).join(', ');
  const lines = script?.trim().replace(/\s+/g, ' ');
  const dialogue = !audio
    ? SILENT
    : lines
      ? `The speaker says exactly: "${lines}", lip-synced, and no other spoken words.`
      : 'Add speech only if the brief asks for it; otherwise use ambient sound or music with no spoken words.';
  return [
    'Marketing video. The brief below is the source of truth; follow it.',
    images > 0 && `The reference images ${refs} show the people, products, settings or style to use; keep their faces, shapes, colours, text and logos true to the photos.`,
    `Brief: ${brief.trim()}`,
    h?.phrase,
    l && `Set in ${l.phrase}.`,
    dialogue,
    'Do not add on-screen text, captions or watermarks.',
  ]
    .filter(Boolean)
    .join(' ');
}
