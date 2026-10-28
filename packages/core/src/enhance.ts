// Enhance, as on Fash ("Enhances your prompt with AI for better results"): one LLM call rewrites a member's short prompt into a detailed brief
// before the generation is submitted. It runs through fal's OpenRouter router, so the fal key the worker already has pays for it.
// Docs read 2026-10-26: https://fal.ai/models/openrouter/router/api — input `prompt`, `system_prompt`, `model` (billed by tokens), `temperature`,
// `max_tokens`; output `output` and `usage.cost`. fal-ai/any-llm, the older endpoint, is deprecated.
import { sendJson, timeout, type Fetch } from './providers/http';

export const ENHANCE_URL = 'https://fal.run/openrouter/router';
export const ENHANCE_MODEL = 'google/gemini-2.5-flash';
export type EnhanceKind = 'video' | 'image';
/** `maxChars`: the job's model prompt limit (promptLimit in models.ts), which the rewrite is cut to. */
export type Enhancer = (prompt: string, kind: EnhanceKind, maxChars: number) => Promise<{ prompt: string; costUsd: number | null }>;

// The brief is written from the text alone, and a first trial made up logo text and garment colours; so nothing visual may be invented.
const KEEP =
  'You cannot see the reference images. Never invent or name anything about what they show (colours, printed text, logos, garments, brands, ' +
  'the people, their age or looks, the place): refer to it as "the product", "the garment", "the model" or by the user\'s own words. ' +
  'Keep every concrete detail the user gave: named products, colours, quoted text, and tokens such as [Image1] exactly as written; ' +
  'never add an [ImageN] token the user did not write. If the request is not in English, translate it; only quoted text keeps its language. ' +
  'Write in English, as one plain paragraph of 60 to 140 words, with no title, list, quotes or comments around it. Reply with the brief only.';

export const SYSTEM_PROMPTS: Record<EnhanceKind, string> = {
  video:
    'You turn a short request into a detailed motion brief for an image-to-video model. The reference images already fix the product, the people, ' +
    'their clothes and the setting, so do not describe or change how they look. Describe the main motion, the camera movement, the pacing, any light ' +
    'change, and what must stay unchanged (product shape, printed text, colours, faces). ' +
    KEEP,
  image:
    'You turn a short request into a detailed photographic brief for an image model that also receives reference images. Describe the subject, ' +
    'composition and framing, the lighting, the lens and camera feel, the background and the mood. Keep the products and people of the references ' +
    'as they are. ' +
    KEEP,
};

/** The rewrite, trimmed and cut to the model's prompt limit; an empty or failed answer throws, and the caller keeps the member's prompt. */
export function createFalEnhancer({ apiKey, fetch: f = fetch, model = ENHANCE_MODEL }: { apiKey: string; fetch?: Fetch; model?: string }): Enhancer {
  return async (prompt, kind, maxChars) => {
    const out = (await sendJson(f, 'fal enhance', ENHANCE_URL, {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, system_prompt: SYSTEM_PROMPTS[kind], prompt, temperature: 0.7, max_tokens: 400 }),
      signal: timeout(),
    })) as { output?: unknown; error?: unknown; usage?: { cost?: unknown } };
    if (out.error) throw new Error(`fal enhance: ${String(out.error)}`);
    const text = typeof out.output === 'string' ? out.output.trim().replace(/^"(.*)"$/s, '$1').trim() : '';
    if (text === '') throw new Error('fal enhance: empty answer');
    const cost = Number(out.usage?.cost);
    return { prompt: text.slice(0, maxChars), costUsd: Number.isFinite(cost) ? cost : null };
  };
}
