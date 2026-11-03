// Starter chips under an empty prompt box: a short Vietnamese label, and the text a click puts in the box to edit from. Video, image and try-on
// tools read English best, so their text is English; Marketing's brief is written in the member's language (the suggester keeps it too).
export interface Starter {
  label: string;
  text: string;
}

const MARKETING: Starter[] = [
  { label: 'Mở hộp', text: 'Người sáng tạo mở hộp sản phẩm, cầm lên giới thiệu từng chi tiết và nói cảm nhận đầu tiên.' },
  { label: 'Review thật', text: 'Người sáng tạo mặc thử sản phẩm, nói thật lòng điểm thích và chưa thích như đang tâm sự với bạn bè.' },
  { label: 'Trước / sau', text: 'Mở đầu với bộ đồ cũ kém nổi bật, rồi đổi sang sản phẩm và chỉ ra sự khác biệt.' },
  { label: 'Cận chất liệu', text: 'Quay cận chất vải, đường may và chi tiết sản phẩm, vừa chạm vừa mô tả cảm giác khi mặc.' },
  { label: 'Phối đồ', text: 'Gợi ý ba cách phối sản phẩm cho đi làm, đi chơi và đi tiệc, đổi nhanh từng bộ.' },
];

/** By feature, as PromptComposer's feature; a feature without starters shows none. */
export const STARTERS: Record<string, Starter[]> = {
  video: [
    { label: 'Xoay 360°', text: 'The camera slowly orbits 360 degrees around the product on a clean studio set, soft even light.' },
    { label: 'Zoom chậm', text: 'A slow push-in from a wide shot to a close-up of the product details, soft natural light.' },
    { label: 'Cầm trên tay', text: 'A hand picks up the product and turns it gently toward the camera, natural window light.' },
    { label: 'Gió nhẹ', text: 'A light breeze moves the fabric while the camera holds steady, warm afternoon light.' },
    { label: 'Người mẫu bước đi', text: 'The model walks toward the camera wearing the outfit, smooth tracking shot, golden-hour light.' },
  ],
  marketing: MARKETING,
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
