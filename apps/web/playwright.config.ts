import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // No .env file; the settings come from the environment.
}
// Git Bash drops environment variables whose names contain parentheses, and Playwright looks for Edge under PROGRAMFILES(X86) too.
if (process.platform === 'win32') {
  process.env['PROGRAMFILES(X86)'] ??= 'C:\\Program Files (x86)';
  process.env.PROGRAMFILES ??= 'C:\\Program Files';
}
const baseURL = process.env.APP_URL ?? 'http://localhost:3400';

// Browser downloads are not possible here, so the specs drive an installed browser: Edge, else Chrome (both play H.264, which the mock clips use).
const hasEdge = [process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']].some(
  (dir) => dir && existsSync(`${dir}\\Microsoft\\Edge\\Application\\msedge.exe`),
);

// The specs end in .e2e.test.ts so the English check treats their UI strings as test data, and Vitest leaves them alone (vitest.config.ts).
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.test.ts',
  globalSetup: './e2e/warm.ts',
  // One database and one worker serve every spec, and each spec has its own account.
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL,
    channel: hasEdge ? 'msedge' : 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node --import tsx e2e/serve.ts',
    url: `${baseURL}/login`,
    timeout: 240_000,
    reuseExistingServer: false,
  },
});
