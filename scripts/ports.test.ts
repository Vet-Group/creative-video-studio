import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const root = join(import.meta.dirname, '..');

// Each worktree overrides these through its .env, so they may only appear as a ${CVS_..._PORT:-default}.
test.each(['docker-compose.yml', 'apps/web/package.json'])('%s hard-codes none of the default ports', (file) => {
  const text = readFileSync(join(root, file), 'utf8').replace(/\$\{CVS_[A-Z0-9_]+_PORT:-\d+\}/g, '');
  expect(text.match(/\b(5435|9400|9401|3400)\b/g) ?? []).toEqual([]);
});
