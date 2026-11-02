// Suggestions (a feature Fash lacks): three short options for Marketing Studio's brief (UGC) or spoken lines (Advanced), the English
// scene of a member's own hook or location from its Vietnamese name and description, or the English prompt of any other tool, written by
// the same fal OpenRouter call as Enhance (enhance.ts), in the worker, which holds the fal key. The member picks one; nothing is generated.
import { ENHANCE_MODEL, ENHANCE_URL } from './enhance';
import { sendJson, timeout, type Fetch } from './providers/http';

export const SUGGESTIONS = 3;

export interface SuggestInput {
  /** `brief`: what the creator should do and say about the product; `script`: the exact lines the creator speaks; `hook` and `location`: the
   * English scene of a new hook or location (the phrase the prompt takes), from the member's Vietnamese name and description in `text`;
   * `prompt`: the English prompt of the tool in `task`. */
  field: 'brief' | 'script' | 'hook' | 'location' | 'prompt';
  /** For a prompt: what the tool does and what its prompt should say (PROMPT_TASKS, picked by the server, never the member's words). */
  task?: string;
  /** The member's own text so far (may be empty). */
  text: string;
  /** The chosen hook and location as the English phrases the prompt uses, when chosen. */
  context: string;
  /** The field's character limit. */
  max: number;
}

export type Suggester = (input: SuggestInput) => Promise<{ options: string[]; costUsd: number | null }>;

export const SUGGEST_SYSTEM =
  'You help a fashion seller write a short UGC (user-generated content) video. You cannot see the photos of the creator or the product: never ' +
  'invent their colours, printed text, logos, brand or looks; say "the product", "the outfit" or use the seller\'s own words. Keep every concrete ' +
  'detail the seller gave. Write in the language of the seller\'s text, or in Vietnamese when it is empty. Reply with a JSON array of exactly ' +
  `${SUGGESTIONS} different strings and nothing else.`;

/** For a hook or a location the answer is always English, whatever the member wrote: the video models read English best. */
export const SCENE_SYSTEM =
  "You write the English scene text an AI video model reads for a fashion UGC clip, from a seller's short Vietnamese name and description of it. " +
  "Keep their meaning and every concrete detail, add nothing about the product's colours, printed text, logos or brand, and write plain English " +
  `with no Vietnamese. Reply with a JSON array of exactly ${SUGGESTIONS} different strings and nothing else.`;

/** For a prompt, the answer is English too, and it describes only what the tool's prompt controls. */
export const PROMPT_SYSTEM =
  'You write prompts for an AI tool a fashion seller uses on their own photos. You cannot see the photos: never invent the colours, printed ' +
  'text, logos, brand or looks of the product, garment or person; say "the product", "the outfit" or "the model" instead. Keep every concrete ' +
  'detail the seller gave, translated to English when needed. Write plain, concrete English with no Vietnamese. Reply with a JSON array of ' +
  `exactly ${SUGGESTIONS} different strings and nothing else.`;

/** What each tool's prompt should say, by feature (the Create, Image Generation, Try On and app pages that take a prompt). */
export const PROMPT_TASKS = {
  video: "an image-to-video model that animates the seller's product photos into a short clip. Describe the motion, the camera move and the light",
  image: "an image model that creates a fashion photo, optionally from reference photos. Describe the subject, the setting, the light and the framing",
  try_on: "a virtual try-on that dresses a model in the seller's garments. Describe the pose, the setting and the light, not the garments",
  character_swap: "a tool that replaces the person in a video with the seller's model photo. Describe how the new person should look and move",
  model_swap: "a tool that replaces the model in a fashion photo while keeping the outfit. Describe the new model's look and pose",
  background_changer: "a tool that puts the product photo on a new background. Describe only the new background as a short scene",
  lingerie_try_on: "a lingerie try-on on a model photo for a fashion shop. Describe a tasteful pose, the setting and the light, not the garment",
} as const;

const ASK = {
  brief: 'Write three different creator briefs: what the creator does on camera and what they say about the product, as one or two sentences each.',
  script: 'Write three different scripts: the exact words the creator speaks to camera, natural and casual, one or two short sentences each.',
  hook: 'Write three different hooks: one English sentence each on what happens in the first one or two seconds of the clip, starting "The clip opens".',
  location: 'Write three different places the clip is set in: a short English noun phrase each, such as "a cozy corner cafe with warm light", not a sentence.',
  prompt: 'Write three different prompts, one or two sentences each, for',
};

/** The user turn of the call: the task, the hook and location when chosen, the member's text and the length limit. */
export function suggestPrompt(i: SuggestInput): string {
  return [i.field === 'prompt' ? `${ASK.prompt} ${i.task}.` : ASK[i.field], i.context && `The video: ${i.context}`, i.text && `The seller's notes: ${i.text}`, `Each string at most ${i.max} characters.`].filter(Boolean).join('\n');
}

/** The options from the model's answer: a JSON array (possibly in a code fence), trimmed, de-duplicated, cut to `max`, at most three. */
export function parseSuggestions(answer: string, max: number): string[] {
  const json = answer.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1');
  let list: unknown;
  try {
    list = JSON.parse(json);
  } catch {
    throw new Error('fal suggest: the answer is not a JSON array');
  }
  if (!Array.isArray(list)) throw new Error('fal suggest: the answer is not a JSON array');
  const options = [...new Set(list.filter((s): s is string => typeof s === 'string').map((s) => s.trim().slice(0, max).trim()))].filter(Boolean).slice(0, SUGGESTIONS);
  if (options.length === 0) throw new Error('fal suggest: no options');
  return options;
}

export function createFalSuggester({ apiKey, fetch: f = fetch, model = ENHANCE_MODEL }: { apiKey: string; fetch?: Fetch; model?: string }): Suggester {
  return async (input) => {
    const out = (await sendJson(f, 'fal suggest', ENHANCE_URL, {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, system_prompt: input.field === 'prompt' ? PROMPT_SYSTEM : input.field === 'hook' || input.field === 'location' ? SCENE_SYSTEM : SUGGEST_SYSTEM, prompt: suggestPrompt(input), temperature: 0.9, max_tokens: 600 }),
      signal: timeout(),
    })) as { output?: unknown; error?: unknown; usage?: { cost?: unknown } };
    if (out.error) throw new Error(`fal suggest: ${String(out.error)}`);
    const cost = Number(out.usage?.cost);
    return { options: parseSuggestions(typeof out.output === 'string' ? out.output : '', input.max), costUsd: Number.isFinite(cost) ? cost : null };
  };
}
