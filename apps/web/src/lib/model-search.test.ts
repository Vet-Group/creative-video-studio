import { expect, test } from 'vitest';
import { CHIPS, normalize, searchModels, suggest, type SearchableModel } from './model-search';

const m = (id: string, label: string, o: Partial<SearchableModel> = {}): SearchableModel => ({ id, label, supported: true, estimateUsd: '1.00', ...o });

const MODELS = [
  m('seedance-2.0', 'Seedance 2.0', { resolution: '1080p', durationsSec: [4, 5, 10, 15], audio: true, isNew: true, estimateUsd: '2.40', score: 90, recommended: true }),
  m('seedance-1.5-pro', 'Seedance 1.5 Pro', { resolution: '720p', durationsSec: [5, 10], audio: true, estimateUsd: '1.20', score: 80 }),
  m('kling-2.5-turbo-pro', 'Kling 2.5 Turbo Pro', { resolution: '1080p', durationsSec: [5, 10], estimateUsd: '0.70', score: 85 }),
  m('minimax-hailuo-02', 'Hailuo 02', { supported: false, resolution: '1080p', durationsSec: [6, 10], audio: true, estimateUsd: '0.10', score: 95 }),
  m('veo-3.1', 'Veo 3.1', { resolution: '1080p', durationsSec: [4, 6, 8], audio: true, estimateUsd: '3.20', score: 88 }),
  m('veo-3.1-lite', 'Veo 3.1 Lite', { resolution: '720p', durationsSec: [4, 8], audio: true, estimateUsd: '0.80', score: 70 }),
  m('nano-banana-pro', 'Nano Banana Pro', { resolution: '1K/2K/4K', estimateUsd: '0.15', score: 75 }),
  m('wan-2.6', 'Wan 2.6', { resolution: '1080p', durationsSec: [5, 10, 15], audio: true, isNew: true, estimateUsd: '0.50', score: 60 }),
  m('grok-imagine', 'Grok Imagine', { resolution: '720p', durationsSec: [6, 10], audio: true, estimateUsd: '0.40', score: 65 }),
];

const ids = (query: string, chips: Parameters<typeof searchModels>[2] = []) => searchModels(MODELS, query, chips).map((h) => h.model.id);

test('normalize lowercases, strips diacritics and maps đ to d, keeping spaces and punctuation', () => {
  expect(normalize('Đổi Màu, Hạ-Cánh_Ưu')).toBe('doi mau, ha-canh_uu');
  expect(normalize('CÓ TIẾNG')).toBe('co tieng');
});

test('an empty query with no chips gives every model in input order, with no ranges', () => {
  const hits = searchModels(MODELS, '  ');
  expect(hits.map((h) => h.model.id)).toEqual(MODELS.map((x) => x.id)); // the unsupported Hailuo stays in place
  expect(hits.every((h) => h.ranges.length === 0)).toBe(true);
});

test('matching ignores case, diacritics, spaces, dots, dashes and underscores, and looks at the label, the id and the family name', () => {
  for (const q of ['veo31', 'VEO 3 1', 'veo-3.1', 'veo_3.1', 'Véo 3.1']) expect(ids(q)).toEqual(['veo-3.1', 'veo-3.1-lite']); // the exact label first
  expect(ids('nanobanana')).toEqual(['nano-banana-pro']);
  expect(ids('hailuo02')).toEqual(['minimax-hailuo-02']);
  expect(ids('turbo kling')).toEqual(['kling-2.5-turbo-pro']); // any order
  const other = [m('flux-3', 'Pro Fill'), m('mock-e2e', 'Mock')];
  expect(searchModels(other, 'flux').map((h) => h.model.id)).toEqual(['flux-3']); // by id (and the FLUX family)
  expect(searchModels([m('mock-1', 'Phối cảnh Đẹp')], 'DEP').map((h) => h.model.id)).toEqual(['mock-1']);
});

test('typos are forgiven, in step with the length of the word; nonsense matches nothing', () => {
  expect(ids('sedance')).toEqual(['seedance-2.0', 'seedance-1.5-pro']);
  expect(ids('klng 2.5')).toEqual(['kling-2.5-turbo-pro']);
  expect(ids('kilng')).toEqual(['kling-2.5-turbo-pro']); // a swapped pair counts as one typo
  expect(ids('seedanc')).toEqual(['seedance-2.0', 'seedance-1.5-pro']); // a word still being typed
  expect(ids('zzqx')).toEqual([]);
  expect(ids('vo')).toEqual([]); // two letters get no budget
});

