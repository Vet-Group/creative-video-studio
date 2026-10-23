// The 5 rejection faults of PRD criterion 8, plus "Other"; a Fail verdict names exactly one. The labels are what Members read.
export const FAULTS = [
  { id: 'print_changed', label: 'In, chữ hoặc logo bị méo hoặc thay đổi' },
  { id: 'off_colour', label: 'Sai màu' },
  { id: 'deformed', label: 'Sản phẩm biến dạng hoặc thêm chi tiết' },
  { id: 'flicker', label: 'Nhấp nháy hoặc giật hình' },
  { id: 'stray_text', label: 'Có chữ lạ hoặc watermark' },
  { id: 'other', label: 'Lỗi khác' },
] as const;

export type FaultId = (typeof FAULTS)[number]['id'];

export const isFault = (v: unknown): v is FaultId => FAULTS.some((f) => f.id === v);
