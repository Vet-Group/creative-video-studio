// A small dot on the tab's icon while jobs run or just finished, for pinned tabs, which show nothing but the icon (the job tray sets the title too).

export type Badge = 'running' | 'done';

/** How long the "done" dot stays when nobody comes back to the tab. */
export const DONE_BADGE_MS = 60_000;

const COLOUR: Record<Badge, string> = { running: '#f59e0b', done: '#22c55e' };

/** The dot the icon shows: amber while any job runs; green for a minute after the last one finished, until the tab is looked at (news); none otherwise. */
export function badgeFor(active: number, news: boolean, lastFinished: number, now: number): Badge | null {
  if (active > 0) return 'running';
  return news && now - lastFinished < DONE_BADGE_MS ? 'done' : null;
}

const ORIGINAL = 'data-original-href';
const drawn = new Map<string, string>();
let latest = 0; // a slow draw does not land over a newer call

/** The page's own icon with the dot over its corner, as a data URL; null when the icon cannot be drawn. */
function draw(src: string, badge: Badge): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 32;
      const ctx = Object.assign(document.createElement('canvas'), { width: size, height: size }).getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, size, size);
      ctx.beginPath();
      ctx.arc(size - 9, size - 9, 8, 0, Math.PI * 2);
      ctx.fillStyle = COLOUR[badge];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      try {
        resolve(ctx.canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const icons = () => [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')];

/** Draws the badge on the tab's icon, or puts the original back when `badge` is null. Skipped when the browser asks for less data. */
export async function setFaviconBadge(badge: Badge | null): Promise<void> {
  const call = ++latest;
  const links = icons();
  if (links.length === 0) return;
  if (badge === null) {
    for (const l of links) {
      if (!l.hasAttribute(ORIGINAL)) continue;
      l.href = l.getAttribute(ORIGINAL)!;
      l.removeAttribute(ORIGINAL);
    }
    return;
  }
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  const source = links.find((l) => l.hasAttribute(ORIGINAL))?.getAttribute(ORIGINAL) ?? links[0]!.href;
  const key = `${source}|${badge}`;
  const url = drawn.get(key) ?? (await draw(source, badge));
  if (!url || call !== latest) return;
  drawn.set(key, url);
  for (const l of icons()) {
    if (!l.hasAttribute(ORIGINAL)) l.setAttribute(ORIGINAL, l.href);
    l.href = url;
  }
}
