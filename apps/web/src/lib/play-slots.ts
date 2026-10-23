// At most MAX_PLAYING preview clips play at once. A preview asks for a slot when it wants to play and is told when one is free.
export const MAX_PLAYING = 4;

const playing = new Set<string>();
const waiting = new Map<string, () => void>();

/** Asks for a slot. `start` runs now if one is free, else when an earlier clip releases its slot. */
export function requestSlot(id: string, start: () => void): void {
  if (playing.has(id)) return;
  if (playing.size < MAX_PLAYING) {
    playing.add(id);
    start();
  } else {
    waiting.set(id, start);
  }
}

/** Gives the slot back (or leaves the queue) and hands the free slot to the longest-waiting clip. */
export function releaseSlot(id: string): void {
  waiting.delete(id);
  if (!playing.delete(id)) return;
  const next = waiting.entries().next();
  if (next.done) return;
  const [nextId, start] = next.value;
  waiting.delete(nextId);
  playing.add(nextId);
  start();
}

export const playingCount = (): number => playing.size;
