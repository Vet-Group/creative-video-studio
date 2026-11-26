// The About tabs as data: one typed page per tool, rendered by components/About.tsx. The section order follows the reference site's About pages;
// every fact (models, limits, prices in USD, the Library) is this app's own. Media fields name samples in the bucket (`<name>.mp4` and/or `<name>.jpg`);
// a missing sample keeps its slot as the empty stripes, so the layout does not move when it is uploaded.
import { HOOKS, LOCATIONS } from './marketing';
import type { AboutCard, AboutPage } from './about-specs';
import type { AboutKey } from './about-updated';
export * from './about-specs';

const PRIVACY: [string, string] = [
  'Ảnh tải lên có riêng tư không?',
  'Ảnh tải lên và kết quả nằm trong kho lưu trữ của công ty, chỉ người đã đăng nhập vào ứng dụng mới xem được. Ảnh được gửi tới nhà cung cấp mô hình để tạo kết quả. Ảnh và video của bạn không bao giờ bị bán, và chúng tôi không dùng chúng để huấn luyện mô hình AI của mình. Thư viện dùng chung trong công ty, nên đồng nghiệp xem được kết quả của bạn.',
];
const RIGHTS = 'Chỉ dùng ảnh mà công ty có quyền sử dụng, và chỉ với người đã đồng ý.';

