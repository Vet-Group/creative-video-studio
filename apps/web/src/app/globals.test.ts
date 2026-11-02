import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// A raw check mark in generated content was once garbled by a script save into two other glyphs; a CSS escape survives any encoding.
test('generated content in globals.css uses CSS escapes, not raw glyphs', () => {
  const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
  const values = [...css.matchAll(/content:\s*(['"])(.*?)\1/g)].map((m) => m[2] ?? '');
  expect(values.filter((v) => v === '\\2713')).toHaveLength(2); // the chosen-card badge and the chosen no-choice tile
  expect(values.filter((v) => /[^\x20-\x7e]/.test(v))).toEqual([]);
});

test('the sessions see-all toggle is a 44px touch target set apart from the list', () => {
  const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
  const rule = css.match(/^.acct-more {([^}]*)}/m)?.[1] ?? '';
  expect(rule).toContain('min-height: 44px');
  expect(rule).toMatch(/margin-top: [1-9]/);
});

const tokenBlocks = (css: string) => ({
  root: css.match(/^:root \{([^}]*)\}/m),
  dark: css.match(/^:root\[data-theme='dark'\][^{]*\{([^}]*)\}/m),
  system: css.match(/^@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='light'\]\)[^{]*\{([^}]*)\}\s*\}/m),
});
const declarations = (block: string) => [...block.matchAll(/(--[\w-]+|color-scheme)\s*:\s*([^;]+);/g)].map((m) => `${m[1]}: ${m[2]!.trim()}`);

// The dark theme redefines tokens only, so a colour written straight into a rule would stay light in it.
test('rules use colour tokens only: no hex, rgb() or named colour outside the token blocks', () => {
  for (const name of ['./globals.css', '../components/MediaOptimizer.module.css', '../components/PromptComposer.module.css']) {
    let css = readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of Object.values(tokenBlocks(css))) if (m) css = css.replace(m[0], '');
    const values = [...css.matchAll(/:\s*([^;{}]+)[;}]/g)].map((m) => m[1]!);
    expect(values.filter((v) => /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.]|(?<![\w-])(?:white|black)(?![\w-])/i.test(v)), name).toEqual([]);
  }
});

test('the dark theme and the system dark mode set the same tokens, each one defined for the light theme too', () => {
  const { root, dark, system } = tokenBlocks(readFileSync(new URL('./globals.css', import.meta.url), 'utf8'));
  const light = new Set(declarations(root![1]!).map((d) => d.split(':')[0]));
  const darkTokens = declarations(dark![1]!);
  expect(darkTokens.length).toBeGreaterThan(40);
  expect(declarations(system![1]!)).toEqual(darkTokens);
  expect(darkTokens.map((d) => d.split(':')[0]).filter((t) => t !== 'color-scheme' && !light.has(t))).toEqual([]);
});
