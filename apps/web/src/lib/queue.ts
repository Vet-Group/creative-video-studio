// The pg-boss client the route handlers use to enqueue; the worker is the only consumer.
import { SUGGEST_QUEUE, SUGGEST_QUEUE_OPTIONS, VIDEO_QUEUE, VIDEO_QUEUE_OPTIONS } from '@cvs/core/queue';
import { databaseUrl } from '@cvs/db/client';
import { PgBoss } from 'pg-boss';

// One client per server process; dev reloads keep it on globalThis.
const g = globalThis as unknown as { cvsBoss?: Promise<PgBoss> };

async function start(): Promise<PgBoss> {
  const b = new PgBoss({ connectionString: databaseUrl(), max: 2 });
  b.on('error', (e) => console.error('pg-boss:', e));
  await b.start();
  await b.createQueue(VIDEO_QUEUE, VIDEO_QUEUE_OPTIONS);
  await b.createQueue(SUGGEST_QUEUE, SUGGEST_QUEUE_OPTIONS);
  return b;
}

export function boss(): Promise<PgBoss> {
  if (!g.cvsBoss) {
    g.cvsBoss = start().catch((e) => {
      g.cvsBoss = undefined;
      throw e;
    });
  }
  return g.cvsBoss;
}

export async function stopBoss(): Promise<void> {
  const b = await g.cvsBoss;
  g.cvsBoss = undefined;
  await b?.stop({ graceful: false });
}
