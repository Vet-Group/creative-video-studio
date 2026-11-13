// Starter chips under an empty prompt box: a short Vietnamese label, and the text a click puts in the box to edit from. Video, image and try-on
// tools read English best, so their text is English. Create and Marketing Studio start from a prompt template instead (PROMPT_TEMPLATES).
export interface Starter {
  label: string;
  text: string;
}

/** A template of a sectioned prompt: a Vietnamese name and one-line description, and the English hook, body and last shot it fills the three sections with. */
export interface PromptTemplate {
  /** A stable lower-case kebab slug, unique across every list: the name of the template's sample clip, `template-<id>.mp4`. */
  id: string;
  name: string;
  desc: string;
  /** Set when the template only works with a particular input photo: one short Vietnamese line, at most 60 characters. */
  needs?: string;
  hook: string;
  body: string;
  ending: string;
}

/** By page: Create's (`video`) and Marketing Studio's formats (`marketing` for UGC, `advanced`, `unboxing`, `review`), each hook and ending a sentence of its own. */
export const PROMPT_TEMPLATES: Record<'video' | 'marketing' | 'advanced' | 'unboxing' | 'review', PromptTemplate[]> = {
  video: [
    {
      id: 'xoay-360',
      name: 'Xoay 360°',
      desc: 'Máy quay xoay quanh sản phẩm trên nền studio sạch',
      hook: 'The clip opens with a quick push-in that lands on the product in the centre of the frame.',
      body: 'The camera slowly orbits 360 degrees around the product on a clean studio set, soft even light.',
      ending: 'The clip ends with the camera settling on a still front view of the product.',
    },
    {
      id: 'zoom-cham',
      name: 'Zoom chậm',
      desc: 'Từ toàn cảnh đẩy chậm vào chi tiết sản phẩm',
      hook: 'The clip opens on a wide shot as a soft beam of light sweeps across the product.',
      body: 'A slow push-in from a wide shot to a close-up of the product details, soft natural light.',
      ending: "The clip ends on a still close-up of the product's finest detail.",
    },
    {
      id: 'cam-tren-tay',
      name: 'Cầm trên tay',
      desc: 'Bàn tay cầm sản phẩm, xoay nhẹ về phía máy quay',
      hook: 'The clip opens as a hand reaches into the frame and takes hold of the product.',
      body: 'A hand picks up the product and turns it gently toward the camera, natural window light.',
      ending: 'The clip ends with the hand holding the product still, facing the camera.',
    },
    {
      id: 'gio-nhe',
      name: 'Gió nhẹ',
      desc: 'Gió nhẹ lay vải, máy quay đứng yên',
      hook: 'The clip opens as a sudden gust of wind lifts the fabric.',
      body: 'A light breeze moves the fabric while the camera holds steady, warm afternoon light.',
      ending: 'The clip ends as the fabric settles and the frame holds still.',
    },
    {
      id: 'nguoi-mau-buoc-di',
      name: 'Người mẫu bước đi',
      desc: 'Người mẫu mặc đồ bước về phía máy quay',
      needs: 'Cần ảnh người mẫu mặc đồ',
      hook: 'The clip opens with the model stepping into the frame in one confident stride.',
      body: 'The model walks toward the camera wearing the outfit, smooth tracking shot, golden-hour light.',
      ending: 'The clip ends with the model stopping, turning to the camera and smiling.',
    },
    {
      id: 'treo-moc',
      name: 'Treo móc',
      desc: 'Áo treo trên móc, xoay nhẹ khoe mặt trước và sau',
      needs: 'Cần ảnh quần áo, không có người',
      hook: 'The clip opens as the garment on its hanger swings gently into view.',
      body: 'The garment hangs on a wooden hanger against a plain wall and turns slowly to show the front and then the back, soft diffused light, static camera.',
      ending: 'The clip ends with the garment settling still, its front facing the camera.',
    },
    {
      id: 'ma-nanh-canh-vo-hinh',
      name: 'Ma-nơ-canh vô hình',
      desc: 'Bộ đồ đứng phom như có người mặc, nền xám nhạt',
      needs: 'Cần ảnh quần áo, không có người',
      hook: 'The clip opens on the outfit standing on its own, shaped as if worn by an invisible body.',
      body: 'The camera circles slowly around the hollow, perfectly shaped outfit on a seamless light grey background, crisp studio light that shows the fabric and the print.',
      ending: 'The clip ends on a still front view of the outfit, centred in the frame.',
    },
    {
      id: 'mo-gap-tren-ban',
      name: 'Mở gấp trên bàn',
      desc: 'Hai tay mở sản phẩm đang gấp rồi giơ lên máy quay',
      hook: 'The clip opens on the product neatly folded on a wooden table as two hands reach in.',
      body: 'The hands unfold the product, hold it up to the camera, then smooth it flat on the table, warm morning window light, top-down camera.',
      ending: 'The clip ends with the product laid flat and still, filling the frame.',
    },
    {
      id: 'selfie-guong',
      name: 'Selfie gương',
      desc: 'Người mẫu chụp gương, xoay người khoe dáng đồ',
      needs: 'Cần ảnh người mẫu mặc đồ',
      hook: 'The clip opens on a mirror reflection of the model raising a phone for a selfie.',
      body: 'The model, wearing the outfit, turns from side to side in front of a full-length mirror to show the fit, bright natural light, the phone held at chest height.',
      ending: 'The clip ends with the model holding one last mirror pose, the whole outfit in view.',
    },
    {
      id: 'can-hinh-in',
      name: 'Cận hình in',
      desc: 'Máy quay lướt sát hình in rồi lùi ra toàn sản phẩm',
      hook: 'The clip opens on an extreme close-up of the printed design as the camera slides across it.',
      body: 'The camera glides slowly over the print and the fabric around it, then pulls back to show the whole product, soft raking light that brings out the texture.',
      ending: 'The clip ends on a still medium shot of the product with the print clearly visible.',
    },
  ],
  marketing: [
    {
      id: 'truoc-sau',
      name: 'Trước / sau',
      desc: 'Từ bộ đồ cũ sang sản phẩm mới trong một cú chuyển cảnh',
      hook: 'The clip opens with the creator in a plain, dull outfit, then a quick snap transition reveals them wearing the product.',
      body: 'The creator turns slowly to show the new look from the front and the side and points out the difference with a confident smile. Soft, even light, a steady phone camera at chest height.',
      ending: 'The clip ends with the creator stepping back and striking a pose that shows the whole outfit.',
    },
    {
      id: 'can-chat-lieu',
      name: 'Cận chất liệu',
      desc: 'Cận cảnh đường may, chất vải và chi tiết nhỏ',
      hook: 'The clip opens on an extreme close-up of the fabric as a hand brushes across it.',
      body: 'The camera moves slowly along the seams, the texture and the small details while the creator touches the product and describes how it feels to wear. Warm side light that brings out the texture, slow handheld close-ups.',
      ending: 'The clip ends as the camera pulls back to a still close-up of the whole product.',
    },
    {
      id: 'phoi-do',
      name: 'Phối đồ',
      desc: 'Ba cách phối sản phẩm: đi làm, đi chơi, dự tiệc',
      hook: 'The clip opens with the creator spinning once in the first look, the product in the centre of the frame.',
      body: 'The creator shows three ways to style the product, for work, for a day out and for a party, switching looks with quick cuts and a short pose in each. Bright, even light, a steady phone camera that frames the full body.',
      ending: 'The clip ends with the creator in the favourite look, waving goodbye to the camera.',
    },
    {
      id: 'quay-bang-dien-thoai',
      name: 'Quay bằng điện thoại',
      desc: 'Như clip tự quay thật: cầm máy một tay, rung nhẹ',
      hook: 'The clip opens on a selfie-style phone shot as the creator holds up the product and grins at the lens.',
      body: "Filmed like a real phone video: the creator, at arm's length, shows the product up close, turns it toward the light and reacts naturally. Slight handheld shake, natural indoor light, no studio polish.",
      ending: 'The clip ends with the creator bringing the product close to the lens, then lowering the phone.',
    },
    {
      id: 'dung-luot',
      name: 'Dừng lướt',
      desc: 'Chỉ thẳng vào máy quay, búng tay là sản phẩm hiện ra',
      hook: 'The clip opens with the creator pointing straight at the camera, then snapping their fingers as the product appears in their hand.',
      body: 'The creator shows the one detail that makes the product special, then wears or uses it in a quick, confident move. Bright, even light, a steady phone camera at eye level.',
      ending: 'The clip ends with the creator giving a quick wink at the camera, the product in view.',
    },
    {
      id: 'phan-ung-bat-ngo',
      name: 'Phản ứng bất ngờ',
      desc: 'Lấy sản phẩm ra khỏi túi và ngạc nhiên thích thú',
      hook: "The clip opens on the creator's surprised face as they pull the product out of a shopping bag.",
      body: 'The creator holds the product up, checks the fabric and the fit in a mirror and nods, impressed, as if seeing it for the first time. Warm natural light, a handheld phone camera.',
      ending: 'The clip ends with the creator hugging the product and smiling at the camera.',
    },
  ],
  advanced: [
    {
      id: 'gioi-thieu-nhanh',
      name: 'Giới thiệu nhanh',
      desc: 'Khoe sản phẩm từ ba góc trên nền sạch',
      hook: 'The clip opens with the product snapping into frame on a clean background.',
      body: 'The product is shown from three angles with quick, smooth camera moves, each angle highlighting one key detail. Clean studio light, steady gimbal shots.',
      ending: 'The clip ends on a still hero shot of the product.',
    },
    {
      id: 'mot-ngay-cung-san-pham',
      name: 'Một ngày cùng sản phẩm',
      desc: 'Sản phẩm đi cùng một người từ sáng tới tối',
      hook: 'The clip opens with a person reaching for the product first thing in the morning.',
      body: 'Short scenes follow the person using the product through the day, at home, on the go and with friends, in a warm, natural style. Natural light, a handheld camera.',
      ending: 'The clip ends with the person smiling at the camera, the product in hand.',
    },
    {
      id: 'van-de-va-giai-phap',
      name: 'Vấn đề và giải pháp',
      desc: 'Một rắc rối nhỏ, rồi sản phẩm giải quyết gọn',
      hook: 'The clip opens on a small everyday problem the product solves, shown in one quick moment.',
      body: 'The person discovers the product, uses it, and the problem is solved in a clear, satisfying way. Bright, even light, close handheld shots.',
      ending: 'The clip ends on a close-up of the product with the person giving a satisfied nod.',
    },
    {
      id: 'phim-quang-cao-ngan',
      name: 'Phim quảng cáo ngắn',
      desc: 'Chuỗi cảnh ngắn: cận chi tiết, đang dùng, toàn cảnh',
      hook: 'The clip opens with a fast push-in on the product under a striking hero light.',
      body: 'Scene by scene: a close shot of one detail, then the product in use in a real setting, then a confident wide shot, each scene short and cut on motion. Cinematic light, smooth gimbal moves.',
      ending: 'The clip ends on a clean hero shot of the product as the light softens.',
    },
    {
      id: 'mon-qua',
      name: 'Món quà',
      desc: 'Một người tặng quà, người kia mở ra và thử ngay',
      hook: 'The clip opens as one person hands a wrapped gift to a friend.',
      body: 'The friend opens it, finds the product and lights up, then tries it on right away while the giver smiles. Warm indoor light, a handheld camera close on their faces and the product.',
      ending: 'The clip ends with the two friends laughing together, the product in the centre of the frame.',
    },
    {
      id: 'dao-pho',
      name: 'Dạo phố',
      desc: 'Lookbook đường phố: đi, cận chi tiết, cười tự nhiên',
      hook: 'The clip opens with the model stepping out of a doorway onto a sunny street.',
      body: 'The model walks through the city in the outfit, with quick cuts between a wide tracking shot, a close-up of the details and a candid laugh. Golden-hour light, a handheld camera that moves with them.',
      ending: 'The clip ends with the model stopping at a corner and looking back over the shoulder at the camera.',
    },
  ],
  unboxing: [
    {
      id: 'hop-qua',
      name: 'Hộp quà',
      desc: 'Gỡ nơ hộp quà và bất ngờ với sản phẩm',
      hook: 'The clip opens on a gift box tied with a ribbon as hands pull the ribbon loose.',
      body: 'The lid lifts to reveal the product wrapped in tissue paper; it is lifted out and turned slowly toward the camera to show each detail. Warm soft light, a handheld phone camera, close and steady.',
      ending: 'The clip ends with the product held up next to its open box.',
    },
    {
      id: 'pov-tay',
      name: 'POV tay',
      desc: 'Góc nhìn thứ nhất, chỉ thấy tay mở hộp',
      hook: 'The clip opens from a first-person view as two hands slide a sealed package onto the table.',
      body: 'The hands cut the tape, fold back the flaps and lift the product out, turning it to catch the light. Bright daylight from a window, a top-down handheld phone camera.',
      ending: 'The clip ends with the hands placing the product neatly on top of its box.',
    },
    {
      id: 'mo-nhanh-asmr',
      name: 'Mở nhanh ASMR',
      desc: 'Mở nhanh, cận cảnh tiếng giấy và băng keo',
      hook: 'The clip opens on an extreme close-up of tape being peeled off a box with a crisp sound.',
      body: 'Quick close cuts follow the box opening, the tissue paper rustling and the product being lifted out, each sound clear and close. Soft side light, macro handheld shots.',
      ending: 'The clip ends on a still close-up of the product resting in its open box.',
    },
    {
      id: 'hang-vua-giao',
      name: 'Hàng vừa giao',
      desc: 'Gói hàng tới cửa, mang vào bàn mở ngay',
      hook: 'The clip opens on a package landing on a doorstep as hands quickly pick it up.',
      body: 'The package is carried to a table and opened in a few quick moves, and the product is lifted out and held up to the light. Bright daylight, a handheld phone camera that follows the hands.',
      ending: 'The clip ends with the product held up in front of the open package.',
    },
    {
      id: 'nhieu-don-mot-lan',
      name: 'Nhiều đơn một lần',
      desc: 'Mở liền mấy gói, để sản phẩm của bạn tới cuối',
      hook: 'The clip opens on a pile of parcels as the creator rubs their hands in excitement.',
      body: 'The creator opens the parcels one after another, each reveal a quick cut, and saves the product for last as the best find. Warm room light, a steady phone camera on a tripod.',
      ending: 'The clip ends with the creator holding the product up beside the empty parcels.',
    },
    {
      id: 'toi-gian',
      name: 'Tối giản',
      desc: 'Mở chậm, gọn gàng trên bàn trắng, ánh sáng dịu',
      hook: 'The clip opens on a plain box on a clean white table in soft morning light.',
      body: 'Slow, calm hands lift the lid, fold back the paper and set the product on the table, every move unhurried and tidy. Soft diffused light, a static top-down camera.',
      ending: 'The clip ends on a calm still frame of the product beside its neatly closed box.',
    },
  ],
  review: [
    {
      id: 'review-that',
      name: 'Review thật',
      desc: 'Mặc thử, đi vài bước và nhận xét thật lòng',
      hook: 'The clip opens on a close-up of the creator wearing the product, looking straight into the camera.',
      body: 'The creator walks a few steps, turns to show the fit and talks honestly about what they like and what could be better, as if chatting with a friend. Bright daylight, a handheld phone camera at eye level.',
      ending: 'The clip ends with the creator nodding and giving a thumbs up next to the product.',
    },
    {
      id: 'uu-va-nhuoc',
      name: 'Ưu và nhược',
      desc: 'Hai điểm thích và một điểm cần lưu ý',
      hook: 'The clip opens with the creator holding the product up to the camera and saying they have used it for a week.',
      body: 'The creator counts on their fingers two things they love about the product and one thing to know before buying, showing each point on the product. Bright daylight, a handheld phone camera at eye level.',
      ending: 'The clip ends with the creator giving the product a confident nod.',
    },
    {
      id: 'mac-ca-ngay',
      name: 'Mặc cả ngày',
      desc: 'Từ sáng tới tối, sản phẩm vẫn chỉn chu',
      hook: 'The clip opens with the creator checking the time on a phone in the morning, wearing the product.',
      body: 'Quick cuts follow the creator through the day, at work, on the street and in the evening, the product still looking neat in each shot. Natural light that shifts from morning to evening, a handheld phone camera.',
      ending: 'The clip ends with the creator back home at night, smiling and pointing at the product.',
    },
    {
      id: 'tra-loi-binh-luan',
      name: 'Trả lời bình luận',
      desc: 'Đọc một câu hỏi của khách rồi trả lời bằng sản phẩm',
      hook: 'The clip opens with the creator reading a comment on their phone, then turning to the camera.',
      body: 'The creator answers the question by showing the product: the fit, the fabric and how it looks in daylight, speaking simply and honestly. Bright daylight, a handheld phone camera at eye level.',
      ending: 'The clip ends with the creator holding the product up and nodding, as if to say it is worth it.',
    },
    {
      id: 'so-voi-do-cu',
      name: 'So với đồ cũ',
      desc: 'Đặt cạnh món cũ đã sờn, chỉ ra chỗ hơn',
      hook: 'The clip opens with the creator holding an old, worn item next to the product.',
      body: 'The creator compares the two side by side and points out the better fabric, finish and fit of the product, then puts the old one away. Bright, even light, a steady phone camera at chest height.',
      ending: 'The clip ends with the creator keeping the product and setting the old one aside with a smile.',
    },
    {
      id: 'thu-size',
      name: 'Thử size',
      desc: 'Mặc thử, chỉ độ vừa ở vai, eo, độ dài',
      hook: 'The clip opens with the creator holding the product against their body in front of a mirror.',
      body: 'The creator puts it on, shows how it fits at the shoulders, the waist and the length, and moves around to show the comfort, saying which size they chose. Bright daylight, a handheld phone camera, full body in frame.',
      ending: 'The clip ends with the creator doing a slow full turn to show the fit from every side.',
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
    { label: 'Ma-nơ-canh vô hình', text: 'The garment shaped as if worn by an invisible body, front view on a seamless light grey background, crisp studio light, the fabric and print exactly as they are.' },
    { label: 'Treo móc', text: 'The garment on a wooden hanger against a clean plaster wall, soft window light, straight-on view.' },
    { label: 'Selfie gương', text: 'A model taking a mirror selfie in the outfit, phone at chest height, in a bright bedroom with natural light, full body.' },
    { label: 'Ảnh quảng cáo', text: "A premium commercial product photo on a softly lit gradient background with a gentle reflection below, the product's shape, colours and printed text unchanged." },
  ],
  try_on: [
    { label: 'Studio', text: 'The model stands in a clean studio with soft even light, full body, facing the camera.' },
    { label: 'Đường phố', text: 'The model walks on a sunny city street, natural light, full-body shot.' },
    { label: 'Quán cà phê', text: 'The model sits by the window of a cozy cafe, warm natural light, three-quarter shot.' },
    { label: 'Selfie gương', text: 'The model takes a mirror selfie in a bright fitting room, phone at chest height, full body.' },
    { label: 'Công viên', text: 'The model stands in a green park on a sunny day, soft natural light, full-body shot.' },
    { label: 'Nền màu', text: 'The model poses against a bold solid-colour studio backdrop, crisp even light, full body.' },
  ],
  lingerie_try_on: [
    { label: 'Phòng ngủ sáng', text: 'The model stands in a bright, airy bedroom with soft morning light, a tasteful three-quarter pose.' },
    { label: 'Studio', text: 'A clean studio with soft even light, the model in a relaxed, tasteful pose.' },
    { label: 'Cạnh cửa sổ', text: 'The model stands by a window with sheer curtains in soft daylight, a tasteful three-quarter pose.' },
  ],
  background_changer: [
    { label: 'Bàn đá cẩm thạch', text: 'a white marble table in a bright minimalist kitchen' },
    { label: 'Quán cà phê', text: 'a sunny outdoor cafe table with a blurred street behind' },
    { label: 'Bãi biển', text: 'a sandy beach at golden hour with soft waves' },
    { label: 'Studio pastel', text: 'a seamless pastel pink studio backdrop with soft shadows' },
    { label: 'Kệ gỗ', text: 'a light oak shelf against a warm white wall with a small green plant' },
    { label: 'Phòng ngủ', text: 'a neatly made bed with linen sheets in soft morning light' },
    { label: 'Vỉa hè', text: 'a sunny city sidewalk with a softly blurred shopfront behind' },
    { label: 'Nền chuyển màu', text: 'a smooth warm-to-cool gradient studio backdrop with a soft floor shadow' },
  ],
};
