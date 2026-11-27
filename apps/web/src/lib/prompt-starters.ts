// Starter chips under an empty prompt box: a short Vietnamese label, and the text a click puts in the box to edit from. Video, image and try-on
// tools read English best, so their text is English. Create and Marketing Studio start from a prompt template instead (PROMPT_TEMPLATES).
import { vnDay } from './lark-prompt';

export interface Starter {
  label: string;
  text: string;
  /** A Christmas, winter or Black Friday chip: it leads the row from 15 November to 31 December (ICT) and is left out the rest of the year. */
  holiday?: true;
}

/** The chips to show on `now`: the holiday ones first from 15 November to 31 December (ICT), and none of them the rest of the year. */
export function inSeason(list: Starter[], now = new Date()): Starter[] {
  const monthDay = vnDay(now).slice(5);
  return monthDay >= '11-15' ? [...list.filter((s) => s.holiday), ...list.filter((s) => !s.holiday)] : list.filter((s) => !s.holiday);
}

/** A template of a sectioned prompt: a Vietnamese name and one-line description, and the English hook, body and last shot it fills the three sections with. */
export interface PromptTemplate {
  /** A stable lower-case kebab slug, unique across every list: the name of the template's sample clip, `template-<id>.mp4`. */
  id: string;
  name: string;
  desc: string;
  /** Set when the template only works with a particular input photo: one short Vietnamese line, at most 60 characters. */
  needs?: string;
  /** Create's templates only: the product types (PRODUCT_TYPES keys) the motion suits, which the dialog's type chips filter by. Unset: any product. */
  types?: string[];
  hook: string;
  body: string;
  ending: string;
}

/** The clothes among PRODUCT_TYPES, which the garment motions suit. */
const APPAREL = ['tshirt', 'jersey', 'hoodie', 'mask_hoodie', 'hawaiian', 'polo'];

/** The type chips of Create's templates dialog: a few groups of PRODUCT_TYPES, so the row stays short. A template shows under a chip when its `types` meet the chip's. */
export const MOTION_KINDS: { label: string; types: string[] }[] = [
  { label: 'Quần áo', types: APPAREL },
  { label: 'Cốc, tumbler', types: ['mug', 'tumbler'] },
  { label: 'Ornament', types: ['ornament'] },
  { label: 'Tranh, poster', types: ['poster'] },
  { label: 'Chăn', types: ['blanket'] },
  { label: 'Thảm', types: ['rug'] },
  { label: 'Cờ', types: ['flag'] },
  { label: 'Mũ', types: ['cap'] },
  { label: 'Giày', types: ['shoes'] },
  { label: 'Cửa, gara', types: ['garage', 'door', 'curtain'] },
  { label: 'Decal', types: ['decal'] },
  { label: 'Trang sức', types: ['jewelry'] },
];

