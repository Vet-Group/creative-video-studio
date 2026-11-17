import type { ChangeEntry } from '../changelog';

export default { at: '2026-11-14T05:30:00+07:00', kind: 'new', title: 'Thiết lập đã lưu có chỗ trống để điền', details: ['Trong prompt, mô tả hay kịch bản của một thiết lập, viết ${tên} hoặc ${tên:mặc định} để chừa một chỗ trống. Khi ai đó mở thiết lập, hộp Điền chỗ trống hiện ra để nhập từng giá trị rồi mới điền vào form; bấm Huỷ thì form giữ nguyên.', 'Chỗ trống có giá trị mặc định thì để trống cũng được; chỗ trống không có mặc định thì bắt buộc phải điền.'], prs: [447], audience: 'all' } satisfies ChangeEntry;
