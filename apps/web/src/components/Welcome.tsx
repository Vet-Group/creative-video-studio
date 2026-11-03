'use client';
// A first-visit card on Explore: three steps from picking a tool to marking the result, gone for good once closed.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { ToolGuideButton } from './ToolGuide';

export const WELCOME_KEY = 'cvs.welcome.done';

export function Welcome() {
  // Hidden until storage is read, so a member who closed it never sees it flash.
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(WELCOME_KEY) !== '1');
    } catch {
      setShow(true); // blocked storage: shown, and closing it lasts for this visit
    }
  }, []);
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
      <ol>
        <li>
          <strong>Chọn công cụ.</strong> Thử đồ cho ảnh người mẫu, Tạo ảnh cho ảnh mới, Tạo video cho clip, Marketing Studio cho quảng cáo kiểu UGC, Ứng dụng cho việc lẻ.{' '}
          <ToolGuideButton className="link-button">Chọn công cụ nào?</ToolGuideButton>
        </li>
        <li>
          <strong>Tải ảnh lên và chạy.</strong> Nút chạy ghi chi phí ước tính trước khi bấm; kết quả về tab Lịch sử của trang sau vài giây đến vài phút.
        </li>
        <li>
          <strong>Chấm kết quả trong Thư viện.</strong> Đạt, Nổi bật hay Không đạt giúp cả công ty chọn đúng mô hình. <Link href="/library">Mở Thư viện</Link>
        </li>
      </ol>
      <button type="button" className="icon-button welcome-close" aria-label="Đã hiểu, ẩn hướng dẫn" title="Đã hiểu, ẩn hướng dẫn" onClick={close}>
        <Icon name="x" size={14} />
      </button>
    </section>
  );
}
