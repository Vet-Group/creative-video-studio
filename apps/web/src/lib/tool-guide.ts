// Which creative tool to use when: one entry per creative-group page, shown in the sidebar, the guide dialog, each page's hint strip and Explore.
// Facts follow the About pages (about-content.ts) and the app list (apps.ts); prices are left to the Run buttons, which show the estimate.
import type { IconName } from '@/components/Icon';

export type ToolHref = '/try-on' | '/image-generation' | '/create' | '/analyze' | '/marketing-studio' | '/apps';

export interface ToolGuide {
  href: ToolHref;
  title: string;
  icon: IconName;
  /** The sidebar and Explore line: what it makes, from what. */
  oneLine: string;
  /** The hint strip's words on the page itself. */
  useIf: string;
  have: string;
  get: string;
  useWhen: string[];
  /** When another tool fits better, with where to go. */
  notWhen: { text: string; href: string; go: string }[];
  example: { have: string; get: string };
  wait: string;
}

export const TOOL_GUIDE: ToolGuide[] = [
  {
    href: '/try-on',
    title: 'Thử đồ',
    icon: 'tryon',
    oneLine: 'Mặc quần áo của bạn lên người mẫu: ảnh trải phẳng hay ma-nơ-canh thành ảnh người mẫu mặc thật.',
    useIf: 'Bạn có ảnh quần áo chưa có người mặc và cần ảnh người mẫu mặc đúng món đó.',
    have: '1–5 ảnh trang phục (trải phẳng, ma-nơ-canh hay người mặc) và 1 ảnh người mẫu hoặc người mẫu có sẵn; ảnh bối cảnh tuỳ chọn.',
    get: 'Ảnh người mẫu mặc đúng trang phục, giữ màu, hoạ tiết và chữ in.',
    useWhen: [
      'Hàng mới về chỉ có ảnh trải phẳng, cần ảnh người mẫu cho trang sản phẩm.',
      'Cần cùng một bộ đồ trên nhiều người mẫu, dáng người hay độ tuổi khác nhau.',
      'Phối cả bộ: áo, quần, giày trong một lần chạy.',
    ],
    notWhen: [
      { text: 'Cần ảnh lifestyle hay ảnh chiến dịch ở bối cảnh mới, không cần giữ đúng từng chi tiết áo', href: '/image-generation', go: 'Tạo ảnh' },
      { text: 'Thử trang sức', href: '/apps/jewelry-try-on', go: 'Thử trang sức' },
      { text: 'Thử đồ lót, ren, lưới, satin', href: '/apps/lingerie-try-on', go: 'Thử đồ lót' },
      { text: 'Đã có ảnh người mẫu, chỉ muốn đổi người hoặc đổi nền', href: '/apps', go: 'Ứng dụng' },
    ],
    example: { have: 'Ảnh áo sơ mi trải phẳng trên nền trắng và ảnh một người mẫu đứng thẳng.', get: 'Ảnh người mẫu đó mặc chiếc sơ mi, đăng được lên trang sản phẩm.' },
    wait: 'Thường dưới một phút.',
  },
  {
    href: '/image-generation',
    title: 'Tạo ảnh',
    icon: 'image',
    oneLine: 'Ảnh mới từ một câu mô tả, có hoặc không có ảnh gốc: bối cảnh, tư thế, ánh sáng hay không khí khác.',
    useIf: 'Bạn muốn một ảnh mới theo mô tả: cảnh khác, góc khác, nhiều biến thể của một ảnh, hay một ảnh từ ý tưởng.',
    have: 'Một câu mô tả, kèm 1 hoặc nhiều ảnh (sản phẩm, người mẫu, kết quả trước đó); vài mô hình tạo được ảnh chỉ từ câu mô tả.',
    get: 'Ảnh mới theo mô tả: ảnh lifestyle, ảnh chiến dịch, biến thể để thử A/B.',
    useWhen: [
      'Cần ảnh lifestyle, ảnh mùa hay ảnh chiến dịch mà không đi chụp.',
      'Một ảnh sản phẩm cần hàng chục biến thể bối cảnh để thử cái nào bán được.',
      'Chuẩn bị ảnh mở đầu thật đẹp trước khi làm video ở Tạo video.',
    ],
    notWhen: [
      { text: 'Phải mặc đúng một món quần áo lên người mẫu', href: '/try-on', go: 'Thử đồ' },
      { text: 'Chỉ cần một việc: xoá nền, đổi tỉ lệ, làm nét, đổi khuôn mặt', href: '/apps', go: 'Ứng dụng' },
      { text: 'Cần ảnh chuyển động thành clip', href: '/create', go: 'Tạo video' },
    ],
    example: { have: 'Ảnh túi xách trên nền trắng và câu “đặt trên bàn đá cẩm thạch, nắng sớm qua cửa sổ”.', get: 'Ảnh túi xách trong cảnh đó, cùng màu và dáng túi.' },
    wait: 'Thường dưới một phút.',
  },
  {
    href: '/create',
    title: 'Tạo video',
    icon: 'create',
    oneLine: 'Làm ảnh chuyển động: một ảnh sản phẩm hay người mẫu thành clip ngắn, tới 30 giây tuỳ mô hình.',
    useIf: 'Bạn đã có ảnh đẹp và muốn nó chuyển động: người mẫu xoay, vải bay, máy quay tiến lại gần.',
    have: '1 ảnh mở đầu (mô hình tham chiếu nhận tới 9 ảnh) và một mẫu chuyển động có sẵn hoặc câu mô tả chuyển động.',
    get: 'Clip ngắn cho trang sản phẩm, Reels, TikTok hay quảng cáo, theo tỉ lệ và thời lượng bạn chọn.',
    useWhen: [
      'Trang sản phẩm cần video mà chỉ có ảnh tĩnh.',
      'Cần nhiều clip chuyển động khác nhau từ cùng một ảnh cho quảng cáo.',
      'Dựng một cảnh từ người mẫu, sản phẩm và bối cảnh riêng (mô hình tham chiếu).',
    ],
    notWhen: [
      { text: 'Cần quảng cáo kiểu người thật cầm điện thoại giới thiệu, có hook và lời thoại', href: '/marketing-studio', go: 'Marketing Studio' },
      { text: 'Ảnh mở đầu chưa đẹp hay sai bối cảnh: sửa ảnh trước', href: '/image-generation', go: 'Tạo ảnh' },
      { text: 'Muốn chép đúng một chuyển động từ video có sẵn', href: '/apps/motion-control', go: 'Điều khiển chuyển động' },
    ],
    example: { have: 'Ảnh người mẫu mặc váy và mẫu chuyển động “Lia vòng ra sau lưng”.', get: 'Clip 5 giây dọc 9:16, máy quay lia vòng ra sau lưng người mẫu, váy khẽ bay.' },
    wait: 'Thường vài phút, tuỳ mô hình và thời lượng.',
  },
  {
    href: '/marketing-studio',
    title: 'Marketing Studio',
    icon: 'megaphone',
    oneLine: 'Video quảng cáo kiểu người sáng tạo nội dung: một người mẫu và một sản phẩm thành clip UGC cho TikTok, Reels.',
    useIf: 'Bạn cần video quảng cáo trông như người thật quay điện thoại giới thiệu sản phẩm.',
    have: 'UGC Thử đồ: 1 ảnh người mẫu và 1 ảnh sản phẩm. Editorial: brief, tối đa 7 ảnh, hook, bối cảnh và lời thoại của bạn.',
    get: 'Clip kiểu quay cầm tay, mặc định dọc 9:16 cho Reels, TikTok và Stories (có cả 16:9 và 1:1).',
    useWhen: [
      'Chạy quảng cáo mạng xã hội cần cảm giác chân thực, như lời giới thiệu của khách.',
      'Thử nhiều cách mở đầu (hook) và bối cảnh cho cùng một sản phẩm.',
      'Cần nhân vật nói đúng lời thoại bạn viết (định dạng Editorial).',
    ],
    notWhen: [
      { text: 'Chỉ cần sản phẩm chuyển động đẹp, không cần người giới thiệu', href: '/create', go: 'Tạo video' },
      { text: 'Cần ảnh người mẫu mặc quần áo, không cần video', href: '/try-on', go: 'Thử đồ' },
      { text: 'Cần ảnh quảng cáo cho sản phẩm khác quần áo', href: '/image-generation', go: 'Tạo ảnh' },
    ],
    example: { have: 'Ảnh một cô gái và ảnh chiếc áo khoác.', get: 'Clip cô gái mặc áo khoác, quay selfie khoe áo như một bài đăng TikTok.' },
    wait: 'Thường vài phút.',
  },
  {
    href: '/apps',
    title: 'Ứng dụng',
    icon: 'apps',
    oneLine: 'Công cụ một việc: xoá hay đổi nền, đổi khung hình, làm nét, đổi người mẫu hay khuôn mặt, thử trang sức, đồ lót, chép chuyển động, nén ảnh.',
    useIf: 'Bạn đã có ảnh gần đúng và chỉ cần làm một việc cụ thể với nó.',
    have: 'Ảnh cần sửa (với Điều khiển chuyển động: một ảnh nhân vật và một video chuyển động).',
    get: 'Kết quả của đúng việc bạn chọn: thường là cùng ảnh đã sửa một chỗ; Điều khiển chuyển động trả về video.',
    useWhen: [
      'Chuẩn bị ảnh đăng sàn: xoá nền, đổi tỉ lệ 1:1, nén nhẹ (Tối ưu media miễn phí).',
      'Ảnh đẹp nhưng nhỏ: tăng độ phân giải lên tới 4K.',
      'Giữ trang phục và bối cảnh, chỉ đổi người mẫu, khuôn mặt hay nền.',
      'Thử trang sức hay đồ lót, những loại cần giữ chi tiết riêng.',
    ],
    notWhen: [
      { text: 'Cần một ảnh mới hoàn toàn theo mô tả', href: '/image-generation', go: 'Tạo ảnh' },
      { text: 'Mặc quần áo từ ảnh trải phẳng lên người mẫu', href: '/try-on', go: 'Thử đồ' },
    ],
    example: { have: 'Ảnh sản phẩm 3:4 đang dùng trên web.', get: 'Bản 1:1 cho sàn thương mại điện tử, AI vẽ thêm phần nền hai bên (Đổi khung hình).' },
    wait: 'Ứng dụng ảnh thường dưới một phút; Điều khiển chuyển động vài phút; Tối ưu media chạy ngay trên máy.',
  },
];