/** Whether a template suits a chip's product types (an untyped template suits any). */
export const suits = (t: PromptTemplate, types: string[]): boolean => !t.types || t.types.some((x) => types.includes(x));

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
      types: [...APPAREL, 'mug', 'tumbler', 'ornament', 'decal', 'cap', 'jewelry', 'shoes'], // things a hand can pick up
      name: 'Cầm trên tay',
      desc: 'Bàn tay cầm sản phẩm, xoay nhẹ về phía máy quay',
      hook: 'The clip opens as a hand reaches into the frame and takes hold of the product.',
      body: 'A hand picks up the product and turns it gently toward the camera, natural window light.',
      ending: 'The clip ends with the hand holding the product still, facing the camera.',
    },
    {
      id: 'gio-nhe',
      types: [...APPAREL, 'blanket', 'curtain'],
      name: 'Gió nhẹ',
      desc: 'Gió nhẹ lay vải, máy quay đứng yên',
      hook: 'The clip opens as a sudden gust of wind lifts the fabric.',
      body: 'A light breeze moves the fabric while the camera holds steady, warm afternoon light.',
      ending: 'The clip ends as the fabric settles and the frame holds still.',
    },
    {
      id: 'nguoi-mau-buoc-di',
      types: APPAREL,
      name: 'Người mẫu bước đi',
      desc: 'Người mẫu mặc đồ bước về phía máy quay',
      needs: 'Cần ảnh người mẫu mặc đồ',
      hook: 'The clip opens with the model stepping into the frame in one confident stride.',
      body: 'The model walks toward the camera wearing the outfit, smooth tracking shot, golden-hour light.',
      ending: 'The clip ends with the model stopping, turning to the camera and smiling.',
    },
    {
      id: 'treo-moc',
      types: APPAREL,
      name: 'Treo móc',
      desc: 'Áo treo trên móc đung đưa nhẹ, khoe phom và chất vải',
      needs: 'Cần ảnh áo treo trên móc, không có người',
      hook: 'The clip opens as the garment on its hanger swings in a soft arc, the fabric rippling.',
      body: 'The garment sways softly on its hanger and turns a little to each side, its front staying toward the camera as the fabric moves and catches the light. Soft diffused light, static camera.',
      ending: 'The clip ends with the garment settling still, its front facing the camera.',
    },
    {
      id: 'ma-nanh-canh-vo-hinh',
      types: APPAREL,
      name: 'Ma-nơ-canh vô hình',
      desc: 'Đồ dựng phom như có người mặc, xoay nhẹ sang hai bên',
      needs: 'Cần ảnh đồ dựng phom kiểu ma-nơ-canh vô hình',
      hook: 'The clip opens on the outfit standing on its own, shaped as if worn by an invisible body, as it begins to turn.',
      body: 'The hollow outfit turns slowly a little to the left and then to the right, its front always toward the camera, while the camera pushes in gently. Crisp, even studio light that shows the fabric.',
      ending: 'The clip ends on a still front view of the outfit, centred in the frame.',
    },
    {
      id: 'selfie-guong',
      types: APPAREL,
      name: 'Selfie gương',
      desc: 'Người mẫu chụp gương, xoay người khoe dáng đồ',
      needs: 'Cần ảnh người mẫu mặc đồ, chụp selfie trước gương',
      hook: "The clip opens on the model's mirror selfie as they shift their weight and tilt the phone slightly.",
      body: 'The model, wearing the outfit, turns gently from side to side in front of the mirror to show the fit, the phone held steady where it is in the image. Bright natural light.',
      ending: 'The clip ends with the model holding one last mirror pose, the whole outfit in view.',
    },
    {
      id: 'keo-khoa-mat-na',
      types: ['mask_hoodie'],
      name: 'Kéo khoá thành mặt nạ',
      desc: 'Trùm mũ rồi kéo khoá lên mặt: hoodie thành mặt nạ',
      needs: 'Cần ảnh người mẫu mặc hoodie mặt nạ, chưa trùm mũ',
      hook: 'The clip opens on the model exactly as in the photo, as they reach up and pull the hood over their head.',
      body: 'With one hand they take the zip pull at the chest and draw it slowly all the way up over the chin and face, so the hood closes into a full mask with only the eye opening left, the print on the hood lining up as it closes. Static camera at chest height, the front of the hoodie toward the camera.',
      ending: 'The clip ends with the masked model standing still and staring straight into the camera.',
    },
    // Motion packs: one or two motions for each kind of product the company sells besides clothes, found by the dialog's type chips.
    {
      id: 'coc-boc-hoi',
      name: 'Cốc bốc hơi',
      desc: 'Hơi nóng bốc lên, máy quay lướt quanh cốc khoe hình in',
      types: ['mug'],
      hook: 'The clip opens on the mug from the photo on a wooden table as a thin curl of steam begins to rise from it.',
      body: 'Steam rises gently from the hot drink while the camera arcs slowly around the mug, the print staying sharp, readable and exactly as in the photo. Warm morning window light, a softly blurred kitchen behind.',
      ending: 'The clip ends on a still front view of the mug with its print facing the camera.',
    },
    {
      id: 'rot-do-uong',
      name: 'Rót đồ uống',
      desc: 'Rót cà phê vào cốc, cận cảnh hình in',
      types: ['mug'],
      hook: 'The clip opens as a stream of hot coffee starts pouring into the mug from the photo.',
      body: 'Coffee pours into the mug and settles with a little swirl while the camera holds a steady close-up on its side, the print unchanged and in focus. Soft cafe light.',
      ending: 'The clip ends with the filled mug standing still, its print toward the camera.',
    },
    {
      id: 'binh-giu-nhiet-ngoai-troi',
      name: 'Tumbler ngoài trời',
      desc: 'Máy quay lướt quanh tumbler trên bàn picnic nắng',
      types: ['tumbler'],
      hook: 'The clip opens on the tumbler from the photo on a picnic table as sunlight glints off its lid.',
      body: 'The camera arcs slowly around the tumbler while tiny beads of condensation catch the light, a sunny park softly blurred behind. The print stays exactly as in the photo.',
      ending: 'The clip ends on a still front view of the tumbler with its print facing the camera.',
    },
    {
      id: 'ornament-cay-thong',
      name: 'Ornament trên cây thông',
      desc: 'Ornament đung đưa trên cành thông, đèn lấp lánh phía sau',
      types: ['ornament'],
      hook: 'The clip opens on the ornament from the photo hanging from a pine branch as fairy lights begin to twinkle behind it.',
      body: 'The ornament sways gently on its ribbon while the camera pushes in slowly, warm fairy lights twinkling in a soft blur behind. The design on the ornament stays exactly as in the photo.',
      ending: 'The clip ends on a still close-up of the ornament glowing in the warm light.',
    },
    {
      id: 'tranh-tren-tuong',
      name: 'Tranh trên tường',
      desc: 'Đẩy chậm vào bức tranh treo trong phòng khách sáng',
      types: ['poster'],
      hook: 'The clip opens on a bright, tidy living room with the framed print from the photo hanging on the wall.',
      body: 'A slow, steady push-in toward the print on the wall while soft daylight drifts across the room. The artwork stays flat and exactly as in the photo.',
      ending: 'The clip ends on the print filling most of the frame, seen straight on.',
    },
    {
      id: 'chan-phu-sofa',
      name: 'Chăn phủ sofa',
      desc: 'Chăn mở ra rồi phủ xuống sofa, khoe trọn hình in',
      types: ['blanket'],
      hook: 'The clip opens as the folded blanket from the photo is lifted above a cosy sofa.',
      body: 'The blanket unfolds and drapes softly over the sofa, its print spreading out flat and readable. Warm lamp light in a calm living room.',
      ending: 'The clip ends on the blanket lying smoothly over the sofa with its whole print in view.',
    },
    {
      id: 'tham-nhin-tu-tren',
      name: 'Thảm nhìn từ trên',
      desc: 'Máy quay xoay chậm từ trên cao xuống tấm thảm',
      types: ['rug'],
      hook: 'The clip opens on a top-down view of the rug from the photo lying on a light wooden floor.',
      body: 'The camera rotates slowly overhead and lowers a little toward the rug, soft daylight from a window. The pattern stays flat, sharp and exactly as in the photo.',
      ending: 'The clip ends on a still top-down view of the whole rug.',
    },
    {
      id: 'co-bay-trong-gio',
      name: 'Cờ bay trong gió',
      desc: 'Cờ tung bay trên cột dưới trời xanh',
      types: ['flag'],
      hook: 'The clip opens on the flag from the photo on a pole as a breeze begins to lift it.',
      body: 'The flag ripples steadily in the wind against a clear blue sky, its design readable through the folds. Bright sunlight and a slow low-angle camera.',
      ending: 'The clip ends with the flag spread wide in the wind, its design facing the camera.',
    },
    {
      id: 'mu-xoay-tren-de',
      name: 'Mũ xoay trên đế',
      desc: 'Mũ xoay chậm trên đế, khoe mặt trước và vành',
      types: ['cap'],
      hook: 'The clip opens on the cap from the photo on a small stand as a soft spotlight comes up.',
      body: 'The cap turns slowly on its stand to show the front panel, the side and the brim, then returns to the front. The embroidery or print stays exactly as in the photo, clean studio light.',
      ending: 'The clip ends on a still front view of the cap.',
    },
    {
      id: 'giay-buoc-tren-pho',
      name: 'Giày bước trên phố',
      desc: 'Máy quay sát đất theo đôi giày bước trên vỉa hè',
      types: ['shoes'],
      hook: 'The clip opens on a low close-up of the shoes from the photo as the first step lands on the pavement.',
      body: 'A low tracking shot follows the shoes for a few steps along a sunny pavement. The design on the shoes stays exactly as in the photo, natural daylight.',
      ending: 'The clip ends with the shoes standing still side by side, toes toward the camera.',
    },
    {
      id: 'cua-nha-in-hinh',
      name: 'Cửa nhà in hình',
      desc: 'Máy quay tiến dần tới cửa nhà phủ cover in hình',
      types: ['garage', 'door'],
      hook: 'The clip opens on a wide shot of a house front with the printed cover from the photo on its door.',
      body: 'The camera glides slowly up the driveway toward the door, late-afternoon sun on the house. The printed design stays flat and exactly as in the photo.',
      ending: 'The clip ends on the door filling the frame, its design seen straight on.',
    },
    {
      id: 'dan-decal',
      name: 'Dán decal',
      desc: 'Bàn tay vuốt decal lên nắp laptop rồi lột lớp đế',
      types: ['decal'],
      hook: 'The clip opens as a hand lays the sticker from the photo onto a clean laptop lid.',
      body: 'The hand smooths the sticker down with a thumb and peels away the clear transfer film. The design stays exactly as in the photo, bright desk light.',
      ending: 'The clip ends on a still close-up of the sticker on the laptop.',
    },
    {
      id: 'trang-suc-lap-lanh',
      name: 'Trang sức lấp lánh',
      desc: 'Cận cảnh trang sức xoay chậm, ánh sáng lấp lánh',
      types: ['jewelry'],
      hook: 'The clip opens on a macro shot of the jewelry from the photo as a glint of light runs across it.',
      body: 'The jewelry turns slowly on a velvet stand while small sparkles of light play across its surface, its design exactly as in the photo, a shallow depth of field and a dark, soft background.',
      ending: 'The clip ends on a still close-up of the jewelry catching the light.',
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
    {
      id: 'chi-la-hoodie',
      name: 'Chỉ là cái hoodie',
      desc: 'Trend TikTok: thản nhiên kéo khoá, hoodie thành mặt nạ',
      needs: 'Cần ảnh hoodie mặt nạ khoá kéo',
      hook: 'The clip opens with the creator in the hoodie, hood down, giving the camera a casual shrug.',
      body: 'Filmed like a real phone video at night outside a brightly lit stadium: the creator pulls the hood up, then zips the hoodie all the way up over the face so it becomes a full mask with only the eye opening left, the print on the hood lining up. A steady phone camera at eye level.',
      ending: 'The clip ends with the masked creator tilting their head at the camera, the whole front of the hoodie in view.',
    },
    {
      id: 'cun-nha-minh',
      name: 'Cún nhà mình',
      desc: 'Mặc áo in ảnh cún, rồi chú chó chạy tới bên cạnh',
      needs: 'Cần ảnh áo in ảnh thú cưng',
      hook: 'The clip opens with the creator wearing the custom pet shirt, pointing down at the printed dog photo and its name.',
      body: 'Their dog, the same breed as the one on the print, trots into the frame and jumps up beside them, and the creator looks from the print to the dog and laughs. A bright, cosy living room, a handheld phone camera at chest height.',
      ending: 'The clip ends with the creator kneeling to hug the dog, the front of the shirt and its print in full view.',
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
    { label: 'Phòng Giáng sinh', holiday: true, text: 'The product in a cosy living room decorated for Christmas, a lit tree with warm fairy lights and wrapped presents softly blurred behind, warm evening light, its colours, print and any text exactly as in the photo.' },
    { label: 'Hộp quà', holiday: true, text: 'The product as a gift beside an open kraft gift box with tissue paper, a red satin ribbon and a blank tag on a white table, soft daylight, top-down, its colours, print and any text exactly as in the photo.' },
    { label: 'Black Friday', holiday: true, text: 'A bold premium product photo for a Black Friday sale: the product centred on a matte black backdrop under a soft spotlight with a subtle red rim light, no added text, its colours, print and any text exactly as in the photo.' },
    { label: 'Phố tuyết', holiday: true, text: 'A model wearing the outfit on a snowy street at dusk, warm shop lights and gently falling snow behind, full-body shot, the colours and print of the outfit exactly as in the photo.' },
    { label: 'Studio nền trắng', text: 'The product on a seamless white studio background, soft even light, centered, high detail.' },
    { label: 'Lifestyle', text: 'The product in a bright, cozy living room, natural window light, shallow depth of field.' },
    { label: 'Ngoài phố', text: 'A model wearing the outfit on a sunny city street, golden-hour light, full-body shot.' },
    { label: 'Flat lay', text: 'A top-down flat lay of the product with a few matching accessories on a linen surface.' },
    { label: 'Ma-nơ-canh vô hình', text: 'The garment shaped as if worn by an invisible body, front view on a seamless light grey background, crisp studio light, the fabric and print exactly as they are.' },
    { label: 'Treo móc', text: 'The garment on a wooden hanger against a clean plaster wall, soft window light, straight-on view.' },
    { label: 'Selfie gương', text: 'A model taking a mirror selfie in the outfit in a bright bedroom with natural light, full body, the phone held beside the face so the whole front of the outfit shows, its colours and any print exactly as in the photo.' },
    { label: 'Ảnh quảng cáo', text: "A premium commercial product photo on a softly lit gradient background with a gentle reflection below, the product's shape, colours and printed text unchanged." },
    { label: 'Sân vận động đêm', text: 'The garment on its own, shaped as if worn by an invisible body, standing on a football field at night under bright stadium floodlights, the crowd in the stands softly blurred behind, its colours and print exactly as in the photo.' },
    // A video model keeps an all-over print better when it has seen the garment from several sides: this sheet is one photo of all of them.
    { label: 'Ảnh nhiều góc', text: 'A product reference sheet on a plain light grey background: the same garment seen from the front, the back, the left side and the right side, plus a close-up of its main print, each view evenly lit and the same size, its colours and print exactly as in the photo.' },
    // The pet pack (2026-11-19): personalised pet products, whose pet photo, name and text must stay exactly as designed.
    { label: 'Thảm tròn Giáng sinh', text: 'The round rug from the photo lying flat on the wooden floor of a cosy living room decorated for Christmas, a lit tree, wrapped presents and a fireplace softly blurred behind, warm evening light, its printed design, the dog in it and any name exactly as in the photo.' },
    { label: 'Ornament thú cưng', text: 'The glass ornament from the photo hanging from a branch of a decorated Christmas tree, warm fairy lights and baubles softly blurred behind, soft reflections on the glass, the pet photo and the name on it exactly as in the photo.' },
    { label: 'Áo in ảnh thú cưng', text: 'A smiling person wearing the shirt from the photo sits on a sofa in a bright living room beside a dog of the breed printed on it, soft natural light, the printed pet photo, the name and any text exactly as in the photo.' },
    { label: 'Tưởng nhớ thú cưng', text: 'The memorial ornament from the photo resting on a soft cream knit blanket beside a lit candle, a dog collar and a few dried flowers, warm gentle light and a calm mood, the pet photo, the name and any dates exactly as in the photo.' },
  ],
  try_on: [
    { label: 'Giáng sinh', holiday: true, text: "Set the scene in a cosy living room decorated for Christmas, a lit tree and warm fairy lights softly blurred behind, the model's pose unchanged." },
    { label: 'Phố tuyết', holiday: true, text: "Set the scene on a snowy city street at dusk with warm shop lights and gently falling snow, the model's pose unchanged." },
    { label: 'Studio', text: "A clean studio backdrop with soft even light, the model's pose unchanged." },
    { label: 'Đường phố', text: "Set the scene on a sunny city street in natural daylight with a softly blurred background, the model's pose unchanged." },
    { label: 'Quán cà phê', text: "Set the scene by the window of a cozy cafe in warm natural light with a softly blurred interior, the model's pose unchanged." },
    { label: 'Công viên', text: "A green park on a sunny day with soft natural light, the model's pose unchanged." },
    { label: 'Nền màu', text: "A bold solid-colour studio backdrop with crisp even light, the model's pose unchanged." },
    { label: 'Sân vận động', text: "Set the scene on a football field at night under bright stadium floodlights with the stands softly blurred behind, the model's pose unchanged." },
  ],
  lingerie_try_on: [
    { label: 'Nắng sớm dịu', text: 'Soft, bright, airy morning light from the side, gentle shadows and clean natural skin tones.' },
    { label: 'Ánh sáng studio', text: 'Soft, even studio-style light with gentle shadows and a clean, neutral look.' },
  ],
  background_changer: [
    { label: 'Cây thông Noel', holiday: true, text: 'a cosy living room with a lit Christmas tree and wrapped presents softly blurred behind' },
    { label: 'Tuyết trắng', holiday: true, text: 'fresh white snow with a few pine branches in soft winter daylight' },
    { label: 'Nền Black Friday', holiday: true, text: 'a matte black backdrop under a soft spotlight with a subtle red rim light' },
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
