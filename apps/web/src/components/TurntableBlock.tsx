'use client';
// A multi-angle Run's 360 turntable in History: waits for the worker's video once the 7 horizontal views are done (GET /api/turntables/[batch] is 404 until it is stored),
// then plays it with a download link; names the views a Run is missing so the member can run them again.
import { turntableState } from '@cvs/core/turntable';
import { useEffect, useState } from 'react';
import { VIEW_LABELS } from '@/lib/apps';
import type { TurntableRun } from '@/lib/turntable-runs';

const POLL_MS = 4_000;
/** About three minutes: the stitch takes seconds, so a video later than that is stuck, and the member is told to come back instead of polling for good. */
const POLL_TRIES = 45;

export function TurntableBlock({ run }: { run: TurntableRun }) {
  const { ready, missing, pending } = turntableState(run.jobs);
  const url = `/api/turntables/${run.batch}?asset=${run.photo}`;
  const [phase, setPhase] = useState<'waiting' | 'stored' | 'late'>('waiting');
  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const look = async () => {
      // One byte asks whether the video is stored without downloading it.
      const found = await fetch(url, { headers: { range: 'bytes=0-0' } }).then((res) => res.ok, () => false);
      if (stopped) return;
      if (found) setPhase('stored');
      else if (++tries >= POLL_TRIES) setPhase('late');
      else timer = setTimeout(() => void look(), POLL_MS);
    };
    void look();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [ready, url]);

  if (!ready && pending) return null; // a view is still being made: say nothing yet
  return (
    <li className="job-turntable">
      <h3>Video xoay 360°</h3>
      {!ready && <p className="muted">Thiếu góc {missing.map((id) => VIEW_LABELS[id] ?? id).join(', ')}: chạy lại góc đó để có video xoay 360°.</p>}
      {ready && phase === 'waiting' && <p className="muted" role="status">Đang ghép video xoay 360°…</p>}
      {ready && phase === 'late' && <p className="muted">Chưa ghép xong video xoay 360°. Hãy tải lại trang sau ít phút.</p>}
      {ready && phase === 'stored' && (
        <>
          <video src={url} autoPlay muted loop playsInline controls aria-label="Video xoay 360° của ảnh gốc và 7 góc ngang" />
          <a className="link-button" href={`${url}&download=1`} download>
            Tải video xoay 360°
          </a>
        </>
      )}
    </li>
  );
}
