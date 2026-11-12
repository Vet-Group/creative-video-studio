// Read-only sample analyses for the /analyze Examples tab: a real sample clip next to the breakdown rea-video made of it (each result is
// the stored `result` of a real analysis, with its `vi` Vietnamese reading), so a newcomer sees what a run gives without spending one.
import type { Analysis } from '@cvs/core/analysis/breakdown';

export interface AnalyzeExample {
  /** A short Vietnamese title for the example card. */
  title: string;
  /** The sample clip's name: /api/samples/<video> streams it, the same name with .jpg is its poster, and POST /api/assets/samples copies it. */
  video: string;
  analysis: Analysis;
}

export const ANALYZE_EXAMPLES: AnalyzeExample[] = [
  {
    title: 'Người mẫu xem trang phục',
    video: 'example-12.mp4',
    analysis: {
      hook: 'The opening frame immediately displays the full head-to-toe casual outfit, letting viewers see the complete look at a glance to attract shoppers looking for everyday outfit ideas.',
      shots: [
        {
          end: 2.708,
          role: 'context',
          index: 1,
          start: 0,
          prompt: 'Model stands facing forward, displaying the full front view of the complete outfit from head to toe.'
        },
        {
          end: 8.042,
          role: 'proof',
          index: 2,
          start: 2.708,
          prompt: 'Camera zooms in, model slowly rotates 360 degrees to show front, side, back, and opposite side views of the clothing details and fit.'
        }
      ],
      format: 'product display',
      summary: 'A fashion model slowly rotates in a plain white studio to showcase all angles of a casual ringer t-shirt and high-waisted black jeans outfit.',
      durationS: 8.042,
      shotCount: 2,
      vi: {
        format: 'trưng bày sản phẩm',
        hook: 'Khung hình mở đầu lập tức hiển thị trọn bộ trang phục thường ngày từ đầu đến chân, giúp người xem thấy toàn bộ diện mạo chỉ trong nháy mắt và thu hút những người đang tìm ý tưởng phối đồ hằng ngày.',
        summary: 'Người mẫu thời trang từ từ xoay người trong studio trắng trơn để giới thiệu mọi góc của bộ trang phục gồm áo thun ringer và quần jeans đen cạp cao.',
        shots: [
          'Người mẫu đứng hướng mặt về phía trước, khoe toàn bộ trang phục từ đầu đến chân ở góc chính diện.',
          'Máy quay phóng to, người mẫu từ từ xoay 360 độ để cho thấy mặt trước, hai bên, mặt sau và góc bên còn lại, làm nổi bật các chi tiết và độ vừa vặn của trang phục.'
        ]
      }
    },
  },
  {
    title: 'Áo crop top Y2K',
    video: 'example-17.mp4',
    analysis: {
      hook: 'The opening immediately shows the stationary top begin to float and spin within the first 3 seconds, using unexpected movement of an inanimate object to grab viewer attention.',
      shots: [
        {
          end: 1.167,
          role: 'hook',
          index: 1,
          start: 0,
          prompt: 'The camera pans over the top laid flat on a concrete surface, then zooms in to highlight the chest X-07 logo detail.'
        },
        {
          end: 2.333,
          role: 'hook',
          index: 2,
          start: 1.167,
          prompt: 'The camera pans over the top laid flat on a concrete surface, then zooms in to highlight the chest X-07 logo detail.'
        },
        {
          end: 4,
          role: 'proof',
          index: 3,
          start: 2.333,
          prompt: 'The top lifts off the ground, spins and floats through the air to show its full silhouette, cut and side panel details from all angles.'
        },
        {
          end: 4.75,
          role: 'proof',
          index: 4,
          start: 4,
          prompt: 'The top lifts off the ground, spins and floats through the air to show its full silhouette, cut and side panel details from all angles.'
        },
        {
          end: 6.417,
          role: 'proof',
          index: 5,
          start: 4.75,
          prompt: 'The top lifts off the ground, spins and floats through the air to show its full silhouette, cut and side panel details from all angles.'
        },
        {
          end: 8.042,
          role: 'payoff',
          index: 6,
          start: 6.417,
          prompt: 'The top lands gently on a reflective metallic table, surrounded by coordinated futuristic silver accessories to show the full styling look.'
        }
      ],
      format: 'product showcase',
      summary: 'A dynamic 3D animated showcase of a futuristic cyberpunk-style cropped long-sleeve athletic top, demonstrating its design from multiple angles before landing on a metallic display table surrounded by matching silver accessories.',
      durationS: 8.042,
      shotCount: 6,
      vi: {
        format: 'trưng bày sản phẩm',
        hook: 'Ngay phần mở đầu, chiếc áo đang nằm yên bắt đầu bay lên và xoay trong 3 giây đầu tiên, dùng chuyển động bất ngờ của một vật vô tri để thu hút sự chú ý của người xem.',
        summary: 'Video hoạt họa 3D sống động giới thiệu chiếc áo thể thao dài tay dáng lửng phong cách cyberpunk tương lai, trình bày thiết kế từ nhiều góc độ trước khi đáp xuống bàn trưng bày bằng kim loại, xung quanh là các phụ kiện bạc đồng bộ.',
        shots: [
          'Máy quay lia qua chiếc áo được trải phẳng trên bề mặt bê tông, sau đó phóng to để làm nổi bật chi tiết logo X-07 trên ngực.',
          'Máy quay lia qua chiếc áo được trải phẳng trên bề mặt bê tông, sau đó phóng to để làm nổi bật chi tiết logo X-07 trên ngực.',
          'Chiếc áo nhấc khỏi mặt đất, xoay và lơ lửng trong không trung, cho thấy toàn bộ phom dáng, đường cắt và các chi tiết mảng bên từ mọi góc độ.',
          'Chiếc áo nhấc khỏi mặt đất, xoay và lơ lửng trong không trung, cho thấy toàn bộ phom dáng, đường cắt và các chi tiết mảng bên từ mọi góc độ.',
          'Chiếc áo nhấc khỏi mặt đất, xoay và lơ lửng trong không trung, cho thấy toàn bộ phom dáng, đường cắt và các chi tiết mảng bên từ mọi góc độ.',
          'Chiếc áo nhẹ nhàng đáp xuống chiếc bàn kim loại phản chiếu, xung quanh là các phụ kiện bạc phong cách tương lai đồng bộ, tạo nên tổng thể phối đồ hoàn chỉnh.'
        ]
      }
    },
  },
  {
    title: 'Clip UGC trong căn hộ',
    video: 'example-23.mp4',
    analysis: {
      hook: 'Opens immediately with the creator holding the jacket, speaking directly to camera with excited, expressive body language to grab viewer attention.',
      shots: [
        {
          end: 6.042,
          role: 'info',
          index: 1,
          start: 0,
          prompt: 'The creator holds up the fur jacket, talks about its design and quality, then flips it to show the smooth inner lining and runs her hand over the fur to demonstrate softness.'
        }
      ],
      format: '商品展示',
      summary: 'A female content creator enthusiastically showcases a cropped black fur jacket to her phone camera, demonstrating its soft texture and inner lining in a bright apartment.',
      durationS: 6.042,
      shotCount: 1,
      vi: {
        format: 'Trưng bày sản phẩm',
        hook: 'Mở đầu ngay với cảnh người sáng tạo cầm chiếc áo khoác, nói trực tiếp với máy quay bằng ngôn ngữ cơ thể hào hứng, biểu cảm để thu hút sự chú ý của người xem.',
        summary: 'Một nữ nhà sáng tạo nội dung hào hứng giới thiệu chiếc áo khoác lông màu đen dáng ngắn trước camera điện thoại, cho thấy chất lông mềm mại và lớp lót bên trong trong một căn hộ sáng sủa.',
        shots: [
          'Người sáng tạo cầm chiếc áo khoác lông, nói về thiết kế và chất lượng, sau đó lật áo để cho thấy lớp lót bên trong mịn màng và vuốt tay lên lớp lông để minh họa độ mềm mại.'
        ]
      }
    },
  },
];
