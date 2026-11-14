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
      desc: 'Máy quay lướt vòng nhẹ quanh sản phẩm, luôn thấy mặt trước',
      hook: 'The clip opens on the product exactly as in the photo, as the camera begins to drift slowly to one side.',
      body: 'The camera arcs slowly a little to one side around the product and then back, its front always toward the camera. Soft, even light, smooth steady motion.',
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
      desc: 'Áo treo trên móc đung đưa nhẹ, khoe phom và chất vải',
      needs: 'Cần ảnh áo treo trên móc, không có người',
      hook: 'The clip opens as the garment on its hanger swings in a soft arc, the fabric rippling.',
      body: 'The garment sways softly on its hanger and turns a little to each side, its front staying toward the camera as the fabric moves and catches the light. Soft diffused light, static camera.',
      ending: 'The clip ends with the garment settling still, its front facing the camera.',
    },
    {
      id: 'ma-nanh-canh-vo-hinh',
      name: 'Ma-nơ-canh vô hình',
      desc: 'Đồ dựng phom như có người mặc, xoay nhẹ sang hai bên',
      needs: 'Cần ảnh đồ dựng phom kiểu ma-nơ-canh vô hình',
      hook: 'The clip opens on the outfit standing on its own, shaped as if worn by an invisible body, as it begins to turn.',
      body: 'The hollow outfit turns slowly a little to the left and then to the right, its front always toward the camera, while the camera pushes in gently. Crisp, even studio light that shows the fabric.',
      ending: 'The clip ends on a still front view of the outfit, centred in the frame.',
    },
    {
      id: 'selfie-guong',
      name: 'Selfie gương',
      desc: 'Người mẫu chụp gương, xoay người khoe dáng đồ',
      needs: 'Cần ảnh người mẫu mặc đồ, chụp selfie trước gương',
      hook: "The clip opens on the model's mirror selfie as they shift their weight and tilt the phone slightly.",
      body: 'The model, wearing the outfit, turns gently from side to side in front of the mirror to show the fit, the phone held steady where it is in the image. Bright natural light.',
      ending: 'The clip ends with the model holding one last mirror pose, the whole outfit in view.',
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
      desc: 'Một cách phối với sản phẩm, xoay nhẹ khoe cả bộ',
      hook: 'The clip opens with the creator in a full-body shot, wearing the product as the centre of the outfit.',
      body: 'The creator shows one outfit built around the product: a gentle turn a little to each side to show the whole look, then a point to how the product pairs with the other pieces. Bright, even light, a steady phone camera that frames the full body.',
      ending: 'The clip ends with the creator facing the camera in the finished look, the front of the product in full view.',
    },
    {
      id: 'quay-bang-dien-thoai',
      name: 'Quay bằng điện thoại',
      desc: 'Như clip tự quay thật: cầm máy một tay, rung nhẹ',
      hook: 'The clip opens on a selfie-style phone shot as the creator, wearing the product, grins at the lens.',
      body: "Filmed like a real phone video: the creator holds the phone at arm's length, tilts it down to show the product on them, then turns side to side so the fit shows. Slight handheld shake, natural indoor light.",
      ending: "The clip ends with the phone tilted back up to the creator's smiling face, the product still in view.",
    },
    {
      id: 'dung-luot',
      name: 'Dừng lướt',
      desc: 'Chỉ thẳng vào máy quay giữ người xem, rồi khoe trọn bộ',
      hook: 'The clip opens with the creator leaning into the camera and pointing straight at the lens, wearing the product.',
      body: 'The creator steps back to show the whole outfit, points to the front of the product, then turns to the side to show the fit. Bright, even light, a steady phone camera at eye level.',
      ending: 'The clip ends with the creator giving a quick wink at the camera, the product in view.',
    },
    {
      id: 'phan-ung-bat-ngo',
      name: 'Phản ứng bất ngờ',
      desc: 'Lấy sản phẩm ra khỏi túi và ngạc nhiên thích thú',
      hook: "The clip opens on the creator's surprised face as they pull the product out of a plain paper shopping bag.",
      body: 'The creator holds the product up against their body, looks down at it, then back at the camera and nods, impressed, as if seeing it for the first time. Warm natural light, a handheld phone camera.',
      ending: 'The clip ends with the creator holding the product up to the camera with a delighted smile, its front fully in view.',
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
      desc: 'Kiểu quảng cáo điện ảnh: người mẫu mặc, rồi cận chất vải',
      hook: 'The clip opens with a fast push-in on the product under a striking hero light.',
      body: 'Two short scenes cut on motion: the model wearing the product walks through a stylish real setting, then a slow close shot glides over the fabric and the details. Cinematic light, smooth gimbal moves.',
      ending: 'The clip ends on a clean hero shot of the product as the light softens.',
    },
    {
      id: 'mon-qua',
      name: 'Món quà',
      desc: 'Nhận quà từ bạn, mở ra thấy sản phẩm và ướm thử ngay',
      hook: 'The clip opens as a friend hands the model a wrapped gift and the model tears off the paper.',
      body: 'The model lifts out the product, lights up and holds it against themselves while the friend smiles beside them. Warm indoor light, a handheld camera close on their faces and the product.',
      ending: 'The clip ends with the model holding the product up to the camera, the friend cheering beside them.',
    },
    {
      id: 'dao-pho',
      name: 'Dạo phố',
      desc: 'Lookbook đường phố: đi, cận chi tiết, cười tự nhiên',
      hook: 'The clip opens with the model stepping out of a doorway onto a sunny street.',
      body: 'The model walks toward the camera through the city in the outfit, with one quick cut from a wide tracking shot to a close-up of the details. Golden-hour light, a handheld camera that moves with them.',
      ending: 'The clip ends with the model stopping in front of the camera with a candid laugh, the whole outfit in view.',
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
      hook: 'The clip opens on a package on a doorstep as hands quickly scoop it up.',
      body: 'A quick cut to a table: the hands tear the package open, lift the product out and turn it toward the light. Bright daylight, a handheld phone camera that follows the hands.',
      ending: 'The clip ends with the product held up in front of the open package.',
    },
    {
      id: 'nhieu-don-mot-lan',
      name: 'Nhiều đơn một lần',
      desc: 'Cả chồng đơn về cùng lúc, mở ngay gói có sản phẩm',
      hook: 'The clip opens on a small stack of parcels as the creator picks one out and grins.',
      body: 'The creator rips it open in a few quick moves and lifts the product out as the best find, the other parcels still sealed beside it. Warm room light, a handheld phone camera.',
      ending: 'The clip ends with the creator holding the product up beside the stack of sealed parcels.',
    },
    {
      id: 'toi-gian',
      name: 'Tối giản',
      desc: 'Mở chậm, gọn gàng trên bàn trắng, ánh sáng dịu',
      hook: 'The clip opens on a plain box on a clean white table in soft morning light.',
      body: 'Slow, calm hands lift the lid, fold back the paper and set the product on the table, every move unhurried and tidy. Soft diffused light, a static top-down camera.',
      ending: 'The clip ends on a calm still frame of the product beside its open box.',
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
      desc: 'Một điểm thích và một điểm cần lưu ý',
      hook: 'The clip opens with the creator holding the product up to the camera, its front in view, ready to share an honest take.',
      body: 'The creator points to one thing they love about the product, then to one thing to know before buying, showing each on the product with its front kept toward the camera. Bright daylight, a handheld phone camera at eye level.',
      ending: 'The clip ends with the creator giving the product a confident nod, its front in view.',
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
      desc: 'Trả lời câu hỏi của khách bằng cách khoe sản phẩm',
      hook: 'The clip opens with the creator looking up from their phone, its screen turned away, and turning to the camera.',
      body: "The creator answers a viewer's question by showing the product: the fit, the fabric and how it looks in daylight, in a simple, honest way. Bright daylight, a handheld phone camera at eye level.",
      ending: 'The clip ends with the creator holding the product up and nodding, as if to say it is worth it.',
    },
    {
      id: 'so-voi-do-cu',
      name: 'So với đồ cũ',
      desc: 'Đặt cạnh món cũ đã sờn, chỉ ra chỗ hơn',
      hook: 'The clip opens with the creator holding an old, faded plain garment next to the product.',
      body: 'The creator holds the two side by side and points out the better fabric, colour and finish of the product. Bright, even light, a steady phone camera at chest height.',
      ending: 'The clip ends with the creator tossing the old garment aside and holding the product up with a smile.',
    },
    {
      id: 'thu-size',
      name: 'Thử size',
      desc: 'Mặc lên người, chỉ độ vừa ở vai, eo và độ dài',
      hook: 'The clip opens with the creator already wearing the product, tugging the hem to show the length.',
      body: 'The creator points to how it sits at the shoulders and the waist, then raises the arms and twists to show it moves comfortably. Bright daylight, a handheld phone camera, full body in frame.',
      ending: 'The clip ends with the creator turning slowly from side to side to show the fit, then facing the camera.',
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
    { label: 'Selfie gương', text: 'A model taking a mirror selfie in the outfit in a bright bedroom with natural light, full body, the phone held beside the face so the whole front of the outfit shows, its colours and any print exactly as in the photo.' },
    { label: 'Ảnh quảng cáo', text: "A premium commercial product photo on a softly lit gradient background with a gentle reflection below, the product's shape, colours and printed text unchanged." },
  ],
  try_on: [
    { label: 'Studio', text: "A clean studio backdrop with soft even light, the model's pose unchanged." },
    { label: 'Đường phố', text: "Set the scene on a sunny city street in natural daylight with a softly blurred background, the model's pose unchanged." },
    { label: 'Quán cà phê', text: "Set the scene by the window of a cozy cafe in warm natural light with a softly blurred interior, the model's pose unchanged." },
    { label: 'Công viên', text: "A green park on a sunny day with soft natural light, the model's pose unchanged." },
    { label: 'Nền màu', text: 'The model poses against a bold solid-colour studio backdrop, crisp even light, full body.' },
  ],
  lingerie_try_on: [
    { label: 'Nắng sớm dịu', text: 'Soft, bright, airy morning light from the side, gentle shadows and clean natural skin tones.' },
    { label: 'Ánh sáng studio', text: 'Soft, even studio-style light with gentle shadows and a clean, neutral look.' },
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
