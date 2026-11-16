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
          point: 'Model stands facing forward, displaying the full front view of the complete outfit from head to toe.',
          prompt: 'Medium full-body shot at eye level, smoothly pushing in slightly as the model adjusts her posture. She stands centered in the vertical frame, facing forward and presenting the complete outfit from head to toe, then settles into a relaxed, upright pose. Bright, even studio lighting illuminates the model against a clean white studio background. Use a simple, realistic fashion-product presentation with balanced framing and a calm pace.'
        },
        {
          end: 8.042,
          role: 'proof',
          index: 2,
          start: 2.708,
          point: 'Camera zooms in, model slowly rotates 360 degrees to show front, side, back, and opposite side views of the clothing details and fit.',
          prompt: 'Medium shot at eye level, smoothly pushing closer toward the model’s upper body and waist as she rotates slowly in place. Centered in the vertical frame, she turns from the front through a side view to the back, continues through the opposite side, and finishes in a side-profile pose, displaying the product’s fit from each angle. Use cool studio lighting with a bright white background and a softly blurred, clean setting. Keep the presentation realistic, minimal, and steady.'
        }
      ],
      format: 'product display',
      summary: 'A fashion model slowly rotates in a plain white studio to showcase all angles of a casual ringer t-shirt and high-waisted black jeans outfit.',
      durationS: 8.042,
      shotCount: 2,
      vi: {
        format: 'trưng bày sản phẩm',
        hook: 'Khung hình mở đầu lập tức hiển thị trọn bộ trang phục thường ngày từ đầu đến chân, giúp người xem nhìn thoáng qua là thấy toàn bộ diện mạo, thu hút những người mua đang tìm ý tưởng phối đồ hằng ngày.',
        summary: 'Người mẫu thời trang từ từ xoay người trong studio trắng trơn để giới thiệu mọi góc nhìn của bộ trang phục gồm áo thun cổ viền và quần jeans đen cạp cao.',
        shots: [
          'Cảnh trung toàn thân ngang tầm mắt, máy quay từ từ tiến gần một chút khi người mẫu điều chỉnh tư thế. Cô đứng chính giữa khung hình dọc, hướng mặt về phía trước và giới thiệu trọn bộ trang phục từ đầu đến chân, sau đó giữ tư thế đứng thẳng thoải mái. Ánh sáng studio sáng và đồng đều chiếu lên người mẫu trên nền studio trắng sạch. Trình bày sản phẩm thời trang đơn giản, chân thực, với bố cục cân đối và nhịp độ nhẹ nhàng.',
          'Cảnh trung ngang tầm mắt, máy quay từ từ tiến gần phần thân trên và eo của người mẫu khi cô chậm rãi xoay tại chỗ. Đứng giữa khung hình dọc, cô xoay từ phía trước qua góc nghiêng đến phía sau, tiếp tục xoay qua phía đối diện và kết thúc ở tư thế nghiêng, cho thấy độ vừa vặn của sản phẩm từ mọi góc nhìn. Dùng ánh sáng studio tông lạnh, nền trắng sáng và không gian sạch sẽ được làm mờ nhẹ. Giữ cách trình bày chân thực, tối giản và ổn định.'
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
          point: 'The camera pans over the top laid flat on a concrete surface, then zooms in to highlight the chest X-07 logo detail.',
          prompt: 'Medium close-up from a directly overhead angle. Begin with a slow planar push-in across the product laid flat, then continue with a smooth downward pan over its surface. Keep the product near the center of the vertical frame, with a small industrial detail at the upper right. Reveal the overall cut first, then move across the chest area and down the fabric to show construction and material texture, ending on a close view of the lower section. Use cool, directional industrial lighting with defined floor shadows, a rough concrete setting, and a realistic, subdued product-photography style.'
        },
        {
          end: 2.333,
          role: 'hook',
          index: 2,
          start: 1.167,
          point: 'The camera pans over the top laid flat on a concrete surface, then zooms in to highlight the chest X-07 logo detail.',
          prompt: 'Medium close-up from a directly overhead angle. Begin with a slow planar push-in across the product laid flat, then continue with a smooth downward pan over its surface. Keep the product near the center of the vertical frame, with a small industrial detail at the upper right. Reveal the overall cut first, then move across the chest area and down the fabric to show construction and material texture, ending on a close view of the lower section. Use cool, directional industrial lighting with defined floor shadows, a rough concrete setting, and a realistic, subdued product-photography style.'
        },
        {
          end: 4,
          role: 'proof',
          index: 3,
          start: 2.333,
          point: 'The top lifts off the ground, spins and floats through the air to show its full silhouette, cut and side panel details from all angles.',
          prompt: 'Medium close-up from a slightly elevated angle, followed by a level close-up of the neckline. Slowly dolly in as the product rises from the floor with its sleeves spreading outward; cut to a gentle push toward the collar, then continue with a slow forward move as accessories fly in and gather around the product. Keep the product centered, unfolding naturally before it and the accessories descend onto a table and settle into a complete display. Use cool side lighting, soft highlights on metal, an industrial setting, and a photorealistic 3D style with smooth slow-motion movement.'
        },
        {
          end: 4.75,
          role: 'proof',
          index: 4,
          start: 4,
          point: 'The top lifts off the ground, spins and floats through the air to show its full silhouette, cut and side panel details from all angles.',
          prompt: 'Medium close-up from a slightly elevated angle, followed by a level close-up of the neckline. Slowly dolly in as the product rises from the floor with its sleeves spreading outward; cut to a gentle push toward the collar, then continue with a slow forward move as accessories fly in and gather around the product. Keep the product centered, unfolding naturally before it and the accessories descend onto a table and settle into a complete display. Use cool side lighting, soft highlights on metal, an industrial setting, and a photorealistic 3D style with smooth slow-motion movement.'
        },
        {
          end: 6.417,
          role: 'proof',
          index: 5,
          start: 4.75,
          point: 'The top lifts off the ground, spins and floats through the air to show its full silhouette, cut and side panel details from all angles.',
          prompt: 'Medium close-up from a slightly elevated angle, followed by a level close-up of the neckline. Slowly dolly in as the product rises from the floor with its sleeves spreading outward; cut to a gentle push toward the collar, then continue with a slow forward move as accessories fly in and gather around the product. Keep the product centered, unfolding naturally before it and the accessories descend onto a table and settle into a complete display. Use cool side lighting, soft highlights on metal, an industrial setting, and a photorealistic 3D style with smooth slow-motion movement.'
        },
        {
          end: 8.042,
          role: 'payoff',
          index: 6,
          start: 6.417,
          point: 'The top lands gently on a reflective metallic table, surrounded by coordinated futuristic silver accessories to show the full styling look.',
          prompt: 'Medium shot from a slightly elevated angle. Make a smooth, steady dolly-in toward the product. Place the product centrally, with coordinated accessories arranged around it in the frame. Let the product and accessories float and rotate slowly, then finish with the product resting gently on a reflective metallic table, surrounded by the accessories in a composed styling display. Use cool, soft window-like light with gentle shadows and subtle reflections, a clean industrial tabletop setting, and a polished, photorealistic 3D product-showcase style.'
        }
      ],
      format: 'product showcase',
      summary: 'A dynamic 3D animated showcase of a futuristic cyberpunk-style cropped long-sleeve athletic top, demonstrating its design from multiple angles before landing on a metallic display table surrounded by matching silver accessories.',
      durationS: 8.042,
      shotCount: 6,
      vi: {
        format: 'giới thiệu sản phẩm',
        hook: 'Ngay phần mở đầu, chiếc áo đang nằm yên bắt đầu lơ lửng và xoay trong 3 giây đầu tiên, dùng chuyển động bất ngờ của một vật vô tri để thu hút sự chú ý của người xem.',
        summary: 'Video giới thiệu sản phẩm bằng hoạt ảnh 3D sống động về một chiếc áo thể thao dài tay dáng lửng, phong cách cyberpunk tương lai. Video trình bày thiết kế từ nhiều góc độ trước khi chiếc áo đáp xuống bàn trưng bày bằng kim loại, xung quanh là các phụ kiện bạc đồng bộ.',
        shots: [
          'Cận cảnh trung bình từ góc nhìn thẳng từ trên xuống. Bắt đầu bằng cú máy tiến chậm theo mặt phẳng qua sản phẩm được đặt phẳng, sau đó tiếp tục lia máy mượt mà xuống bề mặt áo. Giữ sản phẩm gần giữa khung hình dọc, với một chi tiết công nghiệp nhỏ ở góc trên bên phải. Trước tiên cho thấy phom dáng tổng thể, rồi di chuyển qua vùng ngực và xuống phần vải để làm nổi bật cấu trúc và chất liệu, kết thúc bằng cận cảnh phần dưới. Dùng ánh sáng công nghiệp lạnh, chiếu có hướng với bóng đổ rõ trên sàn, bối cảnh bê tông thô và phong cách chụp sản phẩm chân thực, tiết chế.',
          'Cận cảnh trung bình từ góc nhìn thẳng từ trên xuống. Bắt đầu bằng cú máy tiến chậm theo mặt phẳng qua sản phẩm được đặt phẳng, sau đó tiếp tục lia máy mượt mà xuống bề mặt áo. Giữ sản phẩm gần giữa khung hình dọc, với một chi tiết công nghiệp nhỏ ở góc trên bên phải. Trước tiên cho thấy phom dáng tổng thể, rồi di chuyển qua vùng ngực và xuống phần vải để làm nổi bật cấu trúc và chất liệu, kết thúc bằng cận cảnh phần dưới. Dùng ánh sáng công nghiệp lạnh, chiếu có hướng với bóng đổ rõ trên sàn, bối cảnh bê tông thô và phong cách chụp sản phẩm chân thực, tiết chế.',
          'Cận cảnh trung bình từ góc hơi cao, sau đó chuyển sang cận cảnh ngang tầm phần cổ áo. Từ từ tiến máy khi sản phẩm rời khỏi sàn, hai tay áo xòe ra; cắt sang cú máy nhẹ nhàng tiến về cổ áo, rồi tiếp tục di chuyển chậm về phía trước khi các phụ kiện bay vào và tụ lại quanh sản phẩm. Giữ sản phẩm ở giữa khung hình, để áo mở ra tự nhiên trước khi áo và phụ kiện hạ xuống bàn, ổn định thành một bố cục trưng bày hoàn chỉnh. Dùng ánh sáng lạnh chiếu từ bên hông, điểm sáng dịu trên kim loại, bối cảnh công nghiệp và phong cách 3D chân thực như ảnh chụp, với chuyển động chậm mượt mà.',
          'Cận cảnh trung bình từ góc hơi cao, sau đó chuyển sang cận cảnh ngang tầm phần cổ áo. Từ từ tiến máy khi sản phẩm rời khỏi sàn, hai tay áo xòe ra; cắt sang cú máy nhẹ nhàng tiến về cổ áo, rồi tiếp tục di chuyển chậm về phía trước khi các phụ kiện bay vào và tụ lại quanh sản phẩm. Giữ sản phẩm ở giữa khung hình, để áo mở ra tự nhiên trước khi áo và phụ kiện hạ xuống bàn, ổn định thành một bố cục trưng bày hoàn chỉnh. Dùng ánh sáng lạnh chiếu từ bên hông, điểm sáng dịu trên kim loại, bối cảnh công nghiệp và phong cách 3D chân thực như ảnh chụp, với chuyển động chậm mượt mà.',
          'Cận cảnh trung bình từ góc hơi cao, sau đó chuyển sang cận cảnh ngang tầm phần cổ áo. Từ từ tiến máy khi sản phẩm rời khỏi sàn, hai tay áo xòe ra; cắt sang cú máy nhẹ nhàng tiến về cổ áo, rồi tiếp tục di chuyển chậm về phía trước khi các phụ kiện bay vào và tụ lại quanh sản phẩm. Giữ sản phẩm ở giữa khung hình, để áo mở ra tự nhiên trước khi áo và phụ kiện hạ xuống bàn, ổn định thành một bố cục trưng bày hoàn chỉnh. Dùng ánh sáng lạnh chiếu từ bên hông, điểm sáng dịu trên kim loại, bối cảnh công nghiệp và phong cách 3D chân thực như ảnh chụp, với chuyển động chậm mượt mà.',
          'Cảnh trung từ góc hơi cao. Tiến máy mượt mà, ổn định về phía sản phẩm. Đặt sản phẩm ở giữa, các phụ kiện đồng bộ được sắp xếp xung quanh trong khung hình. Để sản phẩm và phụ kiện lơ lửng, xoay chậm, rồi kết thúc khi sản phẩm nhẹ nhàng nằm trên bàn kim loại phản chiếu, xung quanh là các phụ kiện được bố trí thành một màn trưng bày hài hòa. Dùng ánh sáng lạnh, dịu như ánh sáng từ cửa sổ, bóng đổ nhẹ và phản chiếu tinh tế; bối cảnh mặt bàn công nghiệp gọn gàng và phong cách giới thiệu sản phẩm 3D trau chuốt, chân thực như ảnh chụp.'
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
          point: 'The creator holds up the fur jacket, talks about its design and quality, then flips it to show the smooth inner lining and runs her hand over the fur to demonstrate softness.',
          prompt: 'Medium close-up at eye level in a vertical selfie composition. Keep the camera fixed as the model moves naturally. She stands centred in frame, holding the product at chest height. She presents it to the camera, turns it to reveal the inner lining, runs her hand over the fabric to demonstrate its softness, then rests her hand on the lining and smiles at the camera. Use soft, bright frontal daylight with gentle shadows. Set the scene in a modern apartment living room with a softly blurred background. Create a natural, warm, realistic everyday fashion-vlog look.'
        }
      ],
      format: '商品展示',
      summary: 'A female content creator enthusiastically showcases a cropped black fur jacket to her phone camera, demonstrating its soft texture and inner lining in a bright apartment.',
      durationS: 6.042,
      shotCount: 1,
      vi: {
        format: 'Trình diễn sản phẩm',
        hook: 'Mở đầu ngay với cảnh nhà sáng tạo cầm chiếc áo khoác, nói trực tiếp với máy quay bằng ngôn ngữ cơ thể hào hứng, biểu cảm để thu hút sự chú ý của người xem.',
        summary: 'Một nhà sáng tạo nội dung nữ hào hứng giới thiệu chiếc áo khoác lông màu đen dáng lửng trước camera điện thoại, cho thấy chất liệu mềm mại và lớp lót bên trong trong một căn hộ sáng sủa.',
        shots: [
          'Cảnh cận trung ở tầm mắt, bố cục selfie dọc. Giữ máy quay cố định khi người mẫu di chuyển tự nhiên. Cô đứng giữa khung hình, cầm sản phẩm ngang ngực. Cô đưa sản phẩm ra trước máy quay, xoay để lộ lớp lót bên trong, vuốt tay trên vải để thể hiện độ mềm mại, sau đó đặt tay lên lớp lót và mỉm cười với máy quay. Dùng ánh sáng ban ngày dịu, sáng chiếu từ phía trước với bóng đổ nhẹ. Bối cảnh là phòng khách trong một căn hộ hiện đại, hậu cảnh làm mờ nhẹ. Tạo cảm giác tự nhiên, ấm áp, chân thực như vlog thời trang đời thường.'
        ]
      }
    },
  },
];
