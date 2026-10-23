/** What each input is, so the model never mistakes the background for a garment. */
const roles = (garments: number, background: boolean): string =>
  `Image 1 is the person. ${garments === 1 ? 'Image 2 is the garment.' : `Images 2 to ${garments + 1} are the garments.`}${background ? ` Image ${garments + 2} is the background scene.` : ''} ` +
  `Dress the person in the garment${garments > 1 ? 's' : ''}${background ? ' and place them in the background scene' : ''}. Keep the person's face, pose and body exactly unchanged. Do not add any text, logos or watermarks.`;

/** The prompt a Try On run sends: undefined (the server default) for one garment, no background and no text; else the role text, then the user's text. */
export function tryOnPrompt(garments: number, background: boolean, text: string): string | undefined {
  const t = text.trim();
  return background || garments > 1 || t ? `${roles(garments, background)}${t ? ` ${t}` : ''}` : undefined;
}
