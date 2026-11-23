/**
 * The prompt's image tokens. A job sends its input images in the order of `assetIds` (the order the page lists them): the API keeps it as
 * `input_asset_ids`, the worker turns that into `imageUrls` in the same order, each video adapter rewrites [ImageN] to its schema's name for the
 * Nth of them (packages/core/src/providers/http.ts imageTokens), and the image adapters (fal, Vertex Gemini) send it as "image N". So the Nth attached image is [ImageN], counting from 1.
 */
export const imageToken = (n: number) => `[Image${n}]`;

/**
 * `text` with the token for image `n` put over the selection `start`..`end` (a bare caret when equal), a space on a side that would glue it to a word.
 * Null when the result would pass `maxLength`. `caret` is just after what it put.
 */
export function insertImageToken(text: string, n: number, start: number, end: number, maxLength?: number): { text: string; caret: number } | null {
  const from = Math.min(Math.max(start, 0), text.length);
  const to = Math.min(Math.max(end, from), text.length);
  const before = text.slice(0, from);
  const after = text.slice(to);
  const put = `${before && !/\s$/.test(before) ? ' ' : ''}${imageToken(n)}${/^[\p{L}\p{N}]/u.test(after) ? ' ' : ''}`;
  const next = before + put + after;
  if (maxLength !== undefined && next.length > maxLength) return null;
  return { text: next, caret: before.length + put.length };
}
