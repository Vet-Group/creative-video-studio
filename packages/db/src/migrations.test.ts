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

test('journal stamps only grow, so the migrator never skips a new migration on a database that has run the older ones', () => {
  const { entries } = JSON.parse(readFileSync(new URL('_journal.json', metaDir), 'utf8')) as { entries: { when: number }[] };
  for (let i = 1; i < entries.length; i++) expect(entries[i]!.when).toBeGreaterThan(entries[i - 1]!.when);
});
