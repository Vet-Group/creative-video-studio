import { poseOf } from './try-on-stock';

/** What each input is, so the model never mistakes the background for a garment; a chosen pose replaces "keep the pose" with that pose's words. */
const roles = (garments: number, background: boolean, pose: string | undefined): string =>
  `Image 1 is the person. ${garments === 1 ? 'Image 2 is the garment.' : `Images 2 to ${garments + 1} are the garments.`}${background ? ` Image ${garments + 2} is the background scene.` : ''} ` +
  `Dress the person in the garment${garments > 1 ? 's' : ''}${background ? ' and place them in the background scene' : ''}. ` +
  `${pose ? `Keep the person's face and identity exactly unchanged, and show them in this pose and framing: ${pose}.` : "Keep the person's face, pose and body exactly unchanged."} Do not add any text, logos or watermarks.`;

/** The prompt a Try On run sends: undefined (the server default) for one garment, no background, no pose and no text; else the role text, then the user's text. */
export function tryOnPrompt(garments: number, background: boolean, text: string, pose?: string | null): string | undefined {
  const t = text.trim();
  const words = poseOf(pose)?.words;
  return background || garments > 1 || t || words ? `${roles(garments, background, words)}${t ? ` ${t}` : ''}` : undefined;
}