/** Create Videos. */
const create: AboutPage = {
  title: 'Tạo video sản phẩm từ ảnh',
  lead: 'Đưa vào một ảnh sản phẩm và một câu tả điều sẽ xảy ra, bạn nhận lại một video. Trang này biến ảnh sản phẩm thành video mà không cần quay. Phần dưới giải thích cách tạo video hoạt động, mỗi họ mô hình mạnh ở đâu và cách viết mô tả chuyển động để ra đúng clip bạn hình dung.',
  video: 'tutorial-create',
  sections: [
    {
      kicker: 'Vì sao quan trọng',
      title: 'Vì sao nên tạo video thay vì quay?',
      lead: 'Video hiệu quả hơn ảnh tĩnh ở gần như mọi nơi, nhưng quay theo cách truyền thống chưa bao giờ theo kịp cả một danh mục sản phẩm. Tạo bằng AI lấp khoảng trống đó: một video sản phẩm không còn là hạng mục phải xin duyệt mà là thứ bạn làm xong trong lúc viết một câu.',
      blocks: [
        {
          cards: [
            { title: 'Không tốn công sản xuất', text: 'Một buổi quay cần đạo diễn, người quay, ánh sáng và người dựng, và cần lại tất cả cho sản phẩm tiếp theo. Video tạo bằng AI chỉ cần một ảnh, một câu mô tả và chi phí mô hình ghi sẵn trên nút Tạo video.' },
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
            { title: 'Tải ảnh mở đầu', text: 'Thả ảnh bạn muốn làm động: ảnh sản phẩm, ảnh người mẫu hay một kết quả trước đó. Ảnh đầu tiên là ảnh chính. Mô hình tham chiếu nhận tối đa 9 ảnh, tuỳ mô hình, để dựng cảnh từ đó; mô hình ảnh-thành-video chỉ dùng ảnh đầu tiên.', media: 'about-create-step-1' },
            { title: 'Mô tả chuyển động', text: 'Chọn một mẫu chuyển động công ty đã thử, hoặc tự viết điều sẽ xảy ra tiếp theo. Ảnh đã quyết định sản phẩm, trang phục và bối cảnh, nên mô tả chỉ cần nói về chuyển động. Viết bằng tiếng Anh thường cho kết quả ổn định hơn.', media: 'about-create-step-2' },
            { title: 'Chọn thông số và chạy', text: 'Chọn mô hình, rồi thời lượng và tỉ lệ mà mô hình đó hỗ trợ; độ phân giải đi theo mô hình. Nút Tạo video ghi chi phí ước tính bằng USD trước khi bạn bấm, và lượt tạo nằm trong tab Lịch sử cho đến khi clip xong.', media: 'about-create-step-3' },
          ],
        },
        { loop: 'about-create-loop' },
      ],
    },
    {
      kicker: 'Trả lời nhanh',
      title: 'Cần mấy bước để có video từ một ảnh sản phẩm?',
      blocks: [
        'Ba bước. Tải ảnh sản phẩm làm khung mở đầu, chọn mẫu hoặc viết một dòng tả chuyển động, rồi chọn mô hình và bấm Tạo video. Không có timeline, không keyframe, không phần mềm dựng nào ở giữa.',
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
            { title: 'Clip chiến dịch', text: 'Clip dài tới 30 giây với chuyển máy, trên các mô hình có thời lượng dài như Seedance 2.5 Reference hay FLUX 3.' },
            { title: 'Dựng cảnh từ nhiều ảnh', text: 'Với mô hình tham chiếu, đưa người mẫu, sản phẩm và bối cảnh vào tối đa 9 ảnh để AI dựng một cảnh mới có đủ các yếu tố đó.' },
            { title: 'Mẫu chuyển động có sẵn', text: 'Các mẫu công ty đã thử như Lia vòng ra sau lưng, Sải bước catwalk hay Hé lộ trang phục: chọn một mẫu là có ngay câu lệnh đã được kiểm chứng.' },
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
              family: 'kling-',
              text: 'Chuyển động chân thực theo vật lý. Kling O3 Pro dựng cảnh từ tối đa 7 ảnh tham chiếu và Kling O1 từ tối đa 4. Kling O3 Pro và 3.0 Pro cho clip 3–15 giây, còn Kling 2.6, 2.5 Turbo và O1 chạy nhanh các clip 5 hoặc 10 giây.',
              specs: ['Thời lượng: 3–15 giây (O3 Pro, 3.0 Pro) · 5 hoặc 10 giây (2.6, 2.5 Turbo, O1)', 'Độ phân giải: 1080p', 'Tỉ lệ: 9:16, 1:1 · thêm 16:9 (O3 Pro, O1)', 'Ảnh tham chiếu: tối đa 7 (O3 Pro) · 4 (O1)'],
            },
            {
              tag: '6 mô hình',
              title: 'Seedance',
              media: 'model-seedance-2-5-image',
              family: 'seedance-',
              text: 'Kể chuyện điện ảnh với dải thời lượng rộng nhất. Seedance 2.5 Reference dựng clip tới 30 giây từ tối đa 7 ảnh, Seedance 2.0 Reference clip tới 15 giây từ tối đa 9 ảnh. Seedance 2.5 (5–10 giây) và 2.0 (4–15 giây) cũng nhận nhiều ảnh, còn 1.5 Pro và 1.0 Pro là lựa chọn tiết kiệm.',
              specs: ['Thời lượng: 4–30 giây (2.5 Reference) · 5–10 giây (2.5) · 4–15 giây (2.0, 2.0 Reference) · 4–12 giây (1.5 Pro) · 3–12 giây (1.0 Pro)', 'Độ phân giải: 720p (1.0 Pro: 1080p)', 'Tỉ lệ: 9:16, 1:1 · thêm 16:9 (2.0) · đủ 9:16, 1:1, 16:9, 4:3, 3:4 (bản Reference, 1.5 Pro, 1.0 Pro)', 'Ảnh: tối đa 9 (2.0 Reference) · 7 (2.5 Reference, 2.0) · 4 (2.5) · 1 (1.5 Pro, 1.0 Pro)'],
            },
            {
              tag: '2 mô hình',
              title: 'FLUX 3',
              media: 'model-flux-3',
              family: 'flux-3',
              text: 'Mô hình video của Black Forest Labs, clip 5–20 giây ở 1080p. FLUX 3 và FLUX 3 Reference đều làm động một ảnh của bạn theo phong cách điện ảnh.',
              specs: ['Thời lượng: 5–20 giây', 'Độ phân giải: 1080p', 'Tỉ lệ: 9:16, 1:1, 16:9, 4:3, 3:4', 'Ảnh: 1'],
            },
            {
              tag: 'Thời lượng cố định',
              title: 'Veo 3.1',
              media: 'model-veo-3-1',
              family: 'veo-',
              text: 'Mô hình điện ảnh của Google. Mỗi lần chạy trả về một clip 8 giây trau chuốt, dựng từ ảnh của bạn.',
              specs: ['Thời lượng: 8 giây (cố định)', 'Độ phân giải: 720p', 'Tỉ lệ: 9:16, 16:9'],
            },
            {
              tag: '2 mô hình',
              title: 'Gemini Omni Flash',
              media: 'model-gemini-omni-flash',
              family: 'gemini-omni-flash',
              text: 'Mô hình nhanh của Google, bám sát mô tả, thời lượng linh hoạt 3–10 giây. Bản thường làm động một ảnh, bản Reference dựng cảnh từ tối đa 9 ảnh.',
              specs: ['Thời lượng: 3–15 giây', 'Độ phân giải: 720p', 'Tỉ lệ: 9:16, 16:9', 'Ảnh tham chiếu: tối đa 9 (Reference)'],
            },
            {
              tag: '2 mô hình',
              title: 'Grok Imagine',
              media: 'model-grok-imagine-1-5',
              family: 'grok-imagine',
              text: 'Mô hình của xAI với clip từ 1 đến 15 giây. Grok Imagine 1.5 làm động một ảnh, bản Reference nhận tối đa 7 ảnh.',
              specs: ['Thời lượng: 1–15 giây (1.5) · 1–10 giây (Reference)', 'Độ phân giải: 720p', 'Tỉ lệ: 9:16, 1:1 · đủ 9:16, 1:1, 16:9, 4:3, 3:4 (Reference)', 'Ảnh tham chiếu: tối đa 7 (Reference)'],
            },
            {
              tag: '2 mô hình',
              title: 'WAN',
              media: 'model-wan-2-7',
              family: 'wan-',
              text: 'Mô hình mã nguồn mở của Alibaba. Wan 2.7 cho clip 2–15 giây, Wan 2.7 Reference dựng cảnh từ tối đa 4 ảnh.',
              specs: ['Thời lượng: 2–15 giây (2.7) · 2–10 giây (Reference)', 'Độ phân giải: 720p', 'Tỉ lệ: 9:16, 1:1 · đủ 9:16, 1:1, 16:9, 4:3, 3:4 (Reference)', 'Ảnh tham chiếu: tối đa 4 (Reference)'],
            },
            {
              tag: '7 mô hình',
              title: 'MiniMax',
              media: 'model-minimax-h3-max',
              family: 'minimax-',
              text: 'MiniMax H3 Max là bản chủ lực, clip 5–15 giây ở 768p, kèm bản 480p rẻ để thử nhanh và bản 1080p sắc nét hơn; H3 Max Reference dựng cảnh từ tối đa 9 ảnh, cũng ở ba độ phân giải đó. Hailuo 2.3 Pro là đường nhanh nhất tới một clip 1080p sắc nét: một ảnh vào, video 6 giây ra.',
              specs: ['Thời lượng: 5–15 giây (H3 Max) · 6 giây cố định (Hailuo 2.3 Pro)', 'Độ phân giải: 480p, 768p, 1080p (H3 Max) · 1080p (Hailuo)', 'Tỉ lệ: 9:16, 1:1 · đủ 9:16, 1:1, 16:9, 4:3, 3:4 (H3 Max Reference)', 'Ảnh tham chiếu: tối đa 9 (H3 Max Reference)'],
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
        'Có. Công tắc Tạo âm thanh bật sẵn: với mô hình tạo được âm thanh, clip có tiếng gốc, gồm âm thanh không khí, tiếng động và lời nói khi mô tả yêu cầu. Giá ghi trên nút Tạo video đã tính âm thanh; tắt công tắc để có clip im lặng.',
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
            { tag: 'Kể chuyện', title: '10–30 giây', text: 'Đi một vòng, chuyển máy, clip chiến dịch ngắn. Kling O3 Pro, Kling 3.0 Pro, Seedance 2.0, Wan 2.7, Grok Imagine 1.5 và MiniMax H3 Max tới 15 giây, FLUX 3 tới 20 và Seedance 2.5 Reference tới 30.' },
          ],
        },
        'Mọi mô hình tính tiền theo giây, nên mỗi giây thêm đều tốn thêm. Hai mô hình có thời lượng cố định: Veo 3.1 luôn tạo 8 giây và MiniMax Hailuo 2.3 Pro luôn tạo 6 giây. Mô hình không có thời lượng đang chọn nằm cuối menu và không chọn được.',
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
            ['16:9', 'YouTube, trang web và banner ngang'],
            ['3:4', 'Bài đăng dọc trên bảng tin, ít bị cắt hơn 9:16'],
            ['4:3', 'Ô ngang trên trang web và slide'],
          ],
        },
        'Mọi mô hình video đều có 9:16. Veo 3.1 và Gemini Omni Flash có thêm 16:9 nhưng không có 1:1; các mô hình còn lại đều có 1:1. Kling O3 Pro, Kling O1 và Seedance 2.0 có thêm 16:9, còn FLUX 3, Seedance 1.0 Pro, 1.5 Pro và các bản Reference có đủ năm tỉ lệ. Với mô hình ảnh-thành-video, ảnh mở đầu được cắt theo tỉ lệ đã chọn, nên hãy để sản phẩm gần giữa ảnh.',
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
        'Quy trình gồm bốn bước: tạo bản 1:1 cho bộ ảnh sản phẩm, tải file từ Thư viện, đặt vào ô media của sản phẩm cạnh các ảnh, rồi lấy bản 9:16 hay 4:5 cho mạng xã hội ở mục "Tải theo tỉ lệ khác" trong chi tiết video ở Thư viện: miễn phí, không tạo lại video, khung mới thêm nền mờ hoặc nền đen chứ không cắt mất phần nào. Ô Cửa hàng/Thương hiệu trên form gắn clip với cửa hàng hoặc thương hiệu bạn chọn.',
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
            { tag: 'HD', title: '720p', text: 'Bảng tin mạng xã hội và nội dung cần nhanh, đủ nét cho phần lớn vị trí xem trên điện thoại. Seedance (trừ 1.0 Pro), Veo 3.1, Gemini Omni Flash, Grok Imagine và WAN xuất ở 720p.' },
            { tag: 'HD+', title: '768p', text: 'Mức mặc định của MiniMax H3 Max và H3 Max Reference, nét hơn 720p một chút. Hai họ này còn có bản 480p rẻ hơn để thử nhanh.' },
            { tag: 'Full HD', title: '1080p', text: 'Trang sản phẩm, quảng cáo trả phí và chiến dịch. Kling, FLUX 3, Seedance 1.0 Pro, Hailuo 2.3 Pro và các bản 1080p của MiniMax H3 Max xuất ở 1080p.' },
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
            'Lượt tạo không thành công? Mỗi lượt tạo được chạy lại một lần từ tab Lịch sử; lượt tạo không thành công không tốn tiền thì không tính vào hạn mức.',
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
            ['Điều khiển chuyển động', '/apps/motion-control', 'chép chuyển động từ một video chuyển động sang nhân vật trong ảnh.'],
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
            { title: 'Video tham chiếu', text: 'Dựng một video mới từ nhiều ảnh tham chiếu, như người mẫu, trang phục và bối cảnh, thay vì một khung cố định. Ở đây nhận tối đa 9 ảnh, tuỳ mô hình.' },
            { title: 'Mẫu chuyển động', text: 'Câu lệnh chuyển động công ty đã thử và giữ lại. Chọn mẫu thay cho tự viết mô tả.' },
            { title: 'Mô tả chuyển động', text: 'Câu chỉ dẫn chuyển động: chủ thể làm gì, máy quay đi ra sao, nhịp độ thế nào.' },
            { title: 'Điểm đề xuất', text: 'Điểm 0–100 của mỗi mô hình trong menu, tính từ đánh giá Đạt/Không đạt và tỉ lệ lượt tạo thành công của công ty.' },
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
            ['Cần biết dựng video mới biến được ảnh thành video không?', 'Không. Bạn tải ảnh lên, chọn mẫu hoặc viết một dòng tả chuyển động, chọn mô hình và bấm Tạo video. Không có timeline, không keyframe, không phần mềm dựng nào, và clip xong nằm trong Thư viện, sẵn để tải xuống.'],
            ['Một video tốn bao nhiêu?', 'Chi phí tuỳ mô hình và thời lượng, vì mọi mô hình tính tiền theo giây. Nút Tạo video ghi chi phí ước tính bằng USD trước khi bạn bấm và cập nhật khi bạn đổi lựa chọn. Chi phí ghi trên clip là chi phí thật từ nhà cung cấp khi có; trước đó là số ước tính.'],
            ['Có giới hạn số video không?', 'Có. Mỗi người có hạn mức số clip mỗi ngày theo giờ Việt Nam, do Admin đặt, và công ty có ngân sách video mỗi tháng. Lượt tạo làm vượt hạn mức sẽ bị từ chối kèm lý do. Lượt tạo không thành công không tốn tiền thì không tính.'],
            ['AI biến ảnh thành video được không?', 'Được. Tải bất kỳ ảnh nào, ảnh sản phẩm, ảnh người mẫu hay một kết quả trước đó, làm khung mở đầu và tả chuyển động bạn muốn. AI làm động thành một video bắt đầu đúng từ ảnh đó. Mô hình tham chiếu cũng nhận ảnh của bạn nhưng dựng một cảnh mới từ chúng thay vì làm động một khung cố định.'],
            ['Xuất được cho nền tảng và định dạng nào?', 'Mọi mô hình có 9:16 cho Reels, TikTok và Stories, đa số có thêm 1:1 cho bảng tin và ô sản phẩm, và nhiều mô hình có 16:9, 4:3 hoặc 3:4. Bạn chọn tỉ lệ trước khi chạy, vì không có gì tự đổi cỡ sau đó.'],
            ['Có lồng tiếng bằng giọng thương hiệu được không?', 'Chưa: ứng dụng không có tải giọng hay nhân bản giọng. Khi Tạo âm thanh bật, clip có tiếng gốc của mô hình; muốn giọng riêng thì tắt âm thanh, tải clip xuống và lồng tiếng hoặc ghép nhạc trong phần mềm dựng.'],
            ['Ứng dụng dùng những mô hình nào?', 'Danh mục có hơn 20 mô hình video thuộc các họ Kling, Seedance, FLUX 3, Veo, Gemini Omni Flash, Grok Imagine, Wan và MiniMax. Admin bật mô hình nào thì menu có mô hình đó, và bạn chọn trước mỗi lần chạy. Đổi mô hình cũng đổi chi phí ghi trên nút Tạo video.'],
            ['Video dài tối đa bao lâu?', 'Từ 1 đến 30 giây tuỳ mô hình. Grok Imagine 1.5 từ 1 đến 15 giây, Kling O3 Pro và 3.0 Pro từ 3 đến 15, Seedance 2.0, Wan 2.7 và MiniMax H3 Max tới 15, FLUX 3 từ 5 đến 20 và Seedance 2.5 Reference tới 30. Veo 3.1 luôn 8 giây, Hailuo 2.3 Pro luôn 6 giây.'],
            ['Nên chọn mô hình nào?', 'Kling mạnh về chuyển động chân thực và vật lý, ở 1080p. Seedance có dải thời lượng dài nhất. Veo 3.1 cho clip 8 giây trau chuốt. Grok Imagine hợp với clip dài mà tiết kiệm, FLUX 3 cho chuyển động điện ảnh tới 20 giây ở 1080p, và Hailuo 2.3 Pro là đường nhanh nhất tới clip 1080p. Khi phân vân, chọn mô hình có nhãn Đề xuất: đó là mô hình công ty chấm điểm cao nhất.'],
            ['Nút Cải thiện làm gì?', 'Khi Cải thiện bật (mặc định), AI viết lại mô tả ngắn của bạn thành một bản tả chi tiết bằng tiếng Anh trước khi chạy, và dịch nếu bạn viết tiếng Việt. Nó không nhìn thấy ảnh, nên chỉ thêm chi tiết về chuyển động, máy quay và nhịp độ, không bịa màu sắc, chữ hay logo. Tắt Cải thiện khi bạn muốn gửi đúng câu của mình.'],
            ['Tạo video chỉ từ chữ, không cần ảnh được không?', 'Chưa. Mỗi lần chạy cần ít nhất một ảnh. Nếu ảnh hiện có chưa phù hợp, hãy chỉnh nó ở trang Tạo ảnh trước rồi đưa vào đây.'],
            ['Video tham chiếu là gì?', 'Thay vì làm động một khung cố định, bạn tải lên vài ảnh tham chiếu, như người mẫu, trang phục và bối cảnh, và AI dựng một video mới có các yếu tố đó. Ở đây các bản Reference (trừ FLUX 3 Reference, chỉ nhận một ảnh), Kling O3 Pro, Kling O1, Seedance 2.0 và 2.5 nhận từ 4 đến 9 ảnh, tuỳ mô hình.'],
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
  video: 'tutorial-try-on',
  sections: [
    {
      kicker: 'So với công cụ chung',
      title: 'Vì sao dùng Thử đồ thay vì ChatGPT, Gemini hay công cụ AI tạo ảnh chung?',
      lead: 'Công cụ AI chung coi trang phục như một vật bất kỳ, nên logo dễ lệch, hoạ tiết dễ đổi và nếp vải dễ sai. Ở Thử đồ, ảnh trang phục bạn tải lên là đầu vào chính: AI mặc đúng món đó lên người mẫu thay vì tự vẽ một món na ná từ lời mô tả.',
      blocks: [
        {
          cards: [
            { title: 'Trang phục lấy từ ảnh của bạn', text: 'AI mặc chính món đồ trong ảnh lên người mẫu, giữ nguyên khuôn mặt, dáng và tư thế của người mẫu. Ảnh trang phục càng nét, sáng đều và thấy rõ logo, hoạ tiết thì kết quả càng sát; vẫn nên xem lại logo và chữ in trước khi đăng.' },
            { title: 'Bắt đầu từ thứ đã có sẵn', text: 'Tab Ví dụ liệt kê các ảnh thử đồ công ty đã làm. Chọn một ví dụ, bấm Dùng ví dụ này để lấy lại mô tả và thông số của nó vào form, rồi thêm ảnh sản phẩm của bạn. Không phải viết mô tả từ đầu.' },
            { title: 'Gương mặt riêng của thương hiệu', text: 'Tạo người mẫu AI của riêng bạn ngay trong bảng chọn người mẫu, hoặc ở ứng dụng Tạo người mẫu AI. Người mẫu lưu trong mục Người mẫu AI và dùng lại ở Thử đồ, Tạo ảnh và Tạo video, nên cả danh mục có cùng một gương mặt thay vì một người mới cho mỗi sản phẩm.' },
            { title: 'Cả bộ trang phục trong một lần', text: 'Thêm nhiều món cùng lúc, như áo, quần, giày và phụ kiện, để phối trên một người mẫu. Số món và tổng số ảnh tối đa tuỳ mô hình bạn chọn.' },
          ],
        },
        {
          table: [
            ['Bạn cần gì', 'Thử đồ', 'ChatGPT, Gemini hay công cụ AI tạo ảnh chung'],
            ['Điểm bắt đầu', 'Ảnh trang phục và ảnh người mẫu, mô tả là tuỳ chọn', 'Một ô nhập trống và một đoạn mô tả bằng chữ'],
            ['Ý tưởng', 'Ví dụ của công ty, dùng lại bằng Dùng ví dụ này rồi thay bằng sản phẩm của bạn', 'Bạn tự nghĩ ra mọi ý tưởng'],
            ['Độ chính xác của sản phẩm', 'Trang phục lấy từ ảnh bạn tải lên, người mẫu giữ nguyên', 'Chi tiết thường lệch giữa các lần tạo'],
            ['Cùng một người mẫu cho cả danh mục', 'Người mẫu AI đã lưu, dùng lại ở Thử đồ, Tạo ảnh và Tạo video', 'Mỗi lần tạo ra một gương mặt khác'],
            ['Mô hình ảnh', 'FASHN v1.6, Nano Banana, Nano Banana 2.1 và Nano Banana Pro trong một tài khoản', 'Một mô hình duy nhất của chính công cụ đó'],
          ],
        },
      ],
    },
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
            { title: 'Tải ảnh trang phục', text: 'Thêm 1 đến 5 ảnh trang phục (đến 13 ảnh với Nano Banana 2.1): ảnh trải phẳng, ảnh ma-nơ-canh ẩn hay ảnh người mặc đều được. Có thể chồng áo, quần và giày để phối cả bộ trong một lần. Tổng số ảnh của một lần chạy (người mẫu, trang phục và bối cảnh) không vượt giới hạn của mô hình: 14 với Nano Banana Pro, 2 và 2.1, 4 với Nano Banana, 2 với FASHN v1.6.', media: 'try-on-garment-1' },
            { title: 'Chọn người mẫu', text: 'Tải ảnh một người, hoặc chọn một người mẫu có sẵn hay một người mẫu AI đã lưu. Chọn người mẫu có sẵn thì bước Chọn tư thế hiện ra ngay sau đó: chọn một tư thế, hoặc Không chọn tư thế rồi tả tư thế trong ô Mô tả nếu muốn. Khi ô Người mẫu đã có ảnh, nút tư thế cạnh ảnh cho biết tư thế đang chọn: bấm để chọn hay đổi tư thế, bấm × để bỏ. Có tư thế thì người mẫu đứng theo tư thế và khung hình của nó; không chọn thì tư thế trong ảnh giữ nguyên, và nếu ảnh chụp sát hơn món đồ cần thấy, AI lùi khung để thấy thêm người thay vì phóng to đầu hay rút ngắn thân.', media: 'try-on-model-1' },
            { title: 'Chọn thông số và chạy', text: 'Chọn mô hình, độ phân giải và tỉ lệ, thêm ảnh bối cảnh hoặc mô tả nếu muốn chỉ đạo cảnh, rồi bấm Thử đồ. Nút ghi chi phí ước tính bằng USD trước khi bạn bấm, và kết quả về tab Lịch sử.', media: 'try-on-example-1' },
          ],
        },
        { loop: 'about-try-on-loop' },
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
      lead: 'Bạn có thể phối cả bộ trong một lần chạy: tối đa 5 ảnh trang phục (13 ảnh với Nano Banana 2.1), trong giới hạn ảnh của mô hình, và trộn các loại tuỳ ý.',
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
            { title: 'Chọn bối cảnh', text: 'Thêm một ảnh bối cảnh, hoặc tả địa điểm trong ô mô tả: một nhà thờ đá, một khu vườn lúc hoàng hôn, một sảnh tiệc ánh nến.' },
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
            { tag: 'Chất lượng cao nhất', title: 'Nano Banana Pro', media: 'model-nano-banana-pro', text: 'Mô hình ảnh chủ lực của Google, xuất ở 1K, 2K hoặc 4K. Giữ chất vải, đường may và hoạ tiết tốt hơn bản tiêu chuẩn. Dùng cho mọi ảnh sẽ lên trang sản phẩm, quảng cáo hay chiến dịch.', specs: ['Độ phân giải: 1K, 2K, 4K', 'Tối đa 14 ảnh mỗi lần chạy'] },
            { tag: 'Mới nhất của Google', title: 'Nano Banana 2.1', media: 'model-nano-banana-2-1', text: 'Bản cập nhật của Nano Banana 2 ở tốc độ Flash: ảnh chân thực hơn, bám prompt sát hơn, với giá thấp.', specs: ['Độ phân giải: 1K, 2K', 'Tối đa 14 ảnh mỗi lần chạy'] },
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
        'Ô bối cảnh có thể hiện vài ảnh mẫu có sẵn nếu công ty đã đưa lên. Muốn một cảnh chưa có ảnh, hãy để trống ô và tả địa điểm trong ô mô tả.',
      ],
    },
    {
      kicker: 'Chỉ đạo',
      title: 'Viết mô tả',
      blocks: [
        'Mô tả là tuỳ chọn. Bỏ trống mô tả và không thêm bối cảnh thì người mẫu mặc trang phục của bạn trong chính khung cảnh của ảnh người mẫu: ứng dụng dùng câu chỉ dẫn mặc định là mặc trang phục lên người mẫu, giữ nguyên người và bối cảnh. Viết mô tả khi bạn muốn chỉ đạo cảnh: địa điểm, ánh sáng, tư thế, phong cách chụp.',
        'Mô tả điều khiển mọi thứ quanh trang phục. Trang phục vẫn bám sát ảnh bạn tải lên, nên hãy dùng ô này để tả thế giới mà bạn muốn nó được chụp trong đó.',
        { example: { label: 'Ví dụ mô tả', text: 'Put the linen shirt from the garment photo on the model. A sunny street café in late-morning light, a relaxed half-body pose, natural photo style. Keep the shirt colour and buttons exactly as in the photo.', media: 'about-try-on-prompt' } },
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
            'Muốn bối cảnh khác? Thêm ảnh bối cảnh, hoặc tả cảnh trong ô mô tả. Không động vào cả hai thì giữ khung cảnh của ảnh người mẫu.',
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
        'Được, khi bạn hiểu một lần chạy được tính thế nào. Mỗi lần chạy cho một ảnh từ tối đa 5 ảnh trang phục (13 ảnh với Nano Banana 2.1), và AI phối chúng thành một bộ trên một người mẫu. Một lần chạy, một bộ đồ.',
        'Vì vậy phủ một danh mục là chuyện xếp hàng. Không có nhập từ bảng tính, nhưng bạn có thể gửi lượt tạo tiếp theo trong lúc lượt trước đang chạy, và mỗi kết quả hiện trong tab Lịch sử ngay khi xong.',
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
            ['Thử nhiều món cùng lúc được không?', 'Được. Thêm tối đa 5 ảnh trang phục (13 ảnh với Nano Banana 2.1) trong một lần chạy, trong giới hạn ảnh của mô hình (4 ảnh tổng cộng với Nano Banana, tính cả người mẫu và bối cảnh), và AI phối áo, quần, giày và phụ kiện thành một bộ trên một người mẫu. Tải mỗi món thành một ảnh riêng thay vì một ảnh ghép.'],
            ['Tạo ảnh thử đồ không cần buổi chụp được không?', 'Được, đó chính là mục đích của trang này. Một ảnh trang phục có sẵn, kể cả chụp bằng điện thoại, cùng một ảnh người mẫu là đủ cho một lần chạy. Không đặt studio, không tuyển người mẫu, không chỉnh ảnh.'],
            ['Có phải cài ứng dụng không?', 'Không. Ứng dụng chạy trên trình duyệt, trên máy tính lẫn điện thoại, nên không có gì để tải về hay cài đặt. Mọi kết quả nằm trong Thư viện của công ty, xem được trên bất kỳ thiết bị nào bạn đăng nhập.'],
            ['Thử đồ có đổi khuôn mặt, tóc hay tư thế của người mẫu không?', 'Khuôn mặt, tóc, màu da và dáng người giữ nguyên; tư thế tuỳ bạn. Chọn một tư thế thì người mẫu đổi sang tư thế đó, khung hình theo tư thế. Không chọn thì tư thế trong ảnh giữ nguyên; nếu ảnh chụp sát hơn món đồ cần thấy, AI lùi khung để thấy thêm người thay vì phóng to đầu hay rút ngắn thân. AI dựng lại chất vải, nếp nhăn và bóng đổ cho khớp với tư thế và ánh sáng. Bối cảnh cũng giữ nguyên trừ khi bạn chủ động đổi bằng ảnh bối cảnh hoặc prompt. Muốn thay cả người, hãy dùng ứng dụng Đổi người mẫu.'],
            ['Tạo ảnh cho nhiều sản phẩm cùng lúc được không?', 'Mỗi lần chạy cho một ảnh người mẫu từ tối đa 5 ảnh trang phục (13 ảnh với Nano Banana 2.1), được phối thành một bộ. Không có nhập từ bảng tính hay tải hàng loạt, nên phủ một danh mục là xếp hàng các lần chạy; kết quả hiện trong tab Lịch sử khi xong.'],
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
  video: 'tutorial-image',
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
            { title: 'Lấp đầy danh mục?', text: 'Mọi mã hàng đều có ảnh đời thường, kể cả những sản phẩm chưa bao giờ đáng một buổi chụp. Mỗi lần chạy cho một ảnh và bạn có thể gửi tiếp trong lúc lượt trước đang chạy, nên danh mục thành một hàng đợi bạn làm dần.' },
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
            { title: 'Tải ảnh lên', text: 'Bấm dấu cộng trên thanh bên dưới để thêm ảnh tham chiếu (tối đa 14 với Nano Banana Pro, 2 và 2.1): ảnh sản phẩm, ảnh người mẫu, thậm chí một ảnh điện thoại. Mỗi lần chạy cần ít nhất một ảnh.', media: 'about-image-step-1' },
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
      lead: 'Nút Mô hình quyết định công cụ nào tạo ảnh. Các mô hình khác nhau về độ chi tiết, tốc độ, định dạng hỗ trợ và giá mỗi lần chạy; menu chỉ hiện mô hình Admin đang bật, nên có thể ít hơn danh sách dưới đây. Nano Banana Pro, 2 và 2.1 nhận tối đa 14 ảnh tham chiếu, các mô hình còn lại tối đa 4.',
      blocks: [
        {
          cards: [
            { tag: 'Chất lượng cao nhất', title: 'Nano Banana Pro', media: 'model-nano-banana-pro', text: 'Mô hình chủ lực của Google, chọn khi ảnh sẽ được dùng lâu dài. Giữ ánh sáng và chất liệu thuyết phục hơn các mô hình khác, xuất ở 1K, 2K hoặc 4K.', specs: ['Tỉ lệ: auto, 1:1, 4:5, 5:4, 3:4, 4:3, 2:3, 3:2, 9:16, 16:9, 21:9', 'Độ phân giải: 1K, 2K, 4K'] },
            { tag: 'Mới nhất của Google', title: 'Nano Banana 2.1', media: 'model-nano-banana-2-1', text: 'Bản cập nhật của Nano Banana 2 ở cùng tốc độ Flash: ảnh chân thực hơn, chữ sắc hơn, bám mô tả sát hơn và giữ nhân vật nhất quán qua các lần chỉnh.', specs: ['Tỉ lệ: như Nano Banana Pro', 'Độ phân giải: 1K, 2K'] },
            { tag: 'Nhanh', title: 'Nano Banana 2', media: 'model-nano-banana-2', text: 'Mô hình Flash của Google, nhanh và nhiều tỉ lệ, hợp với thử nhanh ở 1K.', specs: ['Tỉ lệ: như Nano Banana Pro', 'Độ phân giải: 1K'] },
            { tag: 'Bám chỉ dẫn tốt nhất', title: 'GPT Image 2', media: 'model-gpt-image-2', text: 'Mô hình của OpenAI, đọc kỹ nhất một chỉ dẫn dài. Nếu mô tả có năm yêu cầu riêng, đây là mô hình dễ đáp ứng đủ cả năm nhất.', specs: ['Tỉ lệ: auto, 1:1, 9:16, 16:9, 3:4, 4:3', 'Độ phân giải: 1K, 2K, 4K'] },
            { tag: 'Mới nhất của OpenAI', title: 'GPT Image 2.5', media: 'model-gpt-image-2-5-flare', text: 'Bản kế nhiệm GPT Image 2, có hai biến thể. Flare là lựa chọn hằng ngày, nét hơn GPT Image 2 và nhanh hơn. Sunburst dành nhiều thời gian hơn cho mỗi ảnh để giữ chi tiết phức tạp, cho lần chỉnh khó cần kiểm soát chặt.', specs: ['Biến thể: Flare (nhanh), Sunburst (chính xác)', 'Tỉ lệ: auto, 1:1, 9:16, 16:9, 3:4, 4:3', 'Độ phân giải: 1K'] },
            { tag: 'Nhanh và rẻ', title: 'Nano Banana', media: 'model-nano-banana', text: 'Mô hình tiêu chuẩn của Google, nhanh và rẻ. Dùng để thử ý tưởng và chỉnh mô tả trước khi chạy bản cuối.', specs: ['Tỉ lệ: như Nano Banana Pro', 'Độ phân giải: cỡ cố định'] },
            { tag: 'Người và cảnh chân thực', title: 'Seedream 5.0 Pro', media: 'model-seedream-5-pro', text: 'Mô hình của ByteDance, mạnh về người và khung cảnh chân thực. Đưa ảnh tham chiếu để chỉnh hoặc phối lại một cảnh, ở 1K hoặc 2K.', specs: ['Tỉ lệ: như Nano Banana Pro', 'Độ phân giải: 1K, 2K'] },
          ],
        },
        {
          cols: 3,
          cards: [
            { tag: 'Nhanh', title: 'Seedream 5.0 Flash', text: 'Bản nhanh của Seedream 5.0, cùng một giá ở 1K và 2K. Hợp với bản nháp và loạt ảnh nhiều biến thể trước khi chạy bản cuối.', specs: ['Tỉ lệ: như Nano Banana Pro', 'Độ phân giải: 1K, 2K'] },
            { tag: 'Chỉ 2K', title: 'Seedream 4.5', text: 'Bản Seedream trước 5.0, chỉ xuất ở 2K với một giá mỗi ảnh. Nhận ảnh tham chiếu để chỉnh hoặc phối lại cảnh như các bản Seedream khác.', specs: ['Tỉ lệ: như Nano Banana Pro', 'Độ phân giải: 2K'] },
            { tag: 'Giá cố định', title: 'Seedream 4.0', text: 'Bản Seedream đời đầu, một giá cho cả 1K và 2K. Hợp khi cần nhiều ảnh thử với chi phí biết trước.', specs: ['Tỉ lệ: như Nano Banana Pro', 'Độ phân giải: 1K, 2K'] },
          ],
        },
        {
          table: [
            ['Mô hình', 'Hợp nhất với', 'Độ phân giải'],
            ['Nano Banana Pro', 'Ảnh cuối cho trang sản phẩm, quảng cáo và chiến dịch', '1K, 2K, 4K'],
            ['Nano Banana 2.1', 'Cảnh chân thực, chữ sắc nét ở tốc độ Flash', '1K, 2K'],
            ['Nano Banana 2', 'Thử nhanh với nhiều tỉ lệ', '1K'],
            ['GPT Image 2', 'Chỉ dẫn dài, chữ trên nhãn hay bao bì', '1K, 2K, 4K'],
            ['GPT Image 2.5 Flare', 'Lần chạy OpenAI hằng ngày, nét hơn GPT Image 2', '1K'],
            ['GPT Image 2.5 Sunburst', 'Chi tiết phức tạp khi lần chỉnh khó cần kiểm soát chặt', '1K'],
            ['Nano Banana', 'Bản nháp rẻ và thử mô tả', 'Cố định'],
            ['Seedream 5.0 Pro', 'Người và cảnh chân thực từ ảnh tham chiếu', '1K, 2K'],
            ['Seedream 5.0 Flash', 'Bản nháp và loạt biến thể, cùng giá ở 1K và 2K', '1K, 2K'],
            ['Seedream 4.5', 'Ảnh 2K với một giá mỗi ảnh', '2K'],
            ['Seedream 4.0', 'Ảnh thử ở 1K hoặc 2K với một giá mỗi ảnh', '1K, 2K'],
          ],
        },
        'Cách làm nhiều người chọn: thử trên Nano Banana cho tới khi bố cục đã ổn, rồi chạy lại câu mô tả đó trên Nano Banana Pro ở độ phân giải cao hơn. Nếu không muốn thử từng mô hình, Nano Banana Pro ở 2K là lựa chọn an toàn, và GPT Image 2.5 Flare khi sản phẩm có chữ.',
      ],
    },
    {
      kicker: 'Chữ trong ảnh',
      title: 'AI có tạo được ảnh sản phẩm với chữ đọc rõ không?',
      blocks: [
        'Có, và mô hình bạn chọn quyết định chữ rõ đến đâu. Chữ trên nhãn mác, logo trên ngực áo, chữ trên bao bì, giá trên thẻ treo: chữ là chi tiết các mô hình ảnh xưa nay hay làm hỏng, biến chữ thật thành thứ trông giống chữ khi nhìn xa và vỡ ra khi nhìn gần.',
        'Các mô hình GPT Image viết chữ chính xác nhất trong các mô hình ở đây, nên hãy dùng chúng khi sản phẩm có chữ mà khách sẽ đọc. Bắt đầu với GPT Image 2.5 Flare, và chuyển sang Sunburst khi nhãn hay logo cần thêm một lượt chính xác.',
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
        'Nano Banana Pro và GPT Image 2 có đủ ba cỡ; Nano Banana 2.1 và Seedream 5.0 Pro có 1K và 2K; các mô hình còn lại tạo ở một cỡ. Cần to hơn thì chạy ảnh qua ứng dụng Tăng độ phân giải.',
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
            { title: 'Ảnh tham chiếu', text: 'Ảnh bạn tải lên làm đầu vào: ảnh sản phẩm, ảnh người mẫu hay một kết quả trước đó. Tối đa 4 hoặc 14 ảnh mỗi lần chạy, tuỳ mô hình.' },
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
            ['Trang này dùng những mô hình nào?', 'Các mô hình của Google (Nano Banana Pro, Nano Banana 2.1, Nano Banana 2 và Nano Banana), của OpenAI (GPT Image 2, GPT Image 2.5 Flare và GPT Image 2.5 Sunburst) và của ByteDance (Seedream 5.0 Pro, Seedream 5.0 Flash, Seedream 4.5 và Seedream 4.0). Bạn chọn trong nút Mô hình trước mỗi lần chạy, trong số mô hình Admin đang bật, và đổi mô hình cũng đổi chi phí ghi trên nút chạy.'],
            ['Nên chọn mô hình nào?', 'Nano Banana Pro cho độ chi tiết cao nhất và tới 4K cho ảnh dùng thật. Nano Banana 2.1 cho ảnh chân thực, chữ sắc ở 1K hoặc 2K. GPT Image 2 và GPT Image 2.5 bám chỉ dẫn dài sát nhất và viết chữ chính xác nhất. Seedream 5.0 Pro mạnh về người và cảnh chân thực. Nano Banana và Seedream 5.0 Flash nhanh và rẻ cho bản nháp.'],
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
  video: 'tutorial-marketing',
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
        'Marketing Studio có bốn định dạng: UGC Thử đồ, Editorial, Mở hộp và Đánh giá sản phẩm. Đổi định dạng ở bảng chọn định dạng ngay trên đầu trang.',
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
        { loop: 'about-marketing-loop' },
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
        'Có. Tạo âm thanh bật sẵn: clip có tiếng như quay bằng điện thoại, gồm âm thanh căn phòng và vài câu phản ứng ngắn, tự nhiên của người mẫu về sản phẩm, không có nhạc nền. Với Kling O3 Pro và hai bản Seedance, tắt công tắc để có clip im lặng; Gemini Omni Flash, Grok Imagine, Wan 2.7 và MiniMax H3 Max luôn tạo tiếng nên công tắc khoá ở Bật. Muốn viết đúng từng chữ người mẫu nói, hãy dùng định dạng Editorial.',
        {
          cols: 3,
          cards: [
            { title: 'Dáng quay điện thoại thật', text: 'Ánh sáng tự nhiên, máy hơi rung tay, chất hình chân thật. Đoạn quay giống người sáng tạo nội dung thật hơn là quảng cáo bóng bẩy, vì đó là thứ hiệu quả trên bảng tin.' },
            { title: 'Đúng người, đúng sản phẩm', text: 'Chỉ dẫn cố định yêu cầu giữ khuôn mặt và dáng người theo ảnh người mẫu, cùng hình dáng, màu sắc và chi tiết theo ảnh sản phẩm.' },
            { title: 'Tiếng như quay điện thoại', text: 'Âm thanh căn phòng và lời phản ứng ngắn của người mẫu, không nhạc nền. Cần nhạc, phụ đề hay giọng thương hiệu thì chọn Kling O3 Pro hoặc Seedance, tắt âm thanh và thêm trong phần mềm dựng.' },
          ],
        },
        'Muốn lái video? Ô Mô tả (tuỳ chọn) nhận ghi chú về chi tiết sản phẩm, không khí hay một khoảnh khắc bạn muốn; ghi chú được ghép vào cuối chỉ dẫn cố định của công cụ.',
      ],
    },
    {
      kicker: 'Thị trường',
      title: 'Video UGC Thử đồ dùng cho nhiều thị trường được không?',
      blocks: [
        'Được. Lời phản ứng trong clip ngắn và tự nhiên; với thị trường dùng ngôn ngữ khác, chọn Kling O3 Pro hoặc Seedance và tắt Tạo âm thanh để có clip không lời, rồi thêm phụ đề hay lồng tiếng theo từng thị trường trong phần mềm dựng.',
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
      kicker: 'Mô hình',
      title: 'Marketing Studio dùng những mô hình nào?',
      lead: 'Có 9 mô hình, đều dựng cảnh từ nhiều ảnh tham chiếu và tự tạo tiếng. Menu Mô hình chỉ hiện các mô hình Admin đã bật, kèm chi phí ước tính và điểm đề xuất của công ty; chọn một mô hình thì tỉ lệ và thời lượng tự chuyển sang mức mô hình đó có.',
      blocks: [
        {
          table: [
            ['Mô hình', 'Độ phân giải', 'Thời lượng', 'Âm thanh'],
            ['Kling O3 Pro', '1080p', '3–15 giây', 'Bật hoặc tắt'],
            ['Seedance 2.0 Reference', '720p', '4–15 giây', 'Bật hoặc tắt'],
            ['Seedance 2.5 Reference', '720p', '4–30 giây', 'Bật hoặc tắt'],
            ['Gemini Omni Flash Reference', '720p', '3–15 giây', 'Luôn có'],
            ['Grok Imagine Reference', '720p', '1–10 giây', 'Luôn có'],
            ['Wan 2.7 Reference', '720p', '2–10 giây', 'Luôn có'],
            ['MiniMax H3 Max Reference (3 mức)', '480p, 768p hoặc 1080p', '5–15 giây', 'Luôn có'],
          ],
        },
        'MiniMax H3 Max Reference có ba bản theo độ phân giải: 480p rẻ để thử nhanh, 768p là bản chính và 1080p sắc nét hơn. Ở Kling O3 Pro, bật âm thanh làm giá cao hơn; giá trên nút Tạo video luôn đã tính nó.',
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
        'Mô hình nào cũng có 9:16 và 16:9, và mọi mô hình trừ Gemini Omni Flash Reference có thêm 1:1. Với tỉ lệ 1:1, Gemini Omni Flash Reference không chạy được; chọn mô hình này thì tỉ lệ tự chuyển về 9:16.',
      ],
    },
    {
      kicker: 'Thời lượng',
      title: 'Video nên dài bao lâu?',
      lead: 'Thời lượng đi theo mô hình đã chọn, từ 1–10 giây ở Grok Imagine Reference tới 4–30 giây ở Seedance 2.5 Reference; bảng Mô hình ở trên ghi dải của từng mô hình. Thời lượng cũng là thứ đổi chi phí, vì chi phí tính theo giây, nên hãy chọn theo việc cần làm thay vì mặc định chọn tối đa.',
      blocks: [
        {
          cols: 3,
          cards: [
            { tag: 'Một nhịp', title: '5 giây', text: 'Một cú chốt: hook xuất hiện và sản phẩm trả lời ngay. Cách rẻ nhất để thử.' },
            { tag: 'Điểm cân bằng', title: '6–8 giây', text: 'Đủ chỗ cho hook, khoảnh khắc sản phẩm và một cảnh kết. Độ dài chuẩn cho quảng cáo trên bảng tin.' },
            { tag: 'Kể chuyện', title: '9–10 giây', text: 'Thêm một hai cảnh quay, cho clip kể trọn câu chuyện hơn.' },
          ],
        },
        'Video dài hơn tốn hơn, và chi phí ước tính luôn ghi trên nút Tạo video trước khi chạy. Kling O3 Pro xuất video ở 1080p, MiniMax H3 Max Reference ở 480p, 768p hoặc 1080p, các mô hình còn lại ở 720p.',
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
            ['Tạo video', '/create', 'làm video đa dụng với các họ mô hình Kling, Seedance, Veo và nhiều họ khác.'],
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
            ['Công cụ dùng mô hình nào?', 'Marketing Studio chạy các mô hình video Admin đã bật cho nó; hiện có 9 mô hình, liệt kê ở mục Mô hình phía trên, và menu Mô hình cho bạn chọn. Muốn tự chọn trong nhiều họ mô hình hơn, hãy dùng trang Tạo video.'],
            ['AI có làm được quảng cáo UGC không?', 'Được. Công cụ biến một ảnh người mẫu và một ảnh sản phẩm thành video thử đồ ngắn kiểu UGC, sẵn cho mạng xã hội, không cần tìm người, quay hay dựng.'],
            ['Hook trong video UGC là gì?', `Hook là khoảnh khắc mở đầu gây chú ý, vài giây đầu quyết định người xem ở lại hay lướt qua. Chọn một trong ${HOOKS.length} hook có sẵn: ${hookNames}. AI mở video bằng hook đó rồi chuyển sang phần thử đồ.`],
            ['Cần gì để tạo một video UGC Thử đồ?', 'Hai ảnh: một người mẫu và một sản phẩm. Hook, bối cảnh và một ghi chú ngắn là tuỳ chọn.'],
            ['Một video UGC Thử đồ tốn bao nhiêu?', 'Chi phí tuỳ mô hình và thời lượng, vì chi phí tính theo giây. Nút Tạo video ghi chi phí ước tính bằng USD trước khi bạn chạy. Âm thanh làm giá cao hơn ở một số mô hình, và giá trên nút đã tính nó. Video dùng chung ngân sách với Tạo video: hạn mức số clip theo ngày của bạn và ngân sách video theo tháng của công ty.'],
            ['Video có giọng nói không?', 'Có, khi Tạo âm thanh bật (mặc định): người mẫu nói vài câu phản ứng ngắn, kèm âm thanh căn phòng, không nhạc nền. Với Kling O3 Pro và Seedance, tắt công tắc để có clip im lặng; bốn mô hình còn lại luôn có tiếng. Muốn viết lời thoại chính xác thì dùng định dạng Editorial.'],
            ['Kiểm soát được nội dung video không?', 'Ô Mô tả (tuỳ chọn) lái video. Nhắc chi tiết sản phẩm, không khí hay khoảnh khắc bạn muốn; ghi chú được ghép vào cuối chỉ dẫn cố định. Hook và bối cảnh cho bạn thêm hai cách kiểm soát nữa.'],
            ['Dùng cho nhiều ngôn ngữ và thị trường được không?', 'Được. Tắt Tạo âm thanh để có clip không lời, dùng được ở mọi ngôn ngữ; thêm phụ đề hay lồng tiếng theo từng thị trường khi dựng. Đổi ảnh người mẫu và bối cảnh để mỗi thị trường có gương mặt và khung cảnh của riêng mình.'],
            ['Video đặt được ở những bối cảnh nào?', `${LOCATIONS.length} bối cảnh có sẵn: ${locationNames}. Mỗi bối cảnh đặt người trong video vào một khung cảnh đáng tin với ánh sáng và không khí phù hợp, và bảng chọn có video xem trước cho từng lựa chọn.`],
            ['Có những tỉ lệ và độ dài nào?', 'Tỉ lệ và thời lượng đi theo mô hình đã chọn. Có 9:16 dọc (mặc định) cho Reels, TikTok và Stories, 1:1 và 16:9; riêng Gemini Omni Flash Reference không có 1:1. Thời lượng từ 1–10 giây ở Grok Imagine Reference tới 4–30 giây ở Seedance 2.5 Reference.'],
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
  title: 'Video marketing Editorial, giải thích rõ',
  lead: 'Mang ảnh của bạn và một bản brief sáng tạo, rồi tự chỉ đạo quảng cáo. Một hook, một bối cảnh, lời thoại chính xác và tối đa 7 ảnh tham chiếu được dựng thành một video marketing riêng. Hướng dẫn này giải thích công cụ hoạt động ra sao và cách viết brief cho tốt.',
  sections: [
    {
      kicker: 'Chọn công cụ',
      title: 'UGC Thử đồ hay Editorial?',
      lead: 'Marketing Studio có bốn định dạng trên cùng một nền tảng. UGC Thử đồ và Editorial khác nhau ở mức kiểm soát bạn muốn: chọn theo đó.',
      blocks: [
        {
          cards: [
            { title: 'UGC Thử đồ', text: 'Định dạng gọn: một ảnh người mẫu và một ảnh sản phẩm vào, một video thử đồ kiểu người sáng tạo nội dung ra. Công cụ tự chỉ đạo mọi thứ.', link: ['Mở UGC Thử đồ', '/marketing-studio'] },
            { title: 'Editorial', text: 'Ghế đạo diễn: bản brief của bạn là nguồn sự thật, bạn đưa tối đa 7 ảnh của mình, viết đúng lời nhân vật nói, và tự chọn hook và bối cảnh.' },
          ],
        },
      ],
    },
    {
      kicker: 'Từng bước',
      title: 'Video marketing Editorial hoạt động thế nào?',
      lead: 'Mỗi video bắt đầu từ ảnh và bản brief của bạn. AI biến chúng thành một clip với hook và bối cảnh bạn đã chọn.',
      blocks: [
        {
          steps: [
            { title: 'Thêm ảnh và viết brief', text: 'Tải tối đa 7 ảnh tham chiếu, là người, sản phẩm, bối cảnh hay ảnh phong cách, và tả video bạn muốn. Bản brief là nguồn sự thật: AI dựng cả quảng cáo quanh nó.', media: 'about-advanced-step-1' },
            { title: 'Thêm hook, bối cảnh và lời thoại', text: `Nếu muốn, mở đầu bằng một trong ${HOOKS.length} hook, đặt cảnh ở một trong ${LOCATIONS.length} bối cảnh, và viết đúng lời nhân vật sẽ nói.`, media: 'about-advanced-step-2' },
            { title: 'Chạy và nhận video', text: 'Chọn tỉ lệ, thời lượng và âm thanh, rồi bấm chạy, với chi phí ước tính bằng USD ghi trên nút. Video xong nằm trong tab Lịch sử và trong Thư viện.', media: 'about-advanced-step-3' },
          ],
        },
        { loop: 'about-advanced-loop' },
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
      lead: 'Tạo âm thanh bật sẵn. Ô Lời thoại (tuỳ chọn) quyết định nhân vật nói gì.',
      blocks: [
        {
          list: [
            'Lời bạn viết thành lời nói khớp khẩu hình của người trong video. Mô hình được dặn không nói thêm chữ nào ngoài lời thoại.',
            'Khoảng hai từ mỗi giây: video 10 giây nên có khoảng hai mươi từ.',
            'Không có lời thoại: chỉ có lời nói khi brief yêu cầu; còn lại là âm thanh nền hoặc nhạc.',
            'Tắt Tạo âm thanh để có video im lặng, rồi thêm giọng đọc hoặc nhạc của riêng bạn khi dựng. Chỉ Kling O3 Pro và Seedance tắt được âm thanh; Gemini Omni Flash, Grok Imagine, Wan 2.7 và MiniMax H3 Max luôn tạo tiếng nên công tắc khoá ở Bật. Ở Kling O3 Pro, âm thanh làm giá cao hơn.',
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
            ['Tạo video', '/create', 'làm video đa dụng với các họ mô hình Kling, Seedance, Veo và nhiều họ khác.'],
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
            ['Video marketing Editorial là gì?', 'Là định dạng marketing toàn quyền kiểm soát: bạn tải tối đa 7 ảnh tham chiếu của mình, viết một bản brief sáng tạo, và thêm hook, bối cảnh và lời thoại nếu muốn. AI dựng tất cả thành một video marketing riêng.'],
            ['Editorial khác UGC Thử đồ thế nào?', 'UGC Thử đồ là định dạng gọn: hai ảnh vào, một video thử đồ kiểu người sáng tạo nội dung ra, theo chỉ dẫn cố định. Editorial trao bạn ghế đạo diễn: bản brief là nguồn sự thật, bạn đưa tối đa 7 ảnh và viết lời thoại.'],
            ['Dùng được bao nhiêu ảnh tham chiếu?', 'Tối đa 7, hoặc ít hơn nếu mô hình đã chọn nhận ít ảnh hơn: Wan 2.7 Reference nhận tối đa 4. Mỗi ảnh có thể là người, sản phẩm, bối cảnh hay ảnh phong cách. AI giữ chi tiết nhìn thấy được của chúng và dựng video quanh chúng.'],
            ['Có bắt buộc chọn hook hay bối cảnh không?', 'Không, cả hai đều tuỳ chọn. Có hook, video mở bằng khoảnh khắc đó trước khi vào ý tưởng của bạn; có bối cảnh, cảnh được đặt ở đó. Không có, AI theo bản brief.'],
            ['Video có lời thoại không?', 'Có. Tạo âm thanh bật sẵn; lời bạn viết trong ô Lời thoại được đọc đúng từng chữ, khớp khẩu hình. Không viết lời thoại thì chỉ có lời nói khi brief yêu cầu. Với Kling O3 Pro và Seedance, tắt công tắc để có clip im lặng; các mô hình còn lại luôn có tiếng.'],
            ['Một video Editorial tốn bao nhiêu?', 'Chi phí tuỳ mô hình và thời lượng, vì chi phí tính theo giây. Âm thanh làm giá cao hơn ở một số mô hình. Chi phí ước tính, đã tính âm thanh, luôn ghi trên nút chạy trước khi bạn tạo, và video dùng chung ngân sách với Tạo video.'],
            ['Video có chữ hay phụ đề trên hình không?', 'Nên dặn rõ trong brief là không có chữ, logo hay watermark. Thêm phụ đề sau trong phần mềm dựng, nơi bạn kiểm soát phông chữ và vị trí.'],
            ['Video thuộc về ai?', `Video là tài sản của công ty, dùng cho trang sản phẩm, mạng xã hội và quảng cáo của công ty. ${RIGHTS}`],
            PRIVACY,
          ],
        },
      ],
    },
  ],
};

/** Marketing Studio, Mở hộp. */
const unboxing: AboutPage = {
  title: 'Mở hộp: video bóc hộp kiểu người sáng tạo nội dung',
  lead: 'Một ảnh sản phẩm vào, một video mở hộp ra. Thêm ảnh người mẫu nếu muốn thấy người mở hộp; bỏ trống thì video quay góc nhìn thứ nhất, chỉ thấy đôi tay. Chỉ dẫn mở hộp được cố định để sản phẩm luôn đúng hình dáng, màu sắc và chi tiết như ảnh.',
  sections: [
    {
      kicker: 'Từng bước',
      title: 'Video mở hộp hoạt động thế nào?',
      lead: 'Chỉ ảnh sản phẩm là bắt buộc. Hai ảnh còn lại làm video thật hơn nhưng có thể bỏ qua.',
      blocks: [
        {
          steps: [
            { title: 'Thêm ảnh', text: 'Tải ảnh sản phẩm (bắt buộc). Thêm ảnh người mẫu nếu muốn họ mở hộp trước ống kính, và ảnh hộp hoặc bao bì nếu muốn video mở đúng chiếc hộp đó.' },
            { title: 'Thêm hook, kết và ý riêng', text: `Nếu muốn, mở đầu bằng một trong ${HOOKS.length} hook, đặt cảnh ở một trong ${LOCATIONS.length} bối cảnh, hoặc điền sẵn Hook, Diễn biến và Cảnh kết từ một Khung prompt như Hộp quà, POV tay hay Mở nhanh ASMR.` },
            { title: 'Chạy và nhận video', text: 'Chọn tỉ lệ, thời lượng và âm thanh, rồi bấm Tạo video, với chi phí ước tính bằng USD ghi trên nút. Video xong nằm trong tab Lịch sử và trong Thư viện.' },
          ],
        },
      ],
    },
    {
      kicker: 'Ảnh vào',
      title: 'Ba ảnh của Mở hộp',
      blocks: [
        {
          table: [
            ['Ảnh', 'Bắt buộc', 'Vai trò trong video'],
            ['Sản phẩm', 'Có', 'Thứ được lấy ra khỏi hộp, giữ đúng hình dáng, màu sắc, hoa văn và chi tiết'],
            ['Người mẫu', 'Không', 'Người mở hộp, giữ đúng khuôn mặt, tóc và dáng người; không có ảnh này thì video là góc nhìn thứ nhất, chỉ thấy tay'],
            ['Bao bì', 'Không', 'Chiếc hộp hoặc túi bên ngoài, để video mở đúng kiểu bao bì của bạn'],
          ],
        },
        'Video luôn có các cảnh: hộp còn đóng, lúc mở, sản phẩm được nhấc ra và xoay về phía máy quay, rồi cận cảnh chi tiết. Không có chữ, logo hay watermark trên hình.',
      ],
    },
    {
      kicker: 'Âm thanh',
      title: 'Âm thanh khi mở hộp',
      lead: 'Tạo âm thanh bật sẵn.',
      blocks: [
        {
          list: [
            'Bật: tiếng giấy, băng keo và nắp hộp mở, cùng một câu phản ứng ngắn của người sáng tạo, không có nhạc nền.',
            'Tắt: video im lặng hoàn toàn, để bạn thêm giọng đọc hoặc nhạc khi dựng.',
            'Một số mô hình luôn có âm thanh; nút âm thanh sẽ nói rõ khi đó.',
          ],
        },
      ],
    },
    {
      kicker: 'Tạo tiếp',
      title: 'Làm gì với kết quả?',
      blocks: [
        {
          links: [
            ['Đánh giá sản phẩm', '/marketing-studio/review', 'cho người mẫu nói về những điểm nổi bật của sản phẩm.'],
            ['UGC Thử đồ', '/marketing-studio', 'cho người mẫu mặc hoặc cầm sản phẩm.'],
            ['Editorial', '/marketing-studio/advanced', 'khi bạn muốn tự viết brief và lời thoại với tối đa 7 ảnh.'],
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
            ['Mở hộp cần mấy ảnh?', 'Tối thiểu 1: ảnh sản phẩm. Thêm tối đa 2 ảnh nữa là người mẫu và bao bì, tuỳ mô hình đã chọn nhận bao nhiêu ảnh.'],
            ['Không có ảnh người mẫu thì sao?', 'Video quay theo góc nhìn thứ nhất: chỉ thấy đôi tay mở hộp và nhấc sản phẩm ra, không có khuôn mặt.'],
            ['Có thể tự viết cảnh không?', 'Có. Điền Hook, Diễn biến và Cảnh kết bằng chữ của bạn, hoặc bắt đầu từ một Khung prompt rồi sửa. Chỉ dẫn mở hộp cố định luôn được giữ.'],
            ['Một video mở hộp tốn bao nhiêu?', 'Chi phí tuỳ mô hình và thời lượng, vì chi phí tính theo giây. Chi phí ước tính, đã tính âm thanh, luôn ghi trên nút Tạo video.'],
            ['Video thuộc về ai?', `Video là tài sản của công ty, dùng cho trang sản phẩm, mạng xã hội và quảng cáo của công ty. ${RIGHTS}`],
            PRIVACY,
          ],
        },
      ],
    },
  ],
};

/** Marketing Studio, Đánh giá sản phẩm. */
const review: AboutPage = {
  title: 'Đánh giá sản phẩm: người mẫu nói về những điểm nổi bật',
  lead: 'Một ảnh người mẫu, một ảnh sản phẩm và từ một đến ba điểm nổi bật bạn muốn nhấn mạnh, AI dựng clip người sáng tạo nội dung cầm hoặc mặc sản phẩm và nói về đúng những điểm đó. Âm thanh bật sẵn.',
  sections: [
    {
      kicker: 'Từng bước',
      title: 'Video đánh giá hoạt động thế nào?',
      blocks: [
        {
          steps: [
            { title: 'Thêm ảnh', text: 'Tải ảnh người mẫu rồi ảnh sản phẩm. Cả hai đều bắt buộc.' },
            { title: 'Viết điểm nổi bật', text: 'Nhập từ một đến ba ý ngắn, mỗi ý tối đa 60 ký tự, ví dụ “Vải mềm, không nhăn”. Người mẫu sẽ nói về các ý này.' },
            { title: 'Thêm hook, kết hoặc lời thoại', text: `Nếu muốn, chọn một trong ${HOOKS.length} hook, một bối cảnh, một Khung prompt như Review thật, Ưu và nhược hay Mặc cả ngày, hoặc viết đúng lời nhân vật sẽ nói.` },
            { title: 'Chạy và nhận video', text: 'Chọn tỉ lệ, thời lượng và âm thanh, rồi bấm Tạo video, với chi phí ước tính bằng USD ghi trên nút.' },
          ],
        },
      ],
    },
    {
      kicker: 'Điểm nổi bật',
      title: 'Viết điểm nổi bật sao cho hiệu quả?',
      blocks: [
        {
          list: [
            'Cần ít nhất 1 điểm và tối đa 3 điểm; mỗi điểm một dòng, tối đa 60 ký tự.',
            'Mỗi điểm là một ý cụ thể, như chất liệu, độ vừa vặn hay giá, thay vì lời khen chung chung.',
            'Có thể viết tiếng Việt: lời được đưa vào prompt đúng như bạn viết.',
          ],
        },
      ],
    },
    {
      kicker: 'Lời thoại',
      title: 'Quy tắc của âm thanh và lời thoại',
      lead: 'Tạo âm thanh bật sẵn. Ô Lời thoại (tuỳ chọn) quyết định nhân vật nói gì.',
      blocks: [
        {
          list: [
            'Không có lời thoại: người mẫu nói tự nhiên, thật thà về các điểm nổi bật, như quay bằng điện thoại, không có nhạc nền.',
            'Có lời thoại: lời bạn viết được nói đúng từng chữ, khớp khẩu hình, và không có lời nào khác.',
            'Tắt Tạo âm thanh: video im lặng hoàn toàn, lời thoại không được dùng.',
            'Khoảng hai từ mỗi giây: video 10 giây nên có khoảng hai mươi từ.',
          ],
        },
      ],
    },
    {
      kicker: 'Tạo tiếp',
      title: 'Làm gì với kết quả?',
      blocks: [
        {
          links: [
            ['Mở hộp', '/marketing-studio/unboxing', 'cho video bóc hộp, có thể chỉ thấy đôi tay.'],
            ['UGC Thử đồ', '/marketing-studio', 'cho người mẫu mặc hoặc cầm sản phẩm, không có điểm nổi bật.'],
            ['Editorial', '/marketing-studio/advanced', 'khi bạn muốn tự viết brief với tối đa 7 ảnh.'],
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
            ['Đánh giá sản phẩm khác UGC Thử đồ thế nào?', 'UGC Thử đồ chỉ cho người mẫu thử sản phẩm. Đánh giá thêm các điểm nổi bật bạn chọn để người mẫu nói về chúng, và có ô Lời thoại.'],
            ['Bắt buộc phải có điểm nổi bật không?', 'Có, ít nhất 1 điểm. Nút Tạo video sẽ nói rõ khi còn thiếu.'],
            ['Một video đánh giá tốn bao nhiêu?', 'Chi phí tuỳ mô hình và thời lượng, vì chi phí tính theo giây. Chi phí ước tính, đã tính âm thanh, luôn ghi trên nút Tạo video.'],
            ['Video thuộc về ai?', `Video là tài sản của công ty, dùng cho trang sản phẩm, mạng xã hội và quảng cáo của công ty. ${RIGHTS}`],
            PRIVACY,
          ],
        },
      ],
    },
  ],
};

const analyze: AboutPage = {
  title: 'Phân tích video tham chiếu',
  video: 'tutorial-analyze',
  lead: 'Đưa vào một video tham chiếu, trang này rã nó thành danh sách cảnh: định dạng, câu mở đầu, tóm tắt và một prompt tiếng Anh cho từng cảnh. Dùng để học cách một clip đang chạy tốt được dựng, rồi tạo lại ý tưởng đó cho sản phẩm của bạn chỉ bằng một cú bấm.',
  sections: [
    {
      kicker: 'Vì sao quan trọng',
      title: 'Vì sao nên phân tích một video tham chiếu?',
      lead: 'Một clip đối thủ hay một mẫu bạn thích chứa sẵn công thức: mở đầu thế nào, cắt cảnh ra sao, mỗi cảnh làm gì. Phân tích rút công thức đó ra thành chữ để bạn tái dùng, thay vì xem đi xem lại và đoán.',
      blocks: [
        {
          cards: [
            { title: 'Rã thành từng cảnh', text: 'Mỗi cảnh có mốc thời gian, vai trò (mở đầu, chi tiết, kết) và một prompt mô tả chuyển động. Bạn thấy rõ clip được dựng ra sao, không phải tua lại.' },
            { title: 'Hiển thị tiếng Việt, prompt tiếng Anh', text: 'Phần đọc hiểu là tiếng Việt cho nhanh; prompt gửi sang Tạo video vẫn là tiếng Anh vì mô hình chạy ổn định hơn với tiếng Anh.' },
            { title: 'Một bấm sang Tạo video', text: 'Mỗi cảnh có nút "Dùng prompt này" nạp thẳng prompt đó vào trang Tạo video, để bạn dựng lại ý tưởng cho ảnh sản phẩm của mình.' },
            { title: 'Video của bạn, trên máy công ty', text: 'Phân tích chạy trên máy chủ của công ty bằng khoá nhà cung cấp của công ty; chi phí ghi lại, không tính phí người dùng.' },
          ],
        },
      ],
    },
    {
      kicker: 'Từng bước',
      title: 'Phân tích hoạt động thế nào?',
      lead: 'Chọn một video của bạn (tải lên hoặc lấy từ Lịch sử), chờ máy chủ rã cảnh, rồi đọc kết quả và đẩy một cảnh sang Tạo video.',
      blocks: [
        {
          steps: [
            { title: 'Chọn video tham chiếu', text: 'Tải lên một clip MP4 hoặc MOV, hoặc chọn một video từ Lịch sử của bạn. Video tải thẳng lên kho nên không còn vướng trần dung lượng như trước.' },
            { title: 'Chờ rã cảnh', text: 'Máy chủ chạy công cụ phân tích trên clip: tách cảnh, đọc hiểu từng cảnh và viết prompt. Việc này mất một lát; lượt phân tích nằm trong tab Lịch sử tới khi xong.' },
            { title: 'Đọc và tái dùng', text: 'Xem định dạng, câu mở đầu và prompt từng cảnh bằng tiếng Việt. Bấm "Dùng prompt này" ở một cảnh để mở Tạo video với prompt tiếng Anh đã điền sẵn.' },
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
            ['Phân tích có tạo ra video không?', 'Không. Phân tích chỉ đọc một video có sẵn và mô tả cách nó được dựng — danh sách cảnh, định dạng, câu mở đầu và một prompt cho mỗi cảnh. Để ra video, bạn mang một prompt sang trang Tạo video. Hãy xem đây là bước nghiên cứu: hiểu một clip hiệu quả rồi dựng lại ý tưởng đó cho sản phẩm của bạn thay vì bắt đầu từ trang trắng.'],
            ['Dùng được video nào làm video tham chiếu?', 'Một clip MP4 hoặc MOV của bạn: tải lên, hoặc chọn một video từ Lịch sử của bạn. Video tải thẳng lên kho nên không còn vướng trần dung lượng nhỏ như trước. Chỉ phân tích được video của chính bạn trong ứng dụng.'],
            ['Vì sao hiển thị tiếng Việt nhưng prompt lại tiếng Anh?', 'Phần đọc hiểu — định dạng, câu mở đầu, tóm tắt và mô tả từng cảnh — được dịch sang tiếng Việt cho nhanh. Prompt gửi sang trang Tạo video vẫn giữ tiếng Anh vì các mô hình chạy ổn định hơn với tiếng Anh.'],
            ['Phân tích mất bao lâu và tốn bao nhiêu?', 'Mỗi lần mất một lát vì máy chủ rã cảnh và đọc hiểu từng cảnh; lượt phân tích nằm trong tab Lịch sử cho tới khi xong. Chi phí được ghi lại cho công ty theo dõi, không tính phí người dùng.'],
            ['Kết quả phân tích có luôn đúng không?', 'Đây là bản đọc hiểu tự động, dùng để tham khảo nhanh chứ không phải mô tả tuyệt đối. Định dạng, câu mở đầu và prompt từng cảnh giúp bạn nắm cách clip được dựng; cứ chỉnh lại prompt khi mang sang Tạo video cho hợp sản phẩm của bạn.'],
          ],
        },
      ],
    },
  ],
};

/** The long About tabs of the tools; `advanced` is for the Advanced marketing page. */
export const ABOUT = { create, tryOn, image, marketing, advanced, unboxing, review, analyze } satisfies Record<AboutKey, AboutPage>;
