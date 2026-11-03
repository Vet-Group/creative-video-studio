// The limits of POST /api/assets, apart from the server helpers so the forms can check a file before they send it.
export const MAX_FILES = 4;
export const MAX_BYTES = 10 * 1024 * 1024;
/** A reference video (Motion Control). Uploads much over 20 MB failed through the Cloudflare tunnel on 2026-10-25, so this is the cap. */
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
/** A reference audio clip (Create video): fal's limit per file on every endpoint that takes one (schemas read 2026-10-30). */
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
