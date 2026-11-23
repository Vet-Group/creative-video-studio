'use client';
// The Library selection bar's compare button: with exactly two items picked it opens both side by side (stacked on a phone). Two videos share one clock:
// playing, pausing or seeking either one does the same to the other. Nothing autoplays and both start muted (each player's own control unmutes it).
import { useRef, useState } from 'react';
import { type Clip, thumbUrl } from '@/lib/api';
import { mirrorOf } from '@/lib/compare-sync';
import { featureLabel } from '@/lib/features';
import { Modal } from './Modal';

const PREVIEW_W = 1600; // the one `w` GET /api/assets/:id/thumb serves besides the tile, as in the Library's detail view
const labelOf = (c: Clip) => `${featureLabel(c.feature)} · ${c.modelLabel}`;

export function CompareButton({ clips }: { clips: Clip[] }) {
  const [open, setOpen] = useState(false);
  const two = clips.length === 2;
  return (
    <>
      <button type="button" disabled={!two} title={two ? 'Xem hai mục cạnh nhau' : 'Chọn đúng 2 mục để so sánh'} onClick={() => setOpen(true)}>
        So sánh
      </button>
      {two && (
        <Modal open={open} onClose={() => setOpen(false)} label="So sánh hai mục" className="compare-two">
          <h2 className="compare-two-title">So sánh hai mục</h2>
          <ComparePair clips={clips} />
        </Modal>
      )}
    </>
  );
}

function ComparePair({ clips }: { clips: Clip[] }) {
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  // The other video follows the one that changed; a mixed pair has no partner to follow.
  const follow = (i: number) => () => {
    const from = videos.current[i];
    const to = videos.current[1 - i];
    if (!from || !to) return;
    const { seek, play } = mirrorOf(from, to);
    if (seek !== null) to.currentTime = seek;
    if (play === true) void to.play().catch(() => {});
    if (play === false) to.pause();
  };
  return (
    <ul className="compare-two-grid">
      {clips.map((c, i) => (
        <li key={c.id}>
          {c.mediaType === 'video' ? (
            <video ref={(el) => void (videos.current[i] = el)} controls muted playsInline preload="metadata" poster={c.posterAssetId ? thumbUrl(c.posterAssetId) : undefined} src={`/api/assets/${c.videoAssetId}/content`} aria-label={labelOf(c)} onPlay={follow(i)} onPause={follow(i)} onSeeked={follow(i)} />
          ) : (
            <img src={thumbUrl(c.videoAssetId, PREVIEW_W)} alt={labelOf(c)} />
          )}
          <span className="compare-two-label">{labelOf(c)}</span>
        </li>
      ))}
    </ul>
  );
}
