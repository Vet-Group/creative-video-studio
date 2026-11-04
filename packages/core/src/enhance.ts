// Enhance, as on Fash ("Enhances your prompt with AI for better results"): one LLM call rewrites a member's short prompt into a detailed brief
// before the generation is submitted. It runs on OpenAI (below) when the worker has OPENAI_API_KEY, else through fal's OpenRouter router on the fal key.
// Docs read 2026-10-26: https://fal.ai/models/openrouter/router/api — input `prompt`, `system_prompt`, `model` (billed by tokens), `temperature`,
// `max_tokens`; output `output` and `usage.cost`. fal-ai/any-llm, the older endpoint, is deprecated.
import { sendJson, timeout, type Fetch } from './providers/http';

export const ENHANCE_URL = 'https://fal.run/openrouter/router';
export const ENHANCE_MODEL = 'google/gemini-2.5-flash';
export type EnhanceKind = 'video' | 'image';
/** `maxChars`: the job's model prompt limit (promptLimit in models.ts), which the rewrite is cut to. */
/** `provider` and `model`: who answered and with what, for the call's ledger row. */
export type Enhancer = (prompt: string, kind: EnhanceKind, maxChars: number) => Promise<{ prompt: string; costUsd: number | null; provider: string; model: string }>;

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
    return { prompt: text.slice(0, maxChars), costUsd: Number.isFinite(cost) ? cost : null, provider: 'fal', model };
  };
}

// The OpenAI Platform runs the same calls on gpt-6-luna (owner decision, 2026-11-04) when the worker has OPENAI_API_KEY; fal stays the fallback.
// Docs read 2026-11-04: https://developers.openai.com/api/docs/models/gpt-6-luna.md, https://developers.openai.com/api/docs/guides/latest-model.md and
// https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create.md — Chat Completions takes `messages`,
// `max_completion_tokens` (reasoning tokens included), `reasoning_effort` and `temperature` (accepted only with effort `none`); the answer is
// `choices[0].message.content`, and `usage.prompt_tokens` includes `prompt_tokens_details.cached_tokens` and `cache_write_tokens`.
export const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
export const OPENAI_MODEL = 'gpt-6-luna';
/** USD per 1M tokens, Standard tier, prompts under 272K tokens (https://developers.openai.com/api/docs/pricing.md, read 2026-11-04). */
export const OPENAI_PRICES = { input: 0.1, cachedInput: 0.01, cacheWrite: 0.125, output: 0.5 };

interface OpenAiUsage { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } }

/** A call's cost: input at the uncached, cached or cache-write rate, and every completion token (reasoning included) at the output rate. */
export function openAiCost(usage: OpenAiUsage | undefined): number | null {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  if (!usage || typeof usage.prompt_tokens !== 'number' || typeof usage.completion_tokens !== 'number') return null;
  const cached = n(usage.prompt_tokens_details?.cached_tokens);
  const written = n(usage.prompt_tokens_details?.cache_write_tokens);
  const p = OPENAI_PRICES;
  return (Math.max(0, usage.prompt_tokens - cached - written) * p.input + cached * p.cachedInput + written * p.cacheWrite + usage.completion_tokens * p.output) / 1e6;
}

/**
 * One Chat Completions call: the answer's text (trimmed, '' when there is none) and its cost. Effort `none`: the tasks are short rewrites and
 * translations that need no planning, it is the fastest and cheapest setting, and it is the only one that keeps our temperatures.
 * `images` (data URLs) follow the user turn's text as image parts.
 */
export async function openAiChat(
  f: Fetch, what: string, apiKey: string, model: string, system: string, user: string, temperature: number, maxTokens: number, images: string[] = [],
): Promise<{ text: string; costUsd: number | null }> {
  const out = (await sendJson(f, what, OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'developer', content: system },
        { role: 'user', content: images.length ? [{ type: 'text', text: user }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))] : user },
      ],
      reasoning_effort: 'none',
      temperature,
      max_completion_tokens: maxTokens,
    }),
    signal: timeout(),
  })) as { choices?: { message?: { content?: unknown } }[]; usage?: OpenAiUsage };
  const content = out.choices?.[0]?.message?.content;
  return { text: typeof content === 'string' ? content.trim() : '', costUsd: openAiCost(out.usage) };
}

/** The OpenAI twin of createFalEnhancer, with the same prompts, cut and errors. */
export function createOpenAiEnhancer({ apiKey, fetch: f = fetch, model = OPENAI_MODEL }: { apiKey: string; fetch?: Fetch; model?: string }): Enhancer {
  return async (prompt, kind, maxChars) => {
    const { text, costUsd } = await openAiChat(f, 'openai enhance', apiKey, model, SYSTEM_PROMPTS[kind], prompt, 0.7, 400);
    const brief = text.replace(/^"(.*)"$/s, '$1').trim();
    if (brief === '') throw new Error('openai enhance: empty answer');
    return { prompt: brief.slice(0, maxChars), costUsd, provider: 'openai', model };
  };
}
