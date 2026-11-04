// A store's brand kit (owner decision, 2026-11-04): its voice, colours and tagline, which POST /api/jobs adds to a Marketing Studio or Image
// Generation prompt when the member turns on the brand kit switch with that store chosen. Template editors and Admins edit it (PATCH /api/stores/[id]).

export interface BrandKit {
  brandVoice: string | null;
  brandColors: string[];
  brandTagline: string | null;
}

/** The pages that offer the brand kit switch. */
export const BRAND_FEATURES = ['marketing', 'image'];
export const MAX_BRAND_VOICE = 500;
export const MAX_BRAND_TAGLINE = 120;
export const MAX_BRAND_COLORS = 6;
const HEX = /^#[0-9a-fA-F]{6}$/;

export const hasBrand = (kit: BrandKit): boolean => Boolean(kit.brandVoice || kit.brandTagline || kit.brandColors.length > 0);

/**
 * The kit fields of a PATCH body, trimmed (an empty text clears it, colours are stored upper-case), or the error to answer with. Only the fields
 * the body names are returned, so an edit leaves the others as they are.
 */
export function parseBrand(body: Record<string, unknown>): { kit: Partial<BrandKit>; error?: never } | { kit?: never; error: string } {
  const kit: Partial<BrandKit> = {};
  for (const [key, max] of [['brandVoice', MAX_BRAND_VOICE], ['brandTagline', MAX_BRAND_TAGLINE]] as const) {
    const v = body[key];
    if (v === undefined) continue;
    if (v !== null && typeof v !== 'string') return { error: `${key} must be text or null` };
    const text = v?.trim() ?? '';
    if (text.length > max) return { error: `${key} may be at most ${max} characters` };
    kit[key] = text || null;
  }
  const colors = body.brandColors;
  if (colors !== undefined) {
    if (!Array.isArray(colors) || colors.length > MAX_BRAND_COLORS || !colors.every((c) => typeof c === 'string' && HEX.test(c.trim()))) {
      return { error: `brandColors must list at most ${MAX_BRAND_COLORS} colours written as #RRGGBB` };
    }
    kit.brandColors = [...new Set(colors.map((c: string) => c.trim().toUpperCase()))];
  }
  if (Object.keys(kit).length === 0) return { error: 'give at least one of brandVoice, brandColors, brandTagline' };
  return { kit };
}

/**
 * The English block appended to the prompt the provider receives: the brand's style and colours (as accents, never over the product's own colours),
 * and on Image Generation the tagline, to use only where the prompt itself asks for text, so no overlay the member did not ask for is added.
 * Marketing Studio's instruction forbids on-screen text, so its block has no tagline. Null for another feature or an empty kit.
 */
export function brandBlock(kit: BrandKit, feature: string): string | null {
  if (!BRAND_FEATURES.includes(feature) || !hasBrand(kit)) return null;
  const voice = kit.brandVoice?.replace(/\s+/g, ' ').replace(/[.\s]+$/, '');
  return [
    voice && `Brand style: ${voice}.`,
    kit.brandColors.length > 0 && `Brand colours: ${kit.brandColors.join(', ')}, as accents in the setting and styling only; keep the product's own colours exactly as in the photos.`,
    feature === 'image' && kit.brandTagline && `If the prompt asks for on-screen text, use the brand tagline "${kit.brandTagline}"; otherwise add no text.`,
  ]
    .filter(Boolean)
    .join(' ') || null;
}

/** The prompt with the brand block after it, or the prompt unchanged when there is no block. */
export const withBrand = (prompt: string, kit: BrandKit, feature: string): string => {
  const block = brandBlock(kit, feature);
  return block ? `${prompt} ${block}` : prompt;
};
