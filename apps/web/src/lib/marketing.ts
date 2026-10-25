/** A choice on the Marketing Studio page: a Vietnamese name for the member and an English scene phrase for the model. */
export type MarketingChoice = { id: string; name: string; phrase: string };

/** How the clip opens: the reference site's six hooks (owner, 2026-10-26: match it), each with its sample loop marketing-hook-<id>.mp4. */
export const HOOKS: MarketingChoice[] = [
  { id: 'blizzard', name: 'Bão tuyết', phrase: 'The clip opens as a sudden snowstorm sweeps across the scene, then clears to reveal the creator in the outfit.' },
  { id: 'flip-fail', name: 'Lộn nhào hụt', phrase: 'The clip opens with the creator trying a playful flip that fails, then laughing and showing the outfit.' },
  { id: 'dramatic-arrival', name: 'Xuất hiện ấn tượng', phrase: 'The product crashes dramatically into the scene and lands intact in front of the creator.' },
  { id: 'product-catch', name: 'Bắt lấy sản phẩm', phrase: 'The creator catches the product thrown into frame with an energetic, surprised reaction.' },
  { id: 'product-drop', name: 'Sản phẩm rơi xuống', phrase: 'The product drops into frame from above and the creator picks it up to show it.' },
  { id: 'strange-mic', name: 'Micro kỳ lạ', phrase: 'An oddly shaped microphone pops up in front of the creator, who starts talking about the product.' },
];

/** Where the clip is set: the reference site's eleven locations, each with its sample loop marketing-location-<id>.mp4. */
export const LOCATIONS: MarketingChoice[] = [
  { id: 'airplane-wing', name: 'Cánh máy bay', phrase: 'a seat on an airplane wing high above the clouds' },
  { id: 'bathroom', name: 'Phòng tắm', phrase: 'a clean, minimal modern bathroom' },
  { id: 'bedroom', name: 'Phòng ngủ', phrase: 'a cozy bedroom with soft natural light from a window' },
  { id: 'car-roof', name: 'Cửa sổ trời ô tô', phrase: 'an open car sunroof, looking up at the sky' },
  { id: 'gym', name: 'Phòng tập', phrase: 'a fitness studio with equipment in the background' },
  { id: 'in-car', name: 'Trong xe', phrase: 'the inside of a car, with the dashboard and windshield behind' },
  { id: 'kitchen', name: 'Nhà bếp', phrase: 'a modern kitchen in warm light' },
  { id: 'office', name: 'Văn phòng', phrase: 'a tidy, professional desk workspace' },
  { id: 'outdoor', name: 'Ngoài trời', phrase: 'a green open-air space in daylight' },
  { id: 'rooftop', name: 'Sân thượng', phrase: 'an urban rooftop with the city skyline behind' },
  { id: 'street', name: 'Đường phố', phrase: 'a lively city street in the daytime' },
];

const INSTRUCTION =
  'UGC try-on video. The person in [Image1] wears the product in [Image2]. Keep the person\'s face and body and the product\'s shape, colours and details true to the photos. ' +
  'Creator-style handheld vertical video, shot on a phone, natural and authentic. Do not add any text, logos or watermarks.';

/**
 * The one English prompt a Marketing Studio run sends: the fixed try-on instruction, then the hook and the location when chosen, then the member's own text.
 * An unknown or empty hook or location id adds nothing.
 */
export function marketingPrompt({ hook, location, prompt }: { hook?: string | null; location?: string | null; prompt?: string | null }): string {
  const h = HOOKS.find((c) => c.id === hook);
  const l = LOCATIONS.find((c) => c.id === location);
  const text = prompt?.trim();
  return [INSTRUCTION, h?.phrase, l && `Set in ${l.phrase}.`, text].filter(Boolean).join(' ');
}
