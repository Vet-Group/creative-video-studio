'use client';
// A sample of the Examples tab (a Marketing clip, a Try On or an Image Generation picture) opened in place, as the reference site's Examples open: the sample, its prompt, photos and
// settings, and the reuse link (Fash's Recreate). The details come from the sample's own file (`<sample>.json`, uploaded by an Admin beside it); nothing here runs a job.
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { exampleFrom } from '@/lib/reuse';
import { NARROW, useMediaQuery } from '@/lib/use-media-query';
import { Icon } from './Icon';
import { useImageModels } from './image-tools';
import { Recreate, roleOf, Tap, useForm } from './jobs';
import { Modal } from './Modal';

/** A sample's details file, in the shape its page refills from (`?example=`): Marketing's format and duration, or Try On's model, resolution and background. */
interface SampleDetails {
  format?: string | null;
  brief?: string | null;
  /** Image Generation's words (its jobs keep the prompt itself). */
  prompt?: string | null;
  images: { sample: string }[];
  ratio: string;
  durationSec?: number;
  modelId?: string | null;
  resolution?: string | null;
  /** The reference site's named background, shown as a chip; its picture is the last input. */
  background?: string | null;
  /** How many of a Try On sample's photos are garments (after the person, before the background). */
  garments?: number;
  date?: string;
}

/** A picture's heading is its model, as on Fash. */
function ModelName({ id, feature, fallback }: { id: string; feature: string; fallback: string }) {
  const { models } = useImageModels(feature);
  return <>{models?.find((m) => m.id === id)?.label ?? fallback}</>;
}

/** A chip: a button that sets its value on the form beside it, or plain text where there is none. */
const chip = (text: string, on: (() => void) | undefined, label: string) =>
  on ? (
    <button type="button" onClick={on} title={label}>
      {text}
    </button>
  ) : (
    <span>{text}</span>
  );

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
  const form = useForm();
  useEffect(() => {
    setDetails(null);
    setNote('');
    api<SampleDetails>(`/api/samples/${base}.json`).then(setDetails, () => setNote(video ? 'Không tải được chi tiết của video mẫu.' : 'Không tải được chi tiết của ảnh mẫu.'));
  }, [base, video]);
  const picture = !video; // a Try On or an Image Generation sample: the photos before the words, resolution chips, Use Result
  const tryOn = base.startsWith('try-on-');
  const feature = video ? 'marketing' : tryOn ? 'try_on' : 'image';
  const text = details?.brief ?? details?.prompt ?? null;
  const advanced = details?.format === 'advanced';
  const title = tryOn ? 'Thử đồ' : picture ? 'Tạo ảnh' : advanced ? 'Nâng cao' : 'UGC Thử đồ';
  // As on Fash, each photo, the words, a chip and the result can go on the form beside the Examples.
  const inputs = details && details.images.length > 0 && (
    <ul className="job-inputs" aria-label="Ảnh đầu vào">
      {details.images.map((i, n) => (
        <li key={i.sample}>
          <Tap on={form?.photo && (() => form.photo!(i, roleOf(feature, n, { garments: details.garments, advanced })))}>
            <img src={`/api/samples/${i.sample}`} alt={i.sample} />
          </Tap>
        </li>
      ))}
    </ul>
  );
  const apply = form?.apply;
  const backdrop = details?.background ? details.images.at(-1) : undefined;
  const copy = () => navigator.clipboard.writeText(text ?? '').then(() => setNote('Đã sao chép.'), () => setNote('Không sao chép được.'));

  return (
    <Modal open onClose={() => onIndex(null)} label={`Chi tiết: ${title}`} className="lightbox">
      <div className="lightbox-media">
        {video ? <video key={name} ref={media} controls autoPlay muted playsInline poster={`/api/samples/${base}.jpg`} src={`/api/samples/${name}`} /> : <img key={name} ref={media} src={`/api/samples/${name}`} alt="Ảnh mẫu" />}
      </div>
      <div className="lightbox-side">
        {/* Fash's Try On lists the photos before the prompt; its Marketing the other way round. */}
        <h2>{picture && details?.modelId ? <ModelName id={details.modelId} feature={feature} fallback={title} /> : title}</h2>
        {picture && inputs}
        {text && (
          <Tap on={form?.prompt && (() => form.prompt!(text))} label="Chép prompt vào ô Prompt" className="job-text">
            {text}
          </Tap>
        )}
        {!picture && inputs}
        {details && (
          <p className="job-chips">
            {picture ? chip(details.resolution ?? '', apply && details.resolution ? () => apply({ resolution: details.resolution! }) : undefined, 'Dùng độ phân giải này') : chip(`${details.durationSec}s`, apply && details.durationSec ? () => apply({ durationSec: details.durationSec }) : undefined, 'Dùng thời lượng này')}
            {chip(details.ratio, apply && (() => apply({ ratio: details.ratio })), 'Dùng tỉ lệ này')}
          </p>
        )}
        {details?.background && <p className="job-chips">{chip(details.background, form?.photo && backdrop && (() => form.photo!(backdrop, 'background')), 'Dùng bối cảnh này')}</p>}
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
          {text && (
            <button type="button" className="icon-button" onClick={() => void copy()} aria-label="Sao chép mô tả" title="Sao chép mô tả">
              <Icon name="copy" />
            </button>
          )}
        </div>
        {details && (
          <Recreate href={tryOn ? `/try-on?example=${base}` : picture ? `/image-generation?example=${base}` : `/marketing-studio${advanced ? '/advanced' : ''}?example=${base}`} from={exampleFrom({ example: base })!} className="lightbox-reuse" onDone={() => narrow && onIndex(null)}>
            Dùng lại
          </Recreate>
        )}
        {picture && form?.result && (
          <button type="button" className="lightbox-result" onClick={() => form.result!({ sample: name })}>
            <Icon name="right" /> Dùng kết quả
          </button>
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
