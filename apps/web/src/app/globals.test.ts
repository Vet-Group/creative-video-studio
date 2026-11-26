import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// A raw check mark in generated content was once garbled by a script save into two other glyphs; a CSS escape survives any encoding.
test('generated content in globals.css uses CSS escapes, not raw glyphs', () => {
  const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
  const values = [...css.matchAll(/content:\s*(['"])(.*?)\1/g)].map((m) => m[2] ?? '');
  expect(values.filter((v) => v === '\\2713')).toHaveLength(3); // the chosen-card badge, the chosen no-choice tile and a picked app chip (multi-angle views, breeds)
  expect(values.filter((v) => /[^\x20-\x7e]/.test(v))).toEqual([]);
});

test('the sessions see-all toggle is a 44px touch target set apart from the list', () => {
  const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
  const rule = css.match(/^.acct-more {([^}]*)}/m)?.[1] ?? '';
  expect(rule).toContain('min-height: 44px');
  expect(rule).toMatch(/margin-top: [1-9]/);
});

const tokenBlocks = (css: string) => ({
  root: css.match(/^:root, \.theme-light \{([^}]*)\}/m), // a .theme-light element keeps the light tokens (the Usage page's PNG)
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

// The 2026-11-18 motion pass: shared timings, entrances and press feedback that stay off for people who ask for less motion.
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
// The text of the block opened by `head`, braces matched.
const blockOf = (css: string, head: string) => {
  const start = css.indexOf(head);
  if (start < 0) return '';
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  return '';
};

test('the motion tokens are defined once on :root for every theme to share', () => {
  const { root, dark } = tokenBlocks(readFileSync(new URL('./globals.css', import.meta.url), 'utf8'));
  const light = declarations(root![1]!);
  for (const name of ['--dur-press', '--dur-fast', '--dur-base', '--dur-slow', '--ease-out']) expect(light.filter((d) => d.startsWith(`${name}:`)), name).toHaveLength(1);
  expect(declarations(dark![1]!).filter((d) => /^--(dur|ease)/.test(d))).toEqual([]);
  expect(light).toContain('--dur-press: 80ms'); // a press answers inside 100 ms
});

test('dialog and toast entrances and the press scale play only under no-preference; Run drops its colour fade under reduce', () => {
  const css = stripComments(readFileSync(new URL('./globals.css', import.meta.url), 'utf8'));
  const motion = blockOf(css, '@media (prefers-reduced-motion: no-preference) {\n  button, .button');
  expect(motion).toContain('@starting-style');
  expect(motion).toMatch(/dialog\.modal:not\(\.jobs-drawer\)\[open\] \{ transition: opacity/);
  expect(motion).toMatch(/:active[^{]*\{ scale: \.97;/);
  expect(motion).toMatch(/\.toast \{ animation: toast-in/);
  // Nothing outside that block starts the entrance, the toast animation or the press scale.
  const rest = css.replace(motion, '');
  expect(rest).not.toContain('@starting-style');
  expect(rest).not.toMatch(/animation: toast-in/);
  expect(rest).not.toMatch(/:active[^{]*\{[^}]*scale:/);
  // Only transform and opacity (scale and translate included) move: no size, margin or inset animates.
  expect(motion).not.toMatch(/transition:[^;}]*\b(width|height|margin|top|left|inset)\b/);
  // A dialog only fades in, so its box is its final size and place from the first frame.
  expect(blockOf(motion, '@starting-style')).not.toMatch(/scale|translate|transform/);
  // A scaled button is the containing block of its absolute ::before, so a button whose ::before covers a whole card, slot or pill keeps its size on a press.
  const press = motion.split('\n').find((l) => /:active \{ scale: \.97;/.test(l))!;
  const stretched = [...css.matchAll(/^([^{}\n]+)::before \{ content: ''; position: absolute; inset: 0; \}/gm)].map((m) => m[1]!.trim()).filter((s) => !/\ba$/.test(s));
  expect(stretched).toEqual(expect.arrayContaining(['.slot-add', '.preset-card button', '.detail-pills .tap']));
  for (const host of stretched) expect(press, host).toContain(host);
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.runbar button\.primary\.run \{ transition: none; \} \}/);
});

// A tool page's tab panel fades in as it shows: opacity only, so it never holds the switch, a click or the layout, and only under no-preference.
test('a shown tab panel fades in at the fast duration, opacity only, inside the no-preference block only', () => {
  const css = stripComments(readFileSync(new URL('./globals.css', import.meta.url), 'utf8'));
  const motion = blockOf(css, '@media (prefers-reduced-motion: no-preference) {\n  button, .button');
  expect(motion).toContain(":where([role='tabpanel'] > :not(dialog)) { animation: panel-in var(--dur-fast) ease-out; }");
  expect(css.replace(motion, '')).not.toContain('panel-in var(');
  expect(css).toMatch(/^@keyframes panel-in \{ from \{ opacity: 0; \} \}$/m);
});

const toHex = (v: string) => {
  const rgb = v.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
  return rgb ? `#${rgb.slice(1).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : v;
};

// The not-ready Run was the brand red at half strength: a muddy red with dim red text in dark.
test('a not-ready Run is a neutral grey whose label reads 4.5:1 in light and in dark', () => {
  const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
  const { root, dark } = tokenBlocks(css);
  const rule = css.match(/^\.runbar button\.primary\.run:disabled \{([^}]*)\}/m)?.[1] ?? '';
  expect(rule).toMatch(/opacity: 1;/); // not the base disabled rule's half strength
  const bg = rule.match(/background: var\((--[\w-]+)\)/)![1]!;
  const fg = rule.match(/(?<!-)color: var\((--[\w-]+)\)/)![1]!;
  for (const [theme, block] of [['light', root], ['dark', dark]] as const) {
    const token = (name: string) => toHex((declarations(block![1]!).find((d) => d.startsWith(`${name}:`)) ?? declarations(root![1]!).find((d) => d.startsWith(`${name}:`)))!.split(': ')[1]!);
    expect(token(bg), theme).not.toBe(token('--brand'));
    expect(contrast(token(fg), token(bg)), theme).toBeGreaterThanOrEqual(4.5);
  }
});