test('resolution, audio, length and new words filter instead of matching names', () => {
  expect(ids('1080p')).toEqual(['seedance-2.0', 'veo-3.1', 'kling-2.5-turbo-pro', 'wan-2.6', 'minimax-hailuo-02']);
  expect(ids('720P')).toEqual(['seedance-1.5-pro', 'veo-3.1-lite', 'grok-imagine']);
  expect(ids('4k')).toEqual(['nano-banana-pro']);
  const audio = ['seedance-2.0', 'veo-3.1', 'seedance-1.5-pro', 'wan-2.6', 'grok-imagine', 'veo-3.1-lite', 'minimax-hailuo-02'];
  for (const q of ['có tiếng', 'co tieng', 'tiếng', 'audio', 'âm thanh', 'am thanh', 'sound']) expect(ids(q).sort()).toEqual([...audio].sort());
  const ten = ['seedance-2.0', 'seedance-1.5-pro', 'kling-2.5-turbo-pro', 'wan-2.6', 'grok-imagine', 'minimax-hailuo-02'];
  for (const q of ['10s', '10 s', '10 giây', '10giay']) expect(ids(q).sort()).toEqual([...ten].sort());
  expect(ids('8s').sort()).toEqual(['veo-3.1', 'veo-3.1-lite']); // any integer, not just 10
  for (const q of ['mới', 'moi', 'new']) expect(ids(q).sort()).toEqual(['seedance-2.0', 'wan-2.6']);
  expect(searchModels(MODELS, '1080p có tiếng 10s').every((h) => h.ranges.length === 0)).toBe(true);
});

test('cheap words sort by price, ascending, without filtering; the unsupported model still goes last', () => {
  const byPrice = ['nano-banana-pro', 'grok-imagine', 'wan-2.6', 'kling-2.5-turbo-pro', 'veo-3.1-lite', 'seedance-1.5-pro', 'seedance-2.0', 'veo-3.1', 'minimax-hailuo-02'];
  for (const q of ['rẻ', 're', 'cheap', 'giá rẻ']) expect(ids(q)).toEqual(byPrice);
  expect(ids('veo rẻ')).toEqual(['veo-3.1-lite', 'veo-3.1']);
  expect(ids('veo')).toEqual(['veo-3.1', 'veo-3.1-lite']); // the exact name first without it
});

test('provider words filter to that family, and several terms are AND-combined', () => {
  expect(ids('google').sort()).toEqual(['nano-banana-pro', 'veo-3.1', 'veo-3.1-lite']);
  expect(ids('Bytedance').sort()).toEqual(['seedance-1.5-pro', 'seedance-2.0']);
  expect(ids('kuaishou')).toEqual(['kling-2.5-turbo-pro']);
  expect(ids('alibaba')).toEqual(['wan-2.6']);
  expect(ids('minimax')).toEqual(['minimax-hailuo-02']);
  expect(ids('xai')).toEqual(['grok-imagine']);
  expect(ids('goog')).toEqual(ids('google')); // a provider word being typed
  expect(ids('google 1080p có tiếng')).toEqual(['veo-3.1']);
  expect(ids('google pro')).toEqual(['nano-banana-pro']);
  expect(ids('seedance 10s mới')).toEqual(['seedance-2.0']);
  expect(ids('veo google')).toEqual(['veo-3.1', 'veo-3.1-lite']); // 'veo' is a name here, not a provider word
});

test('name matches rank exact, prefix, word start, inside a word, typo; supported first; then recommended, score, input order', () => {
  const list = [m('mock-1', 'Lyte', { score: 99 }), m('mock-2', 'Elite Cam', { score: 98 }), m('mock-3', 'Cam Lite', { score: 97 }), m('mock-4', 'Lite Pro', { score: 96 }), m('mock-5', 'Lite', { score: 1 })];
  const order = (q: string, models: SearchableModel[]) => searchModels(models, q).map((h) => h.model.id);
  expect(order('lite', list)).toEqual(['mock-5', 'mock-4', 'mock-3', 'mock-2', 'mock-1']);
  expect(order('lite', [m('mock-1', 'Lite', { supported: false }), m('mock-2', 'Lyte')])).toEqual(['mock-2', 'mock-1']); // supported beats a better match
  const tie = [m('a', 'Foo Pro', { score: 10 }), m('b', 'Bar Pro', { score: 50 }), m('c', 'Baz Pro', { score: 50 }), m('d', 'Qux Pro', { score: 5, recommended: true })];
  expect(order('pro', tie)).toEqual(['d', 'b', 'c', 'a']);
});

