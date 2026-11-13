// The reuse link (Fash's Recreate, without the run): the page that made a job, told which job to refill its form from.
import { APPS } from './apps';

const PAGES: Partial<Record<string, string>> = {
  video: '/create',
  marketing: '/marketing-studio',
  try_on: '/try-on',
  image: '/image-generation',
  // The apps, Motion Control too. Smart Remake has no jobs, and its `video` feature must keep pointing at Create.
  ...Object.fromEntries(APPS.filter((a) => !a.soon && a.feature !== 'media_optimizer' && a.slug !== 'smart-remake').map((a) => [a.feature, `/apps/${a.slug}`])),
};

/** The page that made a job of the feature; it opens on its History once the feature has a job. */
export const pageOf = (feature: string): string | undefined => PAGES[feature];

/** Whether the feature's page can refill its form (from a job or a saved template). */
export const canReuse = (feature: string): boolean => PAGES[feature] !== undefined;

/** The API path a page refills its form from: a job (`?reuse=`, the reuse link) or a saved template (`?template=`); both answer in the same shape. */
export function refillFrom(q: { reuse?: unknown; template?: unknown }): string | undefined {
  if (typeof q.reuse === 'string') return `/api/jobs/${encodeURIComponent(q.reuse)}`;
  if (typeof q.template === 'string') return `/api/templates/${encodeURIComponent(q.template)}`;
  return undefined;
}

/** Recreate on a sample of the Examples tab (`?example=`: `marketing-example-<n>` on Marketing Studio, `try-on-example-<n>` on Try On, `image-example-<n>` on Image Generation, `example-<n>` on Create Videos): the sample's details file, read in the same shape, its photos named as samples. */
export function exampleFrom(q: { example?: unknown }): string | undefined {
  return typeof q.example === 'string' && /^(marketing-|try-on-|image-)?example-[1-9]\d*$/.test(q.example) ? `/api/samples/${q.example}.json` : undefined;
}

/** Once a link's refill (?reuse=, ?template=, ?example=) is on the form, the address drops it: a reload or Back must not refill the form over the user's
 * changes and copy its photos again, while the link itself still opens the refill from anywhere. */
export function dropRefillQuery(): void {
  const url = new URL(window.location.href);
  for (const k of ['reuse', 'template', 'example']) url.searchParams.delete(k);
  if (url.href !== window.location.href) window.history.replaceState(null, '', url);
}

/** The page query that refills from `from` (what refillFrom and exampleFrom return), for a refill that has to open on another page. */
export function queryOf(from: string): string {
  const m = from.match(/^\/api\/(jobs|templates|samples)\/([^/]+?)(\.json)?$/);
  return m ? `${{ jobs: 'reuse', templates: 'template', samples: 'example' }[m[1] as 'jobs' | 'templates' | 'samples']}=${m[2]}` : '';
}

/** The link for a job's reuse action, or null for a feature whose page cannot refill from a job yet. */
export function reuseHref(job: { id: string; feature: string }): string | null {
  const page = PAGES[job.feature];
  return page ? `${page}?reuse=${encodeURIComponent(job.id)}` : null;
}
