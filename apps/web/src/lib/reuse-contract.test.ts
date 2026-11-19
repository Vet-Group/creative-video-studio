// The reuse contract: every key GET /api/jobs/:id sends has a reader on some page's refill path, so a field added to the route (or a form field the route does not keep)
// cannot go missing from Reuse unnoticed. The maps below are explicit on purpose: add a key to the route and this fails until you say who reads it.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** The keys of the JSON the route's GET answers with. */
function routeKeys(): string[] {
  const route = source('app/api/jobs/[id]/route.ts');
  const start = route.indexOf('return Response.json({', route.indexOf('export async function GET'));
  const body = route.slice(start, route.indexOf('\n  });', start)).replace(/^\s*\/\/.*$/gm, '');
  return [...body.matchAll(/[{,]\s*(\w+):/g)].map((m) => m[1]!);
}

/** A key a page's refill puts on its form (or reads to say what it could not), and the files that read it as `j.<key>` or `loaded.<key>`. */
const READERS: Record<string, string[]> = {
  feature: ['components/image-tools.tsx', 'components/MarketingStudio.tsx'], // which page the job belongs to
  resolution: ['components/image-tools.tsx'],
  presetId: ['components/CreateForm.tsx', 'components/ImageGeneration.tsx'],
  prompt: ['components/CreateForm.tsx', 'components/ImageGeneration.tsx', 'components/AppPage.tsx'],
  enhance: ['components/CreateForm.tsx', 'components/ImageGeneration.tsx'],
  audio: ['components/CreateForm.tsx', 'components/MarketingStudio.tsx'],
  orientation: ['components/AppPage.tsx'], // Motion Control
  view: ['components/AppPage.tsx'], // the multi-angle app
  breed: ['components/AppPage.tsx'], // the breed swap and name swap apps
  style: ['components/AppPage.tsx'], // the pet portrait app
  product: ['components/AppPage.tsx'], // the mockup pack
  name: ['components/AppPage.tsx'], // the name swap app
  batchItems: ['components/AppPage.tsx'], // every item of a batch app's Run
  ratio: ['components/image-tools.tsx', 'components/CreateForm.tsx', 'components/MarketingStudio.tsx'],
  garments: ['components/TryOn.tsx'],
  pose: ['components/TryOn.tsx'],
  format: ['components/MarketingStudio.tsx'],
  hook: ['components/MarketingStudio.tsx'],
  location: ['components/MarketingStudio.tsx'],
  brief: ['components/TryOn.tsx', 'components/ImageGeneration.tsx', 'components/AppPage.tsx', 'components/MarketingStudio.tsx'],
  script: ['components/MarketingStudio.tsx'],
  roles: ['components/MarketingStudio.tsx'],
  highlights: ['components/MarketingStudio.tsx'],
  brand: ['components/ImageGeneration.tsx', 'components/MarketingStudio.tsx'], // the brand kit switch, with its store
  hookText: ['components/CreateForm.tsx', 'components/MarketingStudio.tsx'],
  ending: ['components/CreateForm.tsx', 'components/MarketingStudio.tsx'],
  endText: ['components/MarketingStudio.tsx'],
  endTextPos: ['components/MarketingStudio.tsx'],
  durationSec: ['components/CreateForm.tsx', 'components/MarketingStudio.tsx'],
  modelId: ['components/image-tools.tsx', 'components/CreateForm.tsx', 'components/MarketingStudio.tsx', 'components/AppPage.tsx'],
  modelLabel: ['components/image-tools.tsx', 'components/CreateForm.tsx', 'components/AppPage.tsx'], // names a model that is gone
  storeId: ['components/CreateForm.tsx', 'components/ImageGeneration.tsx', 'components/MarketingStudio.tsx'],
  storeLost: ['components/CreateForm.tsx', 'components/ImageGeneration.tsx', 'components/MarketingStudio.tsx'], // says the store is hidden
  images: ['components/image-tools.tsx', 'components/CreateForm.tsx', 'components/MarketingStudio.tsx', 'components/TryOn.tsx'],
  inputCount: ['lib/reuse.ts'], // says how many images no longer exist
  inputIds: ['components/TryOn.tsx', 'components/AppPage.tsx', 'components/MarketingStudio.tsx'], // keeps each image in its own slot when one before it is gone
  endFrame: ['components/CreateForm.tsx', 'components/MarketingStudio.tsx'],
  videoRef: ['components/MarketingStudio.tsx'],
  clips: ['components/CreateForm.tsx'],
};

/** A key the route sends that no form takes: what History's cards and the Library's detail show about the job. */
const NOT_FORM_FIELDS: Record<string, string> = {
  id: 'the job itself',
  userId: 'who made it',
  status: 'the card shows it',
  error: 'the card shows it',
  isMock: 'the card shows it',
  enhancedPrompt: 'the Library detail shows the prompt the provider got',
  outputAssetId: 'the result, not an input',
  posterAssetId: 'the result, not an input',
};

test('every key the job route sends is read by a refill or named as not a form field, and none is listed twice or stale', () => {
  const keys = routeKeys();
  expect(keys.length).toBeGreaterThan(30); // the parse found the answer
  const named = [...Object.keys(READERS), ...Object.keys(NOT_FORM_FIELDS)];
  expect(keys.filter((k) => !named.includes(k))).toEqual([]); // a new key: say which page reads it, or why none does
  expect(named.filter((k) => !keys.includes(k))).toEqual([]); // a key the route no longer sends
  expect(Object.keys(READERS).filter((k) => k in NOT_FORM_FIELDS)).toEqual([]);
});

test('each key listed as read is read in its page', () => {
  const unread = Object.entries(READERS).flatMap(([key, files]) => files.filter((f) => !new RegExp(String.raw`\b(?:j|loaded)\.${key}\b`).test(source(f))).map((f) => `${f} does not read ${key}`));
  expect(unread).toEqual([]);
});
