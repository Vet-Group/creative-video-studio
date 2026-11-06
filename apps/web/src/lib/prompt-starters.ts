// Starter chips under an empty prompt box: a short Vietnamese label, and the text a click puts in the box to edit from. Video, image and try-on
// tools read English best, so their text is English. Create and Marketing Studio start from a prompt template instead (PROMPT_TEMPLATES).
export interface Starter {
  label: string;
  text: string;
}

/** A template of a sectioned prompt: a Vietnamese name and one-line description, and the English hook, body and last shot it fills the three sections with. */
export interface PromptTemplate {
  name: string;
  desc: string;
  hook: string;
  body: string;
  ending: string;
}

/** By page: Create's (`video`) and Marketing Studio's formats (`marketing` for UGC, `unboxing`, `review`; Advanced has none), each hook and ending a sentence of its own. */
export const PROMPT_TEMPLATES: Record<'video' | 'marketing' | 'unboxing' | 'review', PromptTemplate[]> = {
  video: [
    {
      name: 'Xoay 360°',
      desc: 'Máy quay xoay quanh sản phẩm trên nền studio sạch',
      hook: 'The clip opens with a quick push-in that lands on the product in the centre of the frame.',
      body: 'The camera slowly orbits 360 degrees around the product on a clean studio set, soft even light.',
      ending: 'The clip ends with the camera settling on a still front view of the product.',
    },
    {
      name: 'Zoom chậm',
      desc: 'Từ toàn cảnh đẩy chậm vào chi tiết sản phẩm',
      hook: 'The clip opens on a wide shot as a soft beam of light sweeps across the product.',
      body: 'A slow push-in from a wide shot to a close-up of the product details, soft natural light.',
      ending: "The clip ends on a still close-up of the product's finest detail.",
    },
    {
      name: 'Cầm trên tay',
      desc: 'Bàn tay cầm sản phẩm, xoay nhẹ về phía máy quay',
      hook: 'The clip opens as a hand reaches into the frame and takes hold of the product.',
      body: 'A hand picks up the product and turns it gently toward the camera, natural window light.',
      ending: 'The clip ends with the hand holding the product still, facing the camera.',
    },
    {
      name: 'Gió nhẹ',
      desc: 'Gió nhẹ lay vải, máy quay đứng yên',
      hook: 'The clip opens as a sudden gust of wind lifts the fabric.',
      body: 'A light breeze moves the fabric while the camera holds steady, warm afternoon light.',
      ending: 'The clip ends as the fabric settles and the frame holds still.',
    },
    {
      name: 'Người mẫu bước đi',
      desc: 'Người mẫu mặc đồ bước về phía máy quay',
      hook: 'The clip opens with the model stepping into the frame in one confident stride.',
      body: 'The model walks toward the camera wearing the outfit, smooth tracking shot, golden-hour light.',
      ending: 'The clip ends with the model stopping, turning to the camera and smiling.',
    },
  ],
  marketing: [
    {
      name: 'Trước / sau',
      desc: 'Từ bộ đồ cũ sang sản phẩm mới trong một cú chuyển cảnh',
      hook: 'The clip opens with the creator in a plain, dull outfit, then a quick snap transition reveals them wearing the product.',
      body: 'The creator turns slowly to show the new look from the front and the side and points out the difference with a confident smile. Soft, even light, a steady phone camera at chest height.',
      ending: 'The clip ends with the creator stepping back and striking a pose that shows the whole outfit.',
    },
    {
      name: 'Cận chất liệu',
      desc: 'Cận cảnh đường may, chất vải và chi tiết nhỏ',
      hook: 'The clip opens on an extreme close-up of the fabric as a hand brushes across it.',
      body: 'The camera moves slowly along the seams, the texture and the small details while the creator touches the product and describes how it feels to wear. Warm side light that brings out the texture, slow handheld close-ups.',
      ending: 'The clip ends as the camera pulls back to a still close-up of the whole product.',
    },
    {
      name: 'Phối đồ',
      desc: 'Ba cách phối sản phẩm: đi làm, đi chơi, dự tiệc',
      hook: 'The clip opens with the creator spinning once in the first look, the product in the centre of the frame.',
      body: 'The creator shows three ways to style the product, for work, for a day out and for a party, switching looks with quick cuts and a short pose in each. Bright, even light, a steady phone camera that frames the full body.',
      ending: 'The clip ends with the creator in the favourite look, waving goodbye to the camera.',
    },
  ],
  unboxing: [
    {
      name: 'Hộp quà',
      desc: 'Gỡ nơ hộp quà và bất ngờ với sản phẩm',
      hook: 'The clip opens on a gift box tied with a ribbon as hands pull the ribbon loose.',
      body: 'The lid lifts to reveal the product wrapped in tissue paper; it is lifted out and turned slowly toward the camera to show each detail. Warm soft light, a handheld phone camera, close and steady.',
      ending: 'The clip ends with the product held up next to its open box.',
    },
    {
      name: 'POV tay',
      desc: 'Góc nhìn thứ nhất, chỉ thấy tay mở hộp',
      hook: 'The clip opens from a first-person view as two hands slide a sealed package onto the table.',
      body: 'The hands cut the tape, fold back the flaps and lift the product out, turning it to catch the light. Bright daylight from a window, a top-down handheld phone camera.',
      ending: 'The clip ends with the hands placing the product neatly on top of its box.',
    },
    {
      name: 'Mở nhanh ASMR',
      desc: 'Mở nhanh, cận cảnh tiếng giấy và băng keo',
      hook: 'The clip opens on an extreme close-up of tape being peeled off a box with a crisp sound.',
      body: 'Quick close cuts follow the box opening, the tissue paper rustling and the product being lifted out, each sound clear and close. Soft side light, macro handheld shots.',
      ending: 'The clip ends on a still close-up of the product resting in its open box.',
    },
  ],
  review: [
    {
      name: 'Review thật',
      desc: 'Mặc thử, đi vài bước và nhận xét thật lòng',
      hook: 'The clip opens on a close-up of the creator wearing the product, looking straight into the camera.',
      body: 'The creator walks a few steps, turns to show the fit and talks honestly about what they like and what could be better, as if chatting with a friend. Bright daylight, a handheld phone camera at eye level.',
      ending: 'The clip ends with the creator nodding and giving a thumbs up next to the product.',
    },
    {
      name: 'Ưu và nhược',
      desc: 'Hai điểm thích và một điểm cần lưu ý',
      hook: 'The clip opens with the creator holding the product up to the camera and saying they have used it for a week.',
      body: 'The creator counts on their fingers two things they love about the product and one thing to know before buying, showing each point on the product. Bright daylight, a handheld phone camera at eye level.',
      ending: 'The clip ends with the creator giving the product a confident nod.',
    },
    {
      name: 'Mặc cả ngày',
      desc: 'Từ sáng tới tối, sản phẩm vẫn chỉn chu',
      hook: 'The clip opens with the creator checking the time on a phone in the morning, wearing the product.',
      body: 'Quick cuts follow the creator through the day, at work, on the street and in the evening, the product still looking neat in each shot. Natural light that shifts from morning to evening, a handheld phone camera.',
      ending: 'The clip ends with the creator back home at night, smiling and pointing at the product.',
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
