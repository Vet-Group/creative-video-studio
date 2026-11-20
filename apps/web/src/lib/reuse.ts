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

/** Recreate on a sample of the Examples tab (`?example=`: `marketing-example-<n>` on Marketing Studio, `try-on-example-<n>` on Try On, `image-example-<n>` on Image Generation, `jewelry-try-on-example-<n>` and `lingerie-try-on-example-<n>` on their apps, `example-<n>` on Create Videos): the sample's details file, read in the same shape, its photos named as samples. */
export function exampleFrom(q: { example?: unknown }): string | undefined {
  return typeof q.example === 'string' && /^(marketing-|try-on-|image-|jewelry-try-on-|lingerie-try-on-)?example-[1-9]\d*$/.test(q.example) ? `/api/samples/${q.example}.json` : undefined;
}

/** Once a link's refill (?reuse=, ?template=, ?example=) is on the form, the address drops it: a reload or Back must not refill the form over the user's
 * changes and copy its photos again, while the link itself still opens the refill from anywhere. */
export function dropRefillQuery(): void {
  const url = new URL(window.location.href);
  for (const k of ['reuse', 'template', 'example', 'recipe']) url.searchParams.delete(k);
  if (url.href !== window.location.href) window.history.replaceState(null, '', url);
}

/** The page query that refills from `from` (what refillFrom and exampleFrom return), for a refill that has to open on another page. */
export function queryOf(from: string): string {
  const m = from.match(/^\/api\/(jobs|templates|samples)\/([^/]+?)(\.json)?$/);
  return m ? `${{ jobs: 'reuse', templates: 'template', samples: 'example' }[m[1] as 'jobs' | 'templates' | 'samples']}=${m[2]}` : '';
}

/** A company example (a result on the Examples tab) fills the whole form, its photos too, so it can run as shown (owner, 2026-11-16); only its store stays off the form.
 * Its photos are marked, and the photo field asks the member to swap in their own product (ExampleNote). */
export const asExample = <I extends object>(images: I[]): (I & { example: true })[] => images.map((i) => ({ ...i, example: true as const }));

/** The link for a job's reuse action, or null for a feature whose page cannot refill from a job yet. */
export function reuseHref(job: { id: string; feature: string }): string | null {
  const page = PAGES[job.feature];
  return page ? `${page}?reuse=${encodeURIComponent(job.id)}` : null;
}

/** What a refill could not bring back, each told to the member with its reason instead of dropped silently. */
export interface Skipped {
  /** The job's model is not offered here (switched off or hidden by an Admin, or not for this page); `instead` is the one the form chose. */
  model?: { label: string | null; instead: string | null };
  /** Input photos that no longer exist (deleted or purged). */
  lost?: number;
  /** Photos the form has no place for, left out. */
  extra?: { count: number; max: number };
  /** The job's store, hidden since or another billing team's. */
  store?: boolean;
}

/** One line for a refill that left something out: what came back, then what did not and why; empty when nothing was skipped. `kept` is how many photos were put back. */
export function skippedNote(kept: number, s: Skipped): string {
  const list = [
    ...(s.model ? [`mô hình ${s.model.label ?? 'đã dùng'} (đã tắt hoặc không còn dùng ở trang này${s.model.instead ? `, đã chọn ${s.model.instead}` : ''})`] : []),
    ...(s.lost ? [`${s.lost} ảnh đầu vào (đã bị xoá)`] : []),
    ...(s.extra ? [`${s.extra.count} ảnh thừa (chỗ này chỉ nhận ${s.extra.max} ảnh)`] : []),
    ...(s.store ? ['cửa hàng (đã bị ẩn hoặc không thuộc team của bạn)'] : []),
  ];
  return list.length === 0 ? '' : `Đã điền lại ${kept > 0 ? `${kept} ảnh và ` : ''}phần còn lại. Không dùng lại được: ${list.join('; ')}.`;
}

/** Whether a job's or a template's refill has nothing to bring back: it had input photos, none exists any more, and it has no words to put in the form. */
export const nothingRefilled = (j: { inputCount?: number; images: unknown[]; prompt?: string | null; brief?: string | null }): boolean =>
  (j.inputCount ?? 0) > 0 && j.images.length === 0 && !(j.brief || j.prompt)?.trim();

/** The line for a refill that changed nothing (see nothingRefilled); `from` is the path it came from, a job's or a template's. */
export const nothingNote = (lost: number, from: string): string =>
  `Không dùng lại được: ${lost} ảnh đầu vào đã bị xoá và ${from.startsWith('/api/templates/') ? 'thiết lập' : 'lượt'} này không có mô tả. Biểu mẫu được giữ nguyên.`;

/** How many of a job's or a template's input photos no longer exist (GET /api/jobs/:id and /api/templates/:id tell how many it had); 0 for a sample, which has no count. */
export const lostInputs = (j: { inputCount?: number; images: unknown[] }): number => Math.max(0, (j.inputCount ?? 0) - j.images.length);

/** A job's or a template's input photos in the places they were sent or saved in (`inputIds`, GET /api/jobs/:id and /api/templates/:id), a deleted one as
 * null, so the photos after it keep their roles; without ids (a sample) the photos as they come. */
export const alignInputs = <I extends { id: string }>(ids: string[] | undefined, images: I[]): (I | null)[] => (ids ? ids.map((id) => images.find((i) => i.id === id) ?? null) : images);

/** Try On's photos back in their slots: the person, then `garments` garments (all but the person when the count is unknown), then the background; a deleted one leaves its slot empty. */
export function tryOnSlots<I extends { id: string }>(ids: string[] | undefined, images: I[], garments: number | null): { person: I[]; garments: I[]; background: I[] } {
  const sent = alignInputs(ids, images);
  const n = garments ?? sent.length - 1;
  const slot = (from: number, to: number) => sent.slice(from, to).filter((i) => i !== null);
  return { person: slot(0, 1), garments: slot(1, 1 + n), background: slot(1 + n, 2 + n) };
}

/** A form's photos as a template saves them, slot by slot (what alignInputs reads back): '' for an empty slot of one photo, so the photos after it keep
 * their slots; a slot of several (`many`, an app's pieces) has as many places as photos. */
export const placesOf = (slots: { id: string }[][], kinds: { many?: boolean }[] = []): string[] =>
  slots.flatMap((s, i) => (s.length === 0 && !kinds[i]?.many ? [''] : s.map((p) => p.id)));

/** Try On's photos as a template saves them (what tryOnSlots reads back): no garment still holds one empty place, as an empty person does, so a backdrop stays the backdrop. */
export const tryOnPlaces = (person: { id: string }[], garments: { id: string }[], background: { id: string }[]): { images: string[]; garments: number } => ({
  images: placesOf([person, garments, background]),
  garments: Math.max(1, garments.length),
});
