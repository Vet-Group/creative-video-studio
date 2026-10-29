// Try On's stock photos, as Fash's pickers offer them (studio-batch.min.js and the page's #tryon-backgrounds, read 2026-10-29). An Admin uploads
// the photos as samples: `try-on-stock-model-<n>.jpg` with its poses `try-on-stock-model-<n>-pose-<p>.jpg`, `try-on-stock-<category>.jpg` with its
// garments `try-on-stock-<category>-<n>.jpg`, and `try-on-bg-<value>.jpg`. A picker shows only what was uploaded.

/** Fash's garment categories, in its order. */
export const GARMENT_CATEGORIES = [
  { id: 'accessories', label: 'Phụ kiện' },
  { id: 'top', label: 'Áo' },
  { id: 'bottom', label: 'Quần' },
  { id: 'shoes', label: 'Giày' },
] as const;

/** Fash's named backgrounds, in its order; the names stay as on Fash, as the sample details show them. */
export const BACKGROUNDS = [
  ['seamless-white', 'Seamless White'], ['warm-sand', 'Warm Sand'], ['pastel', 'Pastel'], ['editorial-grey', 'Editorial Grey'], ['colored-gel', 'Colored Gel'],
  ['terracotta-wall', 'Terracotta Wall'], ['gallery', 'Gallery'], ['arched-corridor', 'Arched Corridor'], ['brutalist', 'Brutalist'], ['concrete-steps', 'Concrete Steps'],
  ['glass-facade', 'Glass Facade'], ['marble-hall', 'Marble Hall'], ['desert-modernism', 'Desert Modernism'], ['poolside-edge', 'Poolside Edge'], ['palm-garden', 'Palm Garden'],
  ['citrus-grove', 'Citrus Grove'], ['greenhouse', 'Greenhouse'], ['boardwalk', 'Boardwalk'], ['beach-midday', 'Beach Midday'], ['marina', 'Marina'],
  ['santorini', 'Santorini'], ['industrial-alley', 'Industrial Alley'], ['subway-platform', 'Subway Platform'], ['rooftop-city', 'Rooftop City'],
  ['london-townhouse', 'London Townhouse'], ['paris-street', 'Paris Street'], ['milan-arcade', 'Milan Arcade'], ['new-york', 'New York Streets'],
] as const;

const num = (name: string) => Number(/(\d+)\.jpg$/.exec(name)?.[1] ?? 0);
const ofPattern = (have: Set<string>, re: RegExp) => [...have].filter((n) => re.test(n)).sort((a, b) => num(a) - num(b));

/** The stock models (their first photo), in number order. */
export const stockModels = (have: Set<string>) => ofPattern(have, /^try-on-stock-model-\d+\.jpg$/);
/** A stock model's poses. */
export const posesOf = (have: Set<string>, model: string) => ofPattern(have, new RegExp(`^${model.replace(/\.jpg$/, '')}-pose-\\d+\\.jpg$`));
/** A category's garments. */
export const garmentsOf = (have: Set<string>, category: string) => ofPattern(have, new RegExp(`^try-on-stock-${category}-\\d+\\.jpg$`));
/** The uploaded backgrounds with their names. */
export const backgroundsIn = (have: Set<string>) => BACKGROUNDS.filter(([value]) => have.has(`try-on-bg-${value}.jpg`)).map(([value, label]) => ({ name: `try-on-bg-${value}.jpg`, label }));
