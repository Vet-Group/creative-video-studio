// The About tabs as data: one typed page per tool, rendered by components/About.tsx. The section order follows the reference site's About pages;
// every fact (models, limits, prices in USD, the Library) is this app's own. Media fields name samples in the bucket (`<name>.mp4` and/or `<name>.jpg`);
// a missing sample keeps its slot as the empty stripes, so the layout does not move when it is uploaded.
import { HOOKS, LOCATIONS } from './marketing';

export interface AboutCard {
  title: string;
  text: string;
  /** A small pill above the title ("Don't", "6 models", "1024px"). */
  tag?: string;
  media?: string;
  /** Short spec lines under the text (a model card's durations, resolutions...). */
  specs?: string[];
  /** A link closing the text, [label, href], as the live cards' "Open UGC Try-On." */
  link?: [string, string];
}
export interface AboutStep {
  title: string;
  text: string;
  media?: string;
}
/** A paragraph, or one of the section's blocks. `links` items are [label, href, text]; `table` rows start with the header row. */
export type AboutBlock =
  | string
  | { cards: AboutCard[]; cols?: 2 | 3 }
  | { steps: AboutStep[] }
  | { pairs: [string, string][]; labels: [string, string] }
  | { table: string[][] }
  | { list: string[] }
  | { links: [string, string, string][] }
  | { ratios: [string, string][] }
  | { example: { label: string; text: string; media?: string } }
  | { faq: [string, string][] };
export interface AboutSection {
  kicker?: string;
  title: string;
  lead?: string;
  blocks?: AboutBlock[];
}
export interface AboutPage {
  title: string;
  lead?: string;
  sections: AboutSection[];
}

const PRIVACY: [string, string] = [
  'Ảnh tải lên có riêng tư không?',
  'Ảnh tải lên và kết quả nằm trong kho lưu trữ của công ty, chỉ người đã đăng nhập vào ứng dụng mới xem được. Ảnh được gửi tới nhà cung cấp mô hình để tạo kết quả. Thư viện dùng chung trong công ty, nên đồng nghiệp xem được kết quả của bạn.',
];
const RIGHTS = 'Chỉ dùng ảnh mà công ty có quyền sử dụng, và chỉ với người đã đồng ý.';

/** Create Videos. */
const create: AboutPage = {
  title: 'Tạo video sản phẩm từ ảnh',
  lead: 'Đưa vào một ảnh sản phẩm và một câu tả điều sẽ xảy ra, bạn nhận lại một video. Trang này biến ảnh sản phẩm thành video mà không cần quay. Phần dưới giải thích cách tạo video hoạt động, mỗi họ mô hình mạnh ở đâu và cách viết mô tả chuyển động để ra đúng clip bạn hình dung.',
  sections: [
    {
      kicker: 'Vì sao quan trọng',
      title: 'Vì sao nên tạo video thay vì quay?',
      lead: 'Video hiệu quả hơn ảnh tĩnh ở gần như mọi nơi, nhưng quay theo cách truyền thống chưa bao giờ theo kịp cả một danh mục sản phẩm. Tạo bằng AI lấp khoảng trống đó: một video sản phẩm không còn là hạng mục phải xin duyệt mà là thứ bạn làm xong trong lúc viết một câu.',
      blocks: [
        {
          cards: [
            { title: 'Không tốn công sản xuất', text: 'Một buổi quay cần đạo diễn, người quay, ánh sáng và người dựng, và cần lại tất cả cho sản phẩm tiếp theo. Video tạo bằng AI chỉ cần một ảnh, một câu mô tả và chi phí mô hình ghi sẵn trên nút Run.' },
            { title: 'Tính bằng phút, không phải ngày', text: 'Quay, dựng và xuất file biến một video sản phẩm thành việc của nhiều ngày. Ở đây clip về tab Lịch sử trong lúc bạn chuẩn bị clip tiếp theo.' },
            { title: 'Nội dung mới khi cần', text: 'Nền tảng quảng cáo ưu tiên nội dung mới và phạt nội dung đã cũ. Tạo nhiều biến thể cho cùng một sản phẩm để thử A/B hay chạy theo mùa mà không phải đặt lịch quay.' },
            { title: 'Video cho mọi sản phẩm', text: 'Thường chỉ sản phẩm chủ lực mới có video. Tạo bằng AI giúp cả những sản phẩm ít bán, vốn chỉ có ảnh tĩnh, cũng có video.' },
          ],
        },
      ],
    },
    {
      kicker: 'Từng bước',
      title: 'Tạo video bằng AI hoạt động thế nào?',
      lead: 'Mỗi video bắt đầu từ ảnh và một mô tả hoặc một mẫu chuyển động. Với mô hình ảnh-thành-video, ảnh đầu tiên trở thành khung hình mở đầu và AI tạo chuyển động nối tiếp. Mô hình bạn chọn quyết định số ảnh được nhận, thời lượng và tỉ lệ có thể chọn.',
      blocks: [
        {
          steps: [
            { title: 'Tải ảnh mở đầu', text: 'Thả ảnh bạn muốn làm động: ảnh sản phẩm, ảnh người mẫu hay một kết quả trước đó. Ảnh đầu tiên là ảnh chính. Mô hình tham chiếu nhận tối đa 4 ảnh để dựng cảnh từ đó; mô hình ảnh-thành-video chỉ dùng ảnh đầu tiên.', media: 'about-create-step-1' },
            { title: 'Mô tả chuyển động', text: 'Chọn một mẫu chuyển động công ty đã thử, hoặc tự viết điều sẽ xảy ra tiếp theo. Ảnh đã quyết định sản phẩm, trang phục và bối cảnh, nên mô tả chỉ cần nói về chuyển động. Viết bằng tiếng Anh thường cho kết quả ổn định hơn.', media: 'about-create-step-2' },
            { title: 'Chọn thông số và chạy', text: 'Chọn mô hình, rồi thời lượng và tỉ lệ mà mô hình đó hỗ trợ; độ phân giải đi theo mô hình. Nút Run ghi chi phí ước tính bằng USD trước khi bạn bấm, và job nằm trong tab Lịch sử cho đến khi clip xong.', media: 'about-create-step-3' },
          ],
        },
      ],
    },
    {
      kicker: 'Trả lời nhanh',
      title: 'Cần mấy bước để có video từ một ảnh sản phẩm?',
      blocks: [
        'Ba bước. Tải ảnh sản phẩm làm khung mở đầu, chọn mẫu hoặc viết một dòng tả chuyển động, rồi chọn mô hình và bấm Run. Không có timeline, không keyframe, không phần mềm dựng nào ở giữa.',
        'Chính vì vậy cách làm này hấp dẫn: giữa lúc tải ảnh và lúc có clip không còn bước nào khác. Clip nằm sẵn trong Thư viện của công ty, xem và tải xuống được ngay.',
      ],
    },
    {
      kicker: 'Kết quả thực tế',
      title: 'Từ ảnh tĩnh thành video',
      lead: 'Mỗi ví dụ bên dưới bắt đầu từ đúng một ảnh bên trái. Không quay, không dựng cảnh, không ê-kíp. Clip bên cạnh là kết quả của một lần chạy.',
      blocks: [
        {
          labels: ['Khung mở đầu', 'Video tạo ra'],
          pairs: [
            ['about-create-frame-1', 'example-2'],
            ['about-create-frame-2', 'example-3'],
          ],
        },
      ],
    },
    {
      kicker: 'Phạm vi',
      title: 'Bạn có thể tạo gì với video AI?',
      lead: 'Một trang lo được mọi kiểu nội dung chuyển động mà một thương hiệu thời trang cần, từ một vòng lặp sản phẩm nhẹ nhàng đến một clip chiến dịch.',
      blocks: [
        {
          cols: 3,
          cards: [
            { title: 'Video sản phẩm', text: 'Làm sống động ảnh sản phẩm hoặc ảnh người mẫu cho trang sản phẩm: vải bay, người mẫu xoay, trang phục chuyển động.' },
            { title: 'Clip Reels và TikTok', text: 'Video dọc 9:16 cho Stories, Reels và TikTok, dựng từ chính ảnh bạn đang dùng trên trang.' },
            { title: 'Nội dung quảng cáo', text: 'Biến thể chuyển động mới cho chiến dịch trả phí: đổi chuyển động, nhịp độ hay mẫu mà không cần quay lại.' },
            { title: 'Clip chiến dịch', text: 'Clip dài tới 30 giây với chuyển máy, trên các mô hình có thời lượng dài như Seedance 2.5 hay FLUX 3.' },
            { title: 'Dựng cảnh từ nhiều ảnh', text: 'Với mô hình tham chiếu, đưa người mẫu, sản phẩm và bối cảnh vào tối đa 4 ảnh để AI dựng một cảnh mới có đủ các yếu tố đó.' },
            { title: 'Mẫu chuyển động có sẵn', text: 'Các mẫu công ty đã thử như Xoay một vòng, Sải bước catwalk hay Hé lộ trang phục: chọn một mẫu là có ngay câu lệnh đã được kiểm chứng.' },
          ],
        },
      ],
    },
    {
      kicker: 'Cho thời trang',
      title: 'Video AI cho thương hiệu quần áo',
      lead: 'Quần áo có một vấn đề mà ảnh tĩnh không giải được: vải chuyển động. Váy thun rủ khác áo blazer đứng form, và khách đang so hai món phải tự hình dung chuyển động từ một tấm ảnh phẳng. Làm video từ chính ảnh trang phục bạn đã chụp giúp lấp khoảng trống đó.',
      blocks: [
        {
          cols: 3,
          cards: [
            { title: 'Vải ra dáng vải', text: 'Gấu áo khoác đung đưa khi người mẫu xoay, chân váy lụa bắt gió, áo len chùng xuống khi người mẫu đổi tư thế. Các mô hình Kling mạnh về vật lý nên độ nặng và độ rủ của vải trông đúng.' },
            { title: 'Một ảnh, nhiều định dạng', text: 'Cùng một ảnh gốc cho ra bản vuông 1:1 cho trang sản phẩm và bản dọc 9:16 cho Reels. Các bản khớp nhau vì đều đi ra từ một khung hình.' },
            { title: 'Quảng cáo luôn mới', text: 'Quảng cáo mạng xã hội tiêu hao nội dung rất nhanh. Chạy lại cùng trang phục với chuyển động và nhịp khác cho bạn biến thể mới mà không cần chụp lại.' },
          ],
        },
        'Đường ngắn nhất cho thương hiệu quần áo: tạo ảnh người mẫu mặc đồ ở trang Thử đồ, rồi làm động ảnh đó ở đây. Trang phục không cần rời giá treo, và video không cần máy quay.',
      ],
    },
    {
      kicker: 'Mô hình tạo',
      title: 'Có những mô hình video nào?',
      lead: 'Menu Mô hình quyết định công cụ nào tạo video. Danh mục có hơn 20 mô hình, chia theo họ có chung phong cách và thế mạnh. Menu chỉ hiện các mô hình Admin đã bật, xếp theo nhà cung cấp và kèm điểm đề xuất của công ty.',
      blocks: [
        {
          cards: [
            {
              tag: '5 mô hình',
              title: 'Kling',
              media: 'model-kling-o3-pro',
              text: 'Chuyển động chân thực theo vật lý. Kling O3 Pro và Kling o1 dựng cảnh từ tối đa 4 ảnh tham chiếu, Kling 3.0 Pro là bản chủ lực với clip 3–15 giây, còn Kling 2.6 và 2.5 Turbo chạy nhanh các clip 5 hoặc 10 giây.',
              specs: ['Thời lượng: 5–10 giây (O3 Pro) · 3–15 giây (3.0 Pro) · 5 hoặc 10 giây (2.6, 2.5 Turbo, o1)', 'Độ phân giải: 1080p', 'Tỉ lệ: 9:16, 1:1', 'Ảnh tham chiếu: tối đa 4 (O3 Pro, o1)'],
            },
            {
              tag: '6 mô hình',
              title: 'Seedance',
              media: 'model-seedance-2-5-image',
              text: 'Kể chuyện điện ảnh với dải thời lượng rộng nhất. Seedance 2.5 kéo tới 30 giây, Seedance 2.5 Reference dựng clip 30 giây từ tối đa 4 ảnh. Seedance 2.0 và 2.0 Reference tới 15 giây, còn 1.5 Pro và 1.0 Pro là lựa chọn tiết kiệm.',
              specs: ['Thời lượng: 4–30 giây (2.5, 2.5 Reference) · 4–15 giây (2.0) · 4–12 giây (1.5 Pro) · 3–12 giây (1.0 Pro)', 'Độ phân giải: 720p (1.0 Pro: 1080p)', 'Tỉ lệ: 9:16, 1:1', 'Ảnh tham chiếu: tối đa 4 (bản Reference)'],
            },
            {
              tag: '2 mô hình',
              title: 'FLUX 3',
              text: 'Mô hình video của Black Forest Labs, clip 5–20 giây ở 1080p. FLUX 3 và FLUX 3 Reference đều làm động một ảnh của bạn theo phong cách điện ảnh.',
              specs: ['Thời lượng: 5–20 giây', 'Độ phân giải: 1080p', 'Tỉ lệ: 9:16, 1:1', 'Ảnh: 1'],
            },
            {
              tag: 'Thời lượng cố định',
              title: 'Google VEO 3.1',
              text: 'Mô hình điện ảnh của Google. Mỗi lần chạy trả về một clip 8 giây trau chuốt, dựng từ ảnh của bạn.',
              specs: ['Thời lượng: 8 giây (cố định)', 'Độ phân giải: 720p', 'Tỉ lệ: 9:16'],
            },
            {
              tag: '2 mô hình',
              title: 'Gemini Omni Flash',
              media: 'model-gemini-omni-flash',
              text: 'Mô hình nhanh của Google, bám sát mô tả, thời lượng linh hoạt 3–10 giây. Bản thường làm động một ảnh, bản Reference dựng cảnh từ tối đa 4 ảnh.',
              specs: ['Thời lượng: 3–10 giây', 'Độ phân giải: 720p', 'Tỉ lệ: 9:16', 'Ảnh tham chiếu: tối đa 4 (Reference)'],
            },
            {
              tag: '2 mô hình',
              title: 'Grok Imagine',
              text: 'Mô hình của xAI với clip từ 1 đến 15 giây. Grok Imagine 1.5 làm động một ảnh, bản Reference nhận tối đa 4 ảnh.',
              specs: ['Thời lượng: 1–15 giây (1.5) · 1–10 giây (Reference)', 'Độ phân giải: 720p', 'Tỉ lệ: 9:16, 1:1', 'Ảnh tham chiếu: tối đa 4 (Reference)'],
            },
            {
              tag: '2 mô hình',
              title: 'WAN',
              text: 'Mô hình mã nguồn mở của Alibaba. WAN 2.7 cho clip 2–15 giây, WAN 2.7 Reference dựng cảnh từ tối đa 4 ảnh.',
              specs: ['Thời lượng: 2–15 giây (2.7) · 2–10 giây (Reference)', 'Độ phân giải: 720p', 'Tỉ lệ: 9:16, 1:1', 'Ảnh tham chiếu: tối đa 4 (Reference)'],
            },
            {
              tag: '3 mô hình',
              title: 'Minimax',
              text: 'Minimax H3 Max là bản chủ lực, clip 5–15 giây ở 768p; H3 Max Reference dựng cảnh từ tối đa 4 ảnh. Hailuo 2.3 Pro là đường nhanh nhất tới một clip 1080p sắc nét: một ảnh vào, video 6 giây ra.',
              specs: ['Thời lượng: 5–15 giây (H3 Max) · 6 giây cố định (Hailuo 2.3 Pro)', 'Độ phân giải: 768p (H3 Max) · 1080p (Hailuo)', 'Tỉ lệ: 9:16, 1:1', 'Ảnh tham chiếu: tối đa 4 (H3 Max Reference)'],
            },
          ],
        },
        'Cách làm nhiều người chọn: thử ngắn và rẻ trước, 5–6 giây trên một mô hình giá thấp, cho đến khi chuyển động ổn, rồi chạy lại câu mô tả đó trên mô hình và thời lượng cuối cùng. Điểm và nhãn Đề xuất trong menu đến từ đánh giá Đạt/Không đạt của công ty.',
      ],
    },
    {
      kicker: 'Âm thanh',
      title: 'Video có tiếng không?',
      blocks: [
        'Có. Công tắc Tạo âm thanh bật sẵn, như trên Fash: với mô hình tạo được âm thanh, clip có tiếng gốc, gồm âm thanh không khí, tiếng động và lời nói khi mô tả yêu cầu. Giá ghi trên nút Tạo video đã tính âm thanh; tắt công tắc để có clip im lặng.',
        'Các mô hình có âm thanh: Kling O3 Pro, Kling 3.0 Pro, Kling 2.6 Pro, Veo 3.1, Seedance 1.5 Pro, Seedance 2.0, Seedance 2.5 và FLUX 3. Với Kling, Veo và Seedance 1.5, âm thanh làm giá mỗi giây cao hơn (Kling O3 Pro khoảng một phần tư, Veo 3.1 gấp đôi); Seedance 2.0, 2.5 và FLUX 3 giữ nguyên giá. Mô hình không tạo được âm thanh thì công tắc ở Tắt và không bấm được.',
        'Cần giọng thương hiệu hay nhạc riêng? Tắt âm thanh, tải clip xuống và lồng tiếng trong phần mềm dựng.',
      ],
    },
    {
      kicker: 'Thời lượng',
      title: 'Video nên dài bao lâu?',
      lead: 'Thời lượng là đòn bẩy lớn nhất lên cả chi phí lẫn cách kể chuyện, nên hãy chọn theo nơi video sẽ phát thay vì mặc định chọn mức tối đa.',
      blocks: [
        {
          cols: 3,
          cards: [
            { tag: 'Vòng lặp ngắn', title: '2–5 giây', text: 'Sản phẩm xoay, vải lay nhẹ và vòng lặp cho trang sản phẩm hay ảnh đại diện. Đủ rẻ để thử thoải mái.' },
            { tag: 'Điểm cân bằng', title: '6–10 giây', text: 'Độ dài chuẩn cho quảng cáo, Reels và video trang sản phẩm. Đủ cho một chuyển động rõ ràng và một nhịp dừng.' },
            { tag: 'Kể chuyện', title: '10–30 giây', text: 'Đi một vòng, chuyển máy, clip chiến dịch ngắn. Kling 3.0 Pro, Seedance 2.0, WAN 2.7, Grok Imagine 1.5 và Minimax H3 Max tới 15 giây, FLUX 3 tới 20 và Seedance 2.5 tới 30.' },
          ],
        },
        'Mọi mô hình tính tiền theo giây, nên mỗi giây thêm đều tốn thêm. Hai mô hình có thời lượng cố định: Google VEO 3.1 luôn tạo 8 giây và Minimax Hailuo 2.3 Pro luôn tạo 6 giây. Mô hình không có thời lượng đang chọn nằm cuối menu và không chọn được.',
      ],
    },
    {
      kicker: 'Khung hình',
      title: 'Nên chọn tỉ lệ khung hình nào?',
      lead: 'Tỉ lệ quyết định hình dạng video. Hãy chọn theo nền tảng sẽ đăng, vì cắt một video đã xong là cắt mất phần chuyển động bạn đã trả tiền.',
      blocks: [
        {
          ratios: [
            ['9:16', 'Reels, TikTok, Stories và quảng cáo dọc'],
            ['1:1', 'Bài đăng trên bảng tin và ô sản phẩm trên sàn'],
          ],
        },
        'Mọi mô hình video đều có 9:16; Google VEO 3.1 và Gemini Omni Flash chỉ có 9:16, các mô hình còn lại có thêm 1:1. Với mô hình ảnh-thành-video, ảnh mở đầu được cắt theo tỉ lệ đã chọn, nên hãy để sản phẩm gần giữa ảnh.',
      ],
    },
    {
      kicker: 'Nền tảng',
      title: 'Video có tự đổi cỡ cho Reels và TikTok không?',
      blocks: [
        'Không, và đó là chủ ý. Bạn chọn tỉ lệ trước khi chạy, và mọi mô hình đều có 9:16. Không có gì tự đổi cỡ sau đó, vì cắt một video đã xong là bỏ đi một phần chuyển động.',
        'Tạo bản thứ hai cho nền tảng thứ hai tốn thêm một lần chạy. Đổi lại, mỗi bản được dựng cho đúng khung của nó thay vì bị ép vào, điều quan trọng nhất với video dọc, nơi một bản cắt từ khung khác dễ cắt mất chân người mẫu.',
      ],
    },
    {
      kicker: 'Nơi đăng',
      title: 'Video sản phẩm AI dùng được ở đâu?',
      lead: 'Video cho bán hàng online phải phục vụ nhiều vị trí cùng lúc, và mỗi vị trí cần hình dạng và độ dài khác nhau. Tạo đúng cho nơi đăng tốt hơn cắt cho vừa, nên hãy quyết định clip sẽ đi đâu trước khi chạy.',
      blocks: [
        {
          table: [
            ['Vị trí', 'Nên tạo gì', 'Tỉ lệ', 'Độ dài'],
            ['Quảng cáo Reels và TikTok', 'Một chuyển động rõ, gây chú ý ngay giây đầu', '9:16', '6–10 giây'],
            ['Bảng tin Instagram, Facebook', 'Vòng lặp xem hiểu cả khi tắt tiếng', '1:1', '3–6 giây'],
            ['Trang sản phẩm', 'Chuyển động nhẹ, khoe chất vải và form dáng', '1:1', '2–5 giây'],
            ['Email marketing', 'Vòng lặp ngắn với khung hình đầu đẹp', '1:1', '2–5 giây'],
            ['Video sản phẩm trên sàn', 'Video dọc giới thiệu sản phẩm', '9:16', '6–15 giây'],
          ],
        },
        'Email là trường hợp khó. Nhiều ứng dụng email không phát video, nên khung hình đầu là thứ phần lớn người nhận sẽ thấy. Hãy chọn ảnh mở đầu đẹp cả khi đứng yên, và gắn đường dẫn tới clip thay vì trông vào việc video tự phát.',
      ],
    },
    {
      kicker: 'Quy trình bán hàng',
      title: 'Đưa video AI lên cửa hàng online thế nào?',
      blocks: [
        'Giống như đưa ảnh sản phẩm lên: tạo clip, tải xuống từ Thư viện, rồi tải lên bằng trình quản lý media của nền tảng. Ứng dụng không kết nối trực tiếp với Shopify hay sàn nào, nên không có gì để cài, cấp quyền hay đồng bộ.',
        'Quy trình gồm bốn bước: tạo bản 1:1 cho bộ ảnh sản phẩm, tải file từ Thư viện, đặt vào ô media của sản phẩm cạnh các ảnh, rồi dùng lại bản 9:16 cho quảng cáo mạng xã hội. Ô Cửa hàng/Thương hiệu trên form gắn clip với cửa hàng hoặc thương hiệu bạn chọn.',
        'Cách này dùng được trên Shopify, WooCommerce, Shopee, TikTok Shop, Etsy, Amazon và mọi nơi nhận file video, vì không bước nào phụ thuộc nền tảng. Chỉ dung lượng và tỉ lệ được nhận là khác nhau, và mỗi nền tảng tự ghi rõ điều đó.',
      ],
    },
    {
      kicker: 'Độ phân giải',
      title: 'Video được tạo ở độ phân giải nào?',
      lead: 'Độ phân giải quyết định kích thước điểm ảnh của clip. Ở đây mỗi mô hình có một độ phân giải cố định, nên ô Độ phân giải trên form chỉ cho biết mô hình đang chọn xuất ra cỡ nào.',
      blocks: [
        {
          cols: 3,
          cards: [
            { tag: 'HD', title: '720p', text: 'Bảng tin mạng xã hội và nội dung cần nhanh, đủ nét cho phần lớn vị trí xem trên điện thoại. Seedance (trừ 1.0 Pro), VEO 3.1, Gemini Omni Flash, Grok Imagine và WAN xuất ở 720p.' },
            { tag: 'HD+', title: '768p', text: 'Mức giữa của Minimax H3 Max và H3 Max Reference, nét hơn 720p một chút.' },
            { tag: 'Full HD', title: '1080p', text: 'Trang sản phẩm, quảng cáo trả phí và chiến dịch. Kling, FLUX 3, Seedance 1.0 Pro và Hailuo 2.3 Pro xuất ở 1080p.' },
          ],
        },
        'Muốn clip sắc hơn, hãy chọn một mô hình 1080p thay vì phóng to sau. Kích thước thực tế còn tuỳ tỉ lệ: một clip 9:16 ở 1080p rộng 1080 điểm ảnh và cao 1920.',
      ],
    },
    {
      kicker: 'Chỉ đạo',
      title: 'Viết mô tả chuyển động thế nào cho hiệu quả?',
      lead: 'Mô tả video là để chỉ đạo chuyển động. Với ảnh-thành-video, khung mở đầu đã cố định chủ thể, trang phục và bối cảnh, nên mô tả chỉ cần nói điều gì xảy ra tiếp theo.',
      blocks: [
        'Một mô tả tốt thường trả lời bốn câu hỏi. Hiếm khi cần cả bốn, nhưng mỗi câu bạn trả lời là một quyết định bạn lấy lại từ AI.',
        {
          cards: [
            { title: 'Cái gì chuyển động, ra sao?', text: 'Gọi tên chuyển động thật rõ: “người mẫu xoay chậm sang trái”, “vạt váy bay nhẹ trong gió”.' },
            { title: 'Máy quay di chuyển thế nào?', text: 'Gọi tên chuyển máy, nếu không AI sẽ tự chọn: “máy quay tiến chậm lại gần”, “máy lia vòng quanh người mẫu”.' },
            { title: 'Nhịp độ ra sao?', text: 'Đặt năng lượng cho clip: “chậm rãi, nhẹ nhàng” hay “nhanh, dứt khoát”.' },
            { title: 'Điều gì không được đổi?', text: 'Chốt lại: “giữ nguyên khuôn mặt, màu vải và chữ in trên áo”.' },
          ],
        },
        { example: { label: 'Mô tả chuyển động', text: 'The model walks slowly towards the camera, the hem of the linen dress moving softly with each step, while the camera pulls back at the same pace. Keep the face, the dress colour and the print unchanged.', media: 'about-create-prompt-1' } },
        { example: { label: 'Mô tả tối giản', text: 'Slow push-in on the model, subtle breathing, the fabric moving gently.', media: 'about-create-prompt-2' } },
        {
          list: [
            'Chỉ đạo chuyển động của những gì đã có trong ảnh. Tả một cảnh mà ảnh không có là đi ngược đầu vào.',
            'Một chuyển động rõ cho mỗi clip. Một video 5–10 giây không chứa nổi năm hành động.',
            'Mẫu chuyển động là các câu lệnh công ty đã thử; chọn mẫu là cách nhanh nhất để có kết quả ổn định.',
            'Câu ngắn và cụ thể cho kết quả ổn định hơn câu dài nhiều ý. Có thể viết tiếng Việt: khi Cải thiện đang bật, mô tả được dịch và viết lại bằng tiếng Anh trước khi chạy.',
          ],
        },
      ],
    },
    {
      kicker: 'Làm cho đúng',
      title: 'Những lỗi hay gặp nhất là gì?',
      lead: 'Khi video không như ý, nguyên nhân gần như luôn là ảnh mở đầu hoặc một mô tả quá tải. Đây là các trường hợp hay gặp nhất, kèm cách sửa.',
      blocks: [
        {
          cards: [
            { tag: 'Không nên', title: 'Tả một cảnh hoàn toàn mới', text: 'Ảnh-thành-video giữ khung hình của bạn. Đòi một địa điểm, trang phục hay người khác là đi ngược đầu vào và cho ra kết quả méo.' },
            { tag: 'Nên', title: 'Chỉ đạo chuyển động', text: 'Tả cảnh hiện có chuyển động ra sao: người mẫu, máy quay, chất vải. Muốn đổi cảnh, hãy sửa ảnh ở trang Tạo ảnh trước rồi làm động kết quả.' },
            { tag: 'Không nên', title: 'Bắt đầu từ một ảnh yếu', text: 'Ảnh mờ, rối hay cắt khung vụng sẽ lộ rõ hơn khi chuyển động. Video chỉ tốt bằng ảnh mở đầu của nó.' },
            { tag: 'Nên', title: 'Dùng ảnh nét, bố cục rõ', text: 'Ảnh sạch, đủ sáng, chủ thể rõ ràng sẽ chuyển động chân thực. Chưa có ảnh tốt thì chỉnh ảnh mở đầu ở trang Tạo ảnh trước.' },
          ],
        },
        {
          list: [
            'Kết quả đứng yên quá? Nói rõ chuyển động và thêm một chuyển máy.',
            'Chuyển động giật hay tay chân méo? Thử một mô hình Kling, vốn mạnh về vật lý, hoặc rút ngắn thời lượng.',
            'Job thất bại? Mỗi job được chạy lại một lần từ tab Lịch sử; job thất bại không tốn tiền thì không tính vào hạn mức.',
          ],
        },
      ],
    },
    {
      kicker: 'Tạo tiếp',
      title: 'Làm gì tiếp với kết quả?',
      lead: 'Trang Tạo video nằm giữa quy trình. Các trang khác chuẩn bị đầu vào và mở rộng đầu ra cho nó.',
      blocks: [
        {
          links: [
            ['Tạo ảnh', '/image-generation', 'chỉnh hoặc dựng lại khung mở đầu, sẵn sàng để làm động ở đây.'],
            ['Thử đồ', '/try-on', 'mặc trang phục của bạn lên người mẫu, để bạn làm động ảnh người mẫu đó.'],
            ['Tăng độ phân giải', '/apps/image-upscale', 'làm nét ảnh mở đầu lên tới 4K trước khi làm động.'],
            ['Đổi khung hình', '/apps/reframe', 'mở rộng ảnh sang tỉ lệ bạn muốn cho video.'],
            ['UGC Thử đồ', '/marketing-studio', 'biến ảnh người mẫu và ảnh sản phẩm thành clip kiểu người sáng tạo nội dung.'],
            ['Điều khiển chuyển động', '/apps/motion-control', 'chép chuyển động từ một video mẫu sang nhân vật trong ảnh.'],
          ],
        },
      ],
    },
    {
      kicker: 'Thuật ngữ',
      title: 'Ảnh-thành-video, video tham chiếu, mẫu chuyển động: khác nhau thế nào?',
      blocks: [
        {
          cols: 3,
          cards: [
            { title: 'Ảnh-thành-video', text: 'Làm động một ảnh. Ảnh của bạn là khung hình đầu tiên và AI tạo chuyển động nối tiếp.' },
            { title: 'Video tham chiếu', text: 'Dựng một video mới từ nhiều ảnh tham chiếu, như người mẫu, trang phục và bối cảnh, thay vì một khung cố định. Ở đây nhận tối đa 4 ảnh.' },
            { title: 'Mẫu chuyển động', text: 'Câu lệnh chuyển động công ty đã thử và giữ lại. Chọn mẫu thay cho tự viết mô tả.' },
            { title: 'Mô tả chuyển động', text: 'Câu chỉ dẫn chuyển động: chủ thể làm gì, máy quay đi ra sao, nhịp độ thế nào.' },
            { title: 'Điểm đề xuất', text: 'Điểm 0–100 của mỗi mô hình trong menu, tính từ đánh giá Đạt/Không đạt và tỉ lệ job thành công của công ty.' },
            { title: 'Thư viện', text: 'Nơi chứa mọi clip của công ty, để xem, tải xuống và đánh giá.' },
          ],
        },
      ],
    },
    {
      kicker: 'Hỏi đáp',
      title: 'Câu hỏi thường gặp',
      blocks: [
        {
          faq: [
            ['Cần biết dựng video mới biến được ảnh thành video không?', 'Không. Bạn tải ảnh lên, chọn mẫu hoặc viết một dòng tả chuyển động, chọn mô hình và bấm Run. Không có timeline, không keyframe, không phần mềm dựng nào, và clip xong nằm trong Thư viện, sẵn để tải xuống.'],
            ['Một video tốn bao nhiêu?', 'Chi phí tuỳ mô hình và thời lượng, vì mọi mô hình tính tiền theo giây. Nút Run ghi chi phí ước tính bằng USD trước khi bạn bấm và cập nhật khi bạn đổi lựa chọn. Chi phí ghi trên clip là chi phí thật từ nhà cung cấp khi có; trước đó là số ước tính.'],
            ['Có giới hạn số video không?', 'Có. Mỗi người có hạn mức số clip mỗi ngày theo giờ Việt Nam, do Admin đặt, và công ty có ngân sách video mỗi tháng. Run làm vượt hạn mức sẽ bị từ chối kèm lý do. Job thất bại không tốn tiền thì không tính.'],
            ['AI biến ảnh thành video được không?', 'Được. Tải bất kỳ ảnh nào, ảnh sản phẩm, ảnh người mẫu hay một kết quả trước đó, làm khung mở đầu và tả chuyển động bạn muốn. AI làm động thành một video bắt đầu đúng từ ảnh đó. Mô hình tham chiếu cũng nhận ảnh của bạn nhưng dựng một cảnh mới từ chúng thay vì làm động một khung cố định.'],
            ['Xuất được cho nền tảng và định dạng nào?', 'Mọi mô hình có 9:16 cho Reels, TikTok và Stories, và đa số có thêm 1:1 cho bảng tin và ô sản phẩm. Bạn chọn tỉ lệ trước khi chạy, vì không có gì tự đổi cỡ sau đó.'],
            ['Có lồng tiếng bằng giọng thương hiệu được không?', 'Chưa: ứng dụng không có tải giọng hay nhân bản giọng. Khi Tạo âm thanh bật, clip có tiếng gốc của mô hình; muốn giọng riêng thì tắt âm thanh, tải clip xuống và lồng tiếng hoặc ghép nhạc trong phần mềm dựng.'],
            ['Ứng dụng dùng những mô hình nào?', 'Danh mục có hơn 20 mô hình video thuộc các họ Kling, Seedance, FLUX 3, Google VEO, Gemini Omni Flash, Grok Imagine, WAN và Minimax. Admin bật mô hình nào thì menu có mô hình đó, và bạn chọn trước mỗi lần chạy. Đổi mô hình cũng đổi chi phí ghi trên nút Run.'],
            ['Video dài tối đa bao lâu?', 'Từ 1 đến 30 giây tuỳ mô hình. Grok Imagine 1.5 từ 1 đến 15 giây, Kling 3.0 Pro từ 3 đến 15, Seedance 2.0, WAN 2.7 và Minimax H3 Max tới 15, FLUX 3 từ 5 đến 20 và Seedance 2.5 tới 30. Google VEO 3.1 luôn 8 giây, Hailuo 2.3 Pro luôn 6 giây.'],
            ['Nên chọn mô hình nào?', 'Kling mạnh về chuyển động chân thực và vật lý, ở 1080p. Seedance có dải thời lượng dài nhất. Google VEO 3.1 cho clip 8 giây trau chuốt. Grok Imagine hợp với clip dài mà tiết kiệm, FLUX 3 cho chuyển động điện ảnh tới 20 giây ở 1080p, và Hailuo 2.3 Pro là đường nhanh nhất tới clip 1080p. Khi phân vân, chọn mô hình có nhãn Đề xuất: đó là mô hình công ty chấm điểm cao nhất.'],
            ['Nút Cải thiện làm gì?', 'Khi Cải thiện bật (mặc định), AI viết lại mô tả ngắn của bạn thành một bản tả chi tiết bằng tiếng Anh trước khi chạy, và dịch nếu bạn viết tiếng Việt. Nó không nhìn thấy ảnh, nên chỉ thêm chi tiết về chuyển động, máy quay và nhịp độ, không bịa màu sắc, chữ hay logo. Tắt Cải thiện khi bạn muốn gửi đúng câu của mình.'],
            ['Tạo video chỉ từ chữ, không cần ảnh được không?', 'Chưa. Mỗi lần chạy cần ít nhất một ảnh. Nếu ảnh hiện có chưa phù hợp, hãy chỉnh nó ở trang Tạo ảnh trước rồi đưa vào đây.'],
            ['Video tham chiếu là gì?', 'Thay vì làm động một khung cố định, bạn tải lên vài ảnh tham chiếu, như người mẫu, trang phục và bối cảnh, và AI dựng một video mới có các yếu tố đó. Ở đây các mô hình Reference cùng Kling O3 Pro và Kling o1 nhận tối đa 4 ảnh.'],
            ['Video thuộc về ai?', `Video là tài sản của công ty, dùng cho trang sản phẩm, mạng xã hội và quảng cáo của công ty. ${RIGHTS}`],
            PRIVACY,
          ],
        },
      ],
    },
  ],
};

