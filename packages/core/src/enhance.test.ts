import { expect, test } from 'vitest';
import { createFalEnhancer, ENHANCE_MODEL, ENHANCE_URL, SYSTEM_PROMPTS } from './enhance';

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
  expect(await enhance('push in on [Image1]', 'video', 2000)).toEqual({ prompt: 'A slow push-in on [Image1] as soft light sweeps across the fabric.', costUsd: 0.00042 });
  expect(calls[0]!.url).toBe(ENHANCE_URL);
  expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Key k');
  expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ model: ENHANCE_MODEL, prompt: 'push in on [Image1]', system_prompt: SYSTEM_PROMPTS.video });
});

test('uses the image system prompt for an image job, cuts a long answer to the model’s prompt limit and tolerates a missing cost', async () => {
  let sent = '';
  const enhance = createFalEnhancer({ apiKey: 'k', fetch: (_u, init) => ((sent = String(init!.body)), answer({ output: 'x'.repeat(2550) })) });
  const r = await enhance('a red dress on a beach', 'image', 2500);
  expect(JSON.parse(sent).system_prompt).toBe(SYSTEM_PROMPTS.image);
  expect(r).toEqual({ prompt: 'x'.repeat(2500), costUsd: null });
});

test('an empty answer, an error field or an HTTP error throws, so the caller keeps the member’s prompt', async () => {
  await expect(createFalEnhancer({ apiKey: 'k', fetch: () => answer({ output: '  ' }) })('a', 'video', 2000)).rejects.toThrow('empty answer');
  await expect(createFalEnhancer({ apiKey: 'k', fetch: () => answer({ output: 'b', error: 'rate limited' }) })('a', 'video', 2000)).rejects.toThrow('rate limited');
  await expect(createFalEnhancer({ apiKey: 'k', fetch: () => answer({ detail: 'no' }, 401) })('a', 'video', 2000)).rejects.toThrow('HTTP 401');
});
