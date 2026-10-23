import type { Metadata } from 'next';
import { connection } from 'next/server';

export const metadata: Metadata = { title: 'Chính sách quyền riêng tư - Creative Video Studio' };

// Public: the Google consent screen links here, so it needs no session and lives outside the (app) group.
export default async function PrivacyPage() {
  await connection(); // read CVS_SUPPORT_EMAIL when the page is served, not when the app is built
  const support = process.env.CVS_SUPPORT_EMAIL;
  return (
    <main className="prose">
      <h1>Chính sách quyền riêng tư</h1>
      <p>Creative Video Studio do VET vận hành, dùng nội bộ để tạo video quảng cáo ngắn từ ảnh sản phẩm.</p>

      <h2>Dữ liệu chúng tôi đọc</h2>
      <ul>
        <li>Khi bạn đăng nhập bằng Google (phạm vi openid, email, profile): tên, địa chỉ email và ảnh đại diện của tài khoản Google.</li>
        <li>Khi bạn đăng nhập bằng Lark: tên và email công ty (enterprise email) của tài khoản Lark.</li>
      </ul>

      <h2>Mục đích sử dụng</h2>
      <p>Chỉ để đăng nhập vào tài khoản mà Admin đã tạo sẵn cho bạn. Địa chỉ email không có trong danh sách của Admin sẽ bị từ chối và không tạo tài khoản nào.</p>

      <h2>Chia sẻ và lưu trữ</h2>
      <p>Chúng tôi không chia sẻ hay bán dữ liệu này cho bên thứ ba. Dữ liệu nằm trên máy chủ của VET và trong các bản sao lưu đã mã hóa của máy chủ đó.</p>

      <h2>Xóa dữ liệu</h2>
      <p>
        Bạn có thể yêu cầu xóa dữ liệu của mình bất cứ lúc nào.{' '}
        {support ? (
          <>
            Liên hệ: <a href={`mailto:${support}`}>{support}</a>.
          </>
        ) : (
          'Hãy liên hệ Admin của VET.'
        )}
      </p>

      <h2>English summary</h2>
      <p>
        Creative Video Studio is an internal tool run by VET. When you sign in with Google (scopes openid, email, profile) we read your name, email and profile picture; with Lark, your name and company email. We use
        them only to sign in an account an Admin has already created. Nothing is shared or sold. The data stays on VET&apos;s server and its encrypted backups. You can ask for its removal at any time.
      </p>
    </main>
  );
}
