// The About tab of each built app, as data for components/About.tsx; split from about-content.ts (the tools' About pages) so an app page
// loads only the apps' copy. Media fields name samples in the bucket, as in about-content.ts.
import { MAX_MODELS, MAX_PICTURES } from './apps';
import type { AboutPage } from './about-specs';

const APP_COST = 'Mỗi lần chạy tính vào ngân sách ảnh và ứng dụng, tách khỏi ngân sách video; nút Chạy ghi chi phí ước tính bằng USD trước khi bạn bấm.';
const SWAP_TABLE = [
  ['Ứng dụng', 'Thứ thay đổi', 'Thứ giữ nguyên', 'Hợp nhất với'],
  ['Đổi nhân vật', 'Khuôn mặt, dáng người và trang phục', 'Bối cảnh của ảnh đích', 'Thay cả người, kể cả bộ đồ'],
  ['Đổi khuôn mặt', 'Chỉ khuôn mặt', 'Dáng người, trang phục và bối cảnh', 'Đổi người xuất hiện mà giữ nguyên cách phối'],
  ['Đổi người mẫu', 'Khuôn mặt, màu da và dáng người', 'Trang phục, tư thế và bối cảnh', 'Cho cùng bộ đồ lên một người khác'],
];

/** The About tab of each built app, by slug. */
export const APP_ABOUT: Record<string, AboutPage> = {
  'media-optimizer': {
    title: 'Nén, đổi cỡ và đổi định dạng ảnh ngay trên thiết bị',
    sections: [
      {
        title: 'Tối ưu media là gì?',
        blocks: [
          'Tối ưu media là công cụ nén ảnh, đổi kích thước và chuyển định dạng trong một lần chạy. Bạn đưa vào một ảnh, gõ chiều rộng và chiều cao mới nếu cần, chọn PNG, JPG hoặc WEBP, rồi bấm Chạy để nhận một tệp mới, nhẹ hơn. Nút Ảnh listing Etsy/Shopify làm cùng lúc tới 50 ảnh vuông cho trang bán hàng.',
          'Công cụ miễn phí và chạy hoàn toàn trong trình duyệt của bạn: ảnh không được tải lên máy chủ, không dùng mô hình AI và không tính vào ngân sách nào. Hiện chỉ hỗ trợ ảnh; chưa hỗ trợ video MP4 hoặc WEBM.',
        ],
      },
      {
        title: 'Cách dùng công cụ nén ảnh',
        lead: 'Thêm ảnh, đặt kích thước nếu cần, chọn định dạng, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Thêm ảnh', text: 'Bấm vào ô Ảnh hoặc kéo thả một ảnh PNG, JPG hay WEBP, tối đa 20 MB. Kích thước gốc được điền sẵn vào hai ô Kích thước.' },
              { title: 'Đặt kích thước (tuỳ chọn)', text: 'Gõ chiều rộng hoặc chiều cao mới, tối đa 8000 px mỗi chiều. Khi Giữ tỷ lệ đang bật, ô còn lại tự đổi theo để ảnh không bị méo.' },
              { title: 'Chọn định dạng', text: 'Chọn WEBP, JPG hoặc PNG ở mục Định dạng. WEBP là lựa chọn mặc định vì thường cho tệp nhỏ nhất.' },
              { title: 'Chạy', text: 'Bấm Chạy. Ảnh mới xuất hiện trong tab Lịch sử, kèm dung lượng trước và sau, để bạn xem rồi tải xuống.' },
            ],
          },
        ],
      },
      {
        title: 'Ảnh listing cho Etsy và Shopify',
        lead: 'Một lần chạy đổi tới 50 ảnh thành ảnh vuông 2048 × 2048 px cho trang bán hàng.',
        blocks: [
          'Bấm nút Ảnh listing Etsy/Shopify trên form. Mỗi ảnh thành một ảnh JPG vuông 2048 × 2048 px: giữ trọn ảnh, thêm nền trắng xung quanh và tô trắng vùng trong suốt, vì Etsy hiện ảnh PNG trong suốt trên nền đen. Kích thước và định dạng đã cố định, nên hai ô Kích thước và mục Định dạng tắt trong lúc nút này bật.',
          'Thêm tối đa 50 ảnh PNG, JPG hoặc WEBP, mỗi ảnh tối đa 20 MB, rồi bấm Chạy. Các ảnh được làm lần lượt ngay trong trình duyệt và gom vào một tệp .zip trong tab Lịch sử; một ảnh thì tải về một tệp JPG như thường. Tắt nút để quay lại một ảnh mỗi lần chạy.',
        ],
      },
      {
        title: 'Định dạng và giới hạn',
        lead: 'Công cụ nhận ảnh PNG, JPG và WEBP, tối đa 20 MB, 8000 px mỗi chiều và 16 triệu điểm ảnh.',
        blocks: [
          {
            table: [
              ['Mục', 'Chi tiết'],
              ['Định dạng ảnh vào và ra', 'PNG, JPG, WEBP'],
              ['Video', 'Chưa hỗ trợ MP4, WEBM'],
              ['Dung lượng tệp tối đa', '20 MB'],
              ['Kích thước tối đa', '8000 px mỗi chiều, tối đa 16 triệu điểm ảnh (ví dụ 4000 × 4000 px)'],
              ['Chất lượng JPG và WEBP', '82%'],
              ['Ảnh động', 'Chỉ xuất một khung hình'],
              ['Giữ tỷ lệ', 'Bật mặc định; tắt để đặt riêng chiều rộng và chiều cao'],
              ['Chi phí', 'Miễn phí'],
              ['Nơi xử lý', 'Trong trình duyệt của bạn, không tải ảnh lên máy chủ'],
              ['Ảnh listing Etsy/Shopify', 'JPG vuông 2048 × 2048 px, tối đa 50 ảnh một lần, tải về một tệp .zip'],
              ['Lưu kết quả', 'Chỉ trong phiên này (tab Lịch sử), không lưu vào Thư viện'],
            ],
          },
          'Ảnh vào và ảnh ra đều là ảnh: mỗi lần chạy cho một tệp ảnh mới, hoặc một tệp .zip khi chạy nhiều ảnh listing. Tệp gốc của bạn không bị thay đổi.',
        ],
      },
      {
        title: 'Nên chọn định dạng nào?',
        lead: 'Chọn định dạng theo nơi tệp sẽ được dùng: WEBP cho trang web, JPG cho ảnh chụp, PNG khi cần nền trong suốt.',
        blocks: [
          {
            cards: [
              { title: 'WEBP cho website và trang tải nhanh', text: 'WEBP thường nhỏ hơn JPG hoặc PNG ở chất lượng nhìn tương đương, nên trang tải nhanh hơn. Đổi ảnh sản phẩm và ảnh bài viết sang WEBP là cách giảm dung lượng nhanh nhất cho trang của bạn. WEBP vẫn giữ được vùng trong suốt.' },
              { title: 'JPG cho ảnh chụp', text: 'JPG được hầu hết sàn thương mại điện tử, email và mạng xã hội chấp nhận. JPG không có nền trong suốt: công cụ tô vùng trong suốt bằng màu trắng. Đổi PNG sang JPG giúp thu nhỏ ảnh chụp không cần nền trong suốt.' },
              { title: 'PNG khi cần nền trong suốt', text: 'PNG giữ nguyên vùng trong suốt, hợp với logo, ảnh tách nền và đồ hoạ đặt lên nền màu. PNG không nén mất chất lượng nên tệp có thể lớn hơn bản gốc, nhất là với ảnh chụp.', link: ['Tách nền bằng Xoá nền', '/apps/background-remover'] },
            ],
            cols: 3,
          },
        ],
      },
      {
        title: 'Vì sao nên nén ảnh?',
        lead: 'Tệp nhỏ hơn tải nhanh hơn, qua được giới hạn tải lên và tốn ít chỗ lưu hơn.',
        blocks: [
          {
            cards: [
              { title: 'Tốc độ trang', text: 'Ảnh nặng là nguyên nhân phổ biến khiến trang tải chậm, và tốc độ ảnh hưởng cả người mua lẫn thứ hạng tìm kiếm. Nén ảnh giúp trang sản phẩm và trang đích nhẹ hơn.' },
              { title: 'Giới hạn của sàn bán hàng', text: 'Sàn thương mại điện tử và nền tảng cửa hàng thường giới hạn dung lượng và kích thước ảnh. Nén và đổi cỡ trước khi tải lên giúp tránh bị từ chối tệp.' },
              { title: 'Quảng cáo và email', text: 'Thư điện tử và nền tảng quảng cáo cũng giới hạn dung lượng tệp đính kèm hay ảnh tải lên. Nén trước khi gửi để không phải làm lại.' },
              { title: 'Dung lượng lưu trữ', text: 'Ảnh nhỏ hơn tốn ít chỗ trong ổ đĩa và thư mục chia sẻ, đồng thời gửi cho đồng nghiệp nhanh hơn.' },
            ],
          },
        ],
      },
      {
        title: 'Đổi kích thước không làm méo ảnh',
        lead: 'Giữ tỷ lệ bật là cách đổi kích thước an toàn: đổi chiều rộng thì chiều cao tự đổi theo, và ngược lại.',
        blocks: [
          'Giữ tỷ lệ được bật mặc định nên tỷ lệ khung hình của ảnh được khoá khi bạn đổi kích thước. Chỉ tắt khi cần đúng một cặp chiều rộng và chiều cao không cùng hình dạng với ảnh gốc, và chấp nhận nội dung bị kéo giãn hoặc bóp méo.',
          'Đổi kích thước chỉ đổi cỡ tệp, không thêm chi tiết cho ảnh. Phóng to ở đây chỉ kéo giãn điểm ảnh có sẵn; nếu cần ảnh lớn hơn và nét hơn, hoặc đổi tỷ lệ khung hình bằng cách thêm nội dung thay vì kéo giãn, hãy dùng các ứng dụng sau.',
          {
            links: [
              ['Tăng độ phân giải', '/apps/image-upscale', 'làm ảnh lớn hơn và nét hơn bằng AI (có chi phí ước tính trên nút Chạy).'],
              ['Đổi khung hình', '/apps/reframe', 'đổi tỷ lệ khung hình bằng cách mở rộng ảnh thay vì kéo giãn.'],
              ['Xoá nền', '/apps/background-remover', 'tách nền ảnh; hãy giữ kết quả ở PNG để vùng trong suốt không bị mất.'],
            ],
          },
          'Thêm một ảnh vào ô Ảnh ở trên để nén, đổi cỡ và chuyển định dạng ngay.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Làm sao giảm dung lượng ảnh mà không mất nhiều chất lượng?', 'Thêm ảnh, giữ nguyên kích thước hoặc gõ kích thước nhỏ hơn, chọn WEBP rồi bấm Chạy. WEBP và JPG dùng chất lượng 82%, đủ nét cho hầu hết ảnh dùng trên web. Xem dung lượng trước và sau trong tab Lịch sử.'],
              ['Ảnh của tôi có bị tải lên máy chủ không?', 'Không. Ảnh được đọc và xử lý ngay trong trình duyệt của bạn; không có gì được gửi đi. Nên công cụ vẫn dùng được với ảnh nội bộ.'],
              ['Công cụ có tốn tiền không?', 'Không. Công cụ miễn phí, không dùng mô hình AI và không tính vào ngân sách ảnh hay ứng dụng.'],
              ['Có nén được video không?', 'Chưa. Hiện chỉ nhận ảnh PNG, JPG và WEBP. Hỗ trợ video MP4 và WEBM chưa có.'],
              ['Kết quả được lưu ở đâu?', 'Chỉ trong tab Lịch sử của phiên này, tối đa 20 kết quả gần nhất. Kết quả không có trong Thư viện, và mất khi bạn tải lại hoặc rời trang, nên hãy tải xuống ngay.'],
              ['Có đổi được WEBP sang PNG hoặc PNG sang WEBP không?', 'Có. Thêm ảnh rồi chọn định dạng muốn nhận: PNG, JPG hoặc WEBP. Việc chuyển định dạng chạy cùng lần với nén và đổi cỡ. Nếu trình duyệt không hỗ trợ ghi định dạng đã chọn, công cụ báo lỗi và bạn hãy chọn định dạng khác.'],
              ['Tệp ra có thể lớn hơn tệp gốc không?', 'Có thể, nhất là khi gốc đã được nén kỹ hoặc khi bạn chọn PNG cho ảnh chụp. Công cụ cho biết tệp mới nhẹ hơn hay nặng hơn bao nhiêu phần trăm để bạn chọn lại định dạng hoặc kích thước.'],
              ['Có bị méo ảnh khi đổi kích thước không?', 'Không, khi Giữ tỷ lệ còn bật: đổi chiều rộng thì chiều cao tự đổi theo. Ảnh chỉ bị kéo giãn nếu bạn tự tắt Giữ tỷ lệ.'],
              ['Ảnh động (PNG hoặc WEBP động) thì sao?', 'Công cụ chỉ xuất một khung hình của ảnh động.'],
              ['Ảnh có thông tin chụp (EXIF) thì sao?', 'Ảnh được vẽ lại và mã hoá lại trong trình duyệt, nên tệp mới không mang theo thông tin EXIF của tệp gốc.'],
            ],
          },
        ],
      },
    ],
  },
  'character-swap': {
    title: 'Đổi nhân vật chỉ với một lần chạy',
    sections: [
      {
        title: 'Đổi nhân vật bằng AI là gì?',
        blocks: [
          'Đổi nhân vật là ứng dụng thay toàn bộ người trong một ảnh bằng một người khác. Bạn tải ảnh Nhân vật mới và Ảnh cần thay người, và AI chuyển khuôn mặt, dáng người và trang phục của người mới vào ảnh đích trong khi bối cảnh giữ nguyên.',
          `Ứng dụng làm cho ảnh thời trang và marketing, khi người cần đổi mà cảnh thì không. Một lần bấm Chạy là bắt đầu đổi. ${APP_COST}`,
        ],
      },
      {
        title: 'Đổi nhân vật trong 3 bước',
        lead: 'Tải nhân vật mới, tải ảnh cần thay người, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải nhân vật mới', text: 'Thêm ảnh người sẽ xuất hiện trong kết quả vào ô Nhân vật mới. Khuôn mặt, dáng người và trang phục trong kết quả đều lấy từ ảnh này.' },
              { title: 'Tải ảnh cần thay người', text: 'Thêm ảnh có người cần thay vào ô Ảnh cần thay người. Kết quả giữ bối cảnh của ảnh này. Muốn dặn thêm thì viết một câu vào ô Mô tả (tuỳ chọn).' },
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
              { title: 'Toàn thân hay nửa người', text: 'Trang phục trong kết quả lấy từ ảnh nhân vật mới, nên ảnh đó phải thấy bộ đồ bạn muốn. Ảnh cần thay người toàn thân đi với nhân vật toàn thân; ảnh đích nửa người đi với nhân vật nửa người hoặc toàn thân. Ảnh chân dung không cho thấy trang phục cần chuyển sang.' },
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
          'Đổi người mẫu là ứng dụng thay người trong một ảnh thời trang bằng một người mẫu mới trong khi bộ đồ giữ nguyên. Bạn tải ảnh Người mẫu mới và Ảnh cần thay người mẫu; AI đổi khuôn mặt, màu da và dáng người, còn trang phục, phụ kiện, tư thế và bối cảnh giữ đúng như cũ.',
          `Ứng dụng làm cho thời trang: một buổi chụp sản phẩm dùng lại được với nhiều người mẫu khác nhau. ${APP_COST}`,
        ],
      },
      {
        title: 'Đổi người mẫu trong ảnh thời trang trong 3 bước',
        lead: 'Tải người mẫu mới, tải ảnh cần thay người mẫu, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải người mẫu mới', text: 'Thêm ảnh người có khuôn mặt, màu da và dáng người sẽ xuất hiện trong kết quả vào ô Người mẫu mới.' },
              { title: 'Tải ảnh cần thay người mẫu', text: 'Thêm ảnh sản phẩm có người mẫu cần thay vào ô Ảnh cần thay người mẫu. Kết quả giữ trang phục, phụ kiện, tư thế và bối cảnh của ảnh này. Muốn dặn thêm thì viết một câu vào ô Mô tả (tuỳ chọn).' },
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
              { title: 'Ảnh cần thay người mẫu độ phân giải cao', text: 'Ảnh cần thay người mẫu mang trang phục, phụ kiện và bối cảnh vào kết quả, nên file nét, độ phân giải cao giữ được chất vải và chi tiết. Dù là ảnh studio hay ảnh chiến dịch có sẵn, hãy dùng file lớn nhất bạn có.' },
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
        title: 'Vì sao dùng Thử trang sức thay vì ChatGPT, Gemini hay công cụ AI tạo ảnh chung?',
        lead: 'Công cụ AI chung vẽ lại một chiếc nhẫn hay dây chuyền mỗi lần bạn yêu cầu, nên đá, ổ chấu và màu kim loại dễ lệch. Thử trang sức lấy món đồ từ chính ảnh sản phẩm của bạn rồi đặt nó lên người trong ảnh.',
        blocks: [
          {
            cards: [
              { title: 'Đúng món của bạn', text: 'Thiết kế, màu kim loại và đá lấy từ ảnh sản phẩm; phản chiếu và bóng đổ được khớp với ánh sáng của ảnh người đeo.' },
              { title: 'Đặt đúng chỗ đeo', text: 'AI nhận ra hoa tai, dây chuyền, nhẫn, vòng tay, đồng hồ hay ghim cài áo và đặt mỗi loại vào đúng chỗ đeo.' },
              { title: 'Nhiều món trong một lần', text: 'Thêm nhiều món trang sức vào ô Trang sức để đeo cùng lúc lên một người.' },
              { title: 'Bắt đầu từ thứ đã có sẵn', text: 'Ở ô Người đeo, chọn một ảnh người đeo có sẵn nếu công ty đã đưa lên, hoặc mở tab Ví dụ và bấm Dùng ví dụ này. Không cần viết mô tả.' },
            ],
          },
          {
            table: [
              ['Bạn cần gì', 'Thử trang sức', 'ChatGPT, Gemini hay công cụ AI tạo ảnh chung'],
              ['Điểm bắt đầu', 'Ảnh món trang sức và ảnh người đeo, hoặc một mẫu có sẵn', 'Một đoạn mô tả món trang sức bằng chữ'],
              ['Ý tưởng', 'Ví dụ của công ty, dùng lại bằng Dùng ví dụ này rồi thay bằng món của bạn', 'Bạn tự nghĩ ra mọi ý tưởng'],
              ['Độ chính xác của sản phẩm', 'Giữ thiết kế, màu kim loại và đá từ ảnh sản phẩm', 'Đá và ổ chấu thường bị vẽ lại'],
              ['Vị trí đeo', 'AI nhận loại trang sức và đặt đúng chỗ đeo', 'Phụ thuộc cách bạn viết mô tả'],
            ],
          },
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
  'lingerie-try-on': {
    title: 'Thử đồ lót bằng AI',
    sections: [
      {
        title: 'Thử đồ lót bằng AI là gì?',
        blocks: [
          'Thử đồ lót là ứng dụng mặc đồ lót trong ảnh sản phẩm lên người mẫu trong một ảnh khác và trả về ảnh người mẫu đang mặc nó. Bạn tải ảnh đồ lót, chọn hoặc tải ảnh người mẫu rồi bấm Chạy. Khuôn mặt, dáng, màu da và bối cảnh giữ nguyên; chỉ bộ đồ lót được thay vào.',
          `Ứng dụng giúp đội bán hàng online có ảnh đồ lót trên người mẫu từ ảnh sản phẩm chụp một lần, không cần buổi chụp riêng. ${APP_COST}`,
        ],
      },
      {
        title: 'Vì sao dùng Thử đồ lót thay vì ChatGPT, Gemini hay công cụ AI tạo ảnh chung?',
        lead: 'Đồ lót là nhóm khó nhất với công cụ AI chung: ren dễ thành hoạ tiết phẳng, dây và khoá dễ xê dịch. Thử đồ lót mặc chính bộ đồ trong ảnh sản phẩm của bạn lên người mẫu và giữ chất liệu, màu sắc và chi tiết của nó.',
        blocks: [
          {
            cards: [
              { title: 'Cấu tạo được giữ nguyên', text: 'Ren, lưới, satin, dây, đường may và màu sắc lấy theo ảnh sản phẩm.' },
              { title: 'Cả bộ trong một ảnh', text: 'Thêm nhiều món của cùng một bộ, như áo ngực và quần, để người mẫu mặc cả bộ trong một lần chạy.' },
              { title: 'Người mẫu có sẵn hoặc của bạn', text: 'Chọn một người mẫu có sẵn ở ô Người mẫu, hoặc tải ảnh người mẫu của bạn lên. Chạy cùng một bộ trên nhiều người mẫu để so sánh.' },
              { title: 'Bắt đầu từ thứ đã có sẵn', text: 'Mở tab Ví dụ, bấm Dùng ví dụ này để lấy lại mô tả và thông số của ví dụ, rồi thêm đồ lót của bạn. Mô tả là tuỳ chọn.' },
            ],
          },
          {
            table: [
              ['Bạn cần gì', 'Thử đồ lót', 'ChatGPT, Gemini hay công cụ AI tạo ảnh chung'],
              ['Điểm bắt đầu', 'Ảnh đồ lót chụp trên nền trơn và một người mẫu', 'Một đoạn mô tả bằng chữ'],
              ['Ý tưởng', 'Ví dụ của công ty, dùng lại bằng Dùng ví dụ này rồi thay bằng sản phẩm của bạn', 'Bạn tự nghĩ ra mọi ý tưởng'],
              ['Ren, lưới và satin', 'Giữ như trong ảnh sản phẩm', 'Thường bị đơn giản hoá hoặc vẽ lại'],
              ['Người mẫu', 'Người mẫu có sẵn hoặc ảnh người mẫu của bạn', 'Người nào mà lời mô tả tạo ra'],
            ],
          },
        ],
      },
      {
        title: 'Thử đồ lót trong 3 bước',
        lead: 'Tải đồ lót, chọn người mẫu, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải đồ lót', text: 'Thêm một hoặc nhiều ảnh đồ lót vào ô Đồ lót, ví dụ áo ngực và quần của cùng một bộ. Ảnh chụp rõ trên nền trơn giúp AI đọc đúng từng món.' },
              { title: 'Chọn người mẫu', text: 'Chọn một người mẫu có sẵn ở ô Người mẫu, hoặc tải ảnh người mẫu của bạn lên, chụp từ đầu tới đùi hoặc toàn thân để người trong ảnh giữ đúng tỉ lệ. Có thể thêm mô tả ngắn và chọn tỉ lệ, độ phân giải.' },
              { title: 'Chạy', text: 'Bấm Chạy. AI mặc bộ đồ lót lên người mẫu, giữ chất liệu và màu sắc; ảnh mới nằm trong tab Lịch sử.' },
            ],
          },
        ],
      },
      {
        title: 'Thử được những gì?',
        lead: 'Áo ngực, bralette, bodysuit, set, babydoll, corset, đồ ngủ và đồ mặc nhà.',
        blocks: [
          {
            cols: 3,
            cards: [
              { title: 'Áo ngực và bralette', text: 'Giữ nguyên dáng cup, dây và khoá của ảnh sản phẩm.' },
              { title: 'Bodysuit và corset', text: 'Giữ đường cắt, đường may và các chi tiết tạo form.' },
              { title: 'Set nhiều món', text: 'Thêm áo và quần của cùng một bộ để người mẫu mặc cả bộ trong một ảnh.' },
              { title: 'Babydoll và đồ ngủ', text: 'Giữ độ rủ của vải và các chi tiết bèo, nơ.' },
              { title: 'Đồ mặc nhà', text: 'Áo và quần mặc nhà được mặc lên người mẫu với đúng màu và hoạ tiết.' },
              { title: 'Ren, lưới và satin', text: 'Hoạ tiết ren, độ trong của lưới và độ bóng của satin được giữ như trong ảnh sản phẩm.' },
            ],
          },
        ],
      },
      {
        title: 'Mẹo để ảnh thật hơn',
        blocks: [
          {
            cards: [
              { title: 'Nền trơn', text: 'Chụp từng món trên nền trơn, đủ sáng và thẳng góc để AI đọc rõ chất liệu.' },
              { title: 'Người mẫu đứng thẳng', text: 'Ảnh người mẫu rõ thân người, không bị che bởi tay hay đồ vật, cho kết quả vừa vặn hơn.' },
              { title: 'Độ phân giải cao', text: 'Chọn 2K khi cần giữ rõ hoạ tiết ren và đường may.' },
            ],
          },
        ],
      },
      {
        title: 'Giới hạn',
        blocks: [
          'Đây là ảnh xem trước, không phải công cụ đo cỡ: kết quả cho thấy bộ đồ trông thế nào trên người mẫu, không cho biết cỡ cần mua. Hoạ tiết ren rất mảnh có thể mờ đi, nhất là ở 1K. Chỉ dùng ảnh sản phẩm công ty có quyền, và ảnh người khi người đó đã đồng ý.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Thử đồ lót bằng AI hoạt động thế nào?', 'AI đọc ảnh đồ lót và mặc nó lên người mẫu trong ảnh còn lại. Nó giữ chất liệu, màu sắc và chi tiết của sản phẩm; khuôn mặt, dáng, màu da và bối cảnh giữ nguyên.'],
              ['Có thể thêm yêu cầu riêng không?', 'Có. Phần mô tả tuỳ chọn được thêm vào hướng dẫn cố định của ứng dụng, ví dụ màu hoặc cách mặc.'],
              ['Một lần chạy tốn bao nhiêu?', `${APP_COST} Chi phí thật nằm trên ảnh trong Thư viện.`],
            ],
          },
        ],
      },
    ],
  },
  'multi-angle': {
    title: 'Ảnh nhiều góc từ một ảnh sản phẩm',
    sections: [
      {
        title: 'Ảnh nhiều góc là gì?',
        blocks: [
          'Ảnh nhiều góc xoay sản phẩm hoặc người mẫu trong một ảnh mặt trước sang các góc khác: mặt sau, bên trái, bên phải, góc 3/4, sau chéo và nhìn từ trên. Mỗi góc là một ảnh riêng.',
          'Nút Vòng xoay 360° chọn sẵn 7 góc ngang; khi cả 7 ảnh xong, app tự ghép ảnh gốc và 7 góc thành một video xoay 360° (MP4, miễn phí) ngay dưới các ảnh trong tab Lịch sử.',
          `Dùng các ảnh này làm ảnh tham chiếu ở Tạo video hay Marketing Studio: mô hình video thấy sản phẩm từ nhiều phía nên giữ hình in quanh sản phẩm tốt hơn. ${APP_COST}`,
        ],
      },
      {
        title: 'Tạo ảnh nhiều góc trong 3 bước',
        lead: 'Tải ảnh sản phẩm, chọn góc, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải ảnh sản phẩm', text: 'Thêm một ảnh mặt trước rõ nét của sản phẩm, tốt nhất trên nền trơn.' },
              { title: 'Chọn góc', text: 'Mặc định là mặt sau và hai bên. Mỗi góc tạo một ảnh riêng và tính tiền riêng; tổng tiền hiện trước khi chạy.' },
              { title: 'Chạy', text: 'Bấm Chạy. Mỗi góc là một lượt trong tab Lịch sử, dùng lại hay tải về như ảnh thường.' },
            ],
          },
        ],
      },
      {
        title: 'Giới hạn',
        blocks: [
          'AI chỉ thấy mặt trước, nên mặt sau và hai bên là phần nó đoán từ kiểu dáng sản phẩm. Hình in phủ toàn thân ở mặt sau không thể đoán đúng: nếu có ảnh thật hay mockup mặt sau, hãy dùng ảnh đó và chỉ tạo các góc còn lại.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Mỗi góc tốn bao nhiêu?', `${APP_COST} Mỗi góc là một ảnh nên tổng tiền bằng giá một ảnh nhân số góc đã chọn.`],
              ['Dùng ảnh nào để có kết quả tốt?', 'Một ảnh mặt trước rõ nét, thấy trọn sản phẩm, không bị tay hay đồ vật che.'],
            ],
          },
        ],
      },
    ],
  },
  'breed-swap': {
    title: 'Đổi giống chó hàng loạt từ một ảnh',
    sections: [
      {
        title: 'Đổi giống chó hàng loạt là gì?',
        blocks: [
          'Từ một ảnh có chó (mockup thảm tròn, ornament, áo in ảnh thú cưng, một thiết kế hay một ảnh chụp), ứng dụng tạo lại đúng ảnh đó với giống chó bạn chọn. Mỗi giống là một ảnh riêng, nên một thiết kế có đủ phiên bản cho từng giống để đăng bán.',
          `AI chỉ thay chú chó, giữ nguyên tư thế, kích thước, vị trí, chữ, tên, bố cục, nền và phong cách: ảnh chụp vẫn là ảnh chụp, tranh vẽ vẫn là tranh vẽ. ${APP_COST}`,
        ],
      },
      {
        title: 'Đổi giống chó trong 3 bước',
        lead: 'Tải ảnh, chọn giống, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải ảnh có chó', text: 'Thêm một mockup, thiết kế hoặc ảnh chụp có một chú chó nhìn rõ.' },
              { title: 'Chọn giống chó', text: 'Đánh dấu các giống cần tạo trong danh sách 25 giống phổ biến. Mỗi giống tạo một ảnh riêng và tính tiền riêng; tổng tiền hiện trước khi chạy.' },
              { title: 'Chạy', text: 'Bấm Chạy. Mỗi giống là một lượt trong tab Lịch sử, thẻ ghi tên giống, dùng lại hay tải về như ảnh thường.' },
            ],
          },
        ],
      },
      {
        title: 'Giới hạn',
        blocks: [
          'Mỗi ảnh nên có một chú chó: ảnh có nhiều con vật thì AI có thể đổi nhầm con. Chữ nhỏ hay chữ viết tay đôi khi bị vẽ lại khác đi một chút, nên hãy xem lại từng ảnh, nhất là tên và chữ, trước khi đăng bán.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Mỗi giống tốn bao nhiêu?', `${APP_COST} Mỗi giống là một ảnh nên tổng tiền bằng giá một ảnh nhân số giống đã chọn.`],
              ['Dùng ảnh nào để có kết quả tốt?', 'Một ảnh rõ nét, chú chó không bị che, thấy rõ dáng và mặt.'],
              ['Không thấy giống mình cần?', 'Danh sách có 25 giống phổ biến nhất. Cần thêm giống nào thì gửi Góp ý.'],
            ],
          },
        ],
      },
    ],
  },
  'pet-portrait': {
    title: 'Chân dung thú cưng in sẵn từ một ảnh chụp',
    sections: [
      {
        title: 'Chân dung thú cưng là gì?',
        blocks: [
          'Từ một ảnh chụp thú cưng của khách, ứng dụng vẽ lại con vật thành thiết kế in sẵn theo từng phong cách bạn chọn: màu nước, hoạt hình, nét mực đen, chân dung hoàng gia, pop art, vector phẳng, phác chì và sơn dầu. Mỗi phong cách là một ảnh riêng.',
          `Mọi thiết kế đều trên nền trắng tinh, một con vật ở giữa, không chữ, không khung, để đặt lên áo, cốc, ornament hay thảm. AI giữ khuôn mặt, đốm lông, màu lông, màu mắt và dáng tai để chủ nuôi nhận ra ngay. ${APP_COST}`,
        ],
      },
      {
        title: 'Tạo chân dung trong 3 bước',
        lead: 'Tải ảnh thú cưng, chọn phong cách, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải ảnh thú cưng', text: 'Thêm một ảnh rõ nét, thấy trọn mặt và tai, chỉ có một con vật.' },
              { title: 'Chọn phong cách', text: 'Đánh dấu các phong cách cần tạo. Mỗi phong cách tạo một ảnh riêng và tính tiền riêng; tổng tiền hiện trước khi chạy.' },
              { title: 'Chạy', text: 'Bấm Chạy. Mỗi phong cách là một lượt trong tab Lịch sử; "Chọn cả lô" trên một thẻ chọn mọi ảnh của lần chạy đó để tải về một tệp .zip.' },
            ],
          },
        ],
      },
      {
        title: 'Giới hạn',
        blocks: [
          'Phong cách nét mực đen và phác chì không có màu, nên chỉ giữ được đốm và hoa văn lông, không giữ màu. Ảnh mờ, tối hay bị che một phần mặt làm AI đoán sai chi tiết: hãy so từng ảnh với ảnh gốc trước khi in.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Mỗi phong cách tốn bao nhiêu?', `${APP_COST} Mỗi phong cách là một ảnh nên tổng tiền bằng giá một ảnh nhân số phong cách đã chọn.`],
              ['Ảnh có nền trong suốt không?', 'Không, nền là màu trắng tinh. Cần nền trong suốt thì đưa ảnh sang ứng dụng Xoá nền.'],
              ['Ảnh có hai con vật thì sao?', 'Ứng dụng chỉ vẽ một con vật. Hãy cắt ảnh để chỉ còn con cần vẽ.'],
            ],
          },
        ],
      },
    ],
  },
  'mockup-pack': {
    title: 'Mockup hàng loạt từ một thiết kế',
    sections: [
      {
        title: 'Mockup hàng loạt là gì?',
        blocks: [
          'Từ một thiết kế, ứng dụng tạo ảnh mockup sản phẩm cho từng loại bạn chọn: thảm tròn 3D trên sàn nhà, ornament kính tròn trên cây thông, áo thun cổ tròn trải phẳng, cốc sứ 11 oz, chăn lông trên sofa và tranh canvas trên tường. Mỗi sản phẩm là một ảnh riêng.',
          `AI giữ nguyên thiết kế: màu, chữ, chính tả và bố cục, và giữ đúng hình dáng thật của sản phẩm. Có sẵn ảnh sản phẩm trơn của mình thì thêm vào ô thứ hai: AI in thiết kế lên đúng sản phẩm đó, giữ nguyên góc chụp, nền và ánh sáng. ${APP_COST}`,
        ],
      },
      {
        title: 'Tạo mockup trong 3 bước',
        lead: 'Tải thiết kế, chọn sản phẩm, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải thiết kế', text: 'Thêm thiết kế, tốt nhất là PNG nền trong hoặc nền trắng. Muốn in lên sản phẩm của mình thì thêm ảnh sản phẩm trơn vào ô thứ hai.' },
              { title: 'Chọn sản phẩm', text: 'Đánh dấu các sản phẩm cần tạo; mỗi sản phẩm tạo một ảnh và tính tiền riêng. Có ảnh sản phẩm trơn thì chỉ chọn một sản phẩm, đúng loại trong ảnh đó.' },
              { title: 'Chạy', text: 'Bấm Chạy. Mỗi sản phẩm là một lượt trong tab Lịch sử; "Chọn cả lô" trên một thẻ chọn mọi ảnh của lần chạy đó để tải về một tệp .zip.' },
            ],
          },
        ],
      },
      {
        title: 'Giới hạn',
        blocks: [
          'Chữ nhỏ trong thiết kế đôi khi bị vẽ lại khác đi một chút, nhất là trên cốc và ornament vì mặt cong. Nên chọn Nano Banana Pro nếu Admin đã bật, vì mô hình này giữ chữ và chi tiết thiết kế tốt hơn. Hãy xem lại từng ảnh trước khi đăng bán.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Mỗi sản phẩm tốn bao nhiêu?', `${APP_COST} Mỗi sản phẩm là một ảnh nên tổng tiền bằng giá một ảnh nhân số sản phẩm đã chọn.`],
              ['Vì sao có ảnh sản phẩm trơn thì chỉ chọn được một sản phẩm?', 'Ảnh sản phẩm trơn là một sản phẩm cụ thể, nên AI in thiết kế lên đúng sản phẩm đó. Cần mockup cho loại khác thì chạy lại với ảnh trơn của loại ấy, hoặc bỏ ảnh trơn để dùng cảnh có sẵn.'],
              ['Không thấy sản phẩm mình cần?', 'Danh sách có 6 sản phẩm bán chạy cho đồ thú cưng. Cần thêm loại nào thì gửi Góp ý, hoặc dùng ảnh sản phẩm trơn của bạn.'],
            ],
          },
        ],
      },
    ],
  },
  'name-swap': {
    title: 'Đổi tên hàng loạt trên một thiết kế',
    sections: [
      {
        title: 'Đổi tên hàng loạt là gì?',
        blocks: [
          'Từ một thiết kế hay mockup có in tên (tên thú cưng, tên gia đình), ứng dụng tạo lại đúng ảnh đó với từng tên mới bạn nhập. Mỗi tên là một ảnh riêng, nên một thiết kế có đủ phiên bản để đăng bán hay gửi khách duyệt.',
          `AI chỉ thay chữ tên, giữ phông chữ, cỡ chữ, màu, độ cong và vị trí, và giữ nguyên phần còn lại. Muốn đổi cả chú chó thì chọn thêm giống: mỗi tên ra một ảnh cho mỗi giống. ${APP_COST}`,
        ],
      },
      {
        title: 'Đổi tên trong 3 bước',
        lead: 'Tải thiết kế, nhập tên, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải thiết kế có tên', text: 'Thêm một thiết kế hoặc mockup có một tên in rõ trên đó.' },
              { title: 'Nhập tên mới', text: 'Mỗi dòng một tên, tối đa 25 tên, mỗi tên tối đa 20 ký tự: chữ cái có dấu, chữ số, khoảng trắng, dấu nháy đơn và gạch nối. Có thể chọn thêm giống chó, tối đa 25 ảnh mỗi lần chạy.' },
              { title: 'Chạy', text: 'Bấm Chạy. Mỗi tên là một lượt trong tab Lịch sử, thẻ ghi tên đó; "Chọn cả lô" chọn mọi ảnh của lần chạy để tải về một tệp .zip.' },
            ],
          },
        ],
      },
      {
        title: 'Giới hạn',
        blocks: [
          'AI vẽ lại chữ nên đôi khi viết sai một ký tự, nhất là chữ có dấu, chữ viết tay hay chữ uốn cong. Nên chọn Nano Banana Pro nếu Admin đã bật, vì mô hình này viết chữ chính xác hơn. Hãy đọc lại chính tả từng ảnh trước khi đăng bán hay in.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Mỗi tên tốn bao nhiêu?', `${APP_COST} Mỗi tên (hay mỗi cặp tên và giống) là một ảnh nên tổng tiền bằng giá một ảnh nhân số ảnh.`],
              ['Vì sao không nhập được biểu tượng cảm xúc?', 'Tên đi thẳng vào mô tả gửi cho AI, nên chỉ nhận chữ cái, chữ số, khoảng trắng, dấu nháy đơn và gạch nối. Biểu tượng và ký hiệu khác thường bị vẽ sai.'],
              ['Sửa một tên rồi chạy lại cả lô thế nào?', 'Bấm Dùng lại trên một thẻ của lô: ảnh, mọi tên và mọi giống của lần chạy đó quay lại biểu mẫu. Sửa tên cần đổi rồi bấm Chạy.'],
            ],
          },
        ],
      },
    ],
  },
  'ai-fashion-model': {
    title: 'Tạo người mẫu AI từ vài lựa chọn',
    sections: [
      {
        title: 'Tạo người mẫu AI là gì?',
        blocks: [
          'Tạo người mẫu AI là ứng dụng dựng một người mẫu hư cấu từ các lựa chọn của bạn: giới tính, độ tuổi, nguồn gốc, màu da, dáng người, tóc, khung hình, nền và biểu cảm. Bạn không cần ảnh đầu vào, ứng dụng tự viết mô tả cố định bằng tiếng Anh và tạo từ 1 đến 4 ảnh để bạn chọn.',
          `Ảnh vừa ý có thể lưu thành một người mẫu AI của bạn, rồi chọn lại ở Thử đồ, Tạo ảnh và Tạo video mà không phải dựng lại từ đầu. ${APP_COST}`,
        ],
      },
      {
        title: 'Từ lựa chọn đến người mẫu trong 4 bước',
        lead: 'Chọn đặc điểm, chọn số ảnh, bấm Chạy, rồi lưu ảnh bạn thích.',
        blocks: [
          {
            steps: [
              { title: 'Chọn đặc điểm', text: 'Chọn từng đặc điểm, hoặc chọn một phong cách có sẵn để điền sẵn vài lựa chọn phù hợp, rồi chỉnh lại nếu muốn. Nguồn gốc có lựa chọn Đa dạng: mỗi ảnh trong một lần chạy nhận một nguồn gốc khác nhau, và mỗi người mẫu đã lưu ghi lại nguồn gốc cụ thể của ảnh đó. Phần chi tiết thêm dành cho nốt ruồi, tàn nhang hay kiểu tóc cụ thể.' },
              { title: 'Chọn số ảnh', text: 'Chọn 1 đến 4 ảnh. Dòng chi phí cho biết tổng tiền trước khi bạn bấm Chạy.' },
              { title: 'Chạy', text: 'Bấm Chạy. Mỗi ảnh là một lượt tạo riêng và nằm trong tab Lịch sử khi xong.' },
              { title: 'Lưu làm người mẫu', text: 'Ở ảnh vừa ý, bấm Lưu làm người mẫu, đặt tên và chọn có dùng chung cho cả công ty hay không. Người mẫu đã lưu nằm trong tab Đã lưu.' },
            ],
          },
        ],
      },
      {
        title: 'Người mẫu đã lưu dùng ở đâu?',
        blocks: [
          {
            cards: [
              { title: 'Thử đồ', text: 'Có trong nhóm Người mẫu AI của bảng chọn người mẫu.' },
              { title: 'Tạo ảnh', text: 'Mở Ảnh đã tải ở ô ảnh tham chiếu và chọn trong nhóm Người mẫu AI.' },
              { title: 'Tạo video', text: 'Mở Ảnh đã tải ở ô ảnh và chọn trong nhóm Người mẫu AI.' },
            ],
          },
        ],
      },
      {
        title: 'Riêng tư và dùng chung',
        blocks: [
          'Người mẫu bạn lưu là của riêng bạn. Bạn có thể bật Dùng chung cho cả công ty để đồng nghiệp chọn được, và tắt lại bất cứ lúc nào. Nếu Admin đã quyết định cho một người mẫu, quyết định đó được giữ cho đến khi Admin thả ra.',
        ],
      },
      {
        title: 'Giới hạn',
        blocks: [
          'Người mẫu luôn là người hư cấu, trên 18 tuổi, mặc áo thun trắng trơn và không có chữ, logo, cờ, đồng phục hay đạo cụ. AI có thể vẽ sai một chi tiết nhỏ, nên hãy xem kỹ ảnh trước khi lưu.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Ai nhìn thấy người mẫu của tôi?', 'Chỉ bạn và Admin, trừ khi bạn bật Dùng chung cho cả công ty.'],
              ['Nếu tôi tắt Dùng chung thì sao?', 'Người mẫu biến khỏi bảng chọn của đồng nghiệp; ảnh mà họ đã tạo từ người mẫu đó vẫn giữ nguyên kết quả.'],
              ['Người mẫu đã dùng chung có xoá được không?', 'Nếu Admin đã quyết định dùng chung thì chỉ Admin xoá hoặc thả quyết định được; còn lại bạn xoá bất cứ lúc nào.'],
              ['Một lần chạy tốn bao nhiêu?', `${APP_COST} Dòng chi phí trên trang cho biết tổng tiền cho số ảnh bạn chọn.`],
            ],
          },
        ],
      },
    ],
  },
  'pose-generator': {
    title: 'Một người mẫu, nhiều tư thế',
    sections: [
      {
        title: 'Tạo tư thế người mẫu là gì?',
        blocks: [
          `Từ một đến ${MAX_MODELS} ảnh người mẫu, ứng dụng tạo lại đúng từng người trong các tư thế bạn chọn: đứng thẳng, chống hông, quay lưng, ngồi, cận mặt và nhiều tư thế khác, hoặc một tư thế bạn tự tả. Mỗi người mẫu ở mỗi tư thế là một ảnh riêng.`,
          `AI giữ nguyên khuôn mặt, tóc, dáng người, trang phục, ánh sáng và nền của ảnh gốc (nếu bạn không đổi nền), chỉ đổi tư thế và khung hình. ${APP_COST}`,
        ],
      },
      {
        title: 'Tạo tư thế trong 3 bước',
        lead: 'Chọn ảnh người mẫu, chọn tư thế, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Chọn ảnh người mẫu', text: 'Tải lên một ảnh rõ mặt, thấy người, hoặc chọn trong Ảnh đã tải hay một người mẫu AI đã lưu. Ô Người mẫu nhận tối đa 6 ảnh, và ảnh nào cũng được tạo đủ các tư thế đã chọn. Trên kết quả của Tạo người mẫu AI và Thử đồ, nút Đổi tư thế mở sẵn ảnh đó ở đây.' },
              { title: 'Chọn tư thế', text: 'Chọn tối đa 4 tư thế trong thư viện, hoặc tả tư thế trong ô Tư thế tự tả; ô này tính là một tư thế. Ô Ảnh tư thế mẫu nhận tối đa 4 ảnh một người ở đúng tư thế bạn muốn, mỗi ảnh cũng là một tư thế: AI chỉ lấy tư thế, góc người và khung hình, không lấy mặt, tóc, trang phục hay nền của người trong ảnh đó. Mỗi tư thế tạo một ảnh riêng và tính tiền riêng; tổng tiền hiện trước khi chạy. Mục Nền cho giữ nền gốc, đổi sang nền studio trắng hoặc một cảnh lifestyle chung cho mọi ảnh của lần chạy. Các nút Amazon, Etsy và Shopify chọn nhanh 4 tư thế và nền hợp quy định ảnh của từng sàn. Các nút Váy/Đầm, Áo, Quần và Áo khoác chỉ chọn nhanh 4 tư thế hợp loại trang phục, giữ nguyên nền.' },
              { title: 'Chạy', text: 'Bấm Chạy. Mỗi tư thế là một lượt trong tab Lịch sử; "Chọn cả lô" trên một thẻ chọn mọi ảnh của lần chạy đó để tải về một tệp .zip.' },
            ],
          },
        ],
      },
      {
        title: 'Giới hạn',
        blocks: [
          'Tư thế càng khác ảnh gốc, AI càng phải đoán phần không thấy trong ảnh, như mặt sau của trang phục khi quay lưng. Hãy so từng ảnh với ảnh gốc trước khi dùng; dòng "Giống người mẫu" trên mỗi thẻ ở Lịch sử cho biết khuôn mặt giống ảnh gốc đến đâu (Cao, Vừa hoặc Thấp), còn ảnh quay lưng ghi "không thấy mặt".',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Mỗi tư thế tốn bao nhiêu?', `${APP_COST} Mỗi tư thế là một ảnh nên tổng tiền bằng giá một ảnh nhân số tư thế đã chọn.`],
              ['Chọn tư thế trong thư viện và tự tả cùng lúc thì sao?', 'Mỗi tư thế chạy thành một ảnh riêng, nên tư thế tự tả không làm đổi các tư thế đã chọn.'],
            ],
          },
        ],
      },
    ],
  },
  'product-recolor': {
    title: 'Một ảnh sản phẩm, đủ các màu',
    sections: [
      {
        title: 'Đổi màu sản phẩm là gì?',
        blocks: [
          'Từ một ảnh sản phẩm (áo thun trơn hoặc đã in, hoodie, cốc, túi tote…), ứng dụng tạo một ảnh cho mỗi màu bạn chọn: 12 màu phôi POD phổ biến như Đen, Trắng, Navy, Xám heather, Đỏ, Be cát, hoặc mã màu riêng của bạn. Mỗi màu là một ảnh riêng.',
          `AI chỉ đổi màu chất liệu của sản phẩm (vải, sứ, canvas…). Hình in, chữ, logo, nếp vải, đường may, ánh sáng, bóng đổ, nền và khung hình giữ nguyên như ảnh gốc. ${APP_COST}`,
        ],
      },
      {
        title: 'Đổi màu trong 3 bước',
        lead: 'Tải ảnh sản phẩm, chọn màu, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải ảnh sản phẩm', text: 'Dùng một ảnh rõ nét, đủ sáng, thấy trọn sản phẩm; ảnh mockup hoặc ảnh chụp thật đều được. Sản phẩm màu sáng (trắng, xám nhạt) thường đổi màu đẹp nhất.' },
              { title: 'Chọn màu', text: `Bấm các ô màu cần tạo, hoặc nhập mã màu riêng dạng #RRGGBB rồi bấm Thêm màu. Tối đa ${MAX_PICTURES} màu mỗi lần chạy; mỗi màu tạo một ảnh và tính tiền riêng.` },
              { title: 'Chạy', text: 'Bấm Chạy. Mỗi màu là một lượt trong tab Lịch sử; "Chọn cả lô" trên một thẻ chọn mọi ảnh của lần chạy đó để tải về một tệp .zip.' },
            ],
          },
        ],
      },
      {
        title: 'Mẹo để ảnh đẹp',
        blocks: [
          'Chọn màu tương phản với hình in: hình in tối nên đi với màu sáng, hình in trắng hay sáng nên đi với màu tối. AI giữ nguyên màu hình in, nên chữ đen trên áo đen sẽ khó đọc.',
          'Mã màu riêng hợp với màu phôi của nhà in bạn dùng; màu trên ảnh vẫn có thể lệch nhẹ so với vải thật, hãy so trước khi đăng bán. Nano Banana Pro (nếu Admin đã bật) giữ chữ và chi tiết hình in tốt hơn.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Mỗi màu tốn bao nhiêu?', `${APP_COST} Mỗi màu là một ảnh nên tổng tiền bằng giá một ảnh nhân số màu đã chọn.`],
              ['Bỏ một màu riêng đã thêm thế nào?', 'Bỏ chọn ô màu đó: màu riêng biến khỏi danh sách. Cần lại thì nhập mã và bấm Thêm màu lần nữa.'],
            ],
          },
        ],
      },
    ],
  },
  'listing-set': {
    title: 'Bộ ảnh đăng bán từ một ảnh sản phẩm',
    sections: [
      {
        title: 'Bộ ảnh listing là gì?',
        blocks: [
          'Từ một ảnh sản phẩm, ứng dụng tạo bộ ảnh để đăng bán trên Etsy, Amazon hay Shopify. Bạn chọn những cảnh cần: nhóm Cơ bản có ảnh chính nền trắng, lifestyle trong nhà, cận cảnh chi tiết, flat lay, cầm trên tay, gói quà, ngoài trời, trên người mẫu hoặc đang dùng, nền màu studio và mở hộp; nhóm Theo mùa có Giáng sinh, Halloween và mùa thu, Valentine, mùa hè và Ngày của Mẹ hay của Cha. Mỗi cảnh là một ảnh riêng.',
          `AI giữ y nguyên sản phẩm trong mọi cảnh: hình dáng, tỉ lệ, màu, hình in và chữ. ${APP_COST}`,
        ],
      },
      {
        title: 'Tạo bộ ảnh trong 3 bước',
        lead: 'Tải ảnh sản phẩm, chọn cảnh, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải ảnh sản phẩm', text: 'Dùng một ảnh rõ nét, thấy trọn sản phẩm, càng ít vật khác càng tốt; ảnh nền trắng hoặc ảnh đã xoá nền cho kết quả sạch nhất.' },
              { title: 'Chọn cảnh', text: `Đánh dấu các cảnh cần tạo, tối đa ${MAX_PICTURES} ảnh mỗi lần chạy; mỗi cảnh tạo một ảnh và tính tiền riêng.` },
              { title: 'Chạy', text: 'Bấm Chạy. Mỗi cảnh là một lượt trong tab Lịch sử; "Chọn cả lô" trên một thẻ chọn mọi ảnh của lần chạy đó để tải về một tệp .zip.' },
            ],
          },
        ],
      },
      {
        title: 'Nên chọn cảnh nào?',
        blocks: [
          'Amazon cần ảnh chính nền trắng tinh, sản phẩm chiếm khoảng 85% khung hình, không đạo cụ và không chữ: chọn Nền trắng. Etsy và Shopify chuộng ảnh lifestyle, cận cảnh và ảnh cầm trên tay để người mua thấy kích thước thật. Cảnh Theo mùa hợp để đổi ảnh bìa trước các dịp lễ.',
          'Cảnh "Trên người mẫu / đang dùng" hợp nhất với đồ mặc hoặc đồ dùng hằng ngày như áo, túi, cốc. Chữ nhỏ trên sản phẩm đôi khi bị vẽ lại khác đi một chút; Nano Banana Pro (nếu Admin đã bật) giữ chữ tốt hơn. Hãy xem lại từng ảnh trước khi đăng bán.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Mỗi cảnh tốn bao nhiêu?', `${APP_COST} Mỗi cảnh là một ảnh nên tổng tiền bằng giá một ảnh nhân số cảnh đã chọn.`],
              ['Muốn thêm một biến thể của cùng một cảnh?', 'Dùng nút Chạy lại trên thẻ của cảnh đó trong Lịch sử: mỗi lần chạy lại ra một ảnh mới cho cùng cảnh.'],
            ],
          },
        ],
      },
    ],
  },
  'hook-effects': {
    title: 'Video mở đầu gây chú ý từ một ảnh sản phẩm',
    sections: [
      {
        title: 'Hiệu ứng mở đầu là gì?',
        blocks: [
          'Từ một ảnh sản phẩm, ứng dụng tạo video dọc 5 giây có hiệu ứng gây chú ý trong 2–3 giây đầu, rồi sản phẩm trở lại đúng như trong ảnh: phồng rồi bóp, tan chảy rồi hiện lại, rơi vào khung hoặc bung ra từ một chiếc hộp. Dùng làm đoạn mở đầu để người xem dừng lại khi lướt.',
          `Ảnh không đúng khung dọc 9:16 được thêm viền cùng màu nền hai bên hoặc trên dưới, sản phẩm không bị cắt, và đoạn cuối luôn trùng với ảnh bạn tải lên. ${APP_COST}`,
        ],
      },
      {
        title: 'Tạo video trong 3 bước',
        lead: 'Tải ảnh sản phẩm, chọn hiệu ứng, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải ảnh sản phẩm', text: 'Dùng một ảnh rõ nét, sản phẩm ở giữa, nền trơn; ảnh nền trắng cho kết quả sạch nhất.' },
              { title: 'Chọn hiệu ứng', text: 'Bốn hiệu ứng: Phồng rồi bóp, Tan chảy thành sản phẩm, Rơi vào khung và Hộp bung mở. Hiệu ứng đang chọn phát video mẫu.' },
              { title: 'Chạy', text: 'Bấm Chạy và xem video trong tab Lịch sử. Muốn hiệu ứng khác với cùng ảnh, chọn hiệu ứng đó rồi chạy lại.' },
            ],
          },
        ],
      },
      {
        title: 'Mẹo để có kết quả đẹp',
        blocks: [
          {
            list: [
              'Chữ nhỏ trên sản phẩm có thể bị nhoè hoặc méo trong lúc hiệu ứng chạy; nên dùng sản phẩm có chữ to hoặc ít chữ.',
              'Clip có sẵn âm thanh do mô hình tự tạo, có thể có tiếng nói; tắt tiếng khi ghép video nếu không cần.',
              'Hiệu ứng rơi vào đúng khung ở 2–3 giây đầu; phần còn lại là sản phẩm đứng yên, hợp để chèn chữ hoặc ghép tiếp cảnh sau.',
            ],
          },
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Một lần chạy tốn bao nhiêu?', `${APP_COST} Với giá hiện tại, ba hiệu ứng đầu khoảng $0.125 một clip, còn Hộp bung mở khoảng $0.25 vì dùng mô hình khác. Chi phí thật nằm trên video trong Thư viện.`],
              ['Sản phẩm có bị cắt hay đổi hình không?', 'Không bị cắt: ảnh được thêm viền thay vì cắt. Đoạn cuối trùng với ảnh gốc; chỉ phần hiệu ứng ở đầu làm sản phẩm biến dạng tạm thời.'],
              ['Chữ trên sản phẩm có giữ được không?', 'Đoạn cuối giữ chữ như trong ảnh, nhưng chữ nhỏ có thể bị nhoè hoặc méo trong lúc hiệu ứng chạy. Hãy xem lại video trước khi đăng.'],
              ['Vì sao Hộp bung mở đắt hơn?', 'Hiệu ứng này chạy trên một mô hình khác, dùng ảnh sản phẩm làm ảnh tham chiếu để hiện ra từ chiếc hộp, nên giá mỗi clip cao hơn ba hiệu ứng còn lại.'],
            ],
          },
        ],
      },
    ],
  },
  'video-edit': {
    title: 'Sửa một video có sẵn bằng một câu lệnh',
    sections: [
      {
        title: 'Sửa video là gì?',
        blocks: [
          'Bạn chọn một video có sẵn và nói điều cần đổi: màu áo, nền phía sau, đổi sang một sản phẩm khác, hoặc tự mô tả thay đổi bằng lời. AI, chạy trên Kling O3 Edit, trả về chính video đó với đúng thay đổi ấy; người, chuyển động, khung hình và âm thanh gốc được giữ nguyên.',
          'Đổi sản phẩm biến một video bán chạy thành video cho thiết kế mới: thêm ảnh sản phẩm mới, AI thay chiếc áo đang mặc (hay món đồ đang cầm) bằng sản phẩm trong ảnh, giữ màu, hình in và chữ.',
          `Video kết quả dài bằng video gốc. Chi phí tính theo số giây của video gốc, làm tròn lên. ${APP_COST}`,
        ],
      },
      {
        title: 'Sửa video trong 3 bước',
        lead: 'Chọn video, chọn kiểu sửa, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Chọn video', text: 'Tải lên một video MP4 hoặc MOV dài 3 đến 15 giây, mỗi cạnh từ 720 px trở lên, tối đa 20 MB, hoặc chọn một video trong Lịch sử của bạn.' },
              { title: 'Chọn kiểu sửa', text: 'Đổi màu áo theo bảng màu có sẵn, đổi nền sang studio trắng hoặc lifestyle, chọn Đổi sản phẩm rồi thêm ảnh sản phẩm mới (tải lên, Ảnh đã tải hoặc Từ kệ sản phẩm), hoặc chọn Tự mô tả và viết thay đổi bạn muốn.' },
              { title: 'Chạy', text: 'Bấm Chạy và xem video trong tab Lịch sử. Muốn thử màu, nền hay thiết kế khác, chọn lại rồi chạy tiếp với cùng video.' },
            ],
          },
        ],
      },
      {
        title: 'Mẹo để có kết quả đẹp',
        blocks: [
          {
            list: [
              'Mỗi lần chạy chỉ sửa một thứ; muốn đổi cả màu áo lẫn nền, chạy hai lần, lần sau dùng video vừa sửa.',
              'Đổi sản phẩm cho kết quả tốt nhất khi ảnh mới chụp thẳng mặt trước, thấy rõ hình in, và sản phẩm trong video cùng loại (áo thay áo, cốc thay cốc).',
              'Khi tự mô tả, nói rõ cần đổi gì; Cải thiện (bật sẵn) dịch lời của bạn sang tiếng Anh thành một câu lệnh ngắn trước khi gửi cho mô hình.',
              'Chưa thêm được chữ vào video: mô hình không viết chữ chính xác. Hãy chèn chữ khi dựng video.',
            ],
          },
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Một lần chạy tốn bao nhiêu?', `${APP_COST} Với giá hiện tại, mỗi giây video khoảng $0.14, nên video 10 giây khoảng $1.40. Chi phí thật nằm trên video trong Thư viện.`],
              ['Hình in và chữ trên áo có giữ được không?', 'Câu lệnh đổi màu dặn giữ nguyên hình in và chữ, nhưng chữ nhỏ có thể bị nhoè ở vài khung hình. Hãy xem lại video trước khi đăng.'],
              ['Đổi sản phẩm khác gì Smart Remake?', 'Đổi sản phẩm sửa một video ngắn trong một lần chạy và giữ âm thanh gốc. Smart Remake dành cho video mẫu dài nhiều cảnh: nó tự tìm các cảnh có sản phẩm và làm lại từng cảnh.'],
              ['Âm thanh của video gốc có còn không?', 'Còn: video sửa xong giữ âm thanh của video gốc.'],
              ['Vì sao video của tôi bị từ chối?', 'Mô hình chỉ nhận video dài 3 đến 15 giây, mỗi cạnh 720 đến 3840 px, 23 đến 60 khung hình mỗi giây. Video ngắn hơn, dài hơn hoặc nhỏ hơn cần được cắt hoặc xuất lại trước.'],
            ],
          },
        ],
      },
    ],
  },
  'print-fix': {
    title: 'Hình in sai thì sửa lại bằng file design gốc',
    sections: [
      {
        title: 'Sửa lại hình in là gì?',
        blocks: [
          'AI đôi khi in sai hình lên sản phẩm: chữ méo, sai chính tả, thiếu chi tiết hoặc ra một mẫu khác. Ứng dụng này lấy ảnh bị sai và file design gốc của bạn, rồi thay đúng phần hình in bằng design đó, đặt ở cùng vị trí, cùng cỡ, theo nếp vải và ánh sáng của ảnh.',
          `Người mẫu, khuôn mặt, tư thế, màu và kiểu sản phẩm, nền và khung hình được giữ nguyên. Ảnh kết quả có cùng tỉ lệ với ảnh cần sửa. ${APP_COST}`,
        ],
      },
      {
        title: 'Sửa hình in trong 3 bước',
        lead: 'Chọn ảnh cần sửa, thêm file design gốc, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Chọn ảnh cần sửa', text: 'Tải lên ảnh có hình in bị sai, hoặc bấm "Sửa lại hình in" trên một kết quả trong Lịch sử hay Thư viện để mở sẵn ảnh đó. Với một video, ứng dụng lấy khung hình đầu tiên.' },
              { title: 'Thêm file design gốc', text: 'Dùng đúng file bạn gửi nhà in, tốt nhất là PNG nền trong. Có thể ghi thêm một dòng ngắn ở ô Mô tả, ví dụ "hình in ở lưng áo".' },
              { title: 'Chạy', text: 'Bấm Chạy và xem ảnh trong tab Lịch sử. Muốn làm lại video từ ảnh đã sửa, bấm "Tạo video" trên ảnh đó.' },
            ],
          },
        ],
      },
      {
        title: 'Mẹo để hình in đúng',
        blocks: [
          {
            list: [
              'File design càng nét càng tốt; chữ quá nhỏ trong design vẫn có thể bị nhoè trên ảnh.',
              'Mỗi lần sửa một hình in. Sản phẩm có hình in ở cả trước và sau thì ghi rõ chỗ cần sửa ở ô Mô tả.',
              'Ảnh lấy từ video là khung hình đầu, nhỏ hơn ảnh gốc; hãy xem kỹ ảnh đã sửa trước khi làm lại video.',
            ],
          },
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Một lần sửa tốn bao nhiêu?', `${APP_COST} Mỗi lần chạy tạo một ảnh.`],
              ['Chữ trên ảnh đã sửa có chắc đúng chính tả không?', 'Câu lệnh dặn AI viết đúng từng chữ như trong design, nhưng hãy đọc lại chữ trên ảnh trước khi đăng bán.'],
              ['Có sửa thẳng trên video được không?', 'Chưa. Ứng dụng sửa khung hình đầu của video thành một ảnh; từ ảnh đó, bấm "Tạo video" để làm lại clip.'],
            ],
          },
        ],
      },
    ],
  },
  'smart-remake': {
    title: 'Làm lại video mẫu với sản phẩm của bạn',
    sections: [
      {
        title: 'Smart Remake là gì?',
        blocks: [
          'Smart Remake giữ mạch truyện của một video mẫu và đặt sản phẩm của bạn vào các cảnh có sản phẩm tương tự. Bạn chỉ cần đưa một video mẫu và một ảnh sản phẩm; AI tự phân tích video, tự chọn sẵn các cảnh có sản phẩm giống của bạn, và bạn bấm một nút để tạo video.',
          'Mỗi cảnh được làm lại riêng, giữ nguyên chuyển động và độ dài của cảnh gốc, không tiếng. Các cảnh được ghép lại thành một video, kèm bản so sánh trước/sau.',
          { loop: 'about-smart-remake-loop' },
        ],
      },
      {
        title: 'Từ video mẫu đến video của bạn trong 3 bước',
        lead: 'Thêm video mẫu, thêm ảnh sản phẩm, kiểm tra các cảnh đã chọn rồi bấm Tạo.',
        blocks: [
          {
            steps: [
              { title: 'Thêm video mẫu', text: 'Tải video lên hoặc chọn từ Lịch sử. Video được phân tích ngay khi bạn thêm, mất vài phút (lâu hơn với video dài), và phân tích tốn khoảng $0.02.' },
              { title: 'Thêm ảnh sản phẩm', text: 'Chọn một ảnh rõ nét của sản phẩm, tốt nhất trên nền trơn và cùng loại sản phẩm với video mẫu. AI xem từng cảnh và tick sẵn các cảnh có sản phẩm giống của bạn.' },
              { title: 'Tạo video', text: 'Bỏ chọn cảnh không cần hoặc chọn thêm cảnh, xem giá ngay trên nút Tạo, rồi bấm. Bạn xác nhận giá trước khi tiền được tính.' },
            ],
          },
        ],
      },
      {
        title: 'Giá bao nhiêu?',
        blocks: [
          'Mỗi cảnh tính theo độ dài của cảnh, làm tròn lên số giây nguyên (từ 2 đến 10 giây). Một video làm lại tối đa 6 cảnh. Tiền tính vào ngân sách video; nút Tạo ghi tổng giá ước tính trước khi bạn bấm.',
        ],
      },
      {
        title: 'Mẹo để có kết quả đẹp',
        blocks: [
          {
            list: [
              'Dùng ảnh sản phẩm rõ nét, đủ sáng, trên nền trơn.',
              'Chọn sản phẩm cùng loại với sản phẩm trong video mẫu, ví dụ áo thay cho áo.',
              'Chỉ chọn các cảnh có sản phẩm; cảnh không có sản phẩm sẽ không thay đổi gì đáng kể mà vẫn tốn tiền.',
            ],
          },
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Nếu AI không chọn được cảnh nào thì sao?', 'Trang sẽ báo và bạn tự tick các cảnh cần thay sản phẩm.'],
              ['Tôi có đổi được cảnh AI đã chọn không?', 'Có. Các cảnh chỉ được tick sẵn; bạn bỏ hoặc thêm cảnh trước khi bấm Tạo.'],
              ['Video làm xong nằm ở đâu?', 'Ngay dưới nút Tạo trên trang này, kèm bản so sánh trước/sau. Bạn cũng xem lại được ở mục Phân tích.'],
              ['Có xoá được video đã làm không?', 'Có, bấm Xoá ở video đó. Ảnh sản phẩm của bạn vẫn còn.'],
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
          'Đổi khuôn mặt là ứng dụng thay khuôn mặt trong một ảnh bằng khuôn mặt từ ảnh khác. Bạn tải Khuôn mặt nguồn và Ảnh cần đổi khuôn mặt, và AI hoà khuôn mặt mới vào, khớp màu da và ánh sáng, trong khi tóc, dáng người, trang phục và bối cảnh không bị động đến.',
          `Ứng dụng làm việc trên ảnh và bắt đầu bằng một lần bấm Chạy. Thương hiệu và người sáng tạo nội dung dùng nó để đổi người xuất hiện trong ảnh trong khi cách phối, trang phục và bối cảnh giữ đúng như lúc chụp. ${APP_COST}`,
        ],
      },
      {
        title: 'Đổi khuôn mặt trong ảnh',
        lead: 'Tải khuôn mặt nguồn, tải ảnh cần đổi khuôn mặt, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải khuôn mặt nguồn', text: 'Thêm ảnh khuôn mặt sẽ xuất hiện trong kết quả vào ô Khuôn mặt nguồn. Ảnh rõ, nhìn thẳng là tốt nhất.' },
              { title: 'Tải ảnh cần đổi khuôn mặt', text: 'Thêm ảnh có khuôn mặt cần thay vào ô Ảnh cần đổi khuôn mặt. Tóc, dáng người, trang phục và bối cảnh của ảnh này được giữ trong kết quả.' },
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
              { title: 'Độ phân giải cao', text: 'Ảnh cần đổi khuôn mặt quyết định chất lượng ảnh cuối, nên hãy dùng file nét nhất, lớn nhất bạn có. Muốn kết quả nét hơn nữa, chạy nó qua Tăng độ phân giải.' },
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
              ['Đổi khuôn mặt sang một ảnh khác thế nào?', 'Tải khuôn mặt muốn dùng vào ô Khuôn mặt nguồn và ảnh muốn đổi vào ô Ảnh cần đổi khuôn mặt, rồi bấm Chạy. AI hoà khuôn mặt mới vào ảnh đích và khớp màu da và ánh sáng. Chỉ dùng ảnh công ty có quyền và có sự đồng ý của người trong ảnh.'],
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
    video: 'tutorial-motion-control',
    sections: [
      {
        title: 'Kling Motion Control là gì?',
        blocks: [
          'Điều khiển chuyển động là ứng dụng chép chuyển động từ một video chuyển động lên ảnh nhân vật. Bạn tải một video ngắn có chuyển động và một ảnh nhân vật, và AI, chạy trên Kling V3 Motion Control, trả về video nhân vật của bạn làm đúng các động tác đó.',
          'Ứng dụng giống chuyển video sang video với một khác biệt: chuyển động đến từ một clip, còn người trên màn hình đến từ ảnh của bạn. Bạn có thể thêm prompt tuỳ chọn để lái chuyển động, phong cách hay chuyển máy. Video kết quả dài bằng video chuyển động và không có tiếng; chi phí tính theo số giây của video chuyển động, làm tròn lên, và tính vào ngân sách ảnh và ứng dụng như các ứng dụng khác.',
        ],
      },
      {
        title: 'Dùng Điều khiển chuyển động thế nào',
        lead: 'Tải ảnh nhân vật, tải video chuyển động, thêm mô tả nếu muốn, rồi bấm Chạy.',
        blocks: [
          {
            steps: [
              { title: 'Tải ảnh nhân vật', text: 'Thêm ảnh nhân vật bạn muốn làm động. Ảnh rõ người, thấy cả thân càng tốt.' },
              { title: 'Tải video chuyển động', text: 'Thêm một clip có chuyển động bạn muốn chép: MP4 hoặc MOV, dài 3 đến 30 giây, tối đa 20 MB, có một người làm động tác rõ ràng.' },
              { title: 'Thêm mô tả (tuỳ chọn)', text: 'Tả chuyển động, phong cách hay chuyển máy bạn muốn, hoặc để trống.' },
              { title: 'Chạy', text: 'Bấm Chạy. AI chép chuyển động từ video chuyển động lên nhân vật và trả về video cùng các động tác. Video nằm trong tab Lịch sử và trong Thư viện, mục Ứng dụng.' },
            ],
          },
        ],
      },
      {
        title: 'Chép được những gì',
        lead: 'Chuyển động cơ thể rõ ràng từ video chuyển động, như điệu nhảy, dáng đi và cử chỉ, và prompt có thể thêm chuyển máy.',
        blocks: [
          {
            cards: [
              { title: 'Điệu nhảy và xu hướng', text: 'Điệu nhảy đang thịnh hợp tự nhiên. Chọn clip điệu nhảy làm video chuyển động, và nhân vật của bạn nhảy theo đúng động tác. Một clip dùng lại được với mọi nhân vật bạn tải lên.' },
              { title: 'Dáng đi và catwalk', text: 'Một bước catwalk, một cú xoay cuối sàn diễn hay một bước dạo chậm chuyển từ video chuyển động sang nhân vật. Ảnh người mẫu tĩnh chuyển động như trên sàn diễn, cùng nhịp và dáng như trong clip.' },
              { title: 'Cử chỉ và dáng nói chuyện', text: 'Cử chỉ tay, quay đầu và ngôn ngữ cơ thể của người nói trước máy cũng chép được. Nhân vật có thể chuyển động như người dẫn hay người sáng tạo nội dung, cùng nhịp cử chỉ với người trong video chuyển động.' },
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
              { title: 'Biến ảnh người mẫu mặc sản phẩm thành video mạng xã hội', text: 'Ảnh người mẫu mặc sản phẩm thành video ngắn khi thêm chuyển động từ một clip chuyển động, như một cú xoay hay đổi tư thế. Video sản phẩm dựng từ mô tả thì dùng trang Tạo video.' },
              { title: 'Một clip xu hướng, nhiều nhân vật', text: 'Một clip chuyển động điều khiển được video cho nhiều nhân vật. Chạy cùng xu hướng với nhiều người mẫu để có bộ video cùng động tác. Muốn video thử đồ kiểu người sáng tạo nội dung, dùng Marketing Studio.' },
            ],
          },
          'Chỉ dùng video chuyển động và ảnh nhân vật mà công ty có quyền, và có sự đồng ý của bất kỳ ai có hình ảnh hay màn trình diễn xuất hiện trong đó. Muốn thay người trong ảnh tĩnh thay vì làm động, dùng Đổi nhân vật.',
        ],
      },
      {
        title: 'Mẹo để chép chuyển động sạch',
        lead: 'Một clip chuyển động rõ ràng, một ảnh nhân vật cùng khung và một prompt ngắn.',
        blocks: [
          {
            list: [
              'Một chủ thể rõ trong video chuyển động: một người, thấy rõ từ đầu đến cuối, cho AI một chuyển động để theo. Đám đông hay người chồng lên nhau làm chuyển động khó đọc.',
              'Thấy cả thân cho chuyển động cả thân: muốn nhân vật đi hay nhảy từ đầu đến chân, hãy dùng video chuyển động và ảnh nhân vật đều thấy cả thân.',
              'Khung hình giống nhau: ảnh nhân vật cùng khung với video chuyển động, như toàn thân với toàn thân hay nửa người với nửa người, giữ chuyển động cân đối. Cần ảnh nhân vật mới thì tạo ở trang Tạo ảnh.',
              'Độ dài trong giới hạn: video chuyển động dài 3 đến 30 giây, tối đa 20 MB.',
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
              ['Bản', 'Hợp nhất với', 'Độ dài video chuyển động'],
              ['Kling V3 Motion Control Pro', 'Chuyển động phức tạp, chất lượng cao nhất', '3 đến 30 giây'],
              ['Kling V3 Motion Control Standard', 'Thử nhanh với chi phí thấp hơn', '3 đến 30 giây'],
            ],
          },
          'Tải video chuyển động và nhân vật ở bên cạnh để chép chuyển động bằng Kling V3.',
        ],
      },
      {
        title: 'Câu hỏi thường gặp',
        blocks: [
          {
            faq: [
              ['Kling Motion Control là gì?', 'Là công cụ chép chuyển động từ một video chuyển động lên ảnh nhân vật. Bạn tải một video chuyển động ngắn và một ảnh nhân vật, và AI, chạy trên Kling V3, trả về video nhân vật của bạn làm cùng các động tác.'],
              ['Video chuyển động dài được bao lâu?', 'Từ 3 đến 30 giây, file MP4 hoặc MOV tối đa 20 MB. Chọn clip chứa trọn chuyển động bạn muốn chép, từ bước đầu đến bước cuối.'],
              ['Làm động ảnh tĩnh bằng chuyển động từ video khác được không?', 'Được. Tải ảnh tĩnh làm nhân vật và video kia làm video chuyển động. AI chép chuyển động từ video lên ảnh, nên người trong ảnh chuyển động y như vậy.'],
              ['Làm video nhảy với nhân vật của mình được không?', 'Được. Dùng một clip nhảy làm video chuyển động và ảnh nhân vật của bạn làm nhân vật. Chỉ dùng nhân vật và clip nhảy mà công ty có quyền, và có sự đồng ý của người thật xuất hiện trong đó.'],
              ['Có cần viết mô tả không?', 'Không. Mô tả là tuỳ chọn. Chuyển động đến từ video chuyển động; chỉ thêm một prompt ngắn khi muốn lái chuyển động, phong cách hay chuyển máy.'],
              ['Một lần chạy tốn bao nhiêu?', 'Chi phí tính theo số giây của video chuyển động, làm tròn lên, và tính vào ngân sách ảnh và ứng dụng, tách khỏi ngân sách video. Nút Chạy ghi chi phí ước tính sau khi bạn tải video chuyển động.'],
            ],
          },
        ],
      },
    ],
  },
};
