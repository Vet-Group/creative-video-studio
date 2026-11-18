'use client';
// A first-visit card on Explore: three picture cards from picking a tool to marking the result, and a way into Try On's sample photos; gone for good once closed.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { WELCOME_KEY } from '@/lib/onboarding';
import { CardMedia } from './CardMedia';
import { Icon } from './Icon';
import { ToolGuideButton } from './ToolGuide';

/** `pictures` are the three step pictures, in step order (the page passes its tool posters). */
export function Welcome({ pictures }: { pictures: { video: string | null; poster: string | null }[] }) {
  // Hidden until storage is read, so a member who closed it never sees it flash.
  const [show, setShow] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(WELCOME_KEY) !== '1');
    } catch {
      setShow(true); // blocked storage: shown, and closing it lasts for this visit
    }
  }, []);
  if (show === null) return <span className="welcome-pending" hidden />; // keeps Explore's first-run line hidden until storage is read
  if (!show) return null;
  function close() {
    setShow(false);
    try {
      localStorage.setItem(WELCOME_KEY, '1');
    } catch {}
  }
  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <h2 id="welcome-title">Bắt đầu trong 3 bước</h2>
      <ol className="welcome-steps">
        <li>
          <span className="welcome-pic">
            <CardMedia {...pictures[0]!} />
          </span>
          <span className="welcome-text">
            <strong>Chọn công cụ.</strong> Thử đồ cho ảnh người mẫu, Tạo ảnh cho ảnh mới, Tạo video cho clip, Marketing Studio cho quảng cáo kiểu UGC, Ứng dụng cho việc lẻ.{' '}
            <ToolGuideButton className="link-button">Chọn công cụ nào?</ToolGuideButton>
          </span>
        </li>
        <li>
          <span className="welcome-pic">
            <CardMedia {...pictures[1]!} />
          </span>
          <span className="welcome-text">
            <strong>Tải ảnh lên và chạy.</strong> Nút chạy ghi chi phí ước tính trước khi bấm; kết quả về tab Lịch sử của trang sau vài giây đến vài phút.
          </span>
        </li>
        <li>
          <span className="welcome-pic">
            <CardMedia {...pictures[2]!} />
          </span>
          <span className="welcome-text">
            <strong>Chấm kết quả trong Thư viện.</strong> Đạt, Nổi bật hay Không đạt giúp cả công ty chọn đúng mô hình. <Link href="/library">Mở Thư viện</Link>
          </span>
        </li>
      </ol>
      {/* Try On offers its sample photos in an empty slot, so the plain link is the way in. */}
      <Link href="/try-on" className="welcome-try">
        Thử ngay với ảnh mẫu
      </Link>
      <button type="button" className="icon-button welcome-close" aria-label="Đã hiểu, ẩn hướng dẫn" title="Đã hiểu, ẩn hướng dẫn" onClick={close}>
        <Icon name="x" size={14} />
      </button>
    </section>
  );
}
