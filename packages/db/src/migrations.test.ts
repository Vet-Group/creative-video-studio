// CI runs `drizzle-kit generate` and fails on any diff; this runs the same comparison locally: the latest snapshot must equal the schema.
import { readdirSync, readFileSync } from 'node:fs';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { expect, test } from 'vitest';
import * as schema from './schema';

const metaDir = new URL('../migrations/meta/', import.meta.url);

test('the latest migration snapshot matches the schema, so generate has nothing to add', async () => {
  const latest = readdirSync(metaDir).filter((f) => /^\d{4}_snapshot\.json$/.test(f)).sort().at(-1)!;
  const previous = JSON.parse(readFileSync(new URL(latest, metaDir), 'utf8'));
  expect(await generateMigration(previous, generateDrizzleJson(schema))).toEqual([]);
});
