// The limits of POST /api/assets, apart from the server helpers so the forms can check a file before they send it.
export const MAX_FILES = 4;
export const MAX_BYTES = 10 * 1024 * 1024;
/** A reference video (Motion Control). Uploads much over 20 MB failed through the Cloudflare tunnel on 2026-10-25, so this is the cap. */
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
/**
 * A reference video uploaded straight to R2 (the /analyze page): the browser PUTs it to storage with a presigned URL, so
 * neither the request body nor the tunnel caps it. shortcut: 500 MB, because the analyze worker buffers the source into
 * memory (its unit is 2 GB); stream the worker read to lift this. It is 25x the tunnel-bound cap, enough for any seller clip.
 */
export const MAX_VIDEO_BYTES_R2 = 500 * 1024 * 1024;
/** A reference audio clip (Create video): fal's limit per file on every endpoint that takes one (schemas read 2026-10-30). */
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
