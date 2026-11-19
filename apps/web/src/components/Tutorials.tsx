'use client';
// The tutorials page, as the reference site's How to Use: the whole-app tour first, then each tool's video from its About page (the same
// sample, so one upload shows in both places) with a link to the tool. A video shows once an Admin uploads it; the titles and links stay.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Tutorial } from './About';

/** The tour's sample name (without `.mp4`). */
export const TOUR = 'tutorial-tour';
/** The tools with a tutorial, in the reference site's order: [About page, page, sidebar name]. */
const TOOLS = [
  ['tryOn', '/try-on', 'Thử đồ'],
  ['image', '/image-generation', 'Tạo ảnh'],
  ['create', '/create', 'Tạo video'],
] as const;

export function Tutorials() {
  const [content, setContent] = useState<typeof import('@/lib/about-content')>();
  useEffect(() => {
    void import('@/lib/about-content').then(setContent);
  }, []);
  return (
    <article className="about tutorials">
      <h1>Hướng dẫn</h1>
      <p className="about-intro">Mỗi video dưới một phút, có giọng đọc và phụ đề: xem một lần là dùng được công cụ.</p>
      <Tutorial name={TOUR} title="Làm quen với CVS" />
      {content &&
        TOOLS.map(([key, href, name]) => {
          const page = content.ABOUT[key];
          return (
            <section key={key}>
              <h2>{name}</h2>
              {page.lead && <p className="about-lead">{page.lead}</p>}
              {page.video && <Tutorial name={page.video} title={page.title} />}
              <p>
                <Link href={href}>Mở {name}</Link>
              </p>
            </section>
          );
        })}
    </article>
  );
}