/** Try On. */
const tryOn: AboutPage = {
  title: 'Thử đồ trên người mẫu',
  lead: 'Tải ảnh trang phục, chọn người mặc, và bạn nhận lại một bức ảnh. Phần dưới giải thích thử đồ bằng AI thực sự hoạt động ra sao, và kết quả thường hỏng ở đâu.',
  sections: [
    {
      kicker: 'Vì sao quan trọng',
      title: 'Vì sao nên dùng thử đồ AI cho ảnh sản phẩm?',
      lead: 'Tấm ảnh bạn chụp trên bàn sáng nay trở thành ảnh người mẫu, không cần thuê người mẫu, không cần thuê studio. Chi phí mỗi ảnh giảm đủ để bạn thôi phải dè sẻn, và thời gian giảm đủ để sản phẩm lên trang ngay trong tuần hàng về.',
      blocks: [
        {
          cards: [
            { title: 'Chỉ bằng một phần nhỏ chi phí chụp', text: 'Người mẫu, studio và chỉnh ảnh cộng lại rất nhanh, rồi lặp lại cho sản phẩm tiếp theo. Một lần thử đồ chỉ tốn vài cent đến vài chục cent tiền mô hình.' },
            { title: 'Từ vài tuần còn vài phút', text: 'Một buổi chụp thường mất nhiều tuần cho mỗi đợt hàng nếu tính cả đặt lịch, chụp và chỉnh. Ở đây ảnh trang phục thành ảnh người mẫu đăng được chỉ sau vài phút.' },
            { title: 'Mọi người mẫu, mọi thị trường', text: 'Mặc cùng một trang phục lên người có ngoại hình, dáng người hay độ tuổi khác mà không cần tuyển ai, để ảnh hợp với thị trường bạn đang bán.' },
            { title: 'Theo kịp danh mục', text: 'Sản phẩm mới không còn kéo theo buổi chụp mới. Năm trăm mã hàng là năm trăm lần chạy, một hàng đợi bạn làm dần chứ không phải một lịch sản xuất.' },
          ],
        },
      ],
    },
    {
      kicker: 'Bán hàng online',
      title: 'Thử đồ ảo cho bán hàng online',
      blocks: [
        'Không ai thử được quần áo qua mạng. Phần lớn câu hỏi về size và không ít đơn hoàn bắt đầu từ đó: khách phải đoán độ vừa từ ảnh một món đồ trải phẳng. Thử đồ ảo thu hẹp khoảng cách đó bằng cách cho mỗi sản phẩm một hoặc vài ảnh người mẫu đàng hoàng.',
        'Cách này phủ được cả danh mục, kể cả những sản phẩm chưa bao giờ đáng một buổi chụp riêng. Cho một món đồ lên vài dáng người và độ tuổi để khách tìm thấy người giống mình hơn.',
        {
          table: [
            ['Ảnh dùng ở đâu', 'Nên tạo gì', 'Tỉ lệ', 'Độ phân giải'],
            ['Ảnh chính trang sản phẩm', 'Trang phục trên người mẫu, nền studio sạch', '4:5 hoặc 3:4', '2K'],
            ['Lưới danh mục và trang liệt kê', 'Khung hình giống nhau cho mọi mã hàng', '1:1', '1K'],
            ['Bảng tin Instagram và lookbook', 'Trang phục được phối trong một khung cảnh', '4:5', '2K'],
            ['Stories, Reels và TikTok', 'Ảnh toàn thân, chừa chỗ cho chữ', '9:16', '2K'],
            ['Banner trang chủ và chiến dịch', 'Cảnh rộng, chừa khoảng trống cho chữ', '16:9', '4K'],
          ],
        },
        'Cột độ phân giải áp dụng cho Nano Banana Pro, mô hình có đủ 1K, 2K và 4K. Nano Banana 2.1 có 1K và 2K, còn Nano Banana và FASHN v1.6 trả về một cỡ cố định.',
        {
          links: [
            ['Đổi người mẫu', '/apps/model-swap', 'đặt một người khác vào ảnh bạn đã có, giữ nguyên trang phục, tư thế và bối cảnh.'],
            ['Tạo video', '/create', 'biến ảnh người mẫu thành clip ngắn để khách thấy trang phục chuyển động.'],
          ],
        },
      ],
    },
    {
      kicker: 'Từng bước',
      title: 'Thử đồ ảo bằng AI hoạt động thế nào?',
      lead: 'Hai ảnh vào, một ảnh ra. AI đọc ảnh trang phục kỹ đến mức phân biệt được áo khoác len giữ form còn váy lụa thì không, tính xem món đồ đó rủ ra sao trên cơ thể trong ảnh người mẫu, rồi dựng lại toàn bộ cảnh. Không có gì bị cắt dán đè lên: mọi nếp gấp, bóng đổ và vùng sáng đều được tạo mới, nên độ vừa trông thật trên nhiều dáng người.',
      blocks: [
        'Một lần chạy cần hai thứ: trang phục và người mặc. Mọi thứ khác trên form là tuỳ chọn.',
        {
          steps: [
            { title: 'Tải ảnh trang phục', text: 'Thêm 1 đến 4 ảnh trang phục: ảnh trải phẳng, ảnh ma-nơ-canh ẩn hay ảnh người mặc đều được. Có thể chồng áo, quần và giày để phối cả bộ trong một lần. Tổng số ảnh của một lần chạy (người mẫu, trang phục và bối cảnh) không vượt giới hạn của mô hình: 4 với các mô hình Nano Banana, 2 với FASHN v1.6.', media: 'try-on-garment-1' },
            { title: 'Chọn người mẫu', text: 'Tải ảnh một người, hoặc chọn một ảnh mẫu có sẵn nếu công ty đã đưa lên. Dùng ảnh toàn thân của một người nhìn thẳng vào máy; ảnh càng rõ, kết quả càng tốt.', media: 'try-on-model-1' },
            { title: 'Chọn thông số và chạy', text: 'Chọn mô hình, độ phân giải và tỉ lệ, thêm ảnh bối cảnh hoặc prompt nếu muốn chỉ đạo cảnh, rồi bấm Thử đồ. Nút ghi chi phí ước tính bằng USD trước khi bạn bấm, và kết quả về tab Lịch sử.', media: 'try-on-example-1' },
          ],
        },
      ],
    },
    {
      kicker: 'Kết quả thực tế',
      title: 'Trước và sau',
      lead: 'Mỗi cặp bên dưới bắt đầu từ một ảnh trang phục. Không người mẫu, không dựng cảnh, không ngày chụp. Ảnh bên phải là kết quả của một lần chạy.',
      blocks: [
        {
          labels: ['Trang phục', 'Ảnh người mẫu'],
          pairs: [
            ['about-try-on-garment-1', 'about-try-on-result-1'],
            ['about-try-on-garment-2', 'about-try-on-result-2'],
          ],
        },
      ],
    },
    {
      kicker: 'Phạm vi',
      title: 'Thử được những gì?',
      lead: 'Bạn có thể phối cả bộ trong một lần chạy: tối đa 4 ảnh trang phục, trong giới hạn ảnh của mô hình, và trộn các loại tuỳ ý.',
      blocks: [
        {
          cols: 3,
          cards: [
            { title: 'Áo', text: 'Sơ mi, áo thun, áo kiểu, áo len. Ảnh trải phẳng trên nền trơn giữ hoạ tiết và cổ áo sắc nét.' },
            { title: 'Quần, chân váy và denim', text: 'Quần âu, chân váy, quần jean. Trải phẳng và thẳng để giữ đường cắt và dáng ống.' },
            { title: 'Đầm', text: 'Từ đầm hai dây đến đầm dạ hội. Ảnh ma-nơ-canh ẩn hợp nhất, vì đã cho thấy dáng váy rủ ra sao.' },
            { title: 'Áo khoác', text: 'Áo khoác dài, áo khoác ngắn, blazer. Chụp cài hay mở đúng như bạn muốn người mẫu mặc trong kết quả.' },
            { title: 'Giày', text: 'Sneaker, giày cao gót, bốt. Thêm thành một ảnh riêng cùng phần còn lại của bộ đồ.' },
            { title: 'Phụ kiện', text: 'Túi, mũ, trang sức. Cho vào cùng lần chạy với quần áo để AI phối tất cả cùng nhau.' },
          ],
        },
      ],
    },
    {
      kicker: 'Đồ cưới',
      title: 'Thử đồ AI cho váy cưới',
      blocks: [
        'Một chiếc váy cưới có thể có đuôi váy, voan, đính cườm, ren và ba độ dày vải cùng lúc, nên đây vừa là loại khó chụp đẹp nhất vừa là loại tốn kém nhất nếu chụp hỏng. Nhiều cửa hàng áo cưới còn có những mẫu không thể may mẫu, gửi đi hay đưa ra trước máy ảnh. Thử đồ AI cho phép mọi mẫu váy lên người mẫu trong khi váy vẫn nằm trên giá.',
        'Về cách làm, váy cưới chỉ là một trang phục nữa: tải váy lên, chọn người mẫu, chạy. Điều khác là ảnh gốc quan trọng hơn nhiều. Độ phồng là phần AI phải tự suy ra, nên một chiếc váy chụp khi treo hoặc mặc trên ma-nơ-canh tốt hơn hẳn một chiếc gấp trên bàn: AI thấy được chỗ dáng váy chuyển, cách chân váy xoè ra từ eo và đuôi váy dài thật bao nhiêu.',
        {
          cols: 3,
          cards: [
            { title: 'Chụp váy giữ được dáng', text: 'Treo váy hoặc mặc lên ma-nơ-canh. Đó là cách AI đọc được dáng váy, vòng eo và chiều dài thật của đuôi váy.' },
            { title: 'Thêm voan và phụ kiện riêng', text: 'Tải voan, cài tóc hay giày thành ảnh riêng trong cùng lần chạy, trong giới hạn ảnh của mô hình, để AI phối trọn bộ cô dâu.' },
            { title: 'Chọn bối cảnh', text: 'Thêm một ảnh bối cảnh, hoặc tả địa điểm trong prompt: một nhà thờ đá, một khu vườn lúc hoàng hôn, một sảnh tiệc ánh nến.' },
          ],
        },
        'Ren, đính cườm và thêu sống nhờ độ phân giải. Chạy ảnh váy cưới trên Nano Banana Pro ở 2K hoặc 4K để chi tiết giữ được khi khách phóng to, rồi đưa ảnh sang trang Tạo video để có clip váy chuyển động.',
      ],
    },
    {
      kicker: 'Mô hình tạo',
      title: 'Có những mô hình nào?',
      lead: 'Menu Mô hình quyết định công cụ nào dựng ảnh. Thử đồ có bốn mô hình trong danh mục, khác nhau về độ chi tiết, tốc độ, số ảnh mỗi lần chạy và giá; menu chỉ hiện mô hình Admin đã bật.',
      blocks: [
        {
          cards: [
            { tag: 'Chất lượng cao nhất', title: 'Nano Banana Pro', media: 'model-nano-banana-pro', text: 'Mô hình ảnh chủ lực của Google, xuất ở 1K, 2K hoặc 4K. Giữ chất vải, đường may và hoạ tiết tốt hơn bản tiêu chuẩn. Dùng cho mọi ảnh sẽ lên trang sản phẩm, quảng cáo hay chiến dịch.', specs: ['Độ phân giải: 1K, 2K, 4K', 'Tối đa 4 ảnh mỗi lần chạy'] },
            { tag: 'Mới nhất của Google', title: 'Nano Banana 2.1', media: 'model-nano-banana-2-1', text: 'Bản cập nhật của Nano Banana 2 ở tốc độ Flash: ảnh chân thực hơn, bám prompt sát hơn, với giá thấp.', specs: ['Độ phân giải: 1K, 2K', 'Tối đa 4 ảnh mỗi lần chạy'] },
            { tag: 'Nhanh và rẻ', title: 'Nano Banana', media: 'model-nano-banana', text: 'Mô hình ảnh tiêu chuẩn của Google. Rẻ hơn mỗi lần chạy, nhanh hơn, chi tiết kém hơn một chút. Dùng để thử các cách phối trước khi chạy bản cuối.', specs: ['Độ phân giải: cỡ cố định', 'Tối đa 4 ảnh mỗi lần chạy'] },
            { tag: 'Chuyên thử đồ', title: 'FASHN v1.6', text: 'Mô hình làm riêng cho thử đồ: mỗi lần chạy một người mẫu và một trang phục, giữ nguyên khung hình của ảnh người mẫu.', specs: ['Độ phân giải: cỡ cố định', '2 ảnh: người mẫu và 1 trang phục', 'Tỉ lệ: theo ảnh người mẫu'] },
          ],
        },
        'Cách làm nhiều người chọn: thử trên Nano Banana cho tới khi cách phối và cảnh đã ổn, rồi chạy lại trên Nano Banana Pro ở độ phân giải cao hơn.',
      ],
    },
    {
      kicker: 'Độ chân thực',
      title: 'Thử đồ AI dựng chất vải và nếp nhăn chân thực bằng cách nào?',
      blocks: [
        'Áo khoác denim trở về với nếp gấp cứng, đứng form. Váy lụa trở về với nếp mềm ôm theo cơ thể. AI suy ra điều đó chỉ từ ảnh trang phục, đọc kiểu dệt và độ nặng, rồi dựng nếp gấp hợp với chất liệu trên tư thế bạn đưa. Vải gân, vân len, đường may và hoạ tiết được dựng lại theo tỉ lệ và góc mới, và bóng của trang phục đổ lên cơ thể được khớp với ánh sáng sẵn có trong ảnh người mẫu.',
        'Giữ lại được bao nhiêu tuỳ ảnh bạn tải lên. Một ảnh trang phục nét, sáng đều cho AI nhiều chất liệu để làm việc, nên cùng một món đồ có thể ra phẳng lì từ ảnh này mà thuyết phục từ ảnh khác.',
        {
          list: [
            'Chụp trang phục dưới ánh sáng đều. Bóng gắt trong ảnh sẽ bị hiểu là một phần của vải.',
            'Chạy ảnh dùng thật trên Nano Banana Pro ở 2K hoặc 4K khi khách sẽ phóng to xem kiểu dệt và đường may.',
            'Với hoạ tiết và logo, để trang phục chiếm kín khung để hoa văn được đọc rõ thay vì bị đoán.',
          ],
        },
      ],
    },
    {
      kicker: 'Khung hình',
      title: 'Chọn tỉ lệ khung hình',
      lead: 'Tỉ lệ quyết định hình dạng ảnh. Hãy chọn trước khi chạy, vì cắt sau sẽ cắt vào người mẫu.',
      blocks: [
        {
          ratios: [
            ['auto', 'Giữ khung của ảnh người mẫu'],
            ['1:1', 'Ô sản phẩm và trang liệt kê trên sàn'],
            ['4:5', 'Bài đăng Instagram và lookbook'],
            ['9:16', 'Stories, Reels và TikTok'],
            ['16:9', 'Banner website và ảnh đầu trang'],
          ],
        },
        'Các mô hình Nano Banana có thêm 3:4, 4:3, 2:3, 3:2, 5:4 và 21:9; FASHN v1.6 luôn giữ khung của ảnh người mẫu.',
      ],
    },
    {
      kicker: 'Kích thước ảnh',
      title: 'Chọn độ phân giải',
      lead: 'Độ phân giải quyết định kích thước điểm ảnh của ảnh. Độ phân giải cao hơn có thể đắt hơn, nên hãy chọn theo nơi ảnh sẽ dùng thay vì luôn chọn mức cao nhất.',
      blocks: [
        {
          cols: 3,
          cards: [
            { tag: '1024px', title: '1K', text: 'Ảnh nháp, bài đăng mạng xã hội, thử nhanh. Đủ nét cho phần lớn màn hình.' },
            { tag: '2048px', title: '2K', text: 'Trang sản phẩm và quảng cáo, nơi khách phóng to xem chất vải và chi tiết.' },
            { tag: '4096px', title: '4K', text: 'In ấn, biển quảng cáo và ảnh chủ đạo của chiến dịch. Chỉ có trên Nano Banana Pro.' },
          ],
        },
      ],
    },
    {
      kicker: 'Bối cảnh',
      title: 'Đổi bối cảnh thế nào?',
      blocks: [
        'Ô Bối cảnh quyết định nơi diễn ra bức ảnh. Ô này là tuỳ chọn; để trống thì ảnh giữ khung cảnh vốn có trong ảnh người mẫu. Thêm một ảnh bối cảnh và AI dựng lại cảnh quanh người mẫu, còn trang phục giữ đúng như ảnh bạn tải lên.',
        {
          cards: [
            { title: 'Phông studio', text: 'Tường liền trơn màu trắng, be, pastel hay xám. Lựa chọn an toàn cho trang sản phẩm và lưới danh mục, nơi một phông sạch giúp mọi mã hàng như chụp cùng một ngày.' },
            { title: 'Kiến trúc và nội thất', text: 'Tường gạch nung, phòng trưng bày, hành lang mái vòm, bậc thang bê tông. Ánh sáng gắt và đường nét mạnh hợp với đồ may đo và áo khoác.' },
            { title: 'Ngoài trời và nghỉ dưỡng', text: 'Hồ bơi, vườn cọ, bãi biển giữa trưa, bến du thuyền. Nắng ấm cho đồ bơi, đồ linen và mọi thứ bán theo mùa hè.' },
            { title: 'Thành phố', text: 'Ngõ phố, sân ga, sân thượng, phố cổ châu Âu. Bối cảnh thời trang đường phố cho ảnh chiến dịch và mạng xã hội.' },
          ],
        },
        'Ô bối cảnh có thể hiện vài ảnh mẫu có sẵn nếu công ty đã đưa lên. Muốn một cảnh chưa có ảnh, hãy để trống ô và tả địa điểm trong prompt.',
      ],
    },
    {
      kicker: 'Chỉ đạo',
      title: 'Viết prompt',
      blocks: [
        'Prompt là tuỳ chọn. Bỏ trống prompt và không thêm bối cảnh thì người mẫu mặc trang phục của bạn trong chính khung cảnh của ảnh người mẫu: ứng dụng dùng câu chỉ dẫn mặc định là mặc trang phục lên người mẫu, giữ nguyên người và bối cảnh. Viết prompt khi bạn muốn chỉ đạo cảnh: địa điểm, ánh sáng, tư thế, phong cách chụp.',
        'Prompt điều khiển mọi thứ quanh trang phục. Trang phục vẫn bám sát ảnh bạn tải lên, nên hãy dùng ô này để tả thế giới mà bạn muốn nó được chụp trong đó.',
        { example: { label: 'Prompt mẫu', text: 'Put the linen shirt from the garment photo on the model. A sunny street café in late-morning light, a relaxed half-body pose, natural photo style. Keep the shirt colour and buttons exactly as in the photo.', media: 'about-try-on-prompt' } },
        {
          list: [
            'Gọi tên trang phục đã tải lên để AI bám vào nó: “chiếc sơ mi linen trong ảnh trang phục”.',
            'Tả cảnh: địa điểm, phông nền, thời điểm trong ngày.',
            'Đặt ánh sáng: “nắng sớm dịu”, “đèn studio mềm”.',
            'Thêm phong cách: “ảnh tạp chí”, “ảnh đời thường chụp bằng điện thoại”.',
          ],
        },
      ],
    },
    {
      kicker: 'Làm cho đúng',
      title: 'Những lỗi nên tránh',
      lead: 'Khi kết quả không như ý, nguyên nhân gần như luôn nằm ở ảnh đầu vào. Đây là bốn trường hợp hay gặp nhất, kèm cách sửa.',
      blocks: [
        {
          cards: [
            { tag: 'Không nên', title: 'Dùng ảnh bị cắt hoặc ảnh nhóm làm người mẫu', text: 'Ảnh chân dung, ảnh nửa người và ảnh nhiều người khiến AI phải đoán ai mặc trang phục và trang phục nên nằm thế nào.' },
            { tag: 'Nên', title: 'Dùng ảnh toàn thân của một người', text: 'Một người, thấy từ đầu đến chân, nhìn thẳng vào máy. AI có cả dáng người để ướm trang phục lên.' },
            { tag: 'Không nên', title: 'Tải ảnh trang phục mờ hoặc rối', text: 'Ảnh độ phân giải thấp, nền bừa bộn và đồ bị gấp che mất chi tiết AI cần, và chất vải, đường cắt mất theo.' },
            { tag: 'Nên', title: 'Dùng ảnh nét trên nền sạch', text: 'Ảnh trải phẳng hoặc ma-nơ-canh ẩn đủ sáng trên nền trơn giữ được chất vải, hoạ tiết và đường may tới kết quả.' },
          ],
        },
        {
          list: [
            'Muốn bối cảnh khác? Thêm ảnh bối cảnh, hoặc tả cảnh trong prompt. Không động vào cả hai thì giữ khung cảnh của ảnh người mẫu.',
            'Chi tiết trang phục bị mềm? Chạy lại với Nano Banana Pro ở 2K trở lên.',
            'Phối nhiều món? Thêm mỗi món thành một ảnh riêng thay vì một ảnh ghép.',
          ],
        },
      ],
    },
    {
      kicker: 'Theo danh mục',
      title: 'Thử đồ có làm được cho nhiều sản phẩm cùng lúc không?',
      blocks: [
        'Được, khi bạn hiểu một lần chạy được tính thế nào. Mỗi lần chạy cho một ảnh từ tối đa 4 ảnh trang phục, và AI phối chúng thành một bộ trên một người mẫu. Một lần chạy, một bộ đồ.',
        'Vì vậy phủ một danh mục là chuyện xếp hàng. Không có nhập từ bảng tính, nhưng bạn có thể gửi job tiếp theo trong lúc job trước đang chạy, và mỗi kết quả hiện trong tab Lịch sử ngay khi xong.',
      ],
    },
    {
      kicker: 'Tạo tiếp',
      title: 'Làm gì với kết quả?',
      lead: 'Ảnh thử đồ thường chỉ là điểm bắt đầu. Mọi ảnh trong Thư viện đều tải xuống được để dùng ở các trang khác.',
      blocks: [
        {
          links: [
            ['Tăng độ phân giải', '/apps/image-upscale', 'phóng kết quả lên tới 4K cho in ấn và chiến dịch.'],
            ['Đổi nền', '/apps/background-changer', 'đổi cảnh mà không cần chạy lại thử đồ.'],
            ['Đổi khung hình', '/apps/reframe', 'mở rộng ảnh sang tỉ lệ mới cho banner và Stories.'],
            ['Tạo ảnh', '/image-generation', 'dựng lại cảnh, đổi tư thế hay biến kết quả thành hình ảnh chiến dịch mới.'],
            ['Tạo video', '/create', 'làm động ảnh người mẫu thành một video thời trang ngắn.'],
            ['UGC Thử đồ', '/marketing-studio', 'biến một sản phẩm và một người mẫu thành clip kiểu người sáng tạo nội dung.'],
          ],
        },
      ],
    },
    {
      kicker: 'Thuật ngữ',
      title: 'Trải phẳng, ma-nơ-canh ẩn, ảnh người mặc: khác nhau thế nào?',
      blocks: [
        {
          cols: 3,
          cards: [
            { title: 'Trải phẳng', text: 'Trang phục chụp từ trên xuống trên một mặt phẳng. Đầu vào đơn giản nhất, và một ảnh điện thoại trên nền sạch là đủ.' },
            { title: 'Ma-nơ-canh ẩn', text: 'Trang phục chụp trên ma-nơ-canh rồi xoá ma-nơ-canh khi hậu kỳ, giữ lại dáng ba chiều. Đầu vào tốt, vì đã cho thấy món đồ giữ form ra sao.' },
            { title: 'Ảnh người mặc', text: 'Trang phục trên một người. Đây là thứ trang này tạo ra, và cũng dùng được làm đầu vào khi bạn phối lại một ảnh sản phẩm có sẵn.' },
          ],
        },
      ],
    },
    {
      kicker: 'Hỏi đáp',
      title: 'Câu hỏi thường gặp',
      blocks: [
        {
          faq: [
            ['Một lần thử đồ tốn bao nhiêu?', 'Chi phí tuỳ mô hình và độ phân giải bạn chọn. Nút Thử đồ ghi chi phí ước tính bằng USD trước khi bạn bấm và cập nhật khi bạn đổi lựa chọn; chi phí thật nằm trên ảnh trong Thư viện. Ảnh và ứng dụng có ngân sách riêng, tách khỏi video: mỗi người có hạn mức theo ngày và theo tháng, công ty có hạn mức theo tháng.'],
            ['Dùng ảnh người mẫu của mình được không?', 'Được. Tải ảnh toàn thân của một người nhìn thẳng vào máy, hoặc chọn một ảnh mẫu có sẵn. Ảnh rõ, sáng đều cho kết quả tốt nhất. Ảnh chân dung và ảnh nhóm cho kết quả kém, vì AI không thấy cả dáng người để ướm trang phục.'],
            ['Ảnh trang phục kiểu nào là tốt nhất?', 'Ảnh trải phẳng, ma-nơ-canh ẩn và ảnh người mặc đều được. Dùng ảnh nét trên nền trơn để AI đọc được chất vải, đường cắt và đường may. Trang phục gấp trên bàn che mất dáng, và đó là lý do phổ biến nhất khiến kết quả trông sai.'],
            ['Cần ảnh chuyên nghiệp hay điện thoại là đủ?', 'Điện thoại là đủ. Trải trang phục dưới ánh sáng đều trên nền trơn là AI có đủ thứ cần. Không cần máy ảnh, studio hay đèn. Điều quan trọng là độ nét và ánh sáng đều, vì bóng gắt trong ảnh sẽ bị hiểu là một phần của vải.'],
            ['Thử nhiều món cùng lúc được không?', 'Được. Thêm tối đa 4 ảnh trang phục trong một lần chạy, trong giới hạn ảnh của mô hình (4 ảnh tổng cộng với Nano Banana, tính cả người mẫu và bối cảnh), và AI phối áo, quần, giày và phụ kiện thành một bộ trên một người mẫu. Tải mỗi món thành một ảnh riêng thay vì một ảnh ghép.'],
            ['Tạo ảnh thử đồ không cần buổi chụp được không?', 'Được, đó chính là mục đích của trang này. Một ảnh trang phục có sẵn, kể cả chụp bằng điện thoại, cùng một ảnh người mẫu là đủ cho một lần chạy. Không đặt studio, không tuyển người mẫu, không chỉnh ảnh.'],
            ['Có phải cài ứng dụng không?', 'Không. Ứng dụng chạy trên trình duyệt, trên máy tính lẫn điện thoại, nên không có gì để tải về hay cài đặt. Mọi kết quả nằm trong Thư viện của công ty, xem được trên bất kỳ thiết bị nào bạn đăng nhập.'],
            ['Thử đồ có đổi khuôn mặt, tóc hay tư thế của người mẫu không?', 'Không. Chỉ quần áo thay đổi. Khuôn mặt, tóc, màu da, dáng người và tư thế giữ nguyên, và AI dựng lại chất vải, nếp nhăn và bóng đổ cho khớp với tư thế và ánh sáng sẵn có. Bối cảnh cũng giữ nguyên trừ khi bạn chủ động đổi bằng ảnh bối cảnh hoặc prompt. Muốn thay cả người, hãy dùng ứng dụng Đổi người mẫu.'],
            ['Tạo ảnh cho nhiều sản phẩm cùng lúc được không?', 'Mỗi lần chạy cho một ảnh người mẫu từ tối đa 4 ảnh trang phục, được phối thành một bộ. Không có nhập từ bảng tính hay tải hàng loạt, nên phủ một danh mục là xếp hàng các lần chạy; kết quả hiện trong tab Lịch sử khi xong.'],
            ['Thử đồ dùng những mô hình nào?', 'Danh mục có bốn mô hình: Nano Banana Pro (1K, 2K, 4K, chi tiết trang phục tốt nhất), Nano Banana 2.1 (1K, 2K), Nano Banana (rẻ và nhanh, một cỡ cố định) và FASHN v1.6 (một người mẫu và một trang phục). Bạn chọn trong menu Mô hình trước mỗi lần chạy, trong số mô hình Admin đã bật.'],
            ['Dùng ảnh thử đồ cho quảng cáo và trang sản phẩm được không?', `Được, ảnh là tài sản của công ty. ${RIGHTS} Nếu ảnh người mẫu là ảnh người thật, cần có sự đồng ý của người đó.`],
            ['Vì sao trang phục trong kết quả hơi khác ảnh gốc?', 'AI dựng lại cách vải rủ và nằm trên một cơ thể thật, nên món đồ có thể trông khác ảnh trải phẳng của nó. Ảnh trang phục nét hơn cho AI nhiều thông tin hơn. Nếu chi tiết vẫn mềm, chạy lại trên Nano Banana Pro ở 2K hoặc 4K.'],
            PRIVACY,
          ],
        },
      ],
    },
  ],
};

