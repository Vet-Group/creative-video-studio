/** What the video form tells the member when it changed a setting by itself because the model did not take the one they had. */
export function adjustNote(c: { ratio?: { from: string; to: string }; durationSec?: { from: number; to: number }; model?: { label: string; ratio: string; durationSec: number } }): string {
  return [
    c.ratio && `Đã đổi tỉ lệ sang ${c.ratio.to} vì mô hình không hỗ trợ ${c.ratio.from}.`,
    c.durationSec && `Đã đổi thời lượng sang ${c.durationSec.to}s vì mô hình không hỗ trợ ${c.durationSec.from}s.`,
    c.model && `Đã chuyển sang ${c.model.label} vì mô hình trước không hỗ trợ ${c.model.ratio}, ${c.model.durationSec}s.`,
  ]
    .filter(Boolean)
    .join(' ');
}
