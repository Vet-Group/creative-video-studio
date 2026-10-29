'use client';
// A sample of the Examples tab (a Marketing clip or a Try On picture) opened in place, as the reference site's Examples open: the sample, its prompt, photos and
// settings, and the reuse link (Fash's Recreate). The details come from the sample's own file (`<sample>.json`, uploaded by an Admin beside it); nothing here runs a job.
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { exampleFrom } from '@/lib/reuse';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { Icon } from './Icon';
import { useImageModels } from './image-tools';
import { Recreate } from './jobs';
import { Modal } from './Modal';

/** A sample's details file, in the shape its page refills from (`?example=`): Marketing's format and duration, or Try On's model, resolution and background. */
interface SampleDetails {
  format?: string | null;
  brief: string | null;
  images: { sample: string }[];
  ratio: string;
  durationSec?: number;
  modelId?: string | null;
  resolution?: string | null;
  /** The reference site's named background, shown as a chip; its picture is the last input. */
  background?: string | null;
  date?: string;
}

/** Try On's heading is the model, as on Fash. */
function ModelName({ id }: { id: string }) {
  const { models } = useImageModels('try_on');
  return <>{models?.find((m) => m.id === id)?.label ?? 'Thử đồ'}</>;
}

const fmtDate = (day: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(day));

/** `names`: the samples that have a details file (`marketing-example-<n>.mp4`, `try-on-example-<n>.jpg`), in tile order; `index` the open one. */
export function SampleDetail({ names, index, onIndex }: { names: string[]; index: number; onIndex: (i: number | null) => void }) {
  const name = names[index]!;
  const video = name.endsWith('.mp4');
  const base = name.replace(/\.(mp4|jpg)$/, '');
  const [details, setDetails] = useState<SampleDetails | null>(null);
  const [note, setNote] = useState('');
  const media = useRef<HTMLVideoElement & HTMLImageElement>(null);
  const narrow = useMediaQuery(NARROW);
  useEffect(() => {
    setDetails(null);
    setNote('');
    api<SampleDetails>(`/api/samples/${base}.json`).then(setDetails, () => setNote(video ? 'Không tải được chi tiết của video mẫu.' : 'Không tải được chi tiết của ảnh mẫu.'));
  }, [base, video]);
  const tryOn = !video;
  const advanced = details?.format === 'advanced';
  const title = tryOn ? 'Thử đồ' : advanced ? 'Nâng cao' : 'UGC Thử đồ';
  const inputs = details && details.images.length > 0 && (
    <ul className="job-inputs" aria-label="Ảnh đầu vào">
      {details.images.map((i) => (
        <li key={i.sample}>
          <img src={`/api/samples/${i.sample}`} alt={i.sample} />
        </li>
      ))}
    </ul>
  );
  const copy = () => navigator.clipboard.writeText(details?.brief ?? '').then(() => setNote('Đã sao chép.'), () => setNote('Không sao chép được.'));

  return (
    <Modal open onClose={() => onIndex(null)} label={`Chi tiết: ${title}`} className="lightbox">
      <div className="lightbox-media">
        {video ? <video key={name} ref={media} controls autoPlay muted playsInline poster={`/api/samples/${base}.jpg`} src={`/api/samples/${name}`} /> : <img key={name} ref={media} src={`/api/samples/${name}`} alt="Ảnh mẫu" />}
      </div>
      <div className="lightbox-side">
        {/* Fash's Try On lists the photos before the prompt; its Marketing the other way round. */}
        <h2>{tryOn && details?.modelId ? <ModelName id={details.modelId} /> : title}</h2>
        {tryOn && inputs}
        {details?.brief && <p className="job-text">{details.brief}</p>}
        {!tryOn && inputs}
        {details && (
          <p className="job-chips">
            {tryOn ? <span>{details.resolution}</span> : <span>{details.durationSec}s</span>}
            <span>{details.ratio}</span>
          </p>
        )}
        {details?.background && (
          <p className="job-chips">
            <span>{details.background}</span>
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
          <Recreate href={tryOn ? `/try-on?example=${base}` : `/marketing-studio${advanced ? '/advanced' : ''}?example=${base}`} from={exampleFrom({ example: base })!} className="lightbox-reuse" onDone={() => narrow && onIndex(null)}>
            Dùng lại
          </Recreate>
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