/** Image Generation. */
const image: AboutPage = {
  title: 'Tạo ảnh thời trang bằng AI cho thương hiệu bán online',
  lead: 'Tải lên một ảnh và nói điều cần đổi, AI dựng phần còn lại. Không cần buổi chụp, không studio, không ê-kíp. Phần dưới giải thích cách làm, từng thiết lập để làm gì và cách viết mô tả để ra gần đúng điều bạn hình dung.',
  sections: [
    {
      kicker: 'Vì sao quan trọng',
      title: 'Vì sao nên tạo ảnh thay vì chụp?',
      lead: 'Ảnh đẹp từng đòi hỏi ngân sách: một studio, một ê-kíp và một buổi sản xuất cho mỗi hình ảnh. Tạo ảnh sản phẩm bằng AI đổi phép tính đó. Một hình ảnh không còn là dự án phải lên lịch mà là thứ bạn làm ngay trong lúc còn đang nghĩ về nó.',
      blocks: [
        {
          cards: [
            { title: 'Không phụ thuộc studio', text: 'Mỗi hình ảnh mới từng là một lần đặt studio, dựng đèn và điều phối ê-kíp. Giờ chỉ là một câu mô tả và chi phí mô hình ghi sẵn trên nút chạy.' },
            { title: 'Một ảnh, vô số biến thể', text: 'Một ảnh sản phẩm thành hàng chục ảnh ở các cảnh, tư thế và không khí khác nhau, đủ để thử xem cái nào bán được thay vì đoán.' },
            { title: 'Mọi bối cảnh, mọi mùa', text: 'Bãi biển giữa mùa đông, một con phố Paris, sân thượng lúc hoàng hôn. Bạn tả địa điểm thay vì đi tìm nó, nên đi lại và thời tiết không còn nằm trong lịch.' },
            { title: 'Nhất quán cả danh mục', text: 'Dùng lại cùng ánh sáng và phong cách cho mọi sản phẩm. Diện mạo giữ được khi danh mục lớn lên, điều khó đảm bảo qua nhiều ngày chụp.' },
          ],
        },
      ],
    },
    {
      kicker: 'Tình huống dùng',
      title: 'Khi nào thương hiệu thời trang dùng tạo ảnh AI?',
      lead: 'Có ba tình huống hay gặp hơn cả. Cả ba đều cần nhiều hình ảnh, vào một ngày mà lịch chụp không kịp.',
      blocks: [
        {
          cols: 3,
          cards: [
            { title: 'Ra mắt bộ sưu tập mới?', text: 'Hàng về và ba mươi sản phẩm cần ảnh trước khi trang bộ sưu tập lên được. Khi tự tạo ảnh trong nhà, ngày ra mắt không còn phụ thuộc lịch studio của người khác.' },
            { title: 'Làm lookbook?', text: 'Một lookbook cần một thế giới hình ảnh nhất quán qua hai ba chục ảnh. Viết ánh sáng và bối cảnh một lần, rồi đổi trang phục, và thế giới đó giữ được theo cách mà các ngày chụp riêng lẻ hiếm khi làm được.' },
            { title: 'Lấp đầy danh mục?', text: 'Mọi mã hàng đều có ảnh đời thường, kể cả những sản phẩm chưa bao giờ đáng một buổi chụp. Mỗi lần chạy cho một ảnh và bạn có thể gửi tiếp trong lúc job trước đang chạy, nên danh mục thành một hàng đợi bạn làm dần.' },
          ],
        },
      ],
    },
    {
      kicker: 'Từng bước',
      title: 'Tạo ảnh bằng AI hoạt động thế nào?',
      lead: 'Bạn tạo ảnh thời trang bằng AI trong ba bước: đưa ảnh tham chiếu, tả bức ảnh bạn muốn, rồi chạy. Ảnh tham chiếu cho AI biết thứ cần giữ, mô tả cho AI biết thứ cần đổi.',
      blocks: [
        {
          steps: [
            { title: 'Tải ảnh lên', text: 'Bấm dấu cộng trên thanh bên dưới để thêm 1 đến 4 ảnh tham chiếu: ảnh sản phẩm, ảnh người mẫu, thậm chí một ảnh điện thoại. Mỗi lần chạy cần ít nhất một ảnh.', media: 'about-image-step-1' },
            { title: 'Tả điều bạn muốn', text: 'Gõ bức ảnh bạn muốn vào ô mô tả: chủ thể, bối cảnh, ánh sáng và phong cách. Nói rõ điều cần đổi và điều phải giữ nguyên. Khi Cải thiện đang bật, AI viết lại mô tả thành một bản tả chi tiết bằng tiếng Anh trước khi chạy.', media: 'about-image-step-2' },
            { title: 'Chọn thông số và chạy', text: 'Chọn mô hình, tỉ lệ và độ phân giải theo nơi ảnh sẽ dùng, rồi bấm Tạo ảnh. Nút ghi chi phí ước tính bằng USD trước khi bạn bấm, và ảnh về tab Lịch sử khi xong. Đưa kết quả vào làm ảnh tham chiếu cho lần sau để đổi từng thứ một.', media: 'about-image-step-3' },
          ],
        },
      ],
    },
    {
      kicker: 'Không có ảnh sản phẩm',
      title: 'Chưa có ảnh sản phẩm thật thì sao?',
      blocks: [
        'Ở đây mỗi lần chạy cần ít nhất một ảnh tham chiếu, nên trang này không tạo ảnh chỉ từ chữ. Ảnh tham chiếu không cần đẹp: một ảnh mẫu thử chụp bằng điện thoại, một bản phác hay một ảnh có bố cục gần giống là đủ để AI dựng tiếp theo mô tả của bạn.',
        'Cách này hợp với việc sản phẩm chưa có hoặc chưa cần chính xác: moodboard, ý tưởng chiến dịch, bìa lookbook, mockup theo mùa, hay một phông nền để sau này ghép sản phẩm thật vào.',
        'Khi trang phục phải đúng, hãy tải đúng ảnh của nó. Đó là đường đến ảnh người mẫu cho quần áo bạn thật sự bán, vì AI giữ những gì bạn bảo nó giữ. Ý tưởng thì viết, sản phẩm thì tải lên.',
      ],
    },
    {
      kicker: 'Kết quả thực tế',
      title: 'Trước và sau',
      lead: 'Mỗi cặp bên dưới bắt đầu từ một ảnh tham chiếu và một câu mô tả. Không dựng cảnh, không chụp lại. Ảnh bên phải là kết quả của một lần chạy.',
      blocks: [
        {
          labels: ['Ảnh tham chiếu', 'Ảnh tạo ra'],
          pairs: [
            ['about-image-before-1', 'about-image-after-1'],
            ['about-image-before-2', 'about-image-after-2'],
          ],
        },
      ],
    },
    {
      kicker: 'Phạm vi',
      title: 'Bạn có thể tạo gì với AI?',
      lead: 'Một thanh mô tả lo được mọi thứ một thương hiệu thời trang cần: ảnh sản phẩm nền sạch lẫn cảnh chiến dịch đầy đủ, không phải đổi cách làm giữa hai việc.',
      blocks: [
        {
          cols: 3,
          cards: [
            { title: 'Ảnh sản phẩm', text: 'Biến ảnh người mẫu thành ảnh sản phẩm nền trắng sạch, hoặc đặt sản phẩm vào cảnh mới mà không chụp lại.' },
            { title: 'Ảnh đời thường', text: 'Đưa sản phẩm vào những cảnh vốn cần đi chụp ngoại cảnh: góc phố, căn hộ, sân thượng.' },
            { title: 'Hình ảnh chiến dịch', text: 'Ảnh chủ đạo kiểu tạp chí với chỉ đạo nghệ thuật viết thẳng vào mô tả: không khí, ánh sáng, phối đồ theo ý.' },
            { title: 'Biến thể người mẫu và tư thế', text: 'Đổi tư thế, khung hình hay bối cảnh trong khi cùng khuôn mặt và bộ đồ đi qua mọi biến thể.' },
            { title: 'Nội dung mạng xã hội', text: 'Bài đăng, Stories và quảng cáo tạo đúng tỉ lệ ngay từ đầu, nên không phải cắt sau.' },
            { title: 'Ý tưởng và concept', text: 'Moodboard, bìa lookbook và ý tưởng thương hiệu dựng từ một ảnh tham chiếu thô.' },
          ],
        },
      ],
    },
    {
      kicker: 'Kiểm soát',
      title: 'Có tuỳ chỉnh được tư thế, bối cảnh và phong cách của người mẫu không?',
      lead: 'Có, và việc đó nằm trong mô tả chứ không trong các menu. Trang này không có menu chọn độ tuổi, dáng người hay ngoại hình, nên bạn tả người bạn muốn và AI tạo ra người đó.',
      blocks: [
        {
          cols: 3,
          cards: [
            { title: 'Con người', text: 'Độ tuổi, màu da, tóc, dáng người và biểu cảm: “người phụ nữ khoảng ba mươi tuổi, tóc ngắn, cười nhẹ”.' },
            { title: 'Khung cảnh', text: 'Tư thế, cách phối đồ, địa điểm, thời điểm trong ngày và phong cách chụp: “đứng tựa lan can, nắng chiều, ảnh phim”.' },
            { title: 'Cùng một khuôn mặt', text: 'Đưa một ảnh đã tạo làm ảnh tham chiếu ở lần sau và dặn “giữ nguyên khuôn mặt”, để cùng một người đi qua cả loạt ảnh.' },
          ],
        },
        'Các nút trên thanh tạo ảnh chỉ lo phần kỹ thuật: Mô hình, Tỉ lệ và Độ phân giải. Mọi thứ về con người và khung cảnh nằm trong mô tả.',
      ],
    },
    {
      kicker: 'Theo thị trường',
      title: 'Ảnh AI có điều chỉnh theo từng thị trường được không?',
      lead: 'Được. Cùng một trang phục có thể được “chụp” cho một thị trường khác chỉ bằng vài chữ trong mô tả, không cần buổi chụp thứ hai hay ngân sách thứ hai.',
      blocks: [
        {
          cols: 3,
          cards: [
            { title: 'Đổi địa điểm', text: 'Một con phố Sài Gòn, một khu phố Seoul, một vỉa hè London trời âm u. Sản phẩm giữ nguyên, bối cảnh di chuyển quanh nó.' },
            { title: 'Đổi mùa', text: 'Một chiếc áo khoác có thể xuất hiện trong nắng đông Bắc Âu và nắng hè nhiệt đới trong cùng một buổi chiều.' },
            { title: 'Đổi người mẫu', text: 'Tả độ tuổi hay ngoại hình khác cho mỗi thị trường để mỗi cửa hàng có hình ảnh giống người đang mua ở đó, không phải tuyển ai.' },
          ],
        },
        'Giữ nguyên cách mô tả khung hình và ánh sáng trong cả bộ thì các phiên bản theo thị trường vẫn đọc như một thương hiệu. Chỉ đổi những chữ tả thị trường.',
      ],
    },
    {
      kicker: 'Mô hình tạo',
      title: 'Có những mô hình nào?',
      lead: 'Nút Mô hình quyết định công cụ nào tạo ảnh. Danh mục có tám mô hình, khác nhau về độ chi tiết, tốc độ, định dạng hỗ trợ và giá mỗi lần chạy; menu chỉ hiện mô hình Admin đã bật. Mọi mô hình nhận tối đa 4 ảnh tham chiếu.',
      blocks: [
        {
          cards: [
            { tag: 'Chất lượng cao nhất', title: 'Nano Banana Pro', media: 'model-nano-banana-pro', text: 'Mô hình chủ lực của Google, chọn khi ảnh sẽ được dùng lâu dài. Giữ ánh sáng và chất liệu thuyết phục hơn các mô hình khác, xuất ở 1K, 2K hoặc 4K.', specs: ['Tỉ lệ: auto, 1:1, 4:5, 5:4, 3:4, 4:3, 2:3, 3:2, 9:16, 16:9, 21:9', 'Độ phân giải: 1K, 2K, 4K'] },
            { tag: 'Mới nhất của Google', title: 'Nano Banana 2.1', media: 'model-nano-banana-2-1', text: 'Bản cập nhật của Nano Banana 2 ở cùng tốc độ Flash: ảnh chân thực hơn, chữ sắc hơn, bám mô tả sát hơn và giữ nhân vật nhất quán qua các lần chỉnh.', specs: ['Tỉ lệ: như Nano Banana Pro', 'Độ phân giải: 1K, 2K'] },
            { tag: 'Nhanh', title: 'Nano Banana 2', media: 'model-nano-banana-2', text: 'Mô hình Flash của Google, nhanh và nhiều tỉ lệ, hợp với thử nhanh ở 1K.', specs: ['Tỉ lệ: như Nano Banana Pro', 'Độ phân giải: 1K'] },
            { tag: 'Bám chỉ dẫn tốt nhất', title: 'GPT Image 2', media: 'model-gpt-image-2', text: 'Mô hình của OpenAI, đọc kỹ nhất một chỉ dẫn dài. Nếu mô tả có năm yêu cầu riêng, đây là mô hình dễ đáp ứng đủ cả năm nhất.', specs: ['Tỉ lệ: auto, 1:1, 9:16, 16:9, 3:4, 4:3', 'Độ phân giải: 1K'] },
            { tag: 'Mới nhất của OpenAI', title: 'GPT Image 2.5', media: 'model-gpt-image-2-5-flare', text: 'Bản kế nhiệm GPT Image 2, có hai biến thể. Flare là lựa chọn hằng ngày, nét hơn GPT Image 2 và nhanh hơn. Sunburst dành nhiều thời gian hơn cho mỗi ảnh để giữ chi tiết phức tạp, cho lần chỉnh khó cần kiểm soát chặt.', specs: ['Biến thể: Flare (nhanh), Sunburst (chính xác)', 'Tỉ lệ: auto, 1:1, 9:16, 16:9, 3:4, 4:3', 'Độ phân giải: 1K'] },
            { tag: 'Nhanh và rẻ', title: 'Nano Banana', media: 'model-nano-banana', text: 'Mô hình tiêu chuẩn của Google và rẻ nhất mỗi lần chạy. Dùng để thử ý tưởng và chỉnh mô tả trước khi chạy bản cuối.', specs: ['Tỉ lệ: như Nano Banana Pro', 'Độ phân giải: cỡ cố định'] },
            { tag: 'Người và cảnh chân thực', title: 'Seedream 5.0 Pro', media: 'model-seedream-5-pro', text: 'Mô hình của ByteDance, mạnh về người và khung cảnh chân thực. Đưa ảnh tham chiếu để chỉnh hoặc phối lại một cảnh, ở 1K hoặc 2K.', specs: ['Tỉ lệ: như Nano Banana Pro', 'Độ phân giải: 1K, 2K'] },
          ],
        },
        {
          table: [
            ['Mô hình', 'Hợp nhất với', 'Độ phân giải'],
            ['Nano Banana Pro', 'Ảnh cuối cho trang sản phẩm, quảng cáo và chiến dịch', '1K, 2K, 4K'],
            ['Nano Banana 2.1', 'Cảnh chân thực, chữ sắc nét ở tốc độ Flash', '1K, 2K'],
            ['Nano Banana 2', 'Thử nhanh với nhiều tỉ lệ', '1K'],
            ['GPT Image 2', 'Chỉ dẫn dài, chữ trên nhãn hay bao bì', '1K'],
            ['GPT Image 2.5 Flare', 'Lần chạy OpenAI hằng ngày, nét hơn GPT Image 2', '1K'],
            ['GPT Image 2.5 Sunburst', 'Chi tiết phức tạp khi lần chỉnh khó cần kiểm soát chặt', '1K'],
            ['Nano Banana', 'Bản nháp rẻ và thử mô tả', 'Cố định'],
            ['Seedream 5.0 Pro', 'Người và cảnh chân thực từ ảnh tham chiếu', '1K, 2K'],
          ],
        },
        'Cách làm nhiều người chọn: thử trên Nano Banana cho tới khi bố cục đã ổn, rồi chạy lại câu mô tả đó trên Nano Banana Pro ở độ phân giải cao hơn. Nếu không muốn thử cả tám, Nano Banana Pro ở 2K là lựa chọn an toàn, và GPT Image 2.5 Flare khi sản phẩm có chữ.',
      ],
    },
    {
      kicker: 'Chữ trong ảnh',
      title: 'AI có tạo được ảnh sản phẩm với chữ đọc rõ không?',
      blocks: [
        'Có, và mô hình bạn chọn quyết định chữ rõ đến đâu. Chữ trên nhãn mác, logo trên ngực áo, chữ trên bao bì, giá trên thẻ treo: chữ là chi tiết các mô hình ảnh xưa nay hay làm hỏng, biến chữ thật thành thứ trông giống chữ khi nhìn xa và vỡ ra khi nhìn gần.',
        'Các mô hình GPT Image viết chữ chính xác nhất trong tám mô hình ở đây, nên hãy dùng chúng khi sản phẩm có chữ mà khách sẽ đọc. Bắt đầu với GPT Image 2.5 Flare, và chuyển sang Sunburst khi nhãn hay logo cần thêm một lượt chính xác.',
        'Viết đúng dòng chữ trong mô tả, đặt trong ngoặc kép, ví dụ: nhãn ghi “VET STUDIO”. Chữ càng ngắn, kết quả càng chắc.',
      ],
    },
    {
      kicker: 'Khung hình',
      title: 'Nên chọn tỉ lệ khung hình nào?',
      lead: 'Tỉ lệ quyết định hình dạng ảnh. Hãy chọn trước khi chạy, vì cắt sau sẽ ăn vào bố cục bạn vừa trả tiền.',
      blocks: [
        {
          ratios: [
            ['auto', 'Giữ khung của ảnh tham chiếu'],
            ['1:1', 'Lưới sản phẩm, ảnh đại diện trên sàn và ô danh mục'],
            ['4:5', 'Bài đăng Instagram và trang lookbook'],
            ['9:16', 'Stories, Reels, TikTok và quảng cáo dọc'],
            ['16:9', 'Ảnh đầu trang website và bài thuyết trình'],
            ['21:9', 'Banner và ảnh đầu trang siêu rộng'],
          ],
        },
        'Các định dạng ảnh cổ điển đều có: 5:4, 4:3 và 3:2, cùng bản dọc 3:4 và 2:3. Các mô hình Nano Banana và Seedream 5.0 Pro có đủ danh sách; các mô hình GPT Image có auto, 1:1, 9:16, 16:9, 3:4 và 4:3.',
      ],
    },
    {
      kicker: 'Kích thước ảnh',
      title: 'Nên tạo ở độ phân giải nào?',
      lead: 'Độ phân giải quyết định kích thước điểm ảnh của ảnh. Độ phân giải cao hơn có thể đắt hơn, nên hãy tạo ở cỡ ảnh sẽ thực sự hiển thị. Bạn luôn có thể phóng to ảnh ưng ý sau.',
      blocks: [
        {
          cols: 3,
          cards: [
            { tag: '1024px', title: '1K', text: 'Thử mô tả và bảng tin mạng xã hội. Thử rẻ ở đây cho tới khi bố cục đúng, rồi mới chi cho bản cuối.' },
            { tag: '2048px', title: '2K', text: 'Trang chi tiết sản phẩm và quảng cáo trả phí, nơi khách phóng to xem chất vải, đường may và hoạ tiết.' },
            { tag: '4096px', title: '4K', text: 'Ảnh chủ đạo chiến dịch, bìa lookbook và in ấn. Chi tiết tối đa cho hình ảnh mà cả đợt ra mắt dựa vào.' },
          ],
        },
        'Nano Banana Pro có đủ ba cỡ; Nano Banana 2.1 và Seedream 5.0 Pro có 1K và 2K; các mô hình còn lại tạo ở một cỡ. Cần to hơn thì chạy ảnh qua ứng dụng Tăng độ phân giải.',
      ],
    },
    {
      kicker: 'Chỉ đạo',
      title: 'Viết mô tả thế nào cho hiệu quả?',
      blocks: [
        'Ảnh thời trang AI được chỉ đạo bằng chữ, nên mô tả là toàn bộ bản brief. Nó thay cho nhiếp ảnh gia, stylist và người đi tìm địa điểm cùng lúc. Câu đơn giản, cụ thể là tốt nhất; không có từ khoá thần kỳ hay cú pháp nào phải học.',
        'Một mô tả tốt thường trả lời bốn câu hỏi. Không cần đủ cả bốn mỗi lần, nhưng mỗi câu bạn trả lời là một quyết định chuyển từ AI về tay bạn.',
        {
          cards: [
            { title: 'Ai trong khung hình?', text: 'Gọi tên chủ thể và việc họ đang làm: “một người mẫu nam mặc áo khoác trong ảnh, đang bước qua đường”.' },
            { title: 'Ở đâu?', text: 'Gọi tên địa điểm, phông nền và thời điểm: “con hẻm nhỏ ở Hà Nội, buổi sáng sớm”.' },
            { title: 'Ánh sáng thế nào?', text: '“Nắng xiên mềm từ bên trái”, “ánh đèn studio dịu, bóng nhẹ”.' },
            { title: 'Chụp kiểu gì?', text: 'Ngôn ngữ nhiếp ảnh: “ảnh toàn thân, ống kính 50mm, màu phim, tạp chí”.' },
          ],
        },
        { example: { label: 'Mô tả dựng cảnh', text: 'The woman from the reference photo in the same denim jacket, walking along a quiet tree-lined street in soft morning light, full-body shot, natural film colours.', media: 'about-image-prompt-1' } },
        { example: { label: 'Mô tả chỉnh ảnh', text: 'Turn this on-model photo into a clean product shot of the jacket alone on a plain white background, front view, soft even studio light. Keep the colour, stitching and buttons exactly as in the photo.', media: 'about-image-prompt-2' } },
        {
          list: [
            'Khi chỉnh ảnh tham chiếu, nói rõ điều phải giữ nguyên: “giữ nguyên khuôn mặt và chiếc áo”.',
            'Nhắc thẳng tới ảnh đã tải lên, ví dụ “người trong ảnh thứ nhất mặc chiếc váy trong ảnh thứ hai”.',
            'Đưa ràng buộc chứ không chỉ mong muốn: “không có chữ, không có logo”.',
            'Đổi từng thứ một. Dùng kết quả làm ảnh tham chiếu cho lần sau và chỉnh tư thế, rồi phông nền, rồi ánh sáng.',
          ],
        },
      ],
    },
    {
      kicker: 'Làm cho đúng',
      title: 'Những lỗi hay gặp nhất là gì?',
      lead: 'Khi kết quả không như ý, nguyên nhân gần như luôn là một mô tả mơ hồ hoặc một ảnh tham chiếu yếu. Đây là các trường hợp hay gặp nhất, kèm cách sửa.',
      blocks: [
        {
          cards: [
            { tag: 'Không nên', title: 'Viết mô tả một chữ', text: '“Đẹp”, “sang trọng” hay “thời trang” để AI tự quyết gần như mọi thứ, và kết quả là một ảnh chung chung.' },
            { tag: 'Nên', title: 'Tả bức ảnh như khi brief thợ chụp', text: 'Chủ thể, bối cảnh, ánh sáng, phong cách. Hai câu bằng lời thường là đủ để kiểm soát kết quả.' },
            { tag: 'Không nên', title: 'Tải ảnh tham chiếu mờ hoặc rối', text: 'Ảnh độ phân giải thấp và nền bừa bộn che mất chi tiết AI cần, và khuôn mặt, chất vải, màu sắc bị trôi trong kết quả.' },
            { tag: 'Nên', title: 'Dùng ảnh tham chiếu nét, đủ sáng', text: 'Một ảnh rõ trên nền sạch, kể cả chụp bằng điện thoại, giữ chủ thể trung thực qua mọi lần chỉnh.' },
          ],
        },
        {
          list: [
            'Đổi mọi thứ cùng lúc? Tách thành nhiều lần chạy: tư thế trước, rồi phông nền, rồi ánh sáng.',
            'Chi tiết bị mềm? Chạy lại cùng mô tả trên Nano Banana Pro ở 2K hoặc 4K.',
            'Kết quả bỏ qua một phần của chỉ dẫn dài? Thử GPT Image 2.5 Flare, mô hình bám chỉ dẫn nhiều bước sát nhất.',
          ],
        },
      ],
    },
    {
      kicker: 'Tạo tiếp',
      title: 'Làm gì với kết quả?',
      lead: 'Một ảnh đã tạo thường chỉ là điểm bắt đầu. Mọi ảnh trong Thư viện đều tải xuống được để dùng ở các trang khác.',
      blocks: [
        {
          links: [
            ['Tăng độ phân giải', '/apps/image-upscale', 'phóng kết quả lên tới 4K cho in ấn và chiến dịch.'],
            ['Đổi khung hình', '/apps/reframe', 'mở rộng ảnh sang tỉ lệ mới cho banner và Stories.'],
            ['Đổi nền', '/apps/background-changer', 'đổi cảnh mà không phải tạo lại chủ thể.'],
            ['Tạo video', '/create', 'làm động ảnh thành một video thời trang ngắn.'],
            ['Đổi người mẫu', '/apps/model-swap', 'thay người trong ảnh trong khi trang phục và phông nền giữ nguyên.'],
            ['Thử đồ', '/try-on', 'mặc trang phục của bạn lên người mẫu bằng công cụ thử đồ chuyên dụng.'],
          ],
        },
      ],
    },
    {
      kicker: 'Thuật ngữ',
      title: 'Ảnh tham chiếu, chỉnh ảnh, mô tả: nghĩa là gì?',
      blocks: [
        {
          cards: [
            { title: 'Ảnh tham chiếu', text: 'Ảnh bạn tải lên làm đầu vào: ảnh sản phẩm, ảnh người mẫu hay một kết quả trước đó. Tối đa 4 ảnh mỗi lần chạy.' },
            { title: 'Chỉnh ảnh', text: 'Sửa hoặc phối lại một ảnh có sẵn. AI giữ những gì bạn bảo nó giữ và tạo lại phần còn lại theo mô tả.' },
            { title: 'Mô tả', text: 'Câu chỉ dẫn điều khiển việc tạo ảnh: chủ thể, bối cảnh, ánh sáng và phong cách bạn muốn trong ảnh cuối.' },
            { title: 'Tỉ lệ auto', text: 'Ảnh tạo ra giữ khung của ảnh tham chiếu thay vì một tỉ lệ bạn chọn.' },
          ],
        },
      ],
    },
    {
      kicker: 'Hỏi đáp',
      title: 'Câu hỏi thường gặp',
      blocks: [
        {
          faq: [
            ['Có cần ảnh sản phẩm thật không?', 'Cần ít nhất một ảnh tham chiếu cho mỗi lần chạy. Với ý tưởng và moodboard, ảnh đó có thể là một ảnh thô bất kỳ có bố cục gần đúng. Khi trang phục phải chính xác, hãy tải đúng ảnh của nó: AI giữ những gì bạn bảo nó giữ, đúng điều bạn cần cho thứ khách sẽ mua.'],
            ['Một lần tạo ảnh tốn bao nhiêu?', 'Chi phí tuỳ mô hình và độ phân giải bạn chọn. Nút Tạo ảnh ghi chi phí ước tính bằng USD trước khi bạn bấm và cập nhật khi bạn đổi lựa chọn. Ảnh và ứng dụng có ngân sách riêng, tách khỏi video: mỗi người có hạn mức theo ngày và theo tháng, công ty có hạn mức theo tháng.'],
            ['Đổi được độ tuổi, màu da và phong cách của người mẫu không?', 'Được, qua mô tả. Trang này không có menu chọn độ tuổi hay dáng người, nên bạn tả người bạn muốn: độ tuổi, màu da, tóc, dáng người, biểu cảm, tư thế và cách phối đồ. Muốn giữ cùng một người qua cả loạt ảnh, đưa một ảnh đã tạo làm ảnh tham chiếu ở lần sau và dặn giữ nguyên khuôn mặt.'],
            ['Ảnh điện thoại làm ảnh tham chiếu có đủ không?', 'Đủ. Một ảnh điện thoại nét, đủ sáng là dùng được, không cần máy ảnh hay studio. AI đọc chủ thể, màu sắc và chi tiết từ đó. Tránh ảnh mờ hoặc nén nặng, vì thứ gì ảnh che đi AI sẽ phải tự bịa ra.'],
            ['Trang này dùng những mô hình nào?', 'Danh mục có tám mô hình: Nano Banana Pro, Nano Banana 2.1, Nano Banana 2 và Nano Banana của Google; GPT Image 2, GPT Image 2.5 Flare và GPT Image 2.5 Sunburst của OpenAI; và Seedream 5.0 Pro của ByteDance. Bạn chọn trong nút Mô hình trước mỗi lần chạy, trong số mô hình Admin đã bật, và đổi mô hình cũng đổi chi phí ghi trên nút chạy.'],
            ['Nên chọn mô hình nào?', 'Nano Banana Pro cho độ chi tiết cao nhất và tới 4K cho ảnh dùng thật. Nano Banana 2.1 cho ảnh chân thực, chữ sắc ở 1K hoặc 2K. GPT Image 2 và GPT Image 2.5 bám chỉ dẫn dài sát nhất và viết chữ chính xác nhất. Seedream 5.0 Pro mạnh về người và cảnh chân thực. Nano Banana rẻ và nhanh nhất cho bản nháp.'],
            ['Viết mô tả thế nào cho tốt?', 'Tả chủ thể, bối cảnh, ánh sáng và phong cách chụp bằng câu đơn giản. Khi chỉnh ảnh tham chiếu, nói điều cần đổi và điều phải giữ, ví dụ “đổi phông nền thành phố đêm, giữ nguyên khuôn mặt và chiếc áo”. Viết tiếng Việt cũng được khi Cải thiện đang bật, vì mô tả được dịch sang tiếng Anh trước khi chạy.'],
            ['Nút Cải thiện làm gì?', 'Khi Cải thiện bật (mặc định), AI viết lại mô tả ngắn của bạn thành một bản tả chi tiết bằng tiếng Anh trước khi chạy, và dịch nếu bạn viết tiếng Việt. Nó không nhìn thấy ảnh, nên chỉ thêm chi tiết về bố cục, ánh sáng và phong cách, không bịa màu sắc, chữ hay logo. Tắt Cải thiện khi bạn muốn gửi đúng câu của mình.'],
            ['Chỉnh một ảnh có sẵn thay vì tạo mới được không?', 'Được, đó là cách trang này làm việc. Tải ảnh lên làm ảnh tham chiếu và tả chỉnh sửa: đổi phông nền, đổi tư thế, bỏ một món đồ, hay biến ảnh người mẫu thành ảnh sản phẩm sạch. AI giữ mọi thứ bạn không yêu cầu đổi, nên nói rõ điều phải giữ là đáng làm.'],
            ['Tạo ảnh sản phẩm từ một ảnh duy nhất được không?', 'Được. Tải một ảnh sản phẩm, kể cả ảnh điện thoại hay ảnh người mẫu, và tả ảnh bạn cần: ảnh nền trắng sạch, một cảnh đời thường hay một góc mới. AI dựng lại mọi thứ quanh sản phẩm trong khi giữ sản phẩm chính xác.'],
            ['Tạo một ảnh mất bao lâu?', 'Phần lớn ảnh xong sau vài giây đến khoảng một phút và hiện trong tab Lịch sử ngay khi xong. Độ phân giải cao thường lâu hơn một chút. Bạn có thể tiếp tục làm việc trong lúc ảnh đang tạo.'],
            ['Ảnh thuộc về ai?', `Ảnh là tài sản của công ty, dùng cho trang sản phẩm, mạng xã hội và quảng cáo của công ty. ${RIGHTS}`],
            PRIVACY,
          ],
        },
      ],
    },
  ],
};

