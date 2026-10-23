/** A choice on the Marketing Studio page: a Vietnamese name for the member and an English scene phrase for the model. */
export type MarketingChoice = { id: string; name: string; phrase: string };

/** How the clip opens: what the creator does in the first seconds. */
export const HOOKS: MarketingChoice[] = [
  { id: 'unboxing', name: 'Mở hộp', phrase: 'The creator opens the package and shows the product to the camera with a surprised smile.' },
  { id: 'first-impression', name: 'Ấn tượng đầu tiên', phrase: 'The creator holds the product up and gives an honest first reaction straight to the camera.' },
  { id: 'before-after', name: 'Trước và sau', phrase: 'The clip starts with the creator in plain clothes, then shows the same look transformed with the product.' },
  { id: 'got-this-today', name: 'Mới mua hôm nay', phrase: 'The creator says they just got this today and shows it off excitedly.' },
  { id: 'twirl', name: 'Xoay một vòng', phrase: 'The creator does a quick twirl so the product is seen from every side.' },
  { id: 'mirror-check', name: 'Soi gương', phrase: 'The creator checks the look in a mirror, filming the reflection with the phone.' },
  { id: 'close-up-detail', name: 'Cận cảnh chi tiết', phrase: 'The creator starts with a close-up of the fabric and details, then pulls back to the full look.' },
  { id: 'must-have', name: 'Phải có', phrase: 'The creator points at the product and says it is a must-have, nodding to the camera.' },
  { id: 'get-ready', name: 'Chuẩn bị ra ngoài', phrase: 'The creator finishes getting ready and does a final check before heading out.' },
  { id: 'recommend', name: 'Gợi ý cho bạn', phrase: 'The creator recommends the product to a friend, speaking casually to the camera.' },
];

/** Where the clip is set. */
export const LOCATIONS: MarketingChoice[] = [
  { id: 'bedroom', name: 'Phòng ngủ', phrase: 'a cozy bedroom with soft natural light from a window' },
  { id: 'living-room', name: 'Phòng khách', phrase: 'a bright, tidy living room with a sofa and plants' },
  { id: 'street', name: 'Đường phố', phrase: 'a lively city street in the daytime' },
  { id: 'cafe', name: 'Quán cà phê', phrase: 'a warm coffee shop with wooden tables' },
  { id: 'park', name: 'Công viên', phrase: 'a green park with trees and morning sunlight' },
  { id: 'rooftop', name: 'Sân thượng', phrase: 'a rooftop terrace at golden hour with the city behind' },
  { id: 'fitting-room', name: 'Phòng thử đồ', phrase: 'a boutique fitting room with a large mirror and warm lights' },
  { id: 'mall', name: 'Trung tâm thương mại', phrase: 'a bright shopping mall hallway' },
  { id: 'beach', name: 'Bãi biển', phrase: 'a sunny beach with gentle waves in the background' },
  { id: 'studio', name: 'Phòng chụp', phrase: 'a simple photo studio with a clean light backdrop' },
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
