import { expect, test } from 'vitest';
import { ENHANCE_MODEL, ENHANCE_URL } from './enhance';
import { createFalSuggester, parseSuggestions, SUGGEST_SYSTEM, suggestPrompt } from './suggest';

const answer = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const input = { field: 'script' as const, text: 'váy linen mùa hè', context: 'The product crashes into the scene.', max: 40 };

test('asks the OpenRouter router for three options with the hook, location and the member’s notes, and returns them with the cost', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const suggest = createFalSuggester({
    apiKey: 'k',
    fetch: (url, init) => {
      calls.push({ url: String(url), init: init! });
      return answer({ output: '```json\n["Một", "Hai", "Ba"]\n```', usage: { cost: 0.0003 } });
    },
  });
  expect(await suggest(input)).toEqual({ options: ['Một', 'Hai', 'Ba'], costUsd: 0.0003 });
  expect(calls[0]!.url).toBe(ENHANCE_URL);
  const body = JSON.parse(String(calls[0]!.init.body));
  expect(body).toMatchObject({ model: ENHANCE_MODEL, system_prompt: SUGGEST_SYSTEM });
  expect(body.prompt).toBe(suggestPrompt(input));
  expect(body.prompt).toContain('The video: The product crashes into the scene.');
  expect(body.prompt).toContain("The seller's notes: váy linen mùa hè");
  expect(body.prompt).toContain('at most 40 characters');
});

test('the prompt leaves out an empty context and empty notes', () => {
  expect(suggestPrompt({ field: 'brief', text: '', context: '', max: 1200 })).not.toMatch(/The video|notes/);
});

test('options are trimmed, cut to the limit, de-duplicated and at most three; a non-array or empty answer throws', () => {
  expect(parseSuggestions('[" a ", "a", "' + 'x'.repeat(50) + '", "b", "c", 1]', 10)).toEqual(['a', 'x'.repeat(10), 'b']);
  expect(() => parseSuggestions('Here are some ideas', 10)).toThrow('not a JSON array');
  expect(() => parseSuggestions('{"a": 1}', 10)).toThrow('not a JSON array');
  expect(() => parseSuggestions('["  "]', 10)).toThrow('no options');
});

test('an error field or an HTTP error throws', async () => {
  await expect(createFalSuggester({ apiKey: 'k', fetch: () => answer({ output: '["a"]', error: 'rate limited' }) })(input)).rejects.toThrow('rate limited');
  await expect(createFalSuggester({ apiKey: 'k', fetch: () => answer({ detail: 'no' }, 401) })(input)).rejects.toThrow('HTTP 401');
});
