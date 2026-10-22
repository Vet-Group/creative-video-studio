import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const root = join(import.meta.dirname, '..');
const FILES = ['docker-compose.yml', 'apps/web/package.json', 'apps/web/scripts/next.ts', 'apps/web/src/app/api/assets/route.test.ts'];

// Each worktree overrides these through its .env, so they may only appear as the default of a CVS_..._PORT variable.
test.each(FILES)('%s hard-codes none of the default ports', (file) => {
  const text = readFileSync(join(root, file), 'utf8')
    .replace(/\$\{CVS_[A-Z0-9_]+_PORT:-\d+\}/g, '')
    .replace(/process\.env\.CVS_[A-Z0-9_]+_PORT \?\? '\d+'/g, '');
  expect(text.match(/\b(5435|9400|9401|3400)\b/g) ?? []).toEqual([]);
});
