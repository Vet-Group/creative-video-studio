// The reuse link (Fash's Recreate, without the run): the page that made a job, told which job to refill its form from.
import { APPS } from './apps';

const PAGES: Partial<Record<string, string>> = {
  video: '/create',
  marketing: '/marketing-studio',
  try_on: '/try-on',
  image: '/image-generation',
  // The image apps; Motion Control's form has no refill yet.
  ...Object.fromEntries(APPS.filter((a) => !a.soon && a.feature !== 'motion_control').map((a) => [a.feature, `/apps/${a.slug}`])),
};

/** The link for a job's reuse action, or null for a feature whose page cannot refill from a job yet. */
export function reuseHref(job: { id: string; feature: string }): string | null {
  const page = PAGES[job.feature];
  return page ? `${page}?reuse=${encodeURIComponent(job.id)}` : null;
}
