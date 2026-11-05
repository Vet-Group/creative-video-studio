// Starter chips under an empty prompt box: a short Vietnamese label, and the text a click puts in the box to edit from. Video, image and try-on
// tools read English best, so their text is English. Create and Marketing Studio start from a prompt template instead (PROMPT_TEMPLATES).
export interface Starter {
  label: string;
  text: string;
}

/** A template of a sectioned prompt: a Vietnamese name and the English hook, body and last shot it fills the three sections with. */
export interface PromptTemplate {
  name: string;
  hook: string;
  body: string;
  ending: string;
}

/** By page feature: Create's (`video`) and Marketing Studio's (`marketing`, UGC and Advanced), each hook and ending a sentence of its own. */
export const PROMPT_TEMPLATES: Record<'video' | 'marketing', PromptTemplate[]> = {
  video: [
    {
      name: 'Xoay 360°',
      hook: 'The clip opens with a quick push-in that lands on the product in the centre of the frame.',
      body: 'The camera slowly orbits 360 degrees around the product on a clean studio set, soft even light.',
      ending: 'The clip ends with the camera settling on a still front view of the product.',
    },
    {
      name: 'Zoom chậm',
      hook: 'The clip opens on a wide shot as a soft beam of light sweeps across the product.',
      body: 'A slow push-in from a wide shot to a close-up of the product details, soft natural light.',
      ending: "The clip ends on a still close-up of the product's finest detail.",
    },
    {
      name: 'Cầm trên tay',
      hook: 'The clip opens as a hand reaches into the frame and takes hold of the product.',
      body: 'A hand picks up the product and turns it gently toward the camera, natural window light.',
      ending: 'The clip ends with the hand holding the product still, facing the camera.',
    },
    {
      name: 'Gió nhẹ',
      hook: 'The clip opens as a sudden gust of wind lifts the fabric.',
      body: 'A light breeze moves the fabric while the camera holds steady, warm afternoon light.',
      ending: 'The clip ends as the fabric settles and the frame holds still.',
    },
    {
      name: 'Người mẫu bước đi',
      hook: 'The clip opens with the model stepping into the frame in one confident stride.',
      body: 'The model walks toward the camera wearing the outfit, smooth tracking shot, golden-hour light.',
      ending: 'The clip ends with the model stopping, turning to the camera and smiling.',
    },
  ],
  marketing: [
    {
      name: 'Mở hộp',
      hook: 'The clip opens with the creator holding a sealed box up to the camera and tearing it open in one quick move.',
      body: 'The creator lifts the product out of the box, turns it slowly toward the camera to show each detail and shares a genuine first reaction. Soft window light, a handheld phone camera, close and steady.',
      ending: 'The clip ends with the creator holding the product up to the camera and smiling.',
    },
    {
      name: 'Review thật',
      hook: 'The clip opens on a close-up of the creator wearing the product, looking straight into the camera.',
      body: 'The creator walks a few steps, turns to show the fit and talks honestly about what they like and what could be better, as if chatting with a friend. Bright daylight, a handheld phone camera at eye level.',
      ending: 'The clip ends with the creator nodding and giving a thumbs up next to the product.',
    },
    {
      name: 'Trước / sau',
      hook: 'The clip opens with the creator in a plain, dull outfit, then a quick snap transition reveals them wearing the product.',
      body: 'The creator turns slowly to show the new look from the front and the side and points out the difference with a confident smile. Soft, even light, a steady phone camera at chest height.',
      ending: 'The clip ends with the creator stepping back and striking a pose that shows the whole outfit.',
    },
    {
      name: 'Cận chất liệu',
      hook: 'The clip opens on an extreme close-up of the fabric as a hand brushes across it.',
      body: 'The camera moves slowly along the seams, the texture and the small details while the creator touches the product and describes how it feels to wear. Warm side light that brings out the texture, slow handheld close-ups.',
      ending: 'The clip ends as the camera pulls back to a still close-up of the whole product.',
    },
    {
      name: 'Phối đồ',
      hook: 'The clip opens with the creator spinning once in the first look, the product in the centre of the frame.',
      body: 'The creator shows three ways to style the product, for work, for a day out and for a party, switching looks with quick cuts and a short pose in each. Bright, even light, a steady phone camera that frames the full body.',
      ending: 'The clip ends with the creator in the favourite look, waving goodbye to the camera.',
    },
  ],
};

/** By feature, as PromptComposer's feature; a feature without starters shows none. */
export const STARTERS: Record<string, Starter[]> = {
  image: [
    { label: 'Studio nền trắng', text: 'The product on a seamless white studio background, soft even light, centered, high detail.' },
    { label: 'Lifestyle', text: 'The product in a bright, cozy living room, natural window light, shallow depth of field.' },
    { label: 'Ngoài phố', text: 'A model wearing the outfit on a sunny city street, golden-hour light, full-body shot.' },
    { label: 'Flat lay', text: 'A top-down flat lay of the product with a few matching accessories on a linen surface.' },
  ],
  try_on: [
    { label: 'Studio', text: 'The model stands in a clean studio with soft even light, full body, facing the camera.' },
    { label: 'Đường phố', text: 'The model walks on a sunny city street, natural light, full-body shot.' },
    { label: 'Quán cà phê', text: 'The model sits by the window of a cozy cafe, warm natural light, three-quarter shot.' },
  ],
  lingerie_try_on: [
    { label: 'Phòng ngủ sáng', text: 'The model stands in a bright, airy bedroom with soft morning light, a tasteful three-quarter pose.' },
    { label: 'Studio', text: 'A clean studio with soft even light, the model in a relaxed, tasteful pose.' },
  ],
  background_changer: [
    { label: 'Bàn đá cẩm thạch', text: 'a white marble table in a bright minimalist kitchen' },
    { label: 'Quán cà phê', text: 'a sunny outdoor cafe table with a blurred street behind' },
    { label: 'Bãi biển', text: 'a sandy beach at golden hour with soft waves' },
    { label: 'Studio pastel', text: 'a seamless pastel pink studio backdrop with soft shadows' },
  ],
};
