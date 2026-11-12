'use client';
// A video slot; by default Marketing Studio Advanced's optional reference video: one MP4 or MOV clip that guides the motion, framing and pace of the new clip. The member uploads one, picks a
// clip of their History (copied as their own input on the server) or sends one from an Example's detail (SampleDetail's use-as-reference-video button).
import { useId, useRef, useState } from 'react';
import { MAX_VIDEO_BYTES } from '@/lib/upload-limits';
import { useHydrated } from '@/lib/use-hydrated';
import { Icon } from './Icon';
import { PhotoDialog } from './image-tools';
import { useJobs } from './jobs';

/** The reference video the form holds: an input asset with its length from the file's header. */
export interface RefVideo {
  id: string;
  filename: string;
  durationMs: number;
  /** The file's size in bytes, where the answer that gave the clip carried it. */
  bytes?: number;
}

/** A model's reference video limits as the models API gives them (videoInputs `videoRefs`). */
export interface VideoRefs {
  max: number;
  minSec: number;
  maxSec: number;
  maxMb: number | null;
  /** The most input images that fit with a video, where the model caps them. */
  maxImages: number | null;
  /** The request a Run with a video makes takes an end frame. */
  endFrame: boolean;
  /** That request has no audio switch: the clip is silent. */
  silent: boolean;
}

/** Why the model cannot take this video, or null when it can. Without a video there is nothing to refuse. */
export function videoReason(video: RefVideo | null, takes: VideoRefs | null | undefined, images: number): string | null {
  if (!video) return null;
  if (!takes) return 'Mô hình này không nhận video tham chiếu. Bỏ video hoặc chọn mô hình khác.';
  const sec = video.durationMs / 1000;
  if (sec < takes.minSec || sec > takes.maxSec) return `Mô hình này nhận video tham chiếu dài ${takes.minSec} đến ${takes.maxSec} giây. Chọn video khác hoặc mô hình khác.`;
  if (takes.maxMb !== null && video.bytes !== undefined && video.bytes > takes.maxMb * 1024 * 1024) return `Mô hình này nhận video tham chiếu tối đa ${takes.maxMb} MB. Chọn video khác hoặc mô hình khác.`;
  if (takes.maxImages !== null && images > takes.maxImages) return `Với video tham chiếu, mô hình này nhận tối đa ${takes.maxImages} ảnh. Bỏ bớt ảnh hoặc chọn mô hình khác.`;
  return null;
}

/**
 * One video slot: upload (a click or a drop), a pick from History, or remove. Marketing Advanced's and Analyze's optional reference video by default;
 * Motion Control passes its own required "Video chuyển động" `label`, `fileLabel` and `hint`.
 */
export function ReferenceVideoSlot({ video, busy, onFile, onHistory, onRemove, label = 'Video tham chiếu', optional = true, fileLabel = 'Tải lên video tham chiếu', hint }: { video: RefVideo | null; busy: boolean; onFile: (file: File) => void; onHistory: (assetId: string) => void; onRemove: () => void; label?: string; optional?: boolean; fileLabel?: string; hint?: string }) {
  const hydrated = useHydrated();
  const input = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const [picking, setPicking] = useState(false);
  const [over, setOver] = useState(false);
  const lower = label[0]!.toLowerCase() + label.slice(1);
  const { jobs } = useJobs();
  // The member's recent finished clips (the tray's 20 latest jobs), each one's poster as its tile.
  const clips = jobs.filter((j) => j.status === 'succeeded' && j.outputAssetId && j.posterAssetId && j.feature !== 'motion_control' && j.resolution === null); // an image job's poster is its preview
  return (
    <div className="field">
      <div className="field-head">
        {optional ? (
          <span className="optional-head">
            <span id={labelId} className="field-label">
              {label}
              <span className="sr-only"> (tuỳ chọn)</span>
            </span>
            <span className="choice-optional" aria-hidden="true">
              Tuỳ chọn
            </span>
          </span>
        ) : (
          <span id={labelId} className="field-label">
            {label}
          </span>
        )}
        {!video && clips.length > 0 && (
          <button type="button" className="link-button uploads-link" aria-haspopup="dialog" disabled={!hydrated || busy} onClick={() => setPicking(true)}>
            Từ Lịch sử
          </button>
        )}
      </div>
      <div
        className="slot"
        role="group"
        aria-labelledby={labelId}
        data-one={video ? true : undefined}
        data-over={over}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (hydrated && !video && !busy && file) onFile(file); // the type and size are checked by the upload, as for a picked file
        }}
      >
        <input
          ref={input}
          type="file"
          accept="video/mp4,video/quicktime"
          hidden
          aria-label={fileLabel}
          disabled={!hydrated}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onFile(file);
          }}
        />
        {video ? (
          <ul className="slot-thumbs" aria-label={`${label}: video đã chọn`}>
            <li>
              <video src={`/api/assets/${video.id}/content`} muted playsInline preload="metadata" aria-label={video.filename} />
              <button type="button" aria-label={`Bỏ video ${video.filename}`} onClick={onRemove}>
                <Icon name="x" size={12} />
              </button>
            </li>
          </ul>
        ) : (
          <button type="button" className="slot-add" aria-label={`Tải lên ${lower}`} disabled={!hydrated || busy} onClick={() => input.current?.click()}>
            <Icon name="plus" size={16} />
            <span>Tải lên</span>
          </button>
        )}
        <span className="slot-hint">{video ? `${video.filename} · ${(video.durationMs / 1000).toFixed(1)} giây` : (hint ?? `Video MP4 hoặc MOV (tối đa ${MAX_VIDEO_BYTES / 1024 / 1024} MB) cho chuyển động, góc máy và nhịp. Hoặc dùng video ở tab Ví dụ.`)}</span>
      </div>
      <PhotoDialog
        open={picking}
        title="Chọn video từ Lịch sử"
        sub="Video đã tạo gần đây của bạn. Video được sao chép thành video tham chiếu của riêng bạn."
        tiles={clips.map((j, i) => ({ key: j.id, src: `/api/assets/${j.posterAssetId}/content`, label: `Dùng video ${i + 1} từ Lịch sử`, pick: () => onHistory(j.outputAssetId!) }))}
        busy={busy}
        onClose={() => setPicking(false)}
      />
    </div>
  );
}
