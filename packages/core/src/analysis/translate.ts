// A Vietnamese reading of an analysis, shown to the seller beside — never in place of — the English the model
// reads. One LLM call translates the format, hook, summary and every distinct shot prompt together; the English prompt is
// what the "use this prompt" button still sends to Create. Runs on gpt-6-luna when the worker has OPENAI_API_KEY, else fal's
// OpenRouter router on FAL_KEY (the same preference as Enhance/Suggest); the scene prompt writer (prompts.ts) uses the same chat.
// Best-effort: a failed or malformed answer leaves the analysis English-only.
import { ENHANCE_MODEL, ENHANCE_URL, OPENAI_MODEL, openAiChat } from '../enhance';
import { type Fetch, sendJson, timeout } from '../providers/http';
import type { Analysis, AnalysisVi } from './breakdown';

export const ANALYSIS_TRANSLATE_SYSTEM =
  'You translate a short-video analysis into natural, plain Vietnamese so a seller can read it quickly. ' +
  'The fields are mostly English, but some (often "format") may be Chinese or another language: translate those to Vietnamese too. ' +
  'Every value you return must be written in Vietnamese; never answer in Chinese. ' +
  'Keep the meaning and every concrete detail; add and drop nothing. Keep product names, brand names and any on-screen or quoted text as they are. ' +
  'You get a JSON object {"format","hook","summary","shots":[...]}. Reply with only a JSON object of the same shape, each value translated to ' +
  'Vietnamese, the "shots" array the same length and in the same order.';

// Chinese or Japanese script in an answer means the model answered in the wrong language (seen in production when the
// analysis' format came back as 商品展示): such a reading is dropped rather than shown as Vietnamese.
export const CJK = /[぀-ヿ㐀-鿿豈-﫿]/;

/** One chat call: the answer text and its cost. */
export type Chat = (system: string, user: string, maxTokens: number) => Promise<{ text: string; costUsd: number | null }>;

// Both analysis calls answer a whole video in one long JSON, which can take longer than the default 30 s wait.
const CHAT_TIMEOUT_MS = 120_000;

const openAiChatFn = (apiKey: string, f: Fetch, what: string): Chat => (system, user, maxTokens) =>
  openAiChat(f, what, apiKey, OPENAI_MODEL, system, user, 0.3, maxTokens, [], CHAT_TIMEOUT_MS);

const falChatFn = (apiKey: string, f: Fetch, what: string): Chat => async (system, user, maxTokens) => {
  const out = (await sendJson(f, `fal ${what}`, ENHANCE_URL, {
    method: 'POST',
    headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: ENHANCE_MODEL, system_prompt: system, prompt: user, temperature: 0.3, max_tokens: maxTokens }),
    signal: timeout(CHAT_TIMEOUT_MS),
  })) as { output?: unknown; error?: unknown; usage?: { cost?: unknown } };
  if (out.error) throw new Error(`fal ${what}: ${String(out.error)}`);
  const cost = Number(out.usage?.cost);
  return { text: typeof out.output === 'string' ? out.output : '', costUsd: Number.isFinite(cost) ? cost : null };
};

export const unfence = (s: string): string =>
  s
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * The pure translation step over an injected chat: one call, parsed and length-checked. Throws on a bad answer. Shots of one scene share a prompt,
 * so each distinct prompt is sent once and its reading given back to every shot that has it.
 */
export async function translateAnalysisVi(a: Analysis, chat: Chat): Promise<{ vi: AnalysisVi; costUsd: number | null }> {
  const prompts = [...new Set(a.shots.map((s) => s.prompt))];
  const input = JSON.stringify({ format: a.format, hook: a.hook, summary: a.summary, shots: prompts });
  // The Vietnamese answer takes about half as many tokens as the English JSON has characters: allow one per character (unused tokens cost nothing),
  // and never less than the old budget, which short prompts fit.
  const { text, costUsd } = await chat(ANALYSIS_TRANSLATE_SYSTEM, input, Math.max(2000, input.length));
  let v: { format?: unknown; hook?: unknown; summary?: unknown; shots?: unknown };
  try {
    v = JSON.parse(unfence(text));
  } catch {
    throw new Error('analyze translate: the answer is not JSON');
  }
  const shots = Array.isArray(v.shots) ? v.shots.map(str) : [];
  if (shots.length !== prompts.length) throw new Error('analyze translate: shot count mismatch');
  const vi = { format: str(v.format), hook: str(v.hook), summary: str(v.summary), shots: a.shots.map((s) => shots[prompts.indexOf(s.prompt)]!) };
  if (CJK.test([vi.format, vi.hook, vi.summary, ...shots].join('\n'))) throw new Error('analyze translate: the answer is not Vietnamese');
  return { vi, costUsd };
}

export interface AnalysisLlmKeys {
  openAiKey?: string;
  falKey?: string;
  fetch?: Fetch;
}

/** The analysis chat with who answers it, for the ledger: gpt-6-luna (OPENAI_API_KEY) if set, else fal (FAL_KEY); undefined when neither is. `what` names the call in errors. */
export function analysisChat(opts: AnalysisLlmKeys, what: string): { chat: Chat; provider: string; model: string } | undefined {
  const f = opts.fetch ?? fetch;
  if (opts.openAiKey) return { chat: openAiChatFn(opts.openAiKey, f, what), provider: 'openai', model: OPENAI_MODEL };
  if (opts.falKey) return { chat: falChatFn(opts.falKey, f, what), provider: 'fal', model: ENHANCE_MODEL };
  return undefined;
}

/** The worker's default translator on analysisChat; undefined when no key is set. */
export function createAnalysisTranslator(opts: AnalysisLlmKeys): ((a: Analysis) => Promise<{ vi: AnalysisVi; costUsd: number | null }>) | undefined {
  const c = analysisChat(opts, 'analyze translate');
  return c && ((a) => translateAnalysisVi(a, c.chat));
}
