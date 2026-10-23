import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // tsconfig says jsx: preserve for Next; the component specs render to static markup and need the JSX compiled.
  oxc: { jsx: { runtime: 'automatic' } },
  // The Playwright specs run with `pnpm e2e`.
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
});
