// A Vietnamese reading of an analysis, shown to the seller beside — never in place of — the English the model
// reads. One LLM call translates the format, hook, summary and every shot prompt together; the English prompt is
// what the "use this prompt" button still sends to Create. Runs on gpt-6-luna when the worker has OPENAI_API_KEY, else fal's
// OpenRouter router on FAL_KEY (the same preference as Enhance/Suggest). Best-effort: a failed or malformed answer
// leaves the analysis English-only.
import { ENHANCE_MODEL, ENHANCE_URL, OPENAI_MODEL, openAiChat } from '../enhance';
import { type Fetch, sendJson, timeout } from '../providers/http';
import type { Analysis, AnalysisVi } from './breakdown';

export const ANALYSIS_TRANSLATE_SYSTEM =
  'You translate a short-video analysis from English into natural, plain Vietnamese so a seller can read it quickly. ' +
  'Keep the meaning and every concrete detail; add and drop nothing. Keep product names, brand names and any on-screen or quoted text as they are. ' +
  'You get a JSON object {"format","hook","summary","shots":[...]}. Reply with only a JSON object of the same shape, each value translated to ' +
  'Vietnamese, the "shots" array the same length and in the same order.';

/** One chat call: the answer text and its cost. */
type Chat = (system: string, user: string, maxTokens: number) => Promise<{ text: string; costUsd: number | null }>;

const openAiChatFn = (apiKey: string, f: Fetch): Chat => (system, user, maxTokens) =>
  openAiChat(f, 'analyze translate', apiKey, OPENAI_MODEL, system, user, 0.3, maxTokens);

const falChatFn = (apiKey: string, f: Fetch): Chat => async (system, user, maxTokens) => {
  const out = (await sendJson(f, 'fal analyze translate', ENHANCE_URL, {
    method: 'POST',
    headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: ENHANCE_MODEL, system_prompt: system, prompt: user, temperature: 0.3, max_tokens: maxTokens }),
    signal: timeout(),
  })) as { output?: unknown; error?: unknown; usage?: { cost?: unknown } };
  if (out.error) throw new Error(`fal analyze translate: ${String(out.error)}`);
  const cost = Number(out.usage?.cost);
  return { text: typeof out.output === 'string' ? out.output : '', costUsd: Number.isFinite(cost) ? cost : null };
};

const unfence = (s: string): string =>
  s
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The pure translation step over an injected chat: one call, parsed and length-checked. Throws on a bad answer. */
export async function translateAnalysisVi(a: Analysis, chat: Chat): Promise<{ vi: AnalysisVi; costUsd: number | null }> {
  const input = JSON.stringify({ format: a.format, hook: a.hook, summary: a.summary, shots: a.shots.map((s) => s.prompt) });
  const { text, costUsd } = await chat(ANALYSIS_TRANSLATE_SYSTEM, input, 2000);
  let v: { format?: unknown; hook?: unknown; summary?: unknown; shots?: unknown };
  try {
    v = JSON.parse(unfence(text));
  } catch {
    throw new Error('analyze translate: the answer is not JSON');
  }
  const shots = Array.isArray(v.shots) ? v.shots.map(str) : [];
  if (shots.length !== a.shots.length) throw new Error('analyze translate: shot count mismatch');
  return { vi: { format: str(v.format), hook: str(v.hook), summary: str(v.summary), shots }, costUsd };
}

/** The worker's default translator: gpt-6-luna (OPENAI_API_KEY) if set, else fal (FAL_KEY); undefined when neither is. */
export function createAnalysisTranslator(opts: {
  openAiKey?: string;
  falKey?: string;
  fetch?: Fetch;
}): ((a: Analysis) => Promise<{ vi: AnalysisVi; costUsd: number | null }>) | undefined {
  const f = opts.fetch ?? fetch;
  const chat = opts.openAiKey ? openAiChatFn(opts.openAiKey, f) : opts.falKey ? falChatFn(opts.falKey, f) : undefined;
  if (!chat) return undefined;
  return (a) => translateAnalysisVi(a, chat);
}