const hookCards: AboutCard[] = HOOKS.map((h) => ({ title: h.name, text: h.desc, media: `marketing-hook-${h.id}` }));
const locationCards: AboutCard[] = LOCATIONS.map((l) => ({ title: l.name, text: l.desc, media: `marketing-location-${l.id}` }));
const locationNames = LOCATIONS.map((l) => l.name).join(', ');
const hookNames = HOOKS.map((h) => h.name).join(', ');

/** Marketing Studio, the UGC Try On format. */
const marketing: AboutPage = {
  title: 'UGC Thử đồ: video kiểu người sáng tạo nội dung cho quảng cáo thời trang',
  lead: 'Hai ảnh vào, một video quảng cáo kiểu người sáng tạo nội dung ra. Một người mẫu, một sản phẩm, và AI dựng cảnh quay điện thoại người đó mặc sản phẩm của bạn. Không phải tìm người sáng tạo nội dung, không đặt lịch quay, không phải dựng lại sau.',
  sections: [
    {
      kicker: 'Vì sao quan trọng',
      title: 'Vì sao thương hiệu chạy quảng cáo kiểu UGC?',
      lead: 'Nội dung do người dùng tạo hiệu quả hơn quảng cáo bóng bẩy trên mạng xã hội, vì người xem thấy ý kiến của một con người trong đó. Video UGC tạo bằng AI giữ được chất đó và bỏ đi phần đi tìm người, đổi cả chi phí lẫn tốc độ thử nghiệm.',
      blocks: [
        {
          cards: [
            { title: 'Chân thực thì bán được', text: 'Một clip kiểu người sáng tạo nội dung đọc như lời giới thiệu của người thật. Người xem xem lâu hơn, tin hơn và bấm vào nhiều hơn so với một quảng cáo trau chuốt.' },
            { title: 'Không phải tìm người', text: 'Tìm người sáng tạo nội dung, gửi hàng, brief và chờ bản giao mất nhiều tuần mỗi chiến dịch. Ở đây cả vòng chỉ là hai ảnh và chi phí mô hình ghi sẵn trên nút chạy.' },
            { title: 'Hook mới khi cần', text: 'Nền tảng quảng cáo phạt nội dung đã nhàm. Chạy lại cùng sản phẩm với hook, bối cảnh hay thời lượng khác để thử cách mở đầu mà không phải brief lại ai.' },
            { title: 'Sẵn cho mạng xã hội', text: 'Video tạo ở khung dọc 9:16, quay kiểu cầm tay bằng điện thoại, đúng cỡ và nhịp cho Reels, TikTok và Stories, không phải đổi định dạng.' },
          ],
        },
      ],
    },
    {
      kicker: 'Sự kết hợp',
      title: 'UGC Thử đồ khác các công cụ UGC khác ở đâu?',
      blocks: [
        'Phần lớn công cụ video UGC bằng AI đặt một người dẫn ảo cạnh sản phẩm và cho họ nói về nó. Công cụ này đặt sản phẩm lên người, điều tách một công cụ UGC cho thời trang khỏi một công cụ chung chung. Điểm nhấn của mỗi clip là chính khoảnh khắc thử đồ, khi trang phục của bạn được người trong video mặc thật, và đó là thứ khách mua quần áo muốn thấy.',
        'Đó là lý do công cụ nhận hai ảnh chứ không phải một. Ảnh người mẫu quyết định người trong video là ai, ảnh sản phẩm quyết định họ mặc gì, và AI được dặn coi khoảnh khắc mặc đồ là trọng tâm của quảng cáo chứ không phải chi tiết nền.',
        {
          cols: 3,
          cards: [
            { title: 'Sản phẩm được giữ đúng', text: 'Chỉ dẫn cố định của công cụ yêu cầu giữ khuôn mặt, dáng người cùng hình dáng, màu sắc và chi tiết của sản phẩm đúng như ảnh.' },
            { title: 'Khoảnh khắc thử đồ là điểm nhấn', text: 'Người trong video mặc sản phẩm như trang phục của chính mình, nên trang phục không bao giờ chỉ nằm trên bàn.' },
            { title: 'Không chữ trên hình', text: 'Không chữ, không logo, không watermark được dựng lên hình. Bạn tự thêm phụ đề trong phần mềm dựng theo ý mình.' },
          ],
        },
        'Marketing Studio hiện có định dạng UGC Thử đồ. Các định dạng Mở hộp và Đánh giá sản phẩm hiện trong bảng chọn định dạng nhưng chưa được xây dựng.',
      ],
    },
    {
      kicker: 'Từng bước',
      title: 'Video UGC Thử đồ hoạt động thế nào?',
      lead: 'Mỗi video bắt đầu từ hai ảnh và kết thúc là một clip quảng cáo hoàn chỉnh. AI lo cảnh quay và cách thể hiện ở giữa.',
      blocks: [
        {
          steps: [
            { title: 'Chọn người mẫu và sản phẩm', text: 'Tải ảnh một người mẫu, rồi thêm một ảnh sản phẩm rõ ràng. Mỗi bên một ảnh, người mẫu trước, sản phẩm sau. Ảnh rõ mặt và rõ sản phẩm cho kết quả tốt hơn.', media: 'about-marketing-step-1' },
            { title: 'Chọn hook, bối cảnh và thông số', text: `Mở đầu bằng một trong ${HOOKS.length} hook, đặt cảnh ở một trong ${LOCATIONS.length} bối cảnh, chọn tỉ lệ và thời lượng, và thêm một ghi chú về điều bạn muốn nếu cần.`, media: 'about-marketing-step-2' },
            { title: 'Chạy và để AI chỉ đạo', text: 'Bấm Tạo video, với chi phí ước tính bằng USD ghi trên nút, và AI dựng video từ hai ảnh cùng các lựa chọn của bạn. Clip xong nằm trong tab Lịch sử và trong Thư viện, mục Marketing Studio.', media: 'about-marketing-step-3' },
          ],
        },
      ],
    },
    {
      kicker: 'Không cần tuyển người',
      title: 'Làm video thử đồ kiểu UGC mà không cần người sáng tạo nội dung thật?',
      blocks: [
        'Bạn đưa một gương mặt thay vì thuê một người. Tải ảnh người mẫu, thêm ảnh sản phẩm, và AI tạo một người như đang tự quay mình thử sản phẩm. Không tuyển ai, không gửi hàng, không lên lịch.',
        'Cách này bỏ đi những phần tốn thời gian nhất của tiếp thị qua người ảnh hưởng: tìm người, thương lượng giá, gửi mẫu, chờ bản đầu, rồi xin sửa và chờ thêm một tuần. Một video thử đồ UGC bằng AI xong trước cả khi email tìm người được trả lời.',
        'Thứ bạn bỏ đi là một lời giới thiệu thật của một người thật, nên đây là một định dạng sáng tạo chứ không thay được hợp tác thật với một cộng đồng thật. Thứ bạn nhận lại là dáng vẻ và nhịp của nội dung người sáng tạo, ở số lượng mà quảng cáo mạng xã hội thật sự cần. Chỉ dùng ảnh người mẫu khi người đó đã đồng ý.',
      ],
    },
    {
      kicker: 'Mở đầu',
      title: 'Hook là gì và vì sao nó quyết định tất cả?',
      lead: 'Hook là khoảnh khắc mở đầu gây chú ý của một video UGC. Vài giây đầu quyết định người xem ở lại hay lướt qua, nên một hook tốt mở ra một bí ẩn nhỏ: một điều bất ngờ xảy ra, và người xem ở lại để xem nó kết thúc ra sao. Sản phẩm luôn là nhân vật chính của phần kết.',
      blocks: [{ cols: 3, cards: hookCards }, 'Bỏ qua hook cũng được. Chọn Không chọn và video mở thẳng vào người mẫu với sản phẩm trước khi chuyển sang phần thử đồ.'],
    },
    {
      kicker: 'Thử nghiệm',
      title: 'Thử cùng một quảng cáo với nhiều hook được không?',
      blocks: [
        'Được, và đó là kiểu thử rẻ nhất bạn có thể làm. Giữ nguyên ảnh người mẫu, ảnh sản phẩm và bối cảnh, chỉ đổi hook rồi chạy lại. Mọi thứ khác trong khung hình vẫn so sánh được, nên chênh lệch hiệu quả chỉ về phía cách mở đầu chứ không phải phần còn lại.',
        `Có sẵn ${HOOKS.length} hook, tức ${HOOKS.length} cách mở đầu cho một sản phẩm mà không phải brief ai. Thời lượng cũng vậy: cùng một thiết lập ở 5 giây và 10 giây cho bạn một bản ngắn và một bản dài để thử với nhau.`,
        'Cách làm thực tế là tạo ba bốn biến thể hook, chạy tất cả với ngân sách nhỏ, rồi dồn ngân sách thật cho bản thắng. Vì mỗi biến thể chỉ tốn chi phí mô hình chứ không phải phí người sáng tạo nội dung, thử cách mở đầu không còn là việc chỉ dành cho chiến dịch lớn.',
      ],
    },
    {
      kicker: 'Bối cảnh',
      title: 'Video có thể đặt ở đâu?',
      blocks: [
        `Mỗi video được đặt ở một nơi đáng tin, với ánh sáng và không khí phù hợp. Chọn trong ${LOCATIONS.length} bối cảnh có sẵn: ${locationNames}. Phòng ngủ là bối cảnh ấm cúng, đời thường hợp với phần lớn sản phẩm, còn Sân thượng, Cửa sổ trời ô tô hay Cánh máy bay đẩy clip về phía lạ mắt, khiến người xem dừng lướt.`,
        'Bảng chọn bối cảnh có video xem trước cho mỗi lựa chọn, nên bạn thấy đúng không khí trước khi chạy. Không chọn bối cảnh thì AI tự chọn một khung cảnh hợp với hai ảnh.',
      ],
    },
    {
      kicker: 'Âm thanh',
      title: 'Video có tiếng không?',
      blocks: [
        'Có. Như trên Fash, Tạo âm thanh bật sẵn: clip có tiếng như quay bằng điện thoại, gồm âm thanh căn phòng và vài câu phản ứng ngắn, tự nhiên của người mẫu về sản phẩm, không có nhạc nền. Tắt công tắc để có clip im lặng. Muốn viết đúng từng chữ người mẫu nói, hãy dùng định dạng Nâng cao.',
        {
          cols: 3,
          cards: [
            { title: 'Dáng quay điện thoại thật', text: 'Ánh sáng tự nhiên, máy hơi rung tay, chất hình chân thật. Đoạn quay giống người sáng tạo nội dung thật hơn là quảng cáo bóng bẩy, vì đó là thứ hiệu quả trên bảng tin.' },
            { title: 'Đúng người, đúng sản phẩm', text: 'Chỉ dẫn cố định yêu cầu giữ khuôn mặt và dáng người theo ảnh người mẫu, cùng hình dáng, màu sắc và chi tiết theo ảnh sản phẩm.' },
            { title: 'Tiếng như quay điện thoại', text: 'Âm thanh căn phòng và lời phản ứng ngắn của người mẫu, không nhạc nền. Cần nhạc, phụ đề hay giọng thương hiệu thì tắt âm thanh và thêm trong phần mềm dựng.' },
          ],
        },
        'Muốn lái video? Ô Prompt (tuỳ chọn) nhận ghi chú về chi tiết sản phẩm, không khí hay một khoảnh khắc bạn muốn; ghi chú được ghép vào cuối chỉ dẫn cố định của công cụ.',
      ],
    },
    {
      kicker: 'Thị trường',
      title: 'Video UGC Thử đồ dùng cho nhiều thị trường được không?',
      blocks: [
        'Được. Lời phản ứng trong clip ngắn và tự nhiên; với thị trường dùng ngôn ngữ khác, tắt Tạo âm thanh để có clip không lời, rồi thêm phụ đề hay lồng tiếng theo từng thị trường trong phần mềm dựng.',
        'Hợp thị trường còn hơn cả ngôn ngữ. Ảnh người mẫu quyết định khán giả thấy ai, nên chạy cùng sản phẩm với một người mẫu khác cho mỗi thị trường một gương mặt giống khách hàng ở đó. Bảng chọn bối cảnh đổi khung cảnh, nên cùng một chiếc áo khoác có thể xuất hiện trong phòng ngủ cho thị trường này và trên sân thượng thành phố cho thị trường khác.',
        'Giữ nguyên ảnh sản phẩm trong cả bộ và chỉ đổi người mẫu và bối cảnh. Các quảng cáo khi đó đọc như một chiến dịch với gương mặt địa phương, đúng dáng vẻ của một đợt triển khai theo từng thị trường.',
      ],
    },
    {
      kicker: 'Nơi chạy',
      title: 'Quảng cáo UGC Thử đồ hiệu quả nhất ở đâu?',
      lead: 'Video quảng cáo kiểu UGC được làm trước hết cho quảng cáo mạng xã hội. Khung dọc, dáng quay cầm tay và nhịp nhanh đều nhắm vào những bảng tin nơi người xem quyết định trong chưa tới hai giây có xem tiếp hay không.',
      blocks: [
        {
          table: [
            ['Vị trí', 'Nên tạo gì', 'Tỉ lệ', 'Độ dài'],
            ['Quảng cáo Meta và TikTok', 'Hook mạnh, khoảnh khắc thử đồ, một cảnh kết', '9:16', '8–10 giây'],
            ['Reels và Stories tự nhiên', 'Mở đầu nhẹ hơn, nhiều thời gian hơn cho trang phục', '9:16', '10 giây'],
            ['Thử A/B hook', 'Cùng người mẫu, sản phẩm và bối cảnh, chỉ đổi hook', '9:16', '5 giây'],
            ['Bài đăng bảng tin', 'Khung vuông không bị cắt khi lên lưới', '1:1', '6–10 giây'],
          ],
        },
        'Hãy coi đây là phương án thay cho một đợt nội dung của người ảnh hưởng chứ không thay người ảnh hưởng. Dùng clip tạo ra để tìm hook và góc nhìn hiệu quả, rồi đầu tư vào hợp tác thật khi đã biết điều gì bán được.',
      ],
    },
    {
      kicker: 'Khung hình',
      title: 'Nên chọn tỉ lệ khung hình nào?',
      lead: 'Tỉ lệ quyết định hình dạng video. Hãy chọn theo nền tảng sẽ đăng, vì cắt một video đã xong là cắt vào phần hành động bạn đã trả tiền.',
      blocks: [
        {
          ratios: [
            ['9:16', 'Reels, TikTok, Stories và quảng cáo dọc, mặc định'],
            ['1:1', 'Bài đăng bảng tin và ô sản phẩm trên sàn'],
            ['16:9', 'YouTube, trang web và quảng cáo ngang'],
          ],
        },
        'Menu Tỉ lệ chỉ có các tỉ lệ mà mô hình đã bật cho Marketing Studio hỗ trợ; Kling O3 Pro có 9:16 và 1:1.',
      ],
    },
    {
      kicker: 'Thời lượng',
      title: 'Video nên dài bao lâu?',
      lead: 'Thời lượng đi theo mô hình đã bật cho Marketing Studio: Kling O3 Pro cho 5 đến 10 giây. Thời lượng cũng là thứ đổi chi phí, vì chi phí tính theo giây, nên hãy chọn theo việc cần làm thay vì mặc định chọn tối đa.',
      blocks: [
        {
          cols: 3,
          cards: [
            { tag: 'Một nhịp', title: '5 giây', text: 'Một cú chốt: hook xuất hiện và sản phẩm trả lời ngay. Cách rẻ nhất để thử.' },
            { tag: 'Điểm cân bằng', title: '6–8 giây', text: 'Đủ chỗ cho hook, khoảnh khắc sản phẩm và một cảnh kết. Độ dài chuẩn cho quảng cáo trên bảng tin.' },
            { tag: 'Kể chuyện', title: '9–10 giây', text: 'Thêm một hai cảnh quay, cho clip kể trọn câu chuyện hơn.' },
          ],
        },
        'Video dài hơn tốn hơn, và chi phí ước tính luôn ghi trên nút Tạo video trước khi chạy. Kling O3 Pro xuất video ở 1080p.',
      ],
    },
    {
      kicker: 'Tạo tiếp',
      title: 'Làm gì với kết quả?',
      lead: 'Marketing Studio nằm ở cuối quy trình. Các trang khác chuẩn bị đầu vào và mở rộng đầu ra cho nó.',
      blocks: [
        {
          links: [
            ['Thử đồ', '/try-on', 'mặc trang phục lên người mẫu trước, để ảnh bạn đưa vào đã có bộ đồ bạn muốn.'],
            ['Đổi nhân vật', '/apps/character-swap', 'thay người trong một ảnh bạn đã có, một cách khác để đổi người trong video giữa các thị trường.'],
            ['Tạo ảnh', '/image-generation', 'chỉnh ảnh người mẫu hay ảnh sản phẩm để đưa vào đây.'],
            ['Tạo video', '/create', 'làm video đa dụng với các họ mô hình Kling, Seedance, VEO và nhiều họ khác.'],
          ],
        },
      ],
    },
    {
      kicker: 'Hỏi đáp',
      title: 'Câu hỏi thường gặp',
      blocks: [
        {
          faq: [
            ['Có cần thuê người sáng tạo nội dung hay tổ chức buổi quay không?', 'Không. Bạn đưa hai ảnh và AI lo phần còn lại. Tải ảnh người mẫu và ảnh sản phẩm, và công cụ tạo một người như đang tự quay mình thử sản phẩm, theo phong cách quay điện thoại tự nhiên. Không tuyển ai, không gửi hàng, không lên lịch quay.'],
            ['Tạo nhiều hook cho cùng một sản phẩm để thử A/B được không?', `Được, và đó là kiểu thử rẻ nhất. Giữ nguyên ảnh người mẫu, ảnh sản phẩm và bối cảnh, chỉ đổi hook và chạy lại. Có sẵn ${HOOKS.length} hook, và thời lượng cũng đổi được nếu bạn muốn một bản ngắn và một bản dài để so.`],
            ['Người trong video có giữ nguyên qua cả chiến dịch không?', 'Khuôn mặt giữ được nếu bạn dùng lại cùng một ảnh người mẫu cho mọi lần chạy, và sản phẩm bám theo ảnh sản phẩm. Mỗi lần chạy vẫn là một video mới, nên cử chỉ và khung hình sẽ khác nhau giữa các clip.'],
            ['Công cụ dùng mô hình nào?', 'Marketing Studio chạy các mô hình video Admin đã bật cho nó; hiện là Kling O3 Pro, được chọn vì giữ chuyển động chân thực và nhận nhiều ảnh tham chiếu ở 1080p. Nếu có hơn một mô hình, menu Mô hình cho bạn chọn. Muốn tự chọn trong nhiều họ mô hình hơn, hãy dùng trang Tạo video.'],
            ['AI có làm được quảng cáo UGC không?', 'Được. Công cụ biến một ảnh người mẫu và một ảnh sản phẩm thành video thử đồ ngắn kiểu UGC, sẵn cho mạng xã hội, không cần tìm người, quay hay dựng.'],
            ['Hook trong video UGC là gì?', `Hook là khoảnh khắc mở đầu gây chú ý, vài giây đầu quyết định người xem ở lại hay lướt qua. Chọn một trong ${HOOKS.length} hook có sẵn: ${hookNames}. AI mở video bằng hook đó rồi chuyển sang phần thử đồ.`],
            ['Cần gì để tạo một video UGC Thử đồ?', 'Hai ảnh: một người mẫu và một sản phẩm. Hook, bối cảnh và một ghi chú ngắn là tuỳ chọn.'],
            ['Một video UGC Thử đồ tốn bao nhiêu?', 'Chi phí tuỳ mô hình và thời lượng, vì chi phí tính theo giây. Nút Tạo video ghi chi phí ước tính bằng USD trước khi bạn chạy. Âm thanh làm giá cao hơn ở một số mô hình, và giá trên nút đã tính nó. Video dùng chung ngân sách với Tạo video: hạn mức số clip theo ngày của bạn và ngân sách video theo tháng của công ty.'],
            ['Video có giọng nói không?', 'Có, khi Tạo âm thanh bật (mặc định): người mẫu nói vài câu phản ứng ngắn, kèm âm thanh căn phòng, không nhạc nền. Tắt công tắc để có clip im lặng; muốn viết lời thoại chính xác thì dùng định dạng Nâng cao.'],
            ['Kiểm soát được nội dung video không?', 'Ô Prompt (tuỳ chọn) lái video. Nhắc chi tiết sản phẩm, không khí hay khoảnh khắc bạn muốn; ghi chú được ghép vào cuối chỉ dẫn cố định. Hook và bối cảnh cho bạn thêm hai cách kiểm soát nữa.'],
            ['Dùng cho nhiều ngôn ngữ và thị trường được không?', 'Được. Tắt Tạo âm thanh để có clip không lời, dùng được ở mọi ngôn ngữ; thêm phụ đề hay lồng tiếng theo từng thị trường khi dựng. Đổi ảnh người mẫu và bối cảnh để mỗi thị trường có gương mặt và khung cảnh của riêng mình.'],
            ['Video đặt được ở những bối cảnh nào?', `${LOCATIONS.length} bối cảnh có sẵn: ${locationNames}. Mỗi bối cảnh đặt người trong video vào một khung cảnh đáng tin với ánh sáng và không khí phù hợp, và bảng chọn có video xem trước cho từng lựa chọn.`],
            ['Có những tỉ lệ và độ dài nào?', 'Tỉ lệ và thời lượng đi theo mô hình đã bật cho Marketing Studio. Với Kling O3 Pro: 9:16 dọc (mặc định) cho Reels, TikTok và Stories, thêm 1:1, và thời lượng 5 đến 10 giây.'],
            ['Video có phụ đề hay chữ trên hình không?', 'Không. Chỉ dẫn cố định yêu cầu không thêm chữ, logo hay watermark vào hình. Thêm phụ đề sau trong phần mềm dựng, nơi bạn kiểm soát phông chữ, vị trí và quy định phụ đề của từng nền tảng.'],
            ['Video thuộc về ai?', `Video là tài sản của công ty, dùng cho trang sản phẩm, mạng xã hội và quảng cáo của công ty. ${RIGHTS}`],
            PRIVACY,
          ],
        },
      ],
    },
  ],
};

