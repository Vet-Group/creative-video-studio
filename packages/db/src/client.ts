// Connections shared by the web app and the worker.
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

/** DATABASE_URL from the environment, else from the repo's .env (local runs). */
export function databaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(new URL('../../../.env', import.meta.url));
    } catch {
      // No .env file.
    }
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set; copy .env.example to .env');
  return url;
}

export function createPool(connectionString: string, max = 5): pg.Pool {
  return new pg.Pool({ connectionString, max });
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema });
}
