// Asset queries shared by the web app and the worker (apps do not depend on drizzle-orm themselves).
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from './client';
import { assets } from './schema';

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;

export async function insertAssets(db: Db, rows: NewAsset[]): Promise<void> {
  await db.insert(assets).values(rows);
}

/** A live (not soft-deleted) asset, or undefined. */
export async function findAsset(db: Db, id: string): Promise<Asset | undefined> {
  const [row] = await db.select().from(assets).where(and(eq(assets.id, id), isNull(assets.deletedAt)));
  return row;
}