/**
 * Marketing Studio's Advanced format (MarketingStudio.tsx): 1 to 7 reference images (each model's own max_images may be lower), a written brief, an optional
 * hook and location from lib/marketing.ts, an optional script spoken word for word, the ratio and duration of the chosen model, and native audio on by default.
 */
const advanced: AboutPage = {
  title: 'Video marketing nâng cao, giải thích rõ',
  lead: 'Mang ảnh của bạn và một bản brief sáng tạo, rồi tự chỉ đạo quảng cáo. Một hook, một bối cảnh, lời thoại chính xác và tối đa 7 ảnh tham chiếu được dựng thành một video marketing riêng. Hướng dẫn này giải thích công cụ hoạt động ra sao và cách viết brief cho tốt.',
  sections: [
    {
      kicker: 'Chọn công cụ',
      title: 'UGC Thử đồ hay Nâng cao?',
      lead: 'Marketing Studio có hai định dạng trên cùng một nền tảng. Chọn theo mức kiểm soát bạn muốn.',
      blocks: [
        {
          cards: [
            { title: 'UGC Thử đồ', text: 'Định dạng gọn: một ảnh người mẫu và một ảnh sản phẩm vào, một video thử đồ kiểu người sáng tạo nội dung ra. Công cụ tự chỉ đạo mọi thứ.', link: ['Mở UGC Thử đồ', '/marketing-studio'] },
            { title: 'Nâng cao', text: 'Ghế đạo diễn: bản brief của bạn là nguồn sự thật, bạn đưa tối đa 7 ảnh của mình, viết đúng lời nhân vật nói, và tự chọn hook và bối cảnh.' },
          ],
        },
      ],
    },
    {
      kicker: 'Từng bước',
      title: 'Video marketing nâng cao hoạt động thế nào?',
      lead: 'Mỗi video bắt đầu từ ảnh và bản brief của bạn. AI biến chúng thành một clip với hook và bối cảnh bạn đã chọn.',
      blocks: [
        {
          steps: [
            { title: 'Thêm ảnh và viết brief', text: 'Tải tối đa 7 ảnh tham chiếu, là người, sản phẩm, bối cảnh hay ảnh phong cách, và tả video bạn muốn. Bản brief là nguồn sự thật: AI dựng cả quảng cáo quanh nó.', media: 'about-advanced-step-1' },
            { title: 'Thêm hook, bối cảnh và lời thoại', text: `Nếu muốn, mở đầu bằng một trong ${HOOKS.length} hook, đặt cảnh ở một trong ${LOCATIONS.length} bối cảnh, và viết đúng lời nhân vật sẽ nói.`, media: 'about-advanced-step-2' },
            { title: 'Chạy và nhận video', text: 'Chọn tỉ lệ, thời lượng và âm thanh, rồi bấm chạy, với chi phí ước tính bằng USD ghi trên nút. Video xong nằm trong tab Lịch sử và trong Thư viện.', media: 'about-advanced-step-3' },
          ],
        },
      ],
    },
    {
      kicker: 'Bối cảnh',
      title: 'Chọn bối cảnh phù hợp',
      lead: `Phông nền đúng bán được khoảnh khắc. Chọn một trong ${LOCATIONS.length} bối cảnh có sẵn và AI đặt video vào đó với ánh sáng và không khí đáng tin, hoặc để trống và để bản brief quyết định khung cảnh.`,
      blocks: [{ cols: 3, cards: locationCards }],
    },
    {
      kicker: 'Mở đầu',
      title: 'Mở đầu bằng một hook',
      blocks: [
        `Hook là một cách mở đầu phá vỡ nhịp lướt, giành sự chú ý trước khi ý tưởng của bạn mở ra. Có sẵn ${HOOKS.length} hook: ${hookNames}. Khi bạn chọn một hook, video mở bằng nó rồi chuyển tự nhiên sang phần còn lại của brief. Không chọn thì AI mở đầu theo gợi ý của brief.`,
        { links: [['Giới thiệu UGC Thử đồ', '/marketing-studio', 'có từng hook kèm video xem trước, trong tab Giới thiệu.']] },
      ],
    },
    {
      kicker: 'Lời thoại',
      title: 'Quy tắc của lời thoại',
      lead: 'Tạo âm thanh bật sẵn, như trên Fash. Ô Lời thoại (tuỳ chọn) quyết định nhân vật nói gì.',
      blocks: [
        {
          list: [
            'Lời bạn viết thành lời nói khớp khẩu hình của người trong video. Mô hình được dặn không nói thêm chữ nào ngoài lời thoại.',
            'Khoảng hai từ mỗi giây: video 10 giây nên có khoảng hai mươi từ.',
            'Không có lời thoại: chỉ có lời nói khi brief yêu cầu; còn lại là âm thanh nền hoặc nhạc.',
            'Tắt Tạo âm thanh để có video im lặng, rồi thêm giọng đọc hoặc nhạc của riêng bạn khi dựng. Mô hình không tạo được âm thanh thì công tắc ở Tắt, và ở một số mô hình âm thanh làm giá cao hơn.',
          ],
        },
      ],
    },
    {
      kicker: 'Ảnh tham chiếu',
      title: 'Ảnh tham chiếu hoạt động thế nào?',
      blocks: [
        'Tải tối đa 7 ảnh và AI dựng video từ chúng: một người, một sản phẩm, một bối cảnh, một ảnh phong cách, hay bất kỳ tổ hợp nào. Mỗi ảnh giữ chi tiết thật nhìn thấy được của nó: hình dáng, màu sắc, chữ, logo và nhận dạng được giữ trung thực trong kết quả.',
        {
          list: [
            'Nói trong brief mỗi ảnh là gì, ví dụ “ảnh 1 là người mẫu, ảnh 2 là chiếc túi, ảnh 3 là quán cà phê”.',
            'Dùng ảnh nét, đủ sáng; video chỉ trung thực bằng ảnh tham chiếu mà nó bắt đầu.',
            'Ít ảnh mà rõ tốt hơn nhiều ảnh mơ hồ, vì mỗi ảnh nên có một việc riêng.',
          ],
        },
      ],
    },
    {
      kicker: 'Khung hình',
      title: 'Chọn tỉ lệ khung hình',
      lead: 'Tỉ lệ quyết định hình dạng video. Hãy chọn theo nền tảng sẽ đăng, vì cắt một video đã xong là cắt vào phần hành động bạn đã trả tiền.',
      blocks: [
        {
          ratios: [
            ['9:16', 'Reels, TikTok, Stories và quảng cáo dọc, mặc định'],
            ['1:1', 'Bài đăng bảng tin và ô sản phẩm trên sàn'],
            ['16:9', 'YouTube, trang web và quảng cáo ngang'],
          ],
        },
      ],
    },
    {
      kicker: 'Thời lượng',
      title: 'Chọn thời lượng',
      lead: 'Thời lượng đi theo mô hình đã chọn, và chi phí tính theo giây, nên hãy chọn theo việc cần làm thay vì mặc định chọn tối đa.',
      blocks: [
        {
          cols: 3,
          cards: [
            { tag: 'Một nhịp', title: 'Ngắn', text: 'Một cú chốt: hook xuất hiện và sản phẩm trả lời ngay. Cách rẻ nhất để thử.' },
            { tag: 'Điểm cân bằng', title: 'Vừa', text: 'Đủ chỗ cho hook, khoảnh khắc sản phẩm và một cảnh kết. Độ dài chuẩn cho quảng cáo trên bảng tin.' },
            { tag: 'Kể chuyện', title: 'Dài', text: 'Thêm một hai cảnh quay, cho clip kể trọn câu chuyện hơn.' },
          ],
        },
        'Video dài hơn tốn hơn, và chi phí ước tính luôn ghi trên nút chạy trước khi bạn tạo.',
      ],
    },
    {
      kicker: 'Tạo tiếp',
      title: 'Làm gì với kết quả?',
      lead: 'Marketing Studio nằm ở cuối quy trình. Các trang khác chuẩn bị đầu vào và mở rộng đầu ra cho nó.',
      blocks: [
        {
          links: [
            ['UGC Thử đồ', '/marketing-studio', 'là định dạng gọn: một người mẫu và một sản phẩm vào, một clip kiểu người sáng tạo nội dung ra.'],
            ['Tạo ảnh', '/image-generation', 'chỉnh ảnh người mẫu hay ảnh sản phẩm để đưa vào đây.'],
            ['Thử đồ', '/try-on', 'mặc trang phục lên người mẫu trước khi biến ảnh thành quảng cáo.'],
            ['Tạo video', '/create', 'làm video đa dụng với các họ mô hình Kling, Seedance, VEO và nhiều họ khác.'],
          ],
        },
      ],
    },
    {
      kicker: 'Hỏi đáp',
      title: 'Câu hỏi thường gặp',
      blocks: [
        {
          faq: [
            ['Video marketing nâng cao là gì?', 'Là định dạng marketing toàn quyền kiểm soát: bạn tải tối đa 7 ảnh tham chiếu của mình, viết một bản brief sáng tạo, và thêm hook, bối cảnh và lời thoại nếu muốn. AI dựng tất cả thành một video marketing riêng.'],
            ['Nâng cao khác UGC Thử đồ thế nào?', 'UGC Thử đồ là định dạng gọn: hai ảnh vào, một video thử đồ kiểu người sáng tạo nội dung ra, theo chỉ dẫn cố định. Nâng cao trao bạn ghế đạo diễn: bản brief là nguồn sự thật, bạn đưa tối đa 7 ảnh và viết lời thoại.'],
            ['Dùng được bao nhiêu ảnh tham chiếu?', 'Tối đa 7, hoặc ít hơn nếu mô hình đã chọn nhận ít ảnh hơn. Mỗi ảnh có thể là người, sản phẩm, bối cảnh hay ảnh phong cách. AI giữ chi tiết nhìn thấy được của chúng và dựng video quanh chúng.'],
            ['Có bắt buộc chọn hook hay bối cảnh không?', 'Không, cả hai đều tuỳ chọn. Có hook, video mở bằng khoảnh khắc đó trước khi vào ý tưởng của bạn; có bối cảnh, cảnh được đặt ở đó. Không có, AI theo bản brief.'],
            ['Video có lời thoại không?', 'Có. Tạo âm thanh bật sẵn; lời bạn viết trong ô Lời thoại được đọc đúng từng chữ, khớp khẩu hình. Không viết lời thoại thì chỉ có lời nói khi brief yêu cầu. Tắt công tắc để có clip im lặng.'],
            ['Một video nâng cao tốn bao nhiêu?', 'Chi phí tuỳ mô hình và thời lượng, vì chi phí tính theo giây. Âm thanh làm giá cao hơn ở một số mô hình. Chi phí ước tính, đã tính âm thanh, luôn ghi trên nút chạy trước khi bạn tạo, và video dùng chung ngân sách với Tạo video.'],
            ['Video có chữ hay phụ đề trên hình không?', 'Nên dặn rõ trong brief là không có chữ, logo hay watermark. Thêm phụ đề sau trong phần mềm dựng, nơi bạn kiểm soát phông chữ và vị trí.'],
            ['Video thuộc về ai?', `Video là tài sản của công ty, dùng cho trang sản phẩm, mạng xã hội và quảng cáo của công ty. ${RIGHTS}`],
            PRIVACY,
          ],
        },
      ],
    },
  ],
};

const APP_COST = 'Mỗi lần chạy tính vào ngân sách ảnh và ứng dụng, tách khỏi ngân sách video; nút Chạy ghi chi phí ước tính bằng USD trước khi bạn bấm.';
const SWAP_TABLE = [
  ['Ứng dụng', 'Thứ thay đổi', 'Thứ giữ nguyên', 'Hợp nhất với'],
  ['Đổi nhân vật', 'Khuôn mặt, dáng người và trang phục', 'Bối cảnh của ảnh đích', 'Thay cả người, kể cả bộ đồ'],
  ['Đổi khuôn mặt', 'Chỉ khuôn mặt', 'Dáng người, trang phục và bối cảnh', 'Đổi người xuất hiện mà giữ nguyên cách phối'],
  ['Đổi người mẫu', 'Khuôn mặt, màu da và dáng người', 'Trang phục, tư thế và bối cảnh', 'Cho cùng bộ đồ lên một người khác'],
];

