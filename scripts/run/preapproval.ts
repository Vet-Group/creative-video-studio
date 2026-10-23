// The fixed pre-approval sentence (plan §3, step 5). The owner types it once; `pnpm run:approve` stores it verbatim.
export const PREAPPROVAL_SENTENCE =
  'Tôi duyệt trước lượt chạy Creative Video Studio theo plan v5.1: tạo repo GitHub riêng tư anhtahaylove/creative-video-studio và bảo vệ nhánh main; ' +
  'chi tối đa 40 USD tiền provider trước khi ra mắt (gồm canary, so sánh model, vòng thử thêm và clip thử trên server); ' +
  'bật model đạt chuẩn cho nhân viên dưới trần 200 USD/tháng; đọc 10 ảnh và kiểm tra chỉ-đọc trên vet-linux; ' +
  'đưa app lên /opt/creative-video-studio trên vet-linux; tạo khoá triển khai chỉ-đọc và khoá SSH giới hạn lệnh cho lượt chạy; ' +
  'tạo tunnel creative-video-studio và DNS video.vetgroup.net; tạo tác vụ CVS-Run-Watchdog; nhắn Lark riêng cho tôi; ' +
  'một lần đăng nhập Lark và một lần đăng nhập Google bằng trình duyệt của tôi để kiểm tra.';

export const PREAPPROVAL_DAYS = 14;

const normalise = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();

export function matchesPreapproval(typed: string): boolean {
  return normalise(typed) === normalise(PREAPPROVAL_SENTENCE);
}
