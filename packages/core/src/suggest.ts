// Suggestions for Marketing Studio (a feature Fash lacks): three short options for the brief (UGC) or the spoken lines (Advanced), written by
// the same fal OpenRouter call as Enhance (enhance.ts), in the worker, which holds the fal key. The member picks one; nothing is generated.
import { ENHANCE_MODEL, ENHANCE_URL } from './enhance';
import { sendJson, timeout, type Fetch } from './providers/http';

export const SUGGESTIONS = 3;

export interface SuggestInput {
  /** `brief`: what the creator should do and say about the product; `script`: the exact lines the creator speaks. */
  field: 'brief' | 'script';
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

const ASK = {
  brief: 'Write three different creator briefs: what the creator does on camera and what they say about the product, as one or two sentences each.',
  script: 'Write three different scripts: the exact words the creator speaks to camera, natural and casual, one or two short sentences each.',
};

/** The user turn of the call: the task, the hook and location when chosen, the member's text and the length limit. */
export function suggestPrompt(i: SuggestInput): string {
  return [ASK[i.field], i.context && `The video: ${i.context}`, i.text && `The seller's notes: ${i.text}`, `Each string at most ${i.max} characters.`].filter(Boolean).join('\n');
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
      body: JSON.stringify({ model, system_prompt: SUGGEST_SYSTEM, prompt: suggestPrompt(input), temperature: 0.9, max_tokens: 600 }),
      signal: timeout(),
    })) as { output?: unknown; error?: unknown; usage?: { cost?: unknown } };
    if (out.error) throw new Error(`fal suggest: ${String(out.error)}`);
    const cost = Number(out.usage?.cost);
    return { options: parseSuggestions(typeof out.output === 'string' ? out.output : '', input.max), costUsd: Number.isFinite(cost) ? cost : null };
  };
}
