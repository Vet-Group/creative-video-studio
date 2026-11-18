// Connections shared by the web app and the worker.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

/** DATABASE_URL from the environment, else from the repo's .env (local runs). */
export function databaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    try {
      // A path, not new URL('…/.env', import.meta.url): Turbopack copies a file named that way into the build, under the public .next/static/media.
      process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), '../../../.env'));
    } catch {
      // No .env file.
    }
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set; copy .env.example to .env');
  return url;
}

export function createPool(connectionString: string, max = 5): pg.Pool {
  const pool = new pg.Pool({ connectionString, max });
  // The pool emits 'error' for an idle client the server drops (restart, terminated backend, a database dropped while its pool is still closing its
  // sockets); with no listener that is an uncaught exception. The pool has already discarded the client and opens a new one on demand.
  pool.on('error', (e) => console.error('pg pool: idle client dropped:', e.message));
  return pool;
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema });
}
