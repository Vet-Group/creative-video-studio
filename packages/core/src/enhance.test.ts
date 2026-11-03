import { expect, test } from 'vitest';
import { createFalEnhancer, createOpenAiEnhancer, ENHANCE_MODEL, ENHANCE_URL, OPENAI_URL, openAiCost, SYSTEM_PROMPTS } from './enhance';

const answer = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

test('sends the prompt with the kind’s system prompt to the OpenRouter router and returns the brief and its cost', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const enhance = createFalEnhancer({
    apiKey: 'k',
    fetch: (url, init) => {
      calls.push({ url: String(url), init: init! });
      return answer({ output: '  "A slow push-in on [Image1] as soft light sweeps across the fabric."  ', usage: { cost: 0.00042 } });
    },
  });
  expect(await enhance('push in on [Image1]', 'video', 2000)).toEqual({ prompt: 'A slow push-in on [Image1] as soft light sweeps across the fabric.', costUsd: 0.00042, provider: 'fal', model: ENHANCE_MODEL });
  expect(calls[0]!.url).toBe(ENHANCE_URL);
  expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Key k');
  expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ model: ENHANCE_MODEL, prompt: 'push in on [Image1]', system_prompt: SYSTEM_PROMPTS.video });
});

test('uses the image system prompt for an image job, cuts a long answer to the model’s prompt limit and tolerates a missing cost', async () => {
  let sent = '';
  const enhance = createFalEnhancer({ apiKey: 'k', fetch: (_u, init) => ((sent = String(init!.body)), answer({ output: 'x'.repeat(2550) })) });
  const r = await enhance('a red dress on a beach', 'image', 2500);
  expect(JSON.parse(sent).system_prompt).toBe(SYSTEM_PROMPTS.image);
  expect(r).toEqual({ prompt: 'x'.repeat(2500), costUsd: null, provider: 'fal', model: ENHANCE_MODEL });
});

test('an empty answer, an error field or an HTTP error throws, so the caller keeps the member’s prompt', async () => {
  await expect(createFalEnhancer({ apiKey: 'k', fetch: () => answer({ output: '  ' }) })('a', 'video', 2000)).rejects.toThrow('empty answer');
  await expect(createFalEnhancer({ apiKey: 'k', fetch: () => answer({ output: 'b', error: 'rate limited' }) })('a', 'video', 2000)).rejects.toThrow('rate limited');
  await expect(createFalEnhancer({ apiKey: 'k', fetch: () => answer({ detail: 'no' }, 401) })('a', 'video', 2000)).rejects.toThrow('HTTP 401');
});

const chat = (content: unknown, usage?: unknown) => answer({ choices: [{ message: { role: 'assistant', content } }], usage });

test('OpenAI: sends gpt-6-luna the kind’s system prompt with effort none and a token limit, and returns the brief and its cost', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const enhance = createOpenAiEnhancer({
    apiKey: 'sk',
    fetch: (url, init) => {
      calls.push({ url: String(url), init: init! });
      return chat('  "A slow push-in on [Image1]."  ', { prompt_tokens: 400, completion_tokens: 120 });
    },
  });
  expect(await enhance('push in on [Image1]', 'video', 2000)).toEqual({ prompt: 'A slow push-in on [Image1].', costUsd: (400 * 0.1 + 120 * 0.5) / 1e6, provider: 'openai', model: 'gpt-6-luna' });
  expect(calls[0]!.url).toBe(OPENAI_URL);
  expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer sk');
  expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
    model: 'gpt-6-luna',
    messages: [{ role: 'developer', content: SYSTEM_PROMPTS.video }, { role: 'user', content: 'push in on [Image1]' }],
    reasoning_effort: 'none',
    temperature: 0.7,
    max_completion_tokens: 400,
  });
  const image = createOpenAiEnhancer({ apiKey: 'sk', fetch: (url, init) => (calls.push({ url: String(url), init: init! }), chat('x'.repeat(2550))) });
  expect(await image('a red dress', 'image', 2500)).toEqual({ prompt: 'x'.repeat(2500), costUsd: null, provider: 'openai', model: 'gpt-6-luna' });
  expect(JSON.parse(String(calls[1]!.init.body)).messages[0].content).toBe(SYSTEM_PROMPTS.image);
});

test('OpenAI cost: cached and cache-written input at their own rates, output (reasoning included) at the output rate; no usage is no cost', () => {
  const usage = { prompt_tokens: 2000, completion_tokens: 300, prompt_tokens_details: { cached_tokens: 1024, cache_write_tokens: 500 } };
  expect(openAiCost(usage)).toBeCloseTo((476 * 0.1 + 1024 * 0.01 + 500 * 0.125 + 300 * 0.5) / 1e6, 15);
  expect(openAiCost({ prompt_tokens: 1_000_000, completion_tokens: 1_000_000 })).toBeCloseTo(0.6, 12);
  expect(openAiCost(undefined)).toBeNull();
  expect(openAiCost({ completion_tokens: 3 })).toBeNull();
});

test('OpenAI: an empty or missing answer, or an HTTP error, throws, so the caller keeps the member’s prompt', async () => {
  await expect(createOpenAiEnhancer({ apiKey: 'k', fetch: () => chat('  ') })('a', 'video', 2000)).rejects.toThrow('openai enhance: empty answer');
  await expect(createOpenAiEnhancer({ apiKey: 'k', fetch: () => chat(null) })('a', 'video', 2000)).rejects.toThrow('empty answer');
  await expect(createOpenAiEnhancer({ apiKey: 'k', fetch: () => answer({ choices: [] }) })('a', 'video', 2000)).rejects.toThrow('empty answer');
  await expect(createOpenAiEnhancer({ apiKey: 'k', fetch: () => answer({ error: { message: 'bad key' } }, 401) })('a', 'video', 2000)).rejects.toThrow('openai enhance: HTTP 401');
});