test('ranges point at the matched characters of the original label, diacritics and separators included', () => {
  const range = (label: string, q: string) => searchModels([m('mock-1', label)], q)[0]!.ranges.map(([s, e]) => label.slice(s, e));
  expect(range('Veo 3.1', 'veo31')).toEqual(['Veo 3.1']);
  expect(range('Seedance 1.5 Pro', 'pro')).toEqual(['Pro']);
  expect(range('Seedance 1.5 Pro', 'pro seedance')).toEqual(['Seedance', 'Pro']); // sorted
  expect(range('Phối cảnh Đẹp', 'canh dep')).toEqual(['cảnh Đẹp']);
  expect(range('Phối cảnh Đẹp', 'đẹp')).toEqual(['Đẹp']);
  expect(range('Nano Banana Pro', 'nano ban')).toEqual(['Nano Ban']);
  const nfd = 'Cảnh Đẹp'.normalize('NFD'); // a decomposed label: the string is longer than its letters
  expect(nfd.length).toBeGreaterThan('Cảnh Đẹp'.length);
  expect(range(nfd, 'canh')).toEqual([nfd.slice(0, 5)]); // the whole word, the combining mark on its vowel included
  expect(searchModels([m('mock-1', 'Seedance 2.0')], 'sedance')[0]!.ranges).toEqual([[0, 8]]); // a typo highlights the word it meant
  expect(range('Seedance 2.0', 'sedance 2')).toEqual(['Seedance', '2']);
  expect(searchModels([m('minimax-hailuo-02', 'Hailuo 02')], 'minimax')[0]!.ranges).toEqual([]); // matched by id: nothing to highlight
});

test('chips filter like the words do and combine with the query', () => {
  expect(CHIPS.map((c) => [c.key, c.label])).toEqual([['audio', 'Có âm thanh'], ['1080p', '1080p'], ['cheap', 'Rẻ nhất'], ['new', 'Mới']]);
  expect(ids('', ['new']).sort()).toEqual(['seedance-2.0', 'wan-2.6']);
  expect(ids('', ['1080p'])).toEqual(ids('1080p'));
  expect(ids('', ['audio'])).toEqual(ids('có tiếng'));
  expect(ids('', ['cheap'])).toEqual(ids('rẻ'));
  expect(ids('veo', ['audio', '1080p'])).toEqual(['veo-3.1']);
  expect(ids('veo', ['cheap'])).toEqual(['veo-3.1-lite', 'veo-3.1']);
  expect(ids('seedance', ['new'])).toEqual(['seedance-2.0']);
  expect(searchModels(MODELS, '', ['audio', 'new']).every((h) => h.ranges.length === 0)).toBe(true);
});

test('a query that matches nothing gets the closest model, or none when everything is far', () => {
  expect(ids('seedanse 9')).toEqual([]);
  expect(suggest(MODELS, 'seedanse 9')?.id).toBe('seedance-2.0');
  expect(ids('vo 3.2')).toEqual([]);
  expect(suggest(MODELS, 'vo 3.2')?.id).toBe('veo-3.1');
  expect(suggest(MODELS, 'zzqx')).toBeNull();
  expect(suggest(MODELS, 'zzqx 99')).toBeNull();
  expect(suggest(MODELS, '')).toBeNull();
  expect(suggest(MODELS, ' - ')).toBeNull();
  expect(suggest([], 'veo')).toBeNull();
});

test('a list of 60 models is searched quickly', () => {
  const many = Array.from({ length: 60 }, (_, i) => m(`mock-${i}`, `Model ${i} ${['Pro', 'Lite', 'Turbo'][i % 3]}`, { score: i }));
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) searchModels(many, 'modl 12 turbo');
  expect(performance.now() - t0).toBeLessThan(1000);
});

test('a full label typed as the query finds that model first (the e2e helper searches by the plain name)', () => {
  const labels = ['Mock image E2E', 'Mock pets E2E', 'Mock pets priced', 'Mock angles E2E', 'Mock E2E Wide', 'Mock image Solo', 'Short model', 'Wide model', 'One image model', 'Two image model', 'Four image model', 'Nano Banana 2.1', 'MiniMax H3 Max'];
  const list = labels.map((label, i) => m(`m-${i}`, label));
  for (const label of labels) expect(searchModels(list, label)[0]?.model.label).toBe(label);
});

test("a chip's own label typed as the query filters as the chip does", () => {
  for (const c of CHIPS) expect(ids(c.label), c.label).toEqual(ids('', [c.key]));
  expect(ids('giá rẻ nhất')).toEqual(ids('', ['cheap']));
  expect(ids('co am thanh')).toEqual(ids('', ['audio']));
});
