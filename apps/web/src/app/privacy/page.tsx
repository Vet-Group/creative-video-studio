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
      <p>
        Chỉ để đăng nhập. Nhân viên thuộc tổ chức Lark của công ty được tạo tài khoản tự động ở lần đầu đăng nhập bằng Lark, là thành viên trong nhóm “Chưa phân team”. Mọi người khác dùng tài khoản do Admin tạo và đăng nhập
        bằng email và mật khẩu, Google hoặc passkey. Địa chỉ email Google không có trong danh sách của Admin, hoặc tài khoản Lark ngoài tổ chức của công ty, sẽ bị từ chối và không tạo tài khoản nào.
      </p>
      <p>Người ngoài tổ chức Lark đăng nhập bằng tài khoản do Admin tạo và không bị nhắc liên kết Lark.</p>

      <h2>Chia sẻ và lưu trữ</h2>
      <p>Chúng tôi không chia sẻ hay bán dữ liệu này cho bên thứ ba. Dữ liệu nằm trên máy chủ của VET và trong các bản sao lưu đã mã hóa của máy chủ đó.</p>

      <h2>Xoá dữ liệu</h2>
      <p>
        Bạn có thể yêu cầu xoá dữ liệu của mình bất cứ lúc nào.{' '}
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
        them only to sign you in. Staff in the company&apos;s Lark organisation get an account automatically at their first Lark sign-in, as a member of the team &quot;Chưa phân team&quot;. Everyone else uses an account an Admin
        creates, with email and password, Google or a passkey; people outside the Lark organisation sign in this way and are not asked to link Lark. Nothing is shared or sold. The data stays on VET&apos;s server and its encrypted backups. You can ask for its removal at any time.
      </p>
    </main>
  );
}
