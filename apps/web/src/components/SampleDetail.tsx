'use client';
// A sample clip of Ví dụ opened in place, as the reference site's Examples open: the clip, its prompt, photos and settings, and Dùng lại (Fash's Recreate).
// The details come from the sample's own file (`<sample>.json`, uploaded by an Admin beside the clip); nothing here runs a job.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from './Icon';
import { Modal } from './Modal';

/** A sample's details file, in the shape the Marketing form refills from (`?example=`). */
interface SampleDetails {
  format: string | null;
  brief: string | null;
  images: { sample: string }[];
  ratio: string;
  durationSec: number;
  date?: string;
}

const fmtDate = (day: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(day));

/** `names`: the sample clips that have a details file (`marketing-example-<n>.mp4`), in tile order; `index` the open one. */
export function SampleDetail({ names, index, onIndex }: { names: string[]; index: number; onIndex: (i: number | null) => void }) {
  const name = names[index]!;
  const base = name.replace(/\.mp4$/, '');
  const [details, setDetails] = useState<SampleDetails | null>(null);
  const [note, setNote] = useState('');
  const media = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    setDetails(null);
    setNote('');
    api<SampleDetails>(`/api/samples/${base}.json`).then(setDetails, () => setNote('Không tải được chi tiết của video mẫu.'));
  }, [base]);
  const advanced = details?.format === 'advanced';
  const title = advanced ? 'Nâng cao' : 'UGC Thử đồ';
  const copy = () => navigator.clipboard.writeText(details?.brief ?? '').then(() => setNote('Đã sao chép.'), () => setNote('Không sao chép được.'));

  return (
    <Modal open onClose={() => onIndex(null)} label={`Chi tiết: ${title}`} className="lightbox">
      <div className="lightbox-media">
        <video key={name} ref={media} controls autoPlay muted playsInline poster={`/api/samples/${base}.jpg`} src={`/api/samples/${name}`} />
      </div>
      <div className="lightbox-side">
        <h2>{title}</h2>
        {details?.brief && <p className="job-text">{details.brief}</p>}
        {details && details.images.length > 0 && (
          <ul className="job-inputs" aria-label="Ảnh đầu vào">
            {details.images.map((i) => (
              <li key={i.sample}>
                <img src={`/api/samples/${i.sample}`} alt={i.sample} />
              </li>
            ))}
          </ul>
        )}
        {details && (
          <p className="job-chips">
            <span>{details.durationSec}s</span>
            <span>{details.ratio}</span>
          </p>
        )}
        {details?.date && <p className="job-when">{fmtDate(details.date)}</p>}
        {note && (
          <p className="muted" role="status">
            {note}
          </p>
        )}
        <div className="job-actions">
          <a className="icon-button" href={`/api/samples/${name}`} download={name} aria-label="Tải xuống" title="Tải xuống">
            <Icon name="download" />
          </a>
          <button type="button" className="icon-button" onClick={() => void media.current?.requestFullscreen?.()} aria-label="Toàn màn hình" title="Toàn màn hình">
            <Icon name="eye" />
          </button>
          <a className="icon-button" href={`/api/samples/${name}`} target="_blank" rel="noreferrer" aria-label="Mở trong tab mới" title="Mở trong tab mới">
            <Icon name="external" />
          </a>
          {details?.brief && (
            <button type="button" className="icon-button" onClick={() => void copy()} aria-label="Sao chép mô tả" title="Sao chép mô tả">
              <Icon name="copy" />
            </button>
          )}
        </div>
        {details && (
          <Link href={`/marketing-studio${advanced ? '/advanced' : ''}?example=${base}`} className="lightbox-reuse">
            Dùng lại
          </Link>
        )}
      </div>
      {index > 0 && (
        <button type="button" className="lightbox-step lightbox-prev" onClick={() => onIndex(index - 1)} aria-label="Mục trước">
          <Icon name="left" size={20} />
        </button>
      )}
      {index < names.length - 1 && (
        <button type="button" className="lightbox-step lightbox-next" onClick={() => onIndex(index + 1)} aria-label="Mục tiếp theo">
          <Icon name="right" size={20} />
        </button>
      )}
    </Modal>
  );
}
