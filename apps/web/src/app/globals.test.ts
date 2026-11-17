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

// Text reads at 12 px or more (the 2026-11-18 phone pass); only a count, a pair of initials, a chart's SVG label and the login page's own tag draw smaller.
test('no text rule sets a font size under 12 px, but for the count badge, the initials, the ring label and the login tag', () => {
  const small: string[] = [];
  for (const name of ['./globals.css', '../components/MediaOptimizer.module.css', '../components/PromptComposer.module.css', '../components/FashionModelApp.module.css']) {
    const css = readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const size = body!.match(/font-size:\s*([\d.]+)px/)?.[1];
      if (size && Number(size) < 12) small.push(selector!.trim());
    }
  }
  expect(small).toEqual(['.topbar .jobs-open-count', '.login-last', '.protect-ring text', '.fb-avatar']);
});

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x! + 0.05) / (y! + 0.05); };

// The chosen segment of a segmented control drew #2c2c31 on the #1c1c1f track in dark (1.22:1), so the choice barely showed.
test('in dark, the chosen segment stands 3:1 off its track and its text reads 4.5:1 on it', () => {
  const { dark } = tokenBlocks(readFileSync(new URL('./globals.css', import.meta.url), 'utf8'));
  const token = (name: string) => declarations(dark![1]!).find((d) => d.startsWith(`${name}:`))!.split(': ')[1]!.split(' ')[0]!;
  expect(contrast(token('--surface-raised'), token('--surface-1'))).toBeGreaterThanOrEqual(3);
  expect(contrast(token('--ink'), token('--surface-raised'))).toBeGreaterThanOrEqual(4.5);
});
