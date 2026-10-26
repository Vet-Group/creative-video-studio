// The About tab of Create: how a Run works here, what limits it, and how to write a motion prompt. Company guidance, not marketing.
import { AboutClips } from './CardMedia';

export function About() {
  return (
    <article className="about">
      <h2>Tạo video sản phẩm từ ảnh</h2>
      <p>Đưa vào một hoặc vài ảnh sản phẩm, chọn một mẫu chuyển động hoặc tự viết mô tả, và nhận lại một clip ngắn. Clip nằm trong Thư viện của công ty, ai trong công ty cũng xem và tải được.</p>


      <p className="about-kicker">Từng bước</p>
      <h3>Một lần Run gồm những gì</h3>
      <ol className="about-steps">
        <li>
          <strong>Tải ảnh lên.</strong> Ảnh đầu tiên là sản phẩm chính. Mỗi mô hình nhận tối đa một số ảnh nhất định; ô tải ảnh báo khi bạn vượt quá.
        </li>
        <li>
          <strong>Chọn mẫu hoặc viết mô tả.</strong> Mẫu chuyển động là các câu lệnh công ty đã thử và giữ lại. Khi tự viết, chỉ cần tả chuyển động: ảnh đã quyết định sản phẩm, màu và bối cảnh.
        </li>
        <li>
          <strong>Chọn mô hình, tỉ lệ và thời lượng.</strong> Menu mô hình xếp theo nhà cung cấp và ghi tỉ lệ đạt, tức tỉ lệ clip được đánh giá Đạt. Mô hình không hỗ trợ tỉ lệ hay thời lượng đang chọn nằm ở cuối và không chọn được.
        </li>
        <li>
          <strong>Bấm Run.</strong> Nút Run ghi chi phí ước tính. Job hiện trong mục Lịch sử và báo khi xong; bạn có thể rời trang trong lúc chờ.
        </li>
        <li>
          <strong>Đánh giá clip.</strong> Đánh dấu Đạt hoặc Không đạt trong Thư viện. Đánh giá giúp công ty chọn mô hình và mẫu tốt hơn.
        </li>
      </ol>

      <p className="about-kicker">Giới hạn</p>
      <h3>Hạn mức và chi phí</h3>
      <ul>
        <li>Mỗi người có hạn mức số clip mỗi ngày theo giờ Việt Nam, do Admin đặt. Job thất bại không tốn tiền thì không tính.</li>
        <li>Công ty có ngân sách video mỗi tháng. Run nào làm tháng vượt ngân sách sẽ bị từ chối.</li>
        <li>Chi phí ghi trên mỗi clip là chi phí thật từ nhà cung cấp khi có; trước đó là số ước tính.</li>
      </ul>

      <p className="about-kicker">Mẹo</p>
      <h3>Viết mô tả chuyển động</h3>
      <ul>
        <li>Tả một chuyển động chính: máy quay tiến lại gần, xoay chậm, ánh sáng quét qua.</li>
        <li>Nói rõ điều gì phải giữ nguyên, ví dụ chữ in trên sản phẩm hay màu vải.</li>
        <li>Câu ngắn và cụ thể cho kết quả ổn định hơn câu dài nhiều ý.</li>
        <li>Chỉ dùng ảnh công ty có quyền sử dụng.</li>
      </ul>
      <AboutClips names={['example-2', 'example-3']} title="Từ ảnh tĩnh thành video" />
    </article>
  );
}