/** The About tab of each built app, by slug (Media Optimizer is not built, so it has none). */
export const APP_ABOUT: Record<string, AboutPage> = {
  'character-swap': {
    title: 'Đổi nhân vật chỉ với một lần chạy',
    sections: [
      {
        title: 'Đổi nhân vật bằng AI là gì?',
        blocks: [
          'Đổi nhân vật là ứng dụng thay toàn bộ người trong một ảnh bằng một người khác. Bạn tải ảnh Nhân vật mới và Ảnh đích, và AI chuyển khuôn mặt, dáng người và trang phục của người mới vào ảnh đích trong khi bối cảnh giữ nguyên.',
          `Ứng dụng làm cho ảnh thời trang và marketing, khi người cần đổi mà cảnh thì không. Một lần bấm Chạy là bắt đầu đổi. ${APP_COST}`,
        ],
      },
      {
        title: 'Đổi nhân vật trong 3 bước',
        lead: 'Tải nhân vật mới, tải ảnh đích, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải nhân vật mới', text: 'Thêm ảnh người sẽ xuất hiện trong kết quả vào ô Nhân vật mới. Khuôn mặt, dáng người và trang phục trong kết quả đều lấy từ ảnh này.' },
              { title: 'Tải ảnh đích', text: 'Thêm ảnh có người cần thay vào ô Ảnh đích. Kết quả giữ bối cảnh của ảnh này. Muốn dặn thêm thì viết một câu vào ô Prompt (tuỳ chọn).' },
              { title: 'Chạy', text: 'Bấm Chạy. AI thay cả người trong ảnh đích bằng nhân vật mới; ảnh mới nằm trong tab Lịch sử và trong Thư viện, mục Ứng dụng.' },
            ],
          },
        ],
      },
      {
        title: 'Đổi nhân vật, đổi khuôn mặt hay đổi người mẫu?',
        lead: 'Đổi nhân vật thay cả người kể cả bộ đồ, Đổi khuôn mặt chỉ thay khuôn mặt, còn Đổi người mẫu thay khuôn mặt và dáng người nhưng giữ bộ đồ gốc.',
        blocks: [{ table: SWAP_TABLE }, 'Chọn ứng dụng theo thứ phải giữ nguyên trong ảnh. Chỉ đổi khuôn mặt, giữ dáng và bộ đồ thì dùng Đổi khuôn mặt. Cho cùng bộ đồ lên người khác thì dùng Đổi người mẫu. Khi cả người lẫn bộ đồ đều phải đổi, Đổi nhân vật là lựa chọn đúng. Muốn mặc một trang phục mới lên người mẫu mà không thay người, hãy dùng trang Thử đồ.'],
      },
      {
        title: 'Đổi nhân vật dùng vào việc gì?',
        lead: 'Đổi nhân vật đặt một người khác vào ảnh bạn đã có, để có ảnh mới mà không cần buổi chụp mới.',
        blocks: [
          {
            cards: [
              { title: 'Chụp lại chiến dịch mà không chụp', text: 'Một ảnh chiến dịch đã xong có thể mang người mới với khuôn mặt, dáng người và bộ đồ mới trong khi bối cảnh giữ nguyên. Khi người mẫu đổi sau buổi chụp hay một diện mạo cần làm mới, bạn giữ địa điểm đã duyệt và chỉ thay người.' },
              { title: 'Quảng cáo theo thị trường', text: 'Chiến dịch theo vùng thường cần người mẫu khác cho mỗi thị trường. Thay người trong một quảng cáo đã duyệt cho mỗi thị trường một phiên bản riêng trên cùng bối cảnh. Thị trường nào cần bối cảnh khác thì chạy kết quả qua Đổi nền.' },
              { title: 'Nội dung của người sáng tạo', text: 'Đặt chính mình hay một cộng sự vào một cảnh đã chụp: tải ảnh của bạn làm nhân vật mới, và ảnh đích giữ khung cảnh, để một địa điểm mang được nhiều diện mạo. Muốn nhân vật chuyển động, làm động ảnh ở trang Tạo video.' },
              { title: 'Storyboard và ý tưởng', text: 'Một cảnh chứa được nhiều người khác nhau giúp storyboard thành hình nhanh hơn: đổi nhân vật trên khung tham chiếu cho thấy một người khác, mặc khác, trông ra sao trong cùng khung cảnh trước khi đặt lịch bất cứ thứ gì.' },
            ],
          },
        ],
      },
      {
        title: 'Mẹo để đổi người trông thật',
        lead: 'Một lần đổi người trông thật bắt đầu từ hai ảnh giống nhau về tư thế, khung hình, ánh sáng và chất lượng.',
        blocks: [
          {
            cards: [
              { title: 'Tư thế và góc máy giống nhau', text: 'Hai ảnh có tư thế và góc máy giống nhau để AI ít phải diễn giải lại. Nhân vật nhìn thẳng hợp với ảnh đích nhìn thẳng, ảnh nghiêng hợp với ảnh nghiêng.' },
              { title: 'Toàn thân hay nửa người', text: 'Trang phục trong kết quả lấy từ ảnh nhân vật mới, nên ảnh đó phải thấy bộ đồ bạn muốn. Ảnh đích toàn thân đi với nhân vật toàn thân; ảnh đích nửa người đi với nhân vật nửa người hoặc toàn thân. Ảnh chân dung không cho thấy trang phục cần chuyển sang.' },
              { title: 'Ánh sáng', text: 'Ánh sáng đều và mềm giúp khuôn mặt, da và chất vải dễ đọc. Bóng gắt, ám màu mạnh và ảnh tối che mất chi tiết cần tái tạo.' },
              { title: 'Độ phân giải', text: 'Ảnh nét, độ phân giải cao cho kết quả tốt nhất. Ảnh mờ hoặc nén nặng mất chi tiết khuôn mặt và chất vải, và AI chỉ làm được với chi tiết nó nhìn thấy.' },
            ],
          },
        ],
      },
      {
        title: 'Dùng Đổi nhân vật có an toàn và đúng mực không?',
        blocks: [
          'An toàn và đúng mực khi công ty có quyền với cả hai ảnh và có sự đồng ý của mọi người trong ảnh, ở cả ảnh nhân vật mới lẫn ảnh đích.',
          'Không bao giờ dùng Đổi nhân vật để mạo danh ai, tạo nội dung gây hiểu lầm hay đặt một người vào cảnh họ không đồng ý. Với việc thương mại, hãy giữ giấy đồng ý của người mẫu và thoả thuận sử dụng cho mọi người xuất hiện trong ảnh cuối.',
          'Tải nhân vật mới và ảnh đích ở bên cạnh để chạy lần đổi nhân vật đầu tiên.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Đổi nhân vật khác đổi khuôn mặt thế nào?', 'Đổi khuôn mặt chỉ thay khuôn mặt và giữ dáng người, trang phục và bối cảnh của ảnh đích. Đổi nhân vật thay cả người, nên khuôn mặt, dáng người và trang phục đều lấy từ nhân vật mới. Bối cảnh của ảnh đích giữ nguyên với cả hai.'],
              ['Trang phục có đổi không?', 'Có. Trang phục được chuyển từ ảnh nhân vật mới cùng với khuôn mặt và dáng người. Muốn giữ bộ đồ gốc và chỉ thay người, hãy dùng Đổi người mẫu.'],
              ['Bối cảnh có đổi không?', 'Không. Bối cảnh của ảnh đích giữ nguyên, chỉ người được thay. Muốn đổi cả khung cảnh, chạy kết quả qua Đổi nền.'],
              ['Ảnh kiểu nào hợp nhất?', 'Hai ảnh nét, đủ sáng, cùng tư thế, góc máy và khung hình. Ảnh nhân vật mới phải thấy trọn bộ đồ bạn muốn trong kết quả. Tránh ảnh mờ, nén nặng hoặc tối.'],
              ['Một lần chạy tốn bao nhiêu?', `${APP_COST} Chi phí thật nằm trên ảnh trong Thư viện.`],
              ['Dùng ảnh đổi nhân vật cho quảng cáo được không?', 'Được, khi công ty có quyền với cả hai ảnh và có sự đồng ý của mọi người trong ảnh. Giữ giấy đồng ý cho nhân vật mới và cho người trong ảnh đích, và xem quy định của từng nền tảng quảng cáo về ảnh chỉnh bằng AI trước khi đăng.'],
            ],
          },
        ],
      },
    ],
  },
  'model-swap': {
    title: 'Đổi người mẫu, giữ nguyên mọi thứ khác',
    sections: [
      {
        title: 'Đổi người mẫu bằng AI là gì?',
        blocks: [
          'Đổi người mẫu là ứng dụng thay người trong một ảnh thời trang bằng một người mẫu mới trong khi bộ đồ giữ nguyên. Bạn tải ảnh Người mẫu mới và Ảnh đích; AI đổi khuôn mặt, màu da và dáng người, còn trang phục, phụ kiện, tư thế và bối cảnh giữ đúng như cũ.',
          `Ứng dụng làm cho thời trang: một buổi chụp sản phẩm dùng lại được với nhiều người mẫu khác nhau. ${APP_COST}`,
        ],
      },
      {
        title: 'Đổi người mẫu trong ảnh thời trang trong 3 bước',
        lead: 'Tải người mẫu mới, tải ảnh đích, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải người mẫu mới', text: 'Thêm ảnh người có khuôn mặt, màu da và dáng người sẽ xuất hiện trong kết quả vào ô Người mẫu mới.' },
              { title: 'Tải ảnh đích', text: 'Thêm ảnh sản phẩm có người mẫu cần thay vào ô Ảnh đích. Kết quả giữ trang phục, phụ kiện, tư thế và bối cảnh của ảnh này. Muốn dặn thêm thì viết một câu vào ô Prompt (tuỳ chọn).' },
              { title: 'Chạy', text: 'Bấm Chạy. AI đặt người mẫu mới vào ảnh đích, và bộ đồ giữ đúng như lúc chụp.' },
            ],
          },
        ],
      },
      {
        title: 'Đổi người mẫu thay đổi những gì?',
        lead: 'Ứng dụng thay khuôn mặt, màu da và dáng người, và giữ nguyên trang phục, phụ kiện, tư thế và bối cảnh.',
        blocks: [
          {
            table: [
              ['Phần của ảnh', 'Sau khi đổi'],
              ['Khuôn mặt', 'Theo người mẫu mới'],
              ['Màu da', 'Theo người mẫu mới'],
              ['Dáng người', 'Theo người mẫu mới'],
              ['Trang phục', 'Giữ nguyên'],
              ['Phụ kiện', 'Giữ nguyên'],
              ['Tư thế', 'Giữ nguyên'],
              ['Bối cảnh', 'Giữ nguyên'],
            ],
          },
          'Trang phục không bị động đến trong mọi lần đổi, nên sản phẩm trong kết quả chính là sản phẩm bạn đã chụp.',
        ],
      },
      {
        title: 'Vì sao thương hiệu thời trang dùng người mẫu ảo',
        lead: 'Để cho cùng một sản phẩm lên nhiều người khác nhau mà không phải tổ chức buổi chụp mới cho từng người.',
        blocks: [
          {
            cards: [
              { title: 'Một buổi chụp, nhiều người mẫu', text: 'Trang phục, cách phối và bối cảnh chỉ chụp một lần, và mỗi lần đổi đặt một người mới vào cùng bức ảnh. Muốn có ảnh sản phẩm, ảnh đời thường hay ảnh chiến dịch mới của cùng trang phục, hãy dùng trang Tạo ảnh.' },
              { title: 'Quần áo trên nhiều diện mạo', text: 'Khách muốn thấy quần áo trên người giống mình. Đổi khuôn mặt, màu da và dáng người cho một bộ đồ xuất hiện trên nhiều người mẫu, còn trang phục giữ đúng như ảnh chụp.' },
              { title: 'Cập nhật danh mục nhanh hơn', text: 'Ảnh danh mục được làm mới mà không chờ buổi chụp sau. Khi trang sản phẩm cần người mẫu khác, ảnh có sẵn được đổi người thay vì chụp lại.' },
              { title: 'Hình ảnh riêng cho từng thị trường', text: 'Chiến dịch theo vùng có thể cho thấy người mẫu hợp với mỗi thị trường trong khi mọi phiên bản dùng cùng ảnh sản phẩm. Mỗi phiên bản cũng có thể thành video ngắn ở trang Tạo video hay clip kiểu người sáng tạo nội dung ở Marketing Studio.' },
            ],
          },
        ],
      },
      {
        title: 'Đổi người mẫu, đổi nhân vật hay đổi khuôn mặt?',
        lead: 'Đổi người mẫu giữ bộ đồ, Đổi nhân vật đổi cả quần áo, còn Đổi khuôn mặt chỉ đổi khuôn mặt.',
        blocks: [{ table: SWAP_TABLE }, 'Chọn theo thứ cần đổi. Dùng Thử đồ để mặc trang phục lên người mẫu, Đổi người mẫu khi bộ đồ đã trên người mẫu và chỉ người cần đổi, Đổi nhân vật khi quần áo cũng phải đổi, và Đổi khuôn mặt khi chỉ khuôn mặt cần đổi.'],
      },
      {
        title: 'Mẹo để có kết quả tốt nhất',
        lead: 'Kết quả tốt nhất đến từ ảnh người mẫu mới và ảnh đích có tư thế và khung hình giống nhau, khuôn mặt rõ và đủ độ phân giải.',
        blocks: [
          {
            cards: [
              { title: 'Tư thế và khung hình giống nhau', text: 'Ảnh người mẫu mới có tư thế và khung hình gần với ảnh đích cho AI một điểm khớp gần. Tư thế trong kết quả lấy từ ảnh đích, nên người mẫu nhìn thẳng hợp nhất với ảnh đích nhìn thẳng.' },
              { title: 'Khuôn mặt rõ trong ảnh người mẫu mới', text: 'Khuôn mặt trong kết quả lấy từ ảnh Người mẫu mới, nên khuôn mặt đó phải thấy rõ. Dùng ảnh nét, sáng đều, không bị tóc, tay, kính râm hay bóng tối che.' },
              { title: 'Ảnh đích độ phân giải cao', text: 'Ảnh đích mang trang phục, phụ kiện và bối cảnh vào kết quả, nên file nét, độ phân giải cao giữ được chất vải và chi tiết. Dù là ảnh studio hay ảnh chiến dịch có sẵn, hãy dùng file lớn nhất bạn có.' },
            ],
          },
          'Tải người mẫu mới và ảnh sản phẩm ở bên cạnh để đổi người mẫu trong một lần chạy.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Quần áo có đổi khi đổi người mẫu không?', 'Không. Trang phục, phụ kiện, tư thế và bối cảnh giữ nguyên, chỉ khuôn mặt, màu da và dáng người đổi. Sản phẩm bạn chụp là sản phẩm xuất hiện trong kết quả.'],
              ['Người mẫu ảo trong ảnh thời trang là gì?', 'Là người trong ảnh thời trang có khuôn mặt, màu da và dáng người được đổi bằng AI. Với Đổi người mẫu, người đó đến từ ảnh Người mẫu mới bạn tải lên và được đặt vào ảnh sản phẩm với bộ đồ không đổi.'],
              ['Cho cùng bộ đồ lên người mẫu có màu da và dáng người khác được không?', 'Được. Chạy một ảnh sản phẩm với nhiều ảnh người mẫu mới để thấy cùng bộ đồ trên những người có màu da và dáng người khác nhau. Trang phục giữ đúng như ảnh chụp trong mọi kết quả, và mỗi lần chạy tính chi phí riêng.'],
              ['Đổi người mẫu khác đổi khuôn mặt thế nào?', 'Đổi khuôn mặt chỉ thay khuôn mặt và để phần còn lại của người gốc như cũ. Đổi người mẫu thay khuôn mặt, màu da và dáng người, nên cả người đổi trong khi trang phục, phụ kiện, tư thế và bối cảnh giữ nguyên.'],
              ['Dùng ảnh người mẫu AI trên trang sản phẩm được không?', 'Được, khi công ty có quyền với ảnh sản phẩm và có sự đồng ý của người mẫu mới và của người trong ảnh đích. Xem quy định của từng sàn bạn bán về ảnh chỉnh bằng AI.'],
              ['Có cần sự cho phép của người mẫu mới không?', 'Có. Cần quyền và sự đồng ý để chỉnh người trong ảnh, gồm người trong ảnh Người mẫu mới và người trong ảnh đích. Giữ giấy đồng ý và thoả thuận sử dụng cho việc thương mại.'],
            ],
          },
        ],
      },
    ],
  },
  'background-changer': {
    title: 'Đổi nền ảnh bằng AI',
    sections: [
      {
        title: 'Đổi nền bằng AI là gì?',
        blocks: [
          'Đổi nền là ứng dụng thay nền của một ảnh bằng một cảnh mới. Bạn tải một ảnh và tả nền mới bằng chữ, hoặc thêm một ảnh nền tham chiếu. AI tách nền cũ và tạo nền mới hợp với chủ thể.',
          `Ứng dụng giữ nguyên chủ thể, nên người hay sản phẩm bạn chụp xuất hiện trong cảnh mới đúng như lúc chụp. Khi cần đổi nền cho một chiến dịch, một trang sản phẩm hay một bài đăng, một lần bấm Chạy là xong. ${APP_COST}`,
        ],
      },
      {
        title: 'Đổi nền ảnh bằng AI trong 3 bước',
        lead: 'Tải ảnh, tả cảnh mới hoặc thêm ảnh nền tham chiếu, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải ảnh', text: 'Thêm ảnh cần đổi nền. Người hoặc sản phẩm trong ảnh giữ nguyên.' },
              { title: 'Tả cảnh hoặc thêm ảnh nền', text: 'Viết mô tả nền mới vào ô Mô tả nền, hoặc tải một ảnh nền tham chiếu theo phong cách bạn muốn. Chọn một trong hai, không dùng cả hai cùng lúc.' },
              { title: 'Chạy', text: 'Bấm Chạy. AI tách nền cũ và tạo nền mới hợp với chủ thể; kết quả nằm trong tab Lịch sử.' },
            ],
          },
        ],
      },
      {
        title: 'Hai cách tả nền mới',
        lead: 'Bạn tả nền mới bằng một câu mô tả hoặc bằng một ảnh tham chiếu. Mô hình nhận một trong hai, không nhận cả hai cùng lúc.',
        blocks: [
          {
            cards: [
              { title: 'Chỉ mô tả', text: 'Mô tả tả cảnh mới bằng chữ. Gọi tên địa điểm, bề mặt, ánh sáng và không khí, ví dụ “quán cà phê ngoài trời đầy nắng, bàn đá cẩm thạch, buổi sáng”.' },
              { title: 'Chỉ ảnh tham chiếu', text: 'Ảnh tham chiếu cho thấy phong cách nền bạn muốn thay vì tả nó. Muốn nền giống một diện mạo có sẵn, như một chiến dịch cũ hay một ảnh moodboard, hãy tải nó làm ảnh tham chiếu và để trống mô tả.' },
            ],
          },
          'Năm gợi ý mô tả cho ảnh thời trang và sản phẩm:',
          {
            list: [
              'Phông studio liền trơn màu be, ánh sáng mềm, bóng đổ nhẹ dưới chân.',
              'Một con phố nhỏ buổi sáng, tường vàng cũ, nắng xiên.',
              'Bãi biển lúc hoàng hôn, cát trắng, trời cam nhạt.',
              'Phòng khách tối giản, sàn gỗ sáng, cây xanh trong góc.',
              'Sân thượng thành phố về đêm, đèn đường lung linh phía xa.',
            ],
          },
        ],
      },
      {
        title: 'Ý tưởng đổi nền cho thương hiệu',
        lead: 'Với Đổi nền, một ảnh sản phẩm hay ảnh người mẫu dùng được cho ảnh studio, ảnh đời thường, ảnh theo mùa và ảnh cho sàn.',
        blocks: [
          {
            cards: [
              { title: 'Phông studio và nền trơn', text: 'Phông trơn giữ sự chú ý ở sản phẩm. Tả một bức tường studio liền trơn màu trung tính hay màu thương hiệu, và mọi ảnh trong một dòng sản phẩm nằm trên cùng một nền sạch.' },
              { title: 'Cảnh đời thường và đường phố', text: 'Ảnh đời thường cho thấy sản phẩm đang được dùng. Một quán cà phê, một con phố hay một công viên đầy nắng đặt cùng ảnh người mẫu vào một khung cảnh thật mà không cần đi chụp ngoại cảnh. Nếu chỉ có ảnh trải phẳng, hãy mặc trang phục lên người mẫu ở trang Thử đồ trước.' },
              { title: 'Chiến dịch theo mùa', text: 'Chiến dịch theo mùa cần cảnh mới vài lần mỗi năm. Tả lá thu, phố mùa đông hay biển mùa hè, và cùng một ảnh sản phẩm mang được chiến dịch của từng mùa. Ảnh xong có thể thành video theo mùa ở trang Tạo video.' },
              { title: 'Ảnh sản phẩm cho sàn', text: 'Trang sản phẩm trên sàn thường cần nền đơn giản và đồng nhất. Dùng cùng một mô tả cho mọi ảnh trong một dòng sản phẩm để các trang trông đồng bộ.' },
            ],
          },
        ],
      },
      {
        title: 'Mẹo để kết quả tự nhiên',
        lead: 'Khớp hướng sáng và phối cảnh của ảnh gốc, chừa chỗ quanh chủ thể, và viết mô tả cụ thể.',
        blocks: [
          {
            cards: [
              { title: 'Khớp hướng sáng', text: 'Chủ thể giữ ánh sáng lúc được chụp. Tả một cảnh được chiếu sáng từ cùng phía, ví dụ “nắng chiều từ bên trái” khi chủ thể sáng từ bên trái.' },
              { title: 'Phối cảnh', text: 'Chủ thể chụp ngang tầm mắt trông tự nhiên trong một cảnh nhìn ngang tầm mắt. Nhắc góc nhìn trong mô tả, ví dụ “góc ngang tầm mắt nhìn ra một con phố”, khi ảnh gốc chụp thẳng.' },
              { title: 'Khung hình của chủ thể', text: 'Ảnh có khoảng trống quanh chủ thể để cảnh mới lộ ra. Nếu ảnh bị cắt quá sát cho bố cục bạn cần, mở rộng nó bằng Đổi khung hình trước.' },
              { title: 'Viết mô tả cụ thể', text: 'Mô tả cụ thể cho AI nhiều thứ để làm việc. “Quán cà phê” cho một quán bất kỳ; “quán cà phê ngoài trời với bàn sắt sơn xanh, buổi sáng” cho đúng không khí bạn nghĩ.' },
            ],
          },
        ],
      },
      {
        title: 'Đổi nền hay Xoá nền?',
        lead: 'Đổi nền tạo một cảnh mới sau chủ thể, còn Xoá nền cho ra ảnh PNG trong suốt không có nền.',
        blocks: [
          {
            table: [
              ['Ứng dụng', 'Bạn nhận được', 'Hợp nhất với'],
              ['Đổi nền', 'Chủ thể trong một cảnh mới được tạo', 'Ảnh studio, đời thường và theo mùa hoàn chỉnh'],
              ['Xoá nền', 'Ảnh PNG trong suốt của chủ thể', 'Ảnh cắt để bạn tự đặt vào thiết kế'],
            ],
          },
          'Cần ảnh cắt không nền thì dùng Xoá nền. Muốn tạo một ảnh hoàn toàn mới thay vì một nền mới, hãy dùng trang Tạo ảnh.',
          'Tải ảnh ở bên cạnh, tả cảnh mới và đổi nền trong một lần chạy.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Đổi nền ảnh bằng AI thế nào?', 'Tải ảnh, tả nền mới trong ô Mô tả nền hoặc thêm ảnh nền tham chiếu, rồi bấm Chạy. AI tách nền cũ và tạo nền mới hợp với chủ thể.'],
              ['Chỉ đổi màu nền được không?', 'Được. Tả một phông trơn màu bạn muốn, ví dụ “phông studio liền trơn màu hồng phấn”, và AI đặt chủ thể lên nền đó.'],
              ['Có cần ảnh tham chiếu không?', 'Không. Mô tả là đủ. Bạn cũng có thể dùng ảnh tham chiếu không kèm mô tả, nhưng không dùng cả hai cùng lúc.'],
              ['Người hay sản phẩm trong ảnh có đổi không?', 'Không. Chủ thể giữ nguyên, chỉ nền được thay bằng cảnh mới.'],
              ['Mô tả nền thế nào là tốt?', 'Mô tả tốt gọi tên địa điểm, bề mặt, ánh sáng và góc nhìn, ví dụ “phòng khách tối giản, sàn gỗ sáng, nắng sớm từ cửa sổ bên trái, góc ngang tầm mắt”.'],
              ['Dùng kết quả cho quảng cáo và trang sản phẩm được không?', 'Được, khi công ty có quyền với ảnh gốc và có sự đồng ý của người trong ảnh. Sản phẩm hay người giữ nguyên, nên ảnh vẫn cho thấy đúng thứ bạn bán. Xem quy định ảnh của từng sàn trước khi đăng, vì có sàn yêu cầu một kiểu nền cụ thể.'],
            ],
          },
        ],
      },
    ],
  },
  reframe: {
    title: 'Mở rộng ảnh bằng AI: đổi khung hình ngay lập tức',
    sections: [
      {
        title: 'Mở rộng ảnh bằng AI là gì?',
        blocks: [
          'Đổi khung hình là ứng dụng mở rộng một ảnh sang tỉ lệ mới bằng cách tạo phần còn thiếu quanh nó. Bạn tải một ảnh và chọn tỉ lệ; AI phân tích phần xung quanh và lấp khoảng mới một cách tự nhiên, nên nội dung gốc được giữ và không có gì lạc lõng.',
          `Kỹ thuật này gọi là outpainting: thay vì cắt ảnh cho vừa định dạng, ứng dụng thêm vùng mới quanh nó. Ứng dụng dùng được cho mọi ảnh, không chỉ ảnh thời trang. ${APP_COST}`,
        ],
      },
      {
        title: 'Mở rộng ảnh bằng AI trong 3 bước',
        lead: 'Tải ảnh, chọn tỉ lệ mới, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải ảnh', text: 'Thêm ảnh cần đổi khung. Ảnh nào cũng được, từ ảnh sản phẩm đến ảnh chiến dịch.' },
              { title: 'Chọn tỉ lệ', text: 'Chọn tỉ lệ mới trong menu, ví dụ 16:9 cho banner website. Danh sách tỉ lệ lấy từ mô hình đang bật.' },
              { title: 'Chạy', text: 'Bấm Chạy để AI kéo mép ảnh vào khoảng mới. Nội dung gốc được giữ, chỉ vùng mới được thêm; ảnh mới nằm trong tab Lịch sử.' },
            ],
          },
        ],
      },
      {
        title: 'Bạn cần tỉ lệ nào?',
        lead: 'Tỉ lệ đúng tuỳ nơi ảnh sẽ chạy: rộng cho banner, cao cho Stories và vuông cho bảng tin và sàn.',
        blocks: [
          {
            table: [
              ['Tỉ lệ', 'Dùng cho'],
              ['16:9', 'Banner website và YouTube'],
              ['9:16', 'Stories, Reels và TikTok'],
              ['1:1', 'Bài đăng bảng tin và sàn'],
              ['4:5', 'Bảng tin Instagram'],
              ['21:9', 'Banner siêu rộng'],
            ],
          },
          'Xem tỉ lệ mỗi kênh yêu cầu trước khi chạy, và tạo một phiên bản cho mỗi kênh từ cùng ảnh gốc. Ngoài các tỉ lệ trên, mô hình còn có 4:3, 3:4, 3:2, 2:3 và 5:4. Muốn video ở các định dạng này, trang Tạo video cho chọn tỉ lệ trước khi tạo.',
        ],
      },
      {
        title: 'Mở rộng bằng AI so với cắt và kéo giãn',
        lead: 'Mở rộng bằng AI đổi định dạng mà không cắt mất hay làm méo chủ thể, điều cắt và kéo giãn không làm được.',
        blocks: [
          {
            cards: [
              { title: 'Cắt', text: 'Cắt làm ảnh vừa định dạng mới bằng cách bỏ đi một phần. Biến ảnh dọc thành banner ngang bằng cách cắt có thể mất đầu, mất chân hay mất chính sản phẩm.' },
              { title: 'Kéo giãn', text: 'Kéo giãn làm ảnh vừa định dạng mới bằng cách kéo điểm ảnh rộng hoặc cao ra. Người, sản phẩm và chữ bị méo, và nhìn là thấy ngay.' },
              { title: 'Mở rộng bằng AI', text: 'Mở rộng giữ trọn ảnh gốc và thêm vùng mới quanh nó. Chủ thể còn nguyên và đúng tỉ lệ.' },
            ],
          },
        ],
      },
      {
        title: 'Một buổi chụp, mọi kênh',
        lead: 'Một buổi chụp phủ được mọi kênh khi mỗi ảnh mở rộng được sang tỉ lệ kênh đó cần.',
        blocks: [
          {
            cards: [
              { title: 'Ảnh chiến dịch cho web và mạng xã hội', text: 'Ảnh chiến dịch chụp ở một định dạng hiếm khi vừa mọi vị trí. Mở rộng một lần cho mỗi định dạng, và cùng một ảnh thành banner rộng cho website và bản cao cho Stories, bản nào cũng thấy trọn ảnh.' },
              { title: 'Ảnh sản phẩm cho sàn', text: 'Sàn thường yêu cầu ảnh vuông hoặc một tỉ lệ cụ thể. Thay vì cắt vào sản phẩm, AI thêm nền quanh nó cho tới khi ảnh đúng định dạng.' },
              { title: 'Banner có chỗ cho chữ', text: 'Tiêu đề và nút cần khoảng trống cạnh chủ thể. Mở rộng ảnh sang tỉ lệ rộng hơn tạo khoảng đó, chủ thể giữ nguyên còn vùng mới chứa chữ. Nếu đang làm hình ảnh mới chứ không chỉnh ảnh cũ, trang Tạo ảnh tạo được đúng tỉ lệ ngay từ đầu.' },
              { title: 'Nới ảnh chụp quá sát', text: 'Có ảnh khung quá chặt, chủ thể sát mép. AI tạo vùng mới quanh mép để ảnh có chỗ thở; hãy kiểm tra vùng mới xem có hợp với cảnh không.' },
            ],
          },
        ],
      },
      {
        title: 'Mẹo để kết quả liền mạch',
        lead: 'Nền đơn giản, chủ thể cách xa mép, kiểm tra nhanh tay và mép ảnh, và tăng độ phân giải sau khi mở rộng.',
        blocks: [
          {
            cards: [
              { title: 'Nền đơn giản mở rộng tốt nhất', text: 'Tường trơn, bầu trời, phông studio và sàn trống dễ nối tiếp. Cảnh rối có hoa văn, chữ hay nhiều đồ vật buộc AI phải bịa nhiều hơn. Nếu nền quá rối, đổi sang nền đơn giản bằng Đổi nền trước.' },
              { title: 'Giữ chủ thể xa mép', text: 'Chủ thể chạm mép ảnh buộc AI tự bịa một phần chủ thể. Ảnh có khoảng cách giữa chủ thể và khung mở rộng sạch hơn.' },
              { title: 'Kiểm tra tay và mép', text: 'Sau mỗi lần chạy, xem tay, chân, tóc và mọi thứ vắt qua mép ảnh gốc. Đó là chỗ vùng mới gặp ảnh gốc.' },
              { title: 'Tăng độ phân giải sau khi mở rộng', text: 'Mở rộng thêm diện tích chứ không thêm độ phân giải, nên cần file lớn hơn thì chạy ảnh đã mở rộng qua Tăng độ phân giải.' },
            ],
          },
          'Tải ảnh ở bên cạnh, chọn tỉ lệ mới và mở rộng trong một lần chạy.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Mở rộng ảnh bằng AI thế nào?', 'Tải ảnh, chọn tỉ lệ mới trong menu và bấm Chạy để AI kéo mép ảnh vào khoảng mới. Nội dung gốc được giữ, và AI lấp vùng thêm cho khớp với xung quanh.'],
              ['Outpainting là gì?', 'Là kỹ thuật tạo nội dung mới bên ngoài mép gốc của ảnh. AI phân tích những gì đã có và nối tiếp vào vùng mới, cách Đổi khung hình mở rộng ảnh sang tỉ lệ mới.'],
              ['AI có đổi ảnh gốc của tôi không?', 'AI được thiết kế để giữ nội dung gốc và chỉ lấp vùng mới quanh nó. Vẫn có thể có thay đổi nhỏ ở chỗ vùng mới gặp ảnh gốc, nên hãy kiểm tra tay, tóc và mép sau mỗi lần chạy.'],
              ['Biến ảnh dọc thành banner ngang được không?', 'Được. Tải ảnh dọc và chọn tỉ lệ rộng như 16:9. AI thêm vùng mới hai bên, nên trọn ảnh nằm trong banner và không bị cắt.'],
              ['Mở rộng ảnh có giống đổi kích thước ảnh không?', 'Không. Đổi kích thước phóng to hay thu nhỏ điểm ảnh có sẵn, nội dung giữ nguyên chỉ cỡ thay đổi. Mở rộng thêm nội dung mới quanh ảnh để đạt tỉ lệ mới.'],
              ['Ảnh đã mở rộng cần độ phân giải cao hơn thì sao?', 'Chạy ảnh đã mở rộng qua Tăng độ phân giải. Mở rộng trước, tăng độ phân giải sau, để file cuối có cả định dạng lẫn kích thước bạn cần.'],
            ],
          },
        ],
      },
    ],
  },
  'image-upscale': {
    title: 'Tăng độ phân giải ảnh bằng AI',
    sections: [
      {
        title: 'Tăng độ phân giải bằng AI là gì?',
        blocks: [
          'Tăng độ phân giải là ứng dụng tăng độ phân giải của ảnh lên tới 4K. Bạn tải một ảnh và chọn độ phân giải đích, và AI phóng to ảnh trong khi giữ chi tiết, màu sắc và chất liệu của bản gốc, nên file lớn hơn vẫn sắc nét thay vì mờ.',
          `Ứng dụng dùng được cho mọi ảnh, từ ảnh sản phẩm đến hình ảnh chiến dịch và ảnh tạo bằng AI, và nằm ở cuối gần như mọi quy trình ảnh. ${APP_COST} Kết quả không vượt quá 24 megapixel.`,
        ],
      },
      {
        title: 'Tăng độ phân giải ảnh lên 4K',
        lead: 'Tải ảnh, chọn 4K làm độ phân giải đích và bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải ảnh', text: 'Thêm ảnh cần phóng to. Ảnh nào cũng được, từ ảnh sản phẩm đến banner.' },
              { title: 'Chọn độ phân giải', text: 'Chọn độ phân giải đích trong menu: 4K cho file lớn nhất, hoặc 2K khi chỉ cần tăng vừa phải. Giá mỗi mức ghi trên nút Chạy.' },
              { title: 'Chạy', text: 'Bấm Chạy. AI tăng độ phân giải tới cỡ đích và giữ chi tiết, màu sắc và chất liệu của bản gốc; ảnh mới nằm trong tab Lịch sử.' },
            ],
          },
        ],
      },
      {
        title: 'Tăng độ phân giải bằng AI so với phóng to thông thường',
        lead: 'Phóng to thông thường kéo giãn điểm ảnh có sẵn và làm ảnh lớn bị mờ, còn AI dựng lại chi tiết khi ảnh lớn lên.',
        blocks: [
          'Phóng to thông thường không có thông tin mới để làm việc. Khi ảnh nhỏ được làm lớn, mỗi điểm ảnh chỉ trải ra một vùng rộng hơn, nên mép mềm đi, chữ nhoè và chất vải biến mất.',
          'AI làm khác. Nó đã học chi tiết trông thế nào trong ảnh thật, như sợi vải, mép đường may hay từng sợi tóc, và thêm chi tiết đó khi tăng độ phân giải. Kết quả là ảnh lớn hơn mà vẫn nét ở cỡ mới thay vì bị kéo giãn.',
          'Tăng độ phân giải theo cách này là khác biệt giữa một ảnh sản phẩm đứng vững khi khách phóng to và một ảnh vỡ thành mảng mờ.',
        ],
      },
      {
        title: 'Tăng độ phân giải mà không mất chất lượng',
        lead: 'Bắt đầu từ nguồn tốt nhất bạn có, chọn đúng cỡ đích, và tăng độ phân giải trước khi ảnh bị cắt hay đem in.',
        blocks: [
          {
            cards: [
              { title: 'Bắt đầu từ nguồn tốt nhất', text: 'Ứng dụng làm việc từ những gì có trong bản gốc, nên bản nét nhất, ít nén nhất cho kết quả tốt nhất. Dùng file xuất gốc thay vì ảnh chụp màn hình hay bản tải từ mạng xã hội, vốn thường đã bị nén.' },
              { title: 'Chọn đúng cỡ đích', text: 'Chọn độ phân giải hợp với nơi ảnh sẽ dùng. Banner web, ảnh phóng to trên trang sản phẩm và ảnh in khổ lớn cần cỡ khác nhau, và 4K là lựa chọn khi cần nhiều chi tiết nhất.' },
              { title: 'Tăng trước khi cắt hay in', text: 'Tăng độ phân giải ảnh hoàn chỉnh trước khi đem in hay đưa vào bố cục có cắt, để bản cuối đủ điểm ảnh ở cỡ hiển thị. Nếu ảnh cần hình dạng khác chứ không cần thêm điểm ảnh, hãy dùng Đổi khung hình.' },
            ],
          },
        ],
      },
      {
        title: 'Khi nào nên tăng độ phân giải?',
        lead: 'Bất cứ khi nào ảnh cần nhiều độ phân giải hơn nó đang có: phóng to sản phẩm, in ấn, ảnh cũ hoặc nhỏ, và ảnh tạo bằng AI.',
        blocks: [
          {
            cards: [
              { title: 'Phóng to trên trang sản phẩm', text: 'Khách phóng to để xem vải, đường may và phụ kiện. Tăng độ phân giải ảnh sản phẩm giữ các chi tiết đó nét khi phóng hết cỡ. Ảnh người mẫu làm ở trang Thử đồ cũng tăng được như vậy trước khi đăng.' },
              { title: 'In ấn và quảng cáo khổ lớn', text: 'Poster, lookbook, trưng bày tại cửa hàng và biển quảng cáo cần nhiều điểm ảnh hơn ảnh web. Tăng độ phân giải giúp ảnh đẹp trên màn hình cũng đứng vững ở khổ in.' },
              { title: 'Ảnh cũ hoặc nhỏ', text: 'Ảnh lưu trữ, ảnh chiến dịch cũ và ảnh nhỏ lưu cho web thường quá nhỏ cho vị trí hiện nay. Chạy qua ứng dụng giúp chúng đủ lớn cho bố cục mới.' },
              { title: 'Ảnh tạo bằng AI cần lớn hơn', text: 'Ảnh tạo ở trang Tạo ảnh thường ra ở một cỡ cố định. Tăng chúng lên 4K khi sắp đem in, làm banner lớn hay đưa lên trang sản phẩm có phóng to.' },
            ],
          },
        ],
      },
      {
        title: 'Các độ phân giải phổ biến',
        lead: 'Từ HD 1280 × 720 đến 4K 3840 × 2160 điểm ảnh, mỗi mức hợp với một việc.',
        blocks: [
          {
            table: [
              ['Tên', 'Kích thước', 'Dùng cho'],
              ['HD', '1280 × 720', 'Ảnh web nhỏ và ảnh thu nhỏ'],
              ['Full HD', '1920 × 1080', 'Ảnh website, bài đăng mạng xã hội và bài thuyết trình'],
              ['2K', '2048 × 1080', 'Banner web lớn và màn hình toàn cỡ'],
              ['4K', '3840 × 2160 (UHD) hoặc 4096 × 2160 (DCI)', 'Phóng to sản phẩm, in ấn và quảng cáo khổ lớn'],
            ],
          },
          'Kích thước ghi cho khung ngang chuẩn; ảnh vuông hay dọc cùng hạng có chiều rộng và chiều cao khác. Ứng dụng giữ mọi kết quả trong 24 megapixel.',
        ],
      },
      {
        title: 'Một công cụ tăng độ phân giải tốt cần gì?',
        lead: 'Thêm chi tiết thật mà không đổi ảnh, đạt độ phân giải bạn cần, và nằm gọn trong quy trình.',
        blocks: [
          {
            list: [
              'Chi tiết không lỗi: mép sắc và chất liệu tự nhiên, không quầng sáng, không nhoè, không da như nhựa.',
              'Màu và nội dung trung thực: giữ màu, chất liệu và nội dung của bản gốc thay vì vẽ lại.',
              'Tới 4K: đủ cỡ cho in ấn, phóng to và banner lớn.',
              'Dùng cho mọi ảnh: ảnh chụp, ảnh sản phẩm, đồ hoạ và ảnh AI đều tăng được ở cùng một nơi.',
              'Chi phí rõ ràng: biết mỗi lần chạy tốn bao nhiêu trước khi bấm.',
              'Nằm trong quy trình: cạnh các công cụ mở rộng, chỉnh và đổi nền ảnh, khỏi phải chuyển file giữa nhiều ứng dụng.',
            ],
          },
          'Tải ảnh ở bên cạnh, chọn độ phân giải và tăng lên 4K.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Tăng độ phân giải ảnh thế nào?', 'Tải ảnh, chọn độ phân giải đích trong menu và bấm Chạy. AI tăng độ phân giải tới cỡ bạn chọn, tối đa 4K, và giữ chi tiết, màu sắc và chất liệu của bản gốc. Để có kết quả tốt nhất, hãy bắt đầu từ bản nét nhất bạn có.'],
              ['AI tăng ảnh lên 4K mà không mất chất lượng được không?', 'Phần lớn trường hợp là được. Nguồn quyết định kết quả tốt đến đâu: ảnh nét, ít nén cho kết quả 4K tốt hơn ảnh nén nặng.'],
              ['Super resolution là gì?', 'Là kỹ thuật tạo ảnh độ phân giải cao từ ảnh độ phân giải thấp. Thay vì kéo giãn điểm ảnh, AI thêm chi tiết nhỏ mà ảnh lớn cần, nên kết quả nét ở cỡ mới.'],
              ['Tăng độ phân giải khác làm đẹp ảnh thế nào?', 'Tăng độ phân giải làm ảnh lớn hơn mà vẫn nét. Làm đẹp ảnh là khái niệm rộng hơn, gồm các công cụ cải thiện độ nét hay độ trong. Ứng dụng này tập trung vào độ phân giải và giữ chi tiết, màu sắc và chất liệu của bản gốc.'],
              ['Ảnh nào tăng độ phân giải tốt nhất?', 'Ảnh nét, đủ sáng và ít nén, vì AI có chi tiết rõ để dựng tiếp. Ảnh nén nặng, mờ hoặc nhiễu nhiều cải thiện ít hơn, vì một phần chi tiết gốc đã mất.'],
              ['Tăng độ phân giải ảnh tạo bằng AI được không?', 'Được. Tăng lên 4K là bước cuối hay gặp trước khi ảnh AI đem in, làm banner lớn hay lên trang sản phẩm có phóng to.'],
            ],
          },
        ],
      },
    ],
  },
  'jewelry-try-on': {
    title: 'Thử trang sức bằng AI',
    sections: [
      {
        title: 'Thử trang sức bằng AI là gì?',
        blocks: [
          'Thử trang sức là ứng dụng đặt trang sức trong một ảnh sản phẩm lên người trong một ảnh khác và trả về ảnh người đó đang đeo nó. Bạn tải ảnh trang sức, tải ảnh người đeo rồi bấm Chạy. Người, dáng, trang phục và bối cảnh giữ nguyên; chỉ trang sức được thêm vào.',
          `Ứng dụng làm cho đội bán hàng online và marketing cần ảnh trang sức trên người mẫu mà không phải đặt lịch chụp: chụp sản phẩm một lần, rồi đeo lên bao nhiêu ảnh người tuỳ ý. ${APP_COST}`,
        ],
      },
      {
        title: 'Thử trang sức trong 3 bước',
        lead: 'Tải trang sức, chọn người đeo, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải trang sức', text: 'Thêm một ảnh rõ của món trang sức vào ô Trang sức. Ảnh chụp trên nền trơn, hoặc đã qua Xoá nền, giúp AI chỉ đọc đúng món đồ.' },
              { title: 'Chọn người đeo', text: 'Thêm ảnh người sẽ đeo vào ô Người đeo: ảnh người mẫu, ảnh chân dung hay ảnh cận tai, cổ hoặc tay, tuỳ món đồ.' },
              { title: 'Chạy', text: 'Bấm Chạy. AI nhận ra loại trang sức, đặt nó vào đúng chỗ đeo và khớp với ánh sáng của ảnh; ảnh mới nằm trong tab Lịch sử.' },
            ],
          },
        ],
      },
      {
        title: 'Thử được những gì?',
        lead: 'AI nhận ra sáu loại trang sức và đặt mỗi loại vào đúng chỗ đeo.',
        blocks: [
          {
            cols: 3,
            cards: [
              { title: 'Hoa tai', text: 'Khuyên, vòng tai, hoa tai dài hay kẹp vành tai. Dùng ảnh nghiêng hoặc cận tai, tóc vén ra sau để thấy rõ dái và vành tai. Muốn xem trước một lỗ xỏ mới, tải món định đeo và ảnh tai của bạn; vị trí chính xác vẫn nên hỏi thợ xỏ.' },
              { title: 'Dây chuyền', text: 'Dây, mặt dây và vòng cổ được đặt lên cổ với độ dài và góc thật. Phần đi sau cổ, tóc hay cổ áo được che đi, để dây trông như đang đeo chứ không như dán lên. Cổ áo mở cho thấy trọn mặt dây.' },
              { title: 'Nhẫn', text: 'Nhẫn nằm trên ngón tay đúng tỉ lệ, đá giữ nguyên giác cắt, màu và ổ chấu.' },
              { title: 'Vòng tay', text: 'Vòng, lắc và vòng bản to nằm trên cổ tay, có bóng đổ chỗ chạm da.' },
              { title: 'Đồng hồ', text: 'Đồng hồ nằm trên cổ tay, giữ nguyên mặt số, vỏ và dây như trong ảnh sản phẩm. Dùng ảnh có cổ tay hướng về máy ảnh.' },
              { title: 'Ghim cài áo', text: 'Ghim và trâm cài được đặt lên áo, ở ngực hoặc cổ áo, cùng ánh sáng và bóng đổ với phần còn lại của ảnh. Áo vest hoặc áo trơn cho ghim một chỗ rõ ràng.' },
            ],
          },
        ],
      },
      {
        title: 'Thử bằng AI hay thử bằng AR?',
        lead: 'Hai cách trả lời hai câu hỏi khác nhau.',
        blocks: [
          {
            table: [
              ['', 'Thử bằng AI', 'Thử bằng AR'],
              ['Cách làm', 'Tạo ảnh mới từ ảnh người và ảnh trang sức', 'Phủ mô hình số của món đồ lên hình camera trực tiếp'],
              ['Cần cài ứng dụng', 'Không, chạy ngay trên trình duyệt', 'Thường cần ứng dụng của cửa hàng hoặc trang web có camera'],
              ['Chất lượng', 'Ảnh chân thực tới 4K, ánh sáng và bóng đổ khớp', 'Xem trực tiếp, chi tiết tuỳ mô hình số và camera'],
              ['Ảnh để chia sẻ', 'Có, tải về ảnh hoàn chỉnh', 'Thường chỉ là ảnh chụp màn hình'],
              ['Hợp nhất cho', 'Ảnh sản phẩm, quảng cáo, xem trước trên một ảnh cụ thể', 'Xem nhanh khi đang mua'],
            ],
          },
        ],
      },
      {
        title: 'Dùng cho thương hiệu và cửa hàng online',
        lead: 'Ảnh trang sức trên người mẫu từ một ảnh sản phẩm, không cần buổi chụp.',
        blocks: [
          {
            cards: [
              { title: 'Ảnh sản phẩm trên người mẫu', text: 'Trang sản phẩm có ảnh món đồ đang được đeo cho thấy kích cỡ và cách nó nằm. Chạy cùng một ảnh sản phẩm trên ảnh tai, cổ hay tay để có cả bộ ảnh từ một lần chụp.' },
              { title: 'Một món đồ trên nhiều người', text: 'Chạy cùng hoa tai hay dây chuyền trên những người có màu da và khuôn mặt khác nhau, để khách thấy nó trên người giống mình. Muốn giữ ảnh đã chốt mà đổi người, dùng Đổi người mẫu sau đó.' },
              { title: 'Quảng cáo và bài đăng', text: 'Ảnh đời thường cho bạn ảnh kiểu chiến dịch để chạy quảng cáo và đăng mạng xã hội. Muốn hợp mùa hay màu thương hiệu, đổi nền kết quả bằng Đổi nền.' },
              { title: 'Video từ chính ảnh đó', text: 'Ảnh thử trang sức đã xong có thể thành video ngắn cho trang sản phẩm và reels ở trang Tạo video, hoặc thành video UGC có người giới thiệu ở Marketing Studio.' },
            ],
          },
        ],
      },
      {
        title: 'Mẹo để ảnh thật hơn',
        lead: 'AI khớp trang sức với ánh sáng của ảnh người đeo, nên đầu vào tốt cho kết quả tốt.',
        blocks: [
          {
            cards: [
              { title: 'Ánh sáng đều, mềm', text: 'Ảnh không có bóng gắt cho phản chiếu trên kim loại và đá sạch hơn.' },
              { title: 'Góc rõ', text: 'Ảnh nghiêng cho hoa tai, ảnh thẳng cho dây chuyền, bàn tay hướng về máy ảnh cho nhẫn, vòng tay và đồng hồ.' },
              { title: 'Vén tóc khi thử hoa tai', text: 'Vén tóc ra sau tai hoặc buộc lên để dái tai và vành tai lộ hẳn.' },
              { title: 'Cổ áo mở khi thử dây chuyền', text: 'Cổ chữ V, cổ áo mở hay áo quây để chỗ cho dây và mặt dây.' },
              { title: 'Nền trơn cho ảnh trang sức', text: 'Chụp món đồ trên mặt phẳng trơn, hoặc chạy Xoá nền trước, để AI chỉ đọc món trang sức.' },
              { title: 'Độ phân giải cao', text: 'File lớn và nét giữ đá và chữ khắc đọc được. Ảnh sản phẩm nhỏ thì chạy Tăng độ phân giải trước khi tải lên.' },
            ],
          },
        ],
      },
      {
        title: 'Giới hạn',
        blocks: [
          'Đây là ảnh xem trước, không phải công cụ đo cỡ: kết quả cho thấy món đồ trông thế nào trên người, không cho biết cỡ nhẫn, độ dài dây hay đường kính khuyên cần mua. Dây rất mảnh, khuyên rất nhỏ và chữ khắc nhỏ có thể mờ đi, nhất là ở 1K. Ảnh mờ hoặc tối cho kết quả kém hơn, nên hãy bắt đầu từ ảnh tốt nhất bạn có.',
          'Chỉ dùng ảnh sản phẩm công ty có quyền, và ảnh người khi người đó đã đồng ý.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Thử trang sức bằng AI hoạt động thế nào?', 'AI đọc ảnh trang sức, nhận ra đó là loại gì và đặt nó vào chỗ đeo trên người trong ảnh. Nó giữ thiết kế, màu kim loại và đá, và khớp phản chiếu và bóng đổ với ánh sáng của ảnh. Người, dáng, trang phục và bối cảnh giữ nguyên.'],
              ['Xem trước một lỗ xỏ tai được không?', 'Được. Tải ảnh cận tai và món khuyên định đeo; kết quả cho thấy cỡ và kiểu trên tai bạn. AI chọn một chỗ tự nhiên trên tai, nên hãy coi đó là ảnh xem kiểu và hỏi thợ xỏ vị trí chính xác.'],
              ['Có dùng cho nam được không?', 'Được. Tải ảnh nghiêng của bạn hoặc của người mẫu nam có tai lộ rõ, cùng ảnh khuyên hay khuyên kẹp; AI đặt nó lên tai như với mọi ảnh khác.'],
              ['Kết quả chính xác tới đâu?', 'Chính xác về vẻ ngoài, không phải về số đo. AI giữ thiết kế, màu kim loại và đá từ ảnh sản phẩm và đặt món đồ ở tỉ lệ thật, nhưng không biết cỡ nhẫn hay độ dài dây bạn cần.'],
              ['Có cần cài ứng dụng không?', 'Không. Ứng dụng chạy trên trình duyệt, cả máy tính và điện thoại. Bạn tải ảnh hoàn chỉnh về khi xong.'],
              ['Một lần chạy tốn bao nhiêu?', `${APP_COST} Chi phí thật nằm trên ảnh trong Thư viện.`],
            ],
          },
        ],
      },
    ],
  },
  'face-swap': {
    title: 'Đổi khuôn mặt chỉ với một lần chạy',
    sections: [
      {
        title: 'Đổi khuôn mặt bằng AI là gì?',
        blocks: [
          'Đổi khuôn mặt là ứng dụng thay khuôn mặt trong một ảnh bằng khuôn mặt từ ảnh khác. Bạn tải Khuôn mặt nguồn và Ảnh đích, và AI hoà khuôn mặt mới vào, khớp màu da và ánh sáng, trong khi tóc, dáng người, trang phục và bối cảnh không bị động đến.',
          `Ứng dụng làm việc trên ảnh và bắt đầu bằng một lần bấm Chạy. Thương hiệu và người sáng tạo nội dung dùng nó để đổi người xuất hiện trong ảnh trong khi cách phối, trang phục và bối cảnh giữ đúng như lúc chụp. ${APP_COST}`,
        ],
      },
      {
        title: 'Đổi khuôn mặt trong ảnh',
        lead: 'Tải khuôn mặt nguồn, tải ảnh đích, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải khuôn mặt nguồn', text: 'Thêm ảnh khuôn mặt sẽ xuất hiện trong kết quả vào ô Khuôn mặt nguồn. Ảnh rõ, nhìn thẳng là tốt nhất.' },
              { title: 'Tải ảnh đích', text: 'Thêm ảnh có khuôn mặt cần thay vào ô Ảnh đích. Tóc, dáng người, trang phục và bối cảnh của ảnh này được giữ trong kết quả.' },
              { title: 'Chạy', text: 'Bấm Chạy. AI hoà khuôn mặt nguồn vào ảnh đích và khớp với màu da và ánh sáng của cảnh; ảnh mới nằm trong tab Lịch sử.' },
            ],
          },
        ],
      },
      {
        title: 'Đổi khuôn mặt giữ ảnh chân thực bằng cách nào?',
        lead: 'Bằng cách khớp khuôn mặt mới với màu da và ánh sáng của ảnh đích, và không động đến mọi thứ khác.',
        blocks: [
          {
            cols: 3,
            cards: [
              { title: 'Khớp màu da', text: 'Một khuôn mặt khác màu da với cổ và tay quanh nó trông như bị dán. AI khớp màu da của khuôn mặt mới với ảnh đích, để khuôn mặt và phần còn lại của người đọc như một.' },
              { title: 'Khớp ánh sáng', text: 'Hướng sáng, độ mềm và màu ánh sáng khác nhau giữa các ảnh. AI khớp ánh sáng của khuôn mặt mới với ảnh đích, để khuôn mặt nằm trong cùng ánh sáng với phần còn lại của cảnh.' },
              { title: 'Mọi thứ khác giữ nguyên', text: 'Ứng dụng chỉ đổi khuôn mặt. Tóc, dáng người, trang phục và bối cảnh trong ảnh đích không bị động đến, nên cách phối, sản phẩm và bối cảnh đúng như ảnh gốc.' },
            ],
          },
        ],
      },
      {
        title: 'Đổi khuôn mặt dùng vào việc gì?',
        lead: 'Để dùng lại những ảnh tốt với một khuôn mặt khác, không phải lên kế hoạch chụp mới.',
        blocks: [
          {
            cards: [
              { title: 'Một gương mặt thương hiệu xuyên suốt chiến dịch', text: 'Ảnh chiến dịch thường đến từ nhiều buổi chụp, nhiều ngày và nhiều người mẫu. Với sự đồng ý của người liên quan, cùng một gương mặt thương hiệu có thể đặt vào các ảnh đó, trong khi mọi bộ đồ và bối cảnh giữ như lúc chụp.' },
              { title: 'Hình ảnh theo thị trường', text: 'Chiến dịch theo vùng đôi khi cần người mẫu khác cho từng thị trường. Đổi khuôn mặt trong một ảnh đã duyệt, với sự đồng ý của người mẫu mới, cho mỗi thị trường một phiên bản riêng trong khi trang phục, cách phối và bối cảnh giữ nguyên.' },
              { title: 'Nội dung của người sáng tạo', text: 'Đặt khuôn mặt của chính bạn lên ảnh đã có, như một cảnh chụp với người đóng thế đã đồng ý. Ảnh giữ bộ đồ và khung cảnh của bản gốc, nên một ảnh dùng lại được cho bài đăng mới. Muốn thành video ngắn, làm động ảnh ở trang Tạo video.' },
              { title: 'Ảnh ý tưởng và moodboard', text: 'Dùng ảnh của các ứng viên đã đồng ý, đổi khuôn mặt cho thấy một gương mặt khác trông thế nào trong bối cảnh và cách phối dự kiến, trước khi chốt người mẫu.' },
            ],
          },
        ],
      },
      {
        title: 'Mẹo để ảnh đổi khuôn mặt đẹp hơn',
        lead: 'Kết quả chỉ tốt bằng đầu vào: khuôn mặt nguồn nhìn thẳng, góc đầu giống nhau, ánh sáng tốt và độ phân giải cao.',
        blocks: [
          {
            cards: [
              { title: 'Khuôn mặt nguồn nhìn thẳng', text: 'Khuôn mặt nhìn thẳng cho thấy mắt, mũi và miệng rõ và cân. Tránh ảnh nguồn quay đi, bị cắt hay bị tóc, tay hoặc kính râm che một phần.' },
              { title: 'Góc đầu giống nhau', text: 'Khuôn mặt mới phải vừa với đầu trong ảnh đích. Khuôn mặt nguồn có góc đầu giống ảnh đích, như thẳng với thẳng hay ba phần tư với ba phần tư, cho AI điểm khớp gần hơn.' },
              { title: 'Ánh sáng tốt', text: 'Ánh sáng đều và mềm trên khuôn mặt nguồn cho thấy rõ các đường nét. Bóng gắt hay ánh màu mạnh che mất chi tiết AI cần, dù kết quả vẫn được khớp với ánh sáng của ảnh đích.' },
              { title: 'Độ phân giải cao', text: 'Ảnh đích quyết định chất lượng ảnh cuối, nên hãy dùng file nét nhất, lớn nhất bạn có. Muốn kết quả nét hơn nữa, chạy nó qua Tăng độ phân giải.' },
            ],
          },
        ],
      },
      {
        title: 'Đổi khuôn mặt, đổi người mẫu hay đổi nhân vật?',
        lead: 'Đổi khuôn mặt chỉ đổi khuôn mặt, Đổi người mẫu đổi khuôn mặt, màu da và dáng người, còn Đổi nhân vật đổi cả người kể cả quần áo.',
        blocks: [{ table: SWAP_TABLE }, 'Chọn theo mức độ người cần đổi. Cần cả dáng người mới lẫn khuôn mặt mới thì dùng Đổi người mẫu. Cần một người mới trong bộ đồ mới thì dùng Đổi nhân vật.'],
      },
      {
        title: 'Dùng Đổi khuôn mặt có trách nhiệm',
        blocks: [
          'Chỉ đổi khuôn mặt trên ảnh công ty có quyền, với sự đồng ý của mọi người có khuôn mặt hay ảnh được chỉnh, gồm người trong ảnh khuôn mặt nguồn và người trong ảnh đích.',
          'Không bao giờ dùng Đổi khuôn mặt để mạo danh ai, đánh lừa người xem hay đặt một người vào nội dung họ không đồng ý. Không dùng ảnh người nổi tiếng hay của bất kỳ ai chưa cho phép. Với việc thương mại, hãy giữ giấy đồng ý của người mẫu và thoả thuận sử dụng cho mọi người xuất hiện trong ảnh cuối.',
          'Tải khuôn mặt nguồn và ảnh đích ở bên cạnh để chạy lần đổi khuôn mặt đầu tiên.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Đổi khuôn mặt sang một ảnh khác thế nào?', 'Tải khuôn mặt muốn dùng vào ô Khuôn mặt nguồn và ảnh muốn đổi vào ô Ảnh đích, rồi bấm Chạy. AI hoà khuôn mặt mới vào ảnh đích và khớp màu da và ánh sáng. Chỉ dùng ảnh công ty có quyền và có sự đồng ý của người trong ảnh.'],
              ['Đổi khuôn mặt có đổi tóc hay quần áo không?', 'Không. Chỉ khuôn mặt đổi. Tóc, dáng người, trang phục và bối cảnh trong ảnh đích giữ nguyên. Muốn đổi cả dáng người thì dùng Đổi người mẫu; đổi cả bộ đồ thì dùng Đổi nhân vật.'],
              ['Điều gì làm ảnh đổi khuôn mặt trông thật?', 'Khớp màu da và ánh sáng giữa khuôn mặt mới và ảnh đích làm kết quả đọc như một bức ảnh, và AI lo cả hai. Đầu vào tốt cũng giúp: khuôn mặt nguồn nhìn thẳng, góc đầu giống nhau, ánh sáng đều và file độ phân giải cao.'],
              ['Dùng ảnh đổi khuôn mặt cho marketing được không?', 'Được, khi công ty có quyền với cả hai ảnh và có sự đồng ý của mọi người có khuôn mặt hay hình ảnh được dùng. Giữ giấy đồng ý và thoả thuận sử dụng, và không bao giờ dùng để mạo danh hay đánh lừa khách hàng.'],
              ['Đổi khuôn mặt có dùng cho video không?', 'Không. Ứng dụng làm việc trên ảnh: cả khuôn mặt nguồn và ảnh đích đều là ảnh, và kết quả là một ảnh đã chỉnh.'],
              ['Một lần chạy tốn bao nhiêu?', `${APP_COST} Chi phí thật nằm trên ảnh trong Thư viện.`],
            ],
          },
        ],
      },
    ],
  },
  'background-remover': {
    title: 'Xoá nền ảnh bằng AI: làm ảnh trong suốt',
    sections: [
      {
        title: 'Xoá nền bằng AI là gì?',
        blocks: [
          'Xoá nền là ứng dụng tách chủ thể của một ảnh khỏi nền và xoá nền đi. Bạn tải một ảnh, bấm Chạy và nhận ảnh PNG trong suốt của chủ thể, sẵn cho mọi dự án hay thiết kế. Ứng dụng dùng được cho người, sản phẩm và đồ vật.',
          `Ứng dụng làm cho đội bán hàng online, marketing và thiết kế cần ảnh cắt sạch của người mẫu, sản phẩm và đạo cụ: một ảnh, một lần bấm, không phải tô vùng chọn bằng tay. ${APP_COST}`,
        ],
      },
      {
        title: 'Xoá nền ảnh trong 3 bước',
        lead: 'Tải ảnh, bấm Chạy, rồi tải ảnh PNG trong suốt về.',
        blocks: [
          {
            steps: [
              { title: 'Tải ảnh', text: 'Thêm ảnh có người, sản phẩm hay đồ vật bạn muốn giữ.' },
              { title: 'Bấm Chạy', text: 'AI tách chủ thể khỏi nền chỉ với một lần bấm.' },
              { title: 'Tải ảnh PNG trong suốt', text: 'Ảnh PNG nằm trong tab Lịch sử và trong Thư viện, mục Ứng dụng. Tải về và đặt vào bất kỳ dự án hay thiết kế nào.' },
            ],
          },
          'Kết quả giữ chủ thể như trong ảnh của bạn, chỉ nền bị xoá. Lặp lại các bước cho mỗi ảnh trong một bộ sản phẩm để có đủ ảnh cắt.',
        ],
      },
      {
        title: 'Bạn nhận được gì',
        lead: 'Tải một ảnh lên và nhận lại ảnh PNG trong suốt của chủ thể, nền đã được xoá.',
        blocks: [
          {
            cols: 3,
            cards: [
              { title: 'Ảnh PNG trong suốt', text: 'Chủ thể giữ lại, nền thành trong suốt. File đặt được lên mọi màu, bố cục hay cảnh mà không có khung quanh chủ thể.' },
              { title: 'Mép chủ thể sạch', text: 'AI dò đường viền chủ thể và tách khỏi nền, nên ảnh cắt sẵn để đặt vào bố cục. Mép sạch nhất khi chủ thể nổi rõ khỏi phía sau.' },
              { title: 'Dùng cho người, sản phẩm và đồ vật', text: 'Ảnh người mẫu, ảnh sản phẩm và đạo cụ đều có nền trong suốt từ cùng một ô tải lên.' },
            ],
          },
        ],
      },
      {
        title: 'Ảnh nền trong suốt cho bán hàng online và thiết kế',
        lead: 'Một ảnh cắt sạch dùng lại được cho cửa hàng, quảng cáo, bài đăng và slide.',
        blocks: [
          {
            cards: [
              { title: 'Ảnh sản phẩm trên nền trắng hoặc nền màu', text: 'Xoá nền một lần, rồi đặt sản phẩm lên nền trắng cho danh mục cửa hàng hay lên màu thương hiệu cho chiến dịch. Cùng một ảnh cắt phục vụ cả hai. Muốn ảnh người mẫu mặc sản phẩm đó, hãy dùng trang Thử đồ.' },
              { title: 'Trang sản phẩm trên sàn', text: 'Trang sản phẩm trông đồng bộ hơn khi mọi sản phẩm nằm trên cùng một nền trơn. Xoá nền trước để đặt mỗi sản phẩm lên phông mà cửa hàng hay sàn yêu cầu.' },
              { title: 'Quảng cáo và banner', text: 'Người thiết kế quảng cáo cần sản phẩm hay người mẫu ở một lớp riêng. Ảnh trong suốt cho đúng lớp đó, sẵn để đặt lên mọi màu, chất liệu hay ảnh. Muốn bỏ qua bước cắt và có ngay cảnh hoàn chỉnh, hãy dùng Đổi nền.' },
              { title: 'Bài đăng mạng xã hội', text: 'Bài đăng thường đặt sản phẩm hay người lên màu mạnh, chữ và đồ hoạ. Ảnh trong suốt thả vào mẫu bài đăng mà không có khung quanh, nên thiết kế trông hoàn chỉnh chứ không như cắt dán.' },
              { title: 'Bài thuyết trình', text: 'Slide lookbook, họp duyệt hàng và bài chào hàng trông gọn hơn với sản phẩm đã cắt. Ứng dụng biến một ảnh thường thành file nằm được trên mọi nền slide, sáng hay tối.' },
            ],
          },
        ],
      },
      {
        title: 'Mẹo để ảnh cắt sạch',
        lead: 'Bắt đầu với ảnh có độ tương phản tốt, lấy nét rõ, chi tiết nhỏ thấy rõ và đủ độ phân giải.',
        blocks: [
          {
            cards: [
              { title: 'Tương phản giữa chủ thể và nền', text: 'Chủ thể nổi khỏi nền thì AI dễ tách hơn. Áo khoác tối trên tường sáng cho đường viền rõ hơn áo đen trên tường tối, nên hãy chọn hoặc chụp ảnh có tương phản.' },
              { title: 'Lấy nét rõ', text: 'Mép mờ khó dò, và độ mềm quanh đường viền đi theo vào ảnh cắt. Dùng ảnh chủ thể nét, nhất là dọc mép.' },
              { title: 'Tóc và chi tiết nhỏ', text: 'Tóc, lông, ren và dây mảnh là phần khó nhất của mọi ảnh cắt. Ảnh có các chi tiết này trên nền trơn, tương phản cho AI mép rõ nhất để theo.' },
              { title: 'Độ phân giải', text: 'Ảnh độ phân giải cao giữ nhiều chi tiết hơn dọc mép chủ thể. Với ảnh nhỏ, làm nét bằng Tăng độ phân giải trước rồi mới xoá nền.' },
            ],
          },
        ],
      },
      {
        title: 'Xoá nền hay đổi nền: cần ứng dụng nào?',
        lead: 'Dùng Xoá nền khi muốn bỏ nền và để trong suốt, dùng Đổi nền khi muốn có nền mới được tạo sau chủ thể.',
        blocks: [
          {
            table: [
              ['Ứng dụng', 'Nền được xử lý thế nào', 'Kết quả'],
              ['Xoá nền', 'Bị xoá và để trong suốt', 'Ảnh PNG trong suốt của chủ thể'],
              ['Đổi nền', 'Được thay bằng nền mới do AI tạo', 'Chủ thể trong một cảnh mới'],
            ],
          },
          'Chọn Xoá nền cho ảnh cắt bạn tự đặt. Khi chủ thể cần cảnh mới, Đổi nền tạo cảnh đó cho bạn.',
          'Tải ảnh ở bên cạnh để có ảnh PNG trong suốt chỉ với một lần chạy.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Xoá nền ảnh thế nào?', 'Tải ảnh vào ô bên cạnh và bấm Chạy. AI tách chủ thể khỏi nền, và bạn tải kết quả về dưới dạng PNG trong suốt.'],
              ['Làm ảnh trong suốt thế nào?', 'Tải ảnh lên và chạy Xoá nền. Nền bị xoá và chủ thể được lưu thành PNG trong suốt, nên mọi thứ phía sau hiện ra khi bạn đặt nó vào thiết kế.'],
              ['Nhận được file định dạng gì?', 'Ảnh PNG trong suốt. Định dạng PNG giữ vùng trong suốt, nên chủ thể nằm được trên mọi nền trong cửa hàng, quảng cáo, bài đăng hay slide.'],
              ['Có dùng cho ảnh sản phẩm không?', 'Có. Ứng dụng dùng được cho người, sản phẩm và đồ vật. Ảnh sản phẩm có tương phản tốt và lấy nét rõ cho ảnh cắt sạch nhất.'],
              ['Thêm nền mới sau khi xoá được không?', 'Được. Đặt ảnh PNG trong suốt lên bất kỳ nền nào trong thiết kế của bạn. Muốn AI tạo nền mới sau chủ thể, hãy dùng Đổi nền.'],
              ['Chất lượng ảnh có thay đổi không?', 'Chủ thể trong ảnh được giữ, chỉ nền bị xoá. Cần độ phân giải cao hơn thì chạy ảnh qua Tăng độ phân giải trước, rồi mới xoá nền.'],
            ],
          },
        ],
      },
    ],
  },
  'motion-control': {
    title: 'Kling Motion Control: chép chuyển động lên nhân vật của bạn',
    sections: [
      {
        title: 'Kling Motion Control là gì?',
        blocks: [
          'Điều khiển chuyển động là ứng dụng chép chuyển động từ một video mẫu lên ảnh nhân vật. Bạn tải một video ngắn có chuyển động và một ảnh nhân vật, và AI, chạy trên Kling V3 Motion Control, trả về video nhân vật của bạn làm đúng các động tác đó.',
          'Ứng dụng giống chuyển video sang video với một khác biệt: chuyển động đến từ một clip, còn người trên màn hình đến từ ảnh của bạn. Bạn có thể thêm prompt tuỳ chọn để lái chuyển động, phong cách hay chuyển máy. Video kết quả dài bằng video mẫu và không có tiếng; chi phí tính theo số giây của video mẫu, làm tròn lên, và tính vào ngân sách ảnh và ứng dụng như các ứng dụng khác.',
        ],
      },
      {
        title: 'Dùng Điều khiển chuyển động thế nào',
        lead: 'Tải ảnh nhân vật, tải video mẫu, thêm prompt nếu muốn, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải ảnh nhân vật', text: 'Thêm ảnh nhân vật bạn muốn làm động. Ảnh rõ người, thấy cả thân càng tốt.' },
              { title: 'Tải video mẫu', text: 'Thêm một clip có chuyển động bạn muốn chép: MP4 hoặc MOV, dài 3 đến 30 giây, tối đa 20 MB, có một người làm động tác rõ ràng.' },
              { title: 'Thêm prompt (tuỳ chọn)', text: 'Tả chuyển động, phong cách hay chuyển máy bạn muốn, hoặc để trống.' },
              { title: 'Chạy', text: 'Bấm Chạy. AI chép chuyển động từ video mẫu lên nhân vật và trả về video cùng các động tác. Video nằm trong tab Lịch sử và trong Thư viện, mục Ứng dụng.' },
            ],
          },
        ],
      },
      {
        title: 'Chép được những gì',
        lead: 'Chuyển động cơ thể rõ ràng từ video mẫu, như điệu nhảy, dáng đi và cử chỉ, và prompt có thể thêm chuyển máy.',
        blocks: [
          {
            cards: [
              { title: 'Điệu nhảy và xu hướng', text: 'Điệu nhảy đang thịnh hợp tự nhiên. Chọn clip điệu nhảy làm video mẫu, và nhân vật của bạn nhảy theo đúng động tác. Một clip dùng lại được với mọi nhân vật bạn tải lên.' },
              { title: 'Dáng đi và catwalk', text: 'Một bước catwalk, một cú xoay cuối sàn diễn hay một bước dạo chậm chuyển từ video mẫu sang nhân vật. Ảnh người mẫu tĩnh chuyển động như trên sàn diễn, cùng nhịp và dáng như trong clip.' },
              { title: 'Cử chỉ và dáng nói chuyện', text: 'Cử chỉ tay, quay đầu và ngôn ngữ cơ thể của người nói trước máy cũng chép được. Nhân vật có thể chuyển động như người dẫn hay người sáng tạo nội dung, cùng nhịp cử chỉ với người trong video mẫu.' },
              { title: 'Chuyển máy qua prompt', text: 'Prompt tuỳ chọn có thể tả chuyển máy, như tiến chậm vào hay lia ngang. Giữ đơn giản và chỉ một chuyển máy mỗi lần chạy.' },
            ],
          },
        ],
      },
      {
        title: 'Điều khiển chuyển động cho video thời trang và marketing',
        lead: 'Đội thời trang và marketing dùng nó để biến ảnh người mẫu và ảnh sản phẩm tĩnh thành video, với chuyển động họ tự chọn.',
        blocks: [
          {
            cards: [
              { title: 'Làm động ảnh người mẫu bằng bước catwalk', text: 'Ghép ảnh người mẫu với một clip catwalk, và người mẫu bước đi y như vậy trong kết quả: một ảnh lookbook thành video sàn diễn ngắn. Nếu trang phục chưa ở trên người mẫu, tạo ảnh người mẫu ở trang Thử đồ trước.' },
              { title: 'Biến ảnh người mẫu mặc sản phẩm thành video mạng xã hội', text: 'Ảnh người mẫu mặc sản phẩm thành video ngắn khi thêm chuyển động từ một clip mẫu, như một cú xoay hay đổi tư thế. Video sản phẩm dựng từ mô tả thì dùng trang Tạo video.' },
              { title: 'Một clip xu hướng, nhiều nhân vật', text: 'Một clip mẫu điều khiển được video cho nhiều nhân vật. Chạy cùng xu hướng với nhiều người mẫu để có bộ video cùng động tác. Muốn video thử đồ kiểu người sáng tạo nội dung, dùng Marketing Studio.' },
            ],
          },
          'Chỉ dùng video mẫu và ảnh nhân vật mà công ty có quyền, và có sự đồng ý của bất kỳ ai có hình ảnh hay màn trình diễn xuất hiện trong đó. Muốn thay người trong ảnh tĩnh thay vì làm động, dùng Đổi nhân vật.',
        ],
      },
      {
        title: 'Mẹo để chép chuyển động sạch',
        lead: 'Một clip mẫu rõ ràng, một ảnh nhân vật cùng khung và một prompt ngắn.',
        blocks: [
          {
            list: [
              'Một chủ thể rõ trong video mẫu: một người, thấy rõ từ đầu đến cuối, cho AI một chuyển động để theo. Đám đông hay người chồng lên nhau làm chuyển động khó đọc.',
              'Thấy cả thân cho chuyển động cả thân: muốn nhân vật đi hay nhảy từ đầu đến chân, hãy dùng video mẫu và ảnh nhân vật đều thấy cả thân.',
              'Khung hình giống nhau: ảnh nhân vật cùng khung với video mẫu, như toàn thân với toàn thân hay nửa người với nửa người, giữ chuyển động cân đối. Cần ảnh nhân vật mới thì tạo ở trang Tạo ảnh.',
              'Độ dài trong giới hạn: video mẫu dài 3 đến 30 giây, tối đa 20 MB.',
              'Prompt ngắn: chuyển động đến từ video, nên prompt chỉ cần vài chữ về phong cách hay chuyển máy.',
            ],
          },
        ],
      },
      {
        title: 'Điều khiển chuyển động dùng phiên bản Kling nào?',
        blocks: [
          'Ứng dụng chạy trên Kling V3 Motion Control, phiên bản mới sau Kling 2.6 Motion Control. Danh mục có hai bản: Pro và Standard; khi Admin bật cả hai, menu Mô hình cho bạn chọn, và chi phí mỗi giây của từng bản ghi trên nút Chạy.',
          {
            table: [
              ['Bản', 'Hợp nhất với', 'Độ dài video mẫu'],
              ['Kling V3 Motion Control Pro', 'Chuyển động phức tạp, chất lượng cao nhất', '3 đến 30 giây'],
              ['Kling V3 Motion Control Standard', 'Thử nhanh với chi phí thấp hơn', '3 đến 30 giây'],
            ],
          },
          'Tải video mẫu và nhân vật ở bên cạnh để chép chuyển động bằng Kling V3.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Kling Motion Control là gì?', 'Là công cụ chép chuyển động từ một video mẫu lên ảnh nhân vật. Bạn tải một video mẫu ngắn và một ảnh nhân vật, và AI, chạy trên Kling V3, trả về video nhân vật của bạn làm cùng các động tác.'],
              ['Video mẫu dài được bao lâu?', 'Từ 3 đến 30 giây, file MP4 hoặc MOV tối đa 20 MB. Chọn clip chứa trọn chuyển động bạn muốn chép, từ bước đầu đến bước cuối.'],
              ['Làm động ảnh tĩnh bằng chuyển động từ video khác được không?', 'Được. Tải ảnh tĩnh làm nhân vật và video kia làm video mẫu. AI chép chuyển động từ video lên ảnh, nên người trong ảnh chuyển động y như vậy.'],
              ['Làm video nhảy với nhân vật của mình được không?', 'Được. Dùng một clip nhảy làm video mẫu và ảnh nhân vật của bạn làm nhân vật. Chỉ dùng nhân vật và clip nhảy mà công ty có quyền, và có sự đồng ý của người thật xuất hiện trong đó.'],
              ['Có cần viết prompt không?', 'Không. Prompt là tuỳ chọn. Chuyển động đến từ video mẫu; chỉ thêm một prompt ngắn khi muốn lái chuyển động, phong cách hay chuyển máy.'],
              ['Một lần chạy tốn bao nhiêu?', 'Chi phí tính theo số giây của video mẫu, làm tròn lên, và tính vào ngân sách ảnh và ứng dụng, tách khỏi ngân sách video. Nút Chạy ghi chi phí ước tính sau khi bạn tải video mẫu.'],
            ],
          },
        ],
      },
    ],
  },
};

