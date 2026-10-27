// "Dùng lại" (Fash's Recreate, without the run): the page that made a job, told which job to refill its form from.
const PAGES: Partial<Record<string, string>> = { video: '/create', marketing: '/marketing-studio' };

/** The link for a job's Dùng lại, or null for a feature whose page cannot refill from a job yet. */
export function reuseHref(job: { id: string; feature: string }): string | null {
  const page = PAGES[job.feature];
  return page ? `${page}?reuse=${encodeURIComponent(job.id)}` : null;
}