/** "I have ... and need ..." answers, in the order people usually ask: the guide's and Explore's first question. */
export const TOOL_GOALS: { need: string; href: string; go: string }[] = [
  { need: 'Có ảnh quần áo, cần ảnh người mẫu mặc nó', href: '/try-on', go: 'Thử đồ' },
  { need: 'Có ảnh sản phẩm, cần ảnh ở bối cảnh mới', href: '/image-generation', go: 'Tạo ảnh' },
  { need: 'Có ảnh đẹp, cần nó chuyển động thành clip', href: '/create', go: 'Tạo video' },
  { need: 'Cần video quảng cáo kiểu người thật giới thiệu', href: '/marketing-studio', go: 'Marketing Studio' },
  { need: 'Ảnh gần xong, chỉ cần xoá nền, đổi tỉ lệ hay làm nét', href: '/apps', go: 'Ứng dụng' },
  { need: 'Thử trang sức lên người mẫu', href: '/apps/jewelry-try-on', go: 'Thử trang sức' },
];

// The reference-video analysis tool (rea-video), shown in the guide only when REA_ANALYZE_ENABLED is on. Kept out of the
// static TOOL_GUIDE/TOOL_GOALS above so the sidebar-mirror test stays exact for the flag-off default (tool-guide.test.ts).
export const ANALYZE_TOOL: ToolGuide = {
  href: '/analyze',
  title: 'Phân tích',
  icon: 'chart',
  oneLine: 'Rã một video tham chiếu thành cảnh, định dạng, câu mở đầu và prompt tiếng Anh cho từng cảnh để dựng lại.',
  useIf: 'Bạn có một video mẫu và muốn hiểu cách nó được dựng để làm một clip tương tự.',
  have: '1 video MP4 hoặc MOV (tải lên hoặc chọn từ Lịch sử).',
  get: 'Danh sách cảnh kèm thời lượng, định dạng và câu mở đầu, mỗi cảnh một prompt tiếng Anh; bấm một prompt để dựng ở Tạo video.',
  useWhen: [
    'Thấy một quảng cáo hay clip đối thủ đẹp và muốn biết nó gồm những cảnh nào.',
    'Cần ý tưởng kịch bản và prompt sẵn để bắt đầu dựng một video tương tự.',
    'Muốn tách một video dài thành từng cảnh để tái sử dụng.',
  ],
  notWhen: [
    { text: 'Muốn chép đúng một chuyển động từ video có sẵn', href: '/apps/motion-control', go: 'Điều khiển chuyển động' },
    { text: 'Đã biết muốn gì, chỉ cần dựng clip', href: '/create', go: 'Tạo video' },
    { text: 'Cần video quảng cáo kiểu người thật giới thiệu', href: '/marketing-studio', go: 'Marketing Studio' },
  ],
  example: { have: 'Một clip quảng cáo áo thun 10 giây.', get: 'Ba cảnh: cận chất vải, người mẫu xoay, câu mở đầu — mỗi cảnh một prompt tiếng Anh để dựng lại.' },
  wait: 'Thường một, hai phút.',
};
const ANALYZE_GOAL = { need: 'Có video mẫu, cần hiểu cách dựng và prompt để làm lại', href: '/analyze', go: 'Phân tích' };

/** The guide's tools in sidebar order, with the analysis tool right after the video tool only when the feature is on. */
export const toolGuides = (analyzeEnabled: boolean): ToolGuide[] =>
  analyzeEnabled ? TOOL_GUIDE.flatMap((t) => (t.href === '/create' ? [t, ANALYZE_TOOL] : [t])) : TOOL_GUIDE;
/** The goals list, with the analysis goal after the video goal only when the feature is on. */
export const toolGoals = (analyzeEnabled: boolean): typeof TOOL_GOALS => (analyzeEnabled ? [...TOOL_GOALS.slice(0, 3), ANALYZE_GOAL, ...TOOL_GOALS.slice(3)] : TOOL_GOALS);

export const toolGuide = (href: string): ToolGuide | undefined => [...TOOL_GUIDE, ANALYZE_TOOL].find((t) => href === t.href || href.startsWith(`${t.href}/`));