/** The long About tabs of the tools; `advanced` is for the Advanced marketing page. */
export const ABOUT = { create, tryOn, image, marketing, advanced };

/** The short description of a model on the Explore "Featured models" cards, by model id. */
export const MODEL_CARD_TEXT: Record<string, string> = {
  'kling-o3-pro': 'Ghép tối đa 4 ảnh tham chiếu thành một video 1080p chuyển động chân thực theo vật lý.',
  'kling-3.0-pro': 'Bản chủ lực của Kling: clip 3–15 giây ở 1080p với chuyển động chính xác, giàu chất điện ảnh.',
  'kling-2.6': 'Clip 5 hoặc 10 giây ở 1080p, chuyển động mượt cho video sản phẩm.',
  'kling-2.5-turbo': 'Bản Kling nhanh: clip 5 hoặc 10 giây ở 1080p với chi phí thấp.',
  'kling-o1': 'Dựng cảnh từ tối đa 4 ảnh tham chiếu thành clip 5 hoặc 10 giây ở 1080p.',
  'seedance-2.5': 'Chuyển động sắc nét hơn và bám mô tả chặt hơn, dựng từ tối đa 4 ảnh.',
  'seedance-2.5-image': 'Chuyển động sắc nét hơn và bám mô tả chặt hơn, với clip dài tới 30 giây.',
  'seedance-2.5-reference': 'Ghép tối đa 4 ảnh tham chiếu thành clip điện ảnh dài tới 30 giây.',
  'seedance-2.0': 'Thế hệ video mới với chuyển động chân thực và linh hoạt sáng tạo, clip tới 15 giây.',
  'seedance-2.0-reference': 'Dựng cảnh từ tối đa 4 ảnh tham chiếu, clip 4–15 giây.',
  'seedance-1.5-pro': 'Lựa chọn tiết kiệm của Seedance cho clip 4–12 giây.',
  'seedance-1.0-pro': 'Clip 3–12 giây ở 1080p, lựa chọn bền bỉ với chi phí vừa phải.',
  'flux-3': 'Mô hình video của Black Forest Labs: chuyển động điện ảnh 5–20 giây ở 1080p.',
  'flux-3-reference': 'Làm động một ảnh tham chiếu theo phong cách điện ảnh của FLUX 3, 5–20 giây.',
  'veo-3.1': 'Mô hình điện ảnh của Google: mỗi lần chạy một clip 8 giây trau chuốt.',
  'gemini-omni-flash': 'Mô hình video nhanh của Google, bám sát mô tả, clip 3–10 giây.',
  'gemini-omni-flash-reference': 'Mô hình nhanh của Google dựng cảnh từ tối đa 4 ảnh tham chiếu.',
  'grok-imagine-1.5': 'Clip từ 1 đến 15 giây từ một ảnh, hợp với clip dài mà tiết kiệm.',
  'grok-imagine-reference': 'Dựng cảnh từ tối đa 4 ảnh tham chiếu, clip 1–10 giây.',
  'wan-2.7': 'Mô hình mã nguồn mở của Alibaba, clip 2–15 giây.',
  'wan-2.7-reference': 'WAN dựng cảnh từ tối đa 4 ảnh tham chiếu, clip 2–10 giây.',
  'minimax-h3-max': 'Bản chủ lực của Minimax: clip 5–15 giây ở 768p.',
  'minimax-h3-max-reference': 'Minimax H3 Max dựng cảnh từ tối đa 4 ảnh tham chiếu.',
  'minimax-hailuo-2.3-pro': 'Đường nhanh nhất tới một clip 1080p sắc nét: một ảnh vào, video 6 giây ra.',
  'nano-banana-pro': 'Ghép tối đa 4 ảnh tham chiếu thành ảnh sắc nét, trung thực với bản gốc, tới 4K.',
  'nano-banana-2.1': 'Bản mới của Google: ảnh chân thực hơn, chữ sắc hơn ở tốc độ Flash.',
  'nano-banana-2': 'Mô hình Flash của Google, nhanh và nhiều tỉ lệ khung hình.',
  'nano-banana': 'Mô hình ảnh tiêu chuẩn của Google, rẻ và nhanh nhất cho bản nháp.',
  'gpt-image-2': 'Mô hình ảnh của OpenAI, bám chỉ dẫn dài sát nhất và viết chữ rõ.',
  'gpt-image-2.5-flare': 'Bản GPT Image hằng ngày của OpenAI, nét hơn và nhanh hơn GPT Image 2.',
  'gpt-image-2.5-sunburst': 'GPT Image dành nhiều thời gian hơn cho mỗi ảnh để giữ chi tiết phức tạp.',
  'seedream-5-pro': 'Mô hình của ByteDance cho người và khung cảnh chân thực, ở 1K hoặc 2K.',
};
