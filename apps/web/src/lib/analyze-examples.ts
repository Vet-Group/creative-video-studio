// Read-only sample analyses for the /analyze Examples tab: they show a newcomer what a reference-video breakdown looks like
// (Vietnamese display + an English prompt per shot) without running — and spending — a real analysis. Each one is a realistic
// apparel/product seller clip, shaped exactly like a live result (@cvs/core Analysis with its `vi` display translation).
import type { Analysis } from '@cvs/core/analysis/breakdown';

export interface AnalyzeExample {
  /** A short Vietnamese title for the example card. */
  title: string;
  analysis: Analysis;
}

export const ANALYZE_EXAMPLES: AnalyzeExample[] = [
  {
    title: 'Áo thun — giới thiệu sản phẩm',
    analysis: {
      durationS: 12.6,
      shotCount: 3,
      format: 'product showcase',
      hook: 'A model turns to show the full print on a cotton tee.',
      summary: 'A single model presents a graphic cotton t-shirt in a clean studio, turning and stepping closer so the print and fabric read clearly.',
      shots: [
        { index: 1, start: 0, end: 4.2, role: 'hook', prompt: 'A model in a plain studio turns from side to front to reveal the full graphic print on a cotton t-shirt, soft daylight, slow natural motion.' },
        { index: 2, start: 4.2, end: 8.9, role: 'detail', prompt: 'Medium close-up of the chest print and collar, the model adjusting the hem so the fabric texture and stitching are visible.' },
        { index: 3, start: 8.9, end: 12.6, role: 'outro', prompt: 'The model steps back into a relaxed standing pose, full body in frame, holding for a clean end card.' },
      ],
      vi: {
        format: 'Giới thiệu sản phẩm',
        hook: 'Người mẫu xoay người để lộ trọn hình in trên áo thun cotton.',
        summary: 'Một người mẫu giới thiệu áo thun cotton in hình trong phòng chụp sạch sẽ, xoay người và bước lại gần để thấy rõ hình in và chất vải.',
        shots: [
          'Người mẫu trong phòng chụp trơn xoay từ nghiêng sang chính diện để lộ trọn hình in trên áo thun cotton, ánh sáng ban ngày dịu, chuyển động chậm tự nhiên.',
          'Cận cảnh vừa hình in ngực và cổ áo, người mẫu chỉnh gấu áo để thấy rõ kết cấu vải và đường may.',
          'Người mẫu lùi lại tư thế đứng thả lỏng, lấy trọn dáng, giữ khung cho cảnh kết sạch.',
        ],
      },
    },
  },
  {
    title: 'Ốp lưng điện thoại — demo tính năng',
    analysis: {
      durationS: 9.4,
      shotCount: 3,
      format: 'product demo',
      hook: 'Two hands snap a phone case on and flex it to show the grip.',
      summary: 'A pair of hands demonstrates a protective phone case over a neutral table: fitting it to the phone, flexing the edges, and standing it upright to show the kickstand.',
      shots: [
        { index: 1, start: 0, end: 3.1, role: 'hook', prompt: 'Top-down of two hands snapping a textured phone case onto a phone on a neutral table, crisp even light, quick confident motion.' },
        { index: 2, start: 3.1, end: 6.4, role: 'detail', prompt: 'Close-up of fingers flexing the case edges and pressing the raised camera lip to show the grip and shock-absorbing corners.' },
        { index: 3, start: 6.4, end: 9.4, role: 'outro', prompt: 'The cased phone is stood upright on its built-in kickstand, slow push-in to the logo for a clean end frame.' },
      ],
      vi: {
        format: 'Demo sản phẩm',
        hook: 'Hai bàn tay lắp ốp vào điện thoại rồi bẻ nhẹ để khoe độ bám.',
        summary: 'Một đôi tay trình diễn ốp lưng bảo vệ trên mặt bàn trung tính: lắp vào máy, bẻ cạnh ốp và dựng máy lên để khoe chân chống.',
        shots: [
          'Góc từ trên xuống, hai tay lắp ốp lưng có vân vào điện thoại trên bàn trung tính, ánh sáng đều và sắc, thao tác nhanh dứt khoát.',
          'Cận cảnh ngón tay bẻ cạnh ốp và ấn gờ cao quanh camera để khoe độ bám và góc chống sốc.',
          'Điện thoại đã lắp ốp dựng đứng bằng chân chống tích hợp, đẩy máy chậm vào logo cho khung kết sạch.',
        ],
      },
    },
  },
];
