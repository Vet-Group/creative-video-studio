'use client';
// The Library's marking guide for staff: why the marks matter (what reads them), where and how to mark, which mark to pick, and each fault with an example.
import { FAULTS } from '@/lib/faults';
import { Modal } from './Modal';

/** What each fault looks like, by its id; the Record type makes a new fault without an example a type error. */
export const FAULT_EXAMPLES: Record<(typeof FAULTS)[number]['id'], string> = {
  print_changed: 'Chữ "SUMMER" trên áo thành "SUMMR", logo bị nhoè hoặc đổi hình, hoạ tiết in bị kéo méo.',
  off_colour: 'Áo đỏ đô thành đỏ tươi, cốc trắng ngả vàng: khác rõ so với ảnh sản phẩm gốc.',
  deformed: 'Cốc mọc thêm quai, áo có thêm túi, tay người mẫu thừa ngón, sản phẩm méo mó.',
  flicker: 'Hình in chớp tắt giữa các khung, chuyển động khựng hoặc nhảy cóc.',
  stray_text: 'Có chữ không có trong ảnh gốc, hoặc watermark ở góc hình.',
  other: 'Lỗi khác làm clip không dùng được: mặt người mẫu méo, cảnh sai yêu cầu, âm thanh lạ.',
};

export function VerdictGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} label="Hướng dẫn chấm điểm" className="verdict-guide">
      <h2>Hướng dẫn chấm điểm</h2>
      <p className="modal-sub">Mỗi clip hoặc ảnh có ba nút: Đạt, Nổi bật và Không đạt. Chấm mất khoảng nửa phút một mục và giúp cả công ty làm video tốt hơn.</p>

      <h3>Chấm để làm gì?</h3>
      <ul>
        <li>
          <strong>Chọn đúng mô hình.</strong> Mỗi lần chấm cập nhật tỉ lệ đạt của mô hình đã tạo ra mục đó. Mô hình có điểm cao nhất được gắn nhãn <em>Đề xuất</em> và được chọn sẵn khi tạo mới. Ví dụ: mô hình A
          được chấm Đạt 8 trên 10 clip, mô hình B chỉ 4 trên 10. Lần sau mở Tạo video, mô hình A được chọn sẵn và đồng nghiệp không phải thử lại mô hình hay làm méo hình in.
        </li>
        <li>
          <strong>Làm mẫu ở Khám phá.</strong> Clip Đạt của Tạo video và Tạo ảnh (clip Nổi bật được ưu tiên) hiện trên thẻ mô hình ở trang Khám phá, để mọi người thấy mô hình làm được gì với sản phẩm thật của
          công ty.
        </li>
        <li>
          <strong>Biết tiền tiêu có đáng không.</strong> Báo cáo chi phí tính chi phí cho mỗi clip đạt và số tiền đã tốn cho clip không đạt. Ví dụ: 10 clip hết 5 USD mà chỉ 2 clip đạt, thì mỗi clip dùng được
          thực tế tốn 2,5 USD.
        </li>
        <li>
          <strong>Biết mô hình hay lỗi gì.</strong> Lỗi bạn chọn khi chấm Không đạt cho thấy mô hình nào hay làm méo chữ in hay sai màu, để tránh dùng nó cho sản phẩm có in chữ.
        </li>
      </ul>
      <p className="muted">Mục chưa chấm không được tính vào đâu cả, nên mỗi lần chấm đều có ích.</p>

      <h3>Ai chấm, chấm ở đâu?</h3>
      <ul>
        <li>Bạn chấm các mục do chính mình tạo. Admin chấm được mọi mục.</li>
        <li>
          Ba nút có trên thẻ ở dạng Lưới, trên hàng ở dạng Danh sách và trong khung chi tiết (biểu tượng con mắt). Khung chi tiết tiện nhất: clip hiện to, có ảnh đầu vào bên cạnh, chấm xong là sang mục
          tiếp theo được ngay.
        </li>
        <li>Bấm là lưu ngay. Đổi ý thì bấm nút khác, kết quả mới thay kết quả cũ.</li>
      </ul>

      <h3>Chấm một mục trong 4 bước</h3>
      <ol>
        <li>Mở khung chi tiết và xem hết clip ít nhất một lần.</li>
        <li>So với ảnh sản phẩm gốc (mục ảnh đầu vào): hình in, chữ, logo, màu và form dáng có giống không.</li>
        <li>Xem kỹ đoạn cận cảnh và đoạn chuyển động nhanh: lỗi méo chữ và nhấp nháy hay nằm ở đó.</li>
        <li>Bấm một nút theo bảng dưới. Với Không đạt, chọn lỗi rồi bấm Xác nhận không đạt.</li>
      </ol>

      <h3>Chọn nút nào?</h3>
      <dl className="verdict-guide-marks">
        <dt>Đạt</dt>
        <dd>Đăng bán hoặc chạy quảng cáo được ngay, không cần sửa; sản phẩm giống ảnh gốc. Ví dụ: áo thun in chữ quay chậm quanh người mẫu, chữ rõ, màu đúng.</dd>
        <dt>Nổi bật</dt>
        <dd>Đạt, và đẹp tới mức muốn cả công ty xem làm mẫu: ánh sáng đẹp, chuyển động mượt, sản phẩm rõ nét. Chỉ dành cho vài mục tốt nhất, khoảng một hai mục cho mỗi mô hình.</dd>
        <dt>Không đạt</dt>
        <dd>Có ít nhất một lỗi khiến không dùng được cho khách. Chọn lỗi rõ nhất trong danh sách dưới.</dd>
      </dl>

      <h3>Các lỗi khi chấm Không đạt</h3>
      <dl className="verdict-guide-faults">
        {FAULTS.map((f) => (
          <div key={f.id}>
            <dt>{f.label}</dt>
            <dd>{FAULT_EXAMPLES[f.id]}</dd>
          </div>
        ))}
      </dl>

      <h3>Mẹo</h3>
      <ul>
        <li>Phân vân giữa Đạt và Không đạt? Tự hỏi: “Mình có dám đăng mục này lên trang bán hàng không?” Không dám thì chọn Không đạt.</li>
        <li>Có nhiều lỗi thì chọn lỗi nặng nhất.</li>
        <li>Tìm mục chưa chấm: ở bộ lọc Kết quả chọn Chưa chấm. Chấm xong một mục trong khung chi tiết, mục đó rời danh sách và khung chuyển sang mục tiếp theo.</li>
        <li>Chấm ngay sau khi tạo, lúc còn nhớ rõ sản phẩm gốc.</li>
      </ul>
    </Modal>
  );
}
