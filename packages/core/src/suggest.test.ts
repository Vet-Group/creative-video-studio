import { expect, test } from 'vitest';
import { ENHANCE_MODEL, ENHANCE_URL, OPENAI_URL } from './enhance';
import {
  createFalSuggester, createOpenAiSuggester, cutTo, DIRECTIONS, lengthenPrompt, modelNote, parseOption, PROMPT_SYSTEM, PROMPT_TASKS, SCENE_SYSTEM, SUGGEST_SYSTEM,
  suggestPrompt, targetRange, TRANSLATE_SYSTEM,
} from './suggest';

const answer = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const input = { field: 'script' as const, text: 'váy linen mùa hè', context: 'The product crashes into the scene.', max: 40 };
/** A fal answer whose text is `n` characters, with a summary. */
const falText = (text: string, cost = 0.0001) => answer({ output: JSON.stringify({ text, vi: `tóm tắt ${text.length}` }), usage: { cost } });
type FalBody = { model: string; system_prompt: string; prompt: string; temperature: number; max_tokens: number };

test('one call per direction, in order, each with the hook, location, notes and length; the options keep that order with their summaries and the summed cost', async () => {
  const bodies: FalBody[] = [];
  const suggest = createFalSuggester({ apiKey: 'k', fetch: (url, init) => (expect(String(url)).toBe(ENHANCE_URL), bodies.push(JSON.parse(String(init!.body))), falText(`Câu số ${bodies.length} cho video linen mùa hè`)) });
  const out = await suggest(input);
  expect(out).toEqual({ options: ['Câu số 1 cho video linen mùa hè', 'Câu số 2 cho video linen mùa hè', 'Câu số 3 cho video linen mùa hè'], meanings: ['tóm tắt 31', 'tóm tắt 31', 'tóm tắt 31'], costUsd: expect.closeTo(0.0003), provider: 'fal', model: ENHANCE_MODEL });
  expect(bodies.map((b) => b.prompt)).toEqual([0, 1, 2].map((d) => suggestPrompt(input, d)));
  expect(bodies.map((b) => b.system_prompt)).toEqual([SUGGEST_SYSTEM, SUGGEST_SYSTEM, SUGGEST_SYSTEM]);
  DIRECTIONS.forEach((d, i) => expect(bodies[i]!.prompt).toContain(`Direction: ${d}`));
  expect(bodies[0]!.prompt).toContain('The video: The product crashes into the scene.');
  expect(bodies[0]!.prompt).toContain("The seller's notes: váy linen mùa hè");
  expect(bodies[0]!.prompt).toContain('About 36 characters long: never fewer than 28 characters or more than 40.');
});

test('each option aims for 70 to 90 % of the limit, a long one also as sentences; a script with the clip length fits the spoken words', () => {
  expect(targetRange({ field: 'prompt', max: 2500 })).toEqual({ low: 1750, high: 2250, max: 2500 });
  expect(suggestPrompt({ field: 'prompt', task: PROMPT_TASKS.video, text: '', context: '', max: 2500 })).toContain('About 2250 characters long, that is about 18 sentences of about 20 words each: never fewer than 1750 characters or more than 2500.');
  // 10 s at 2.5 words a second is 25 words, about 150 characters, under the field's 300.
  expect(targetRange({ field: 'script', max: 300, seconds: 10 })).toEqual({ low: 105, high: 135, max: 150 });
  expect(suggestPrompt({ field: 'script', text: '', context: '', max: 300, seconds: 10 })).toContain('The lines are spoken in a 10-second clip.');
  expect(suggestPrompt({ field: 'brief', text: '', context: '', max: 1200, seconds: 8 })).toContain('The clip lasts 8 seconds: pace the beats to it.');
  expect(suggestPrompt({ field: 'prompt', task: PROMPT_TASKS.image, text: '', context: '', max: 1200, seconds: 8 })).not.toMatch(/seconds/);
});

test('an option short of the range gets one more call to lengthen it, and the longer text wins; a shorter rewrite keeps the first', async () => {
  const bodies: FalBody[] = [];
  const long = 'A sentence about the light and the camera. '.repeat(3).trim(); // 128 characters
  const suggest = createFalSuggester({
    apiKey: 'k',
    fetch: (_u, init) => {
      const body = JSON.parse(String(init!.body)) as FalBody;
      bodies.push(body);
      if (body.prompt.startsWith('Rewrite')) return falText(body.prompt.includes('Short two') ? 'Tiny' : long);
      return falText(body.prompt.includes('Direction: Faithful') ? 'Short one.' : body.prompt.includes('Direction: Creative') ? 'Short two.' : long);
    },
  });
  const i = { field: 'prompt' as const, task: PROMPT_TASKS.image, text: '', context: '', max: 150 };
  const out = await suggest(i);
  expect(out.options).toEqual([long, 'Short two.', long]);
  const rewrites = bodies.filter((b) => b.prompt.startsWith('Rewrite'));
  expect(rewrites.map((b) => b.prompt)).toEqual(expect.arrayContaining([lengthenPrompt(i, 'Short one.'), lengthenPrompt(i, 'Short two.')]));
  expect(rewrites.every((b) => b.system_prompt === PROMPT_SYSTEM && b.prompt.includes('never fewer than 105 characters'))).toBe(true);
  expect(out.costUsd).toBeCloseTo(0.0005); // three first calls and two rewrites
});

test('the model note names the model, its family tip and the sound only when the clip has it', () => {
  const kling = { id: 'kling-2.6', label: 'Kling 2.6 Pro', endpoint: 'fal-ai/kling-video/v2.6/pro/image-to-video' };
  expect(modelNote(kling, true)).toMatch(/^The model: Kling 2\.6 Pro\. Kling follows a clear order: .* The clip has sound: .*double quotes\.$/);
  expect(modelNote(kling, false)).not.toMatch(/sound/);
  // An endpoint that always makes sound has it with the switch off; a family with no tip is only named.
  expect(modelNote({ id: 'wan-2.7-reference', label: 'WAN', endpoint: 'fal-ai/wan/v2.7/reference-to-video' }, false)).toMatch(/^The model: WAN\. WAN rewards detail: .* The clip has sound/);
  expect(modelNote({ id: 'fashn-v1.6', label: 'FASHN', endpoint: 'x' }, true)).toBe('The model: FASHN.');
  expect(suggestPrompt({ field: 'prompt', task: PROMPT_TASKS.video, text: '', context: '', max: 500, model: modelNote(kling, false) })).toContain('\nThe model: Kling 2.6 Pro.');
});

test("a hook or a location asks for English scene text under its own system prompt; a brief keeps the seller's language", async () => {
  const bodies: FalBody[] = [];
  const suggest = createFalSuggester({ apiKey: 'k', fetch: (_url, init) => (bodies.push(JSON.parse(String(init!.body))), falText('x'.repeat(250))) });
  for (const field of ['hook', 'location', 'brief'] as const) await suggest({ field, text: 'Quán cà phê - góc quán ấm cúng', context: '', max: 300 });
  expect(bodies.map((b) => b.system_prompt)).toEqual([...Array(6).fill(SCENE_SYSTEM), ...Array(3).fill(SUGGEST_SYSTEM)]);
  expect(SCENE_SYSTEM).toMatch(/plain English/);
  expect(bodies[0]!.prompt).toMatch(/^Write one hook: .*"The clip opens"/);
  expect(bodies[3]!.prompt).toMatch(/^Write one place .*noun phrase/);
  expect(bodies[3]!.prompt).toContain("The seller's notes: Quán cà phê - góc quán ấm cúng");
  // Every system prompt that writes options asks for the summary; the field is only ever filled with the text.
  for (const system of [SUGGEST_SYSTEM, SCENE_SYSTEM, PROMPT_SYSTEM]) expect(system).toMatch(/\{"text": the text, "vi": a short summary of it in natural Vietnamese/);
});

test('the prompt leaves out an empty context, empty notes, no model and no seconds', () => {
  expect(suggestPrompt({ field: 'brief', text: '', context: '', max: 1200 })).not.toMatch(/The video|The seller's notes|The model|seconds/);
});

test('an option is a JSON object, a one-item array or a string, in a fence or not, cut to the limit; anything else throws', () => {
  expect(parseOption('```json\n{"text": " A walk. ", "vi": " Đi bộ "}\n```', 100)).toEqual({ text: 'A walk.', vi: 'Đi bộ' });
  expect(parseOption('[{"text": "A walk", "vi": ""}]', 100)).toEqual({ text: 'A walk', vi: null });
  expect(parseOption('["Người mẫu xoay chậm"]', 100)).toEqual({ text: 'Người mẫu xoay chậm', vi: null });
  expect(parseOption(JSON.stringify({ text: 'a', vi: 'v'.repeat(500) }), 100).vi).toHaveLength(400);
  expect(() => parseOption('Here are some ideas', 10)).toThrow('not JSON');
  expect(() => parseOption('{"vi": "no text"}', 10)).toThrow('no text');
});

test('an over-long text is cut at its last sentence end, or its last word when no sentence ends late enough', () => {
  expect(cutTo('First one here. Second one is long.', 25)).toBe('First one here.');
  expect(cutTo('She says "hello there." Then she turns away.', 30)).toBe('She says "hello there."');
  expect(cutTo('One. A very long sentence without any end', 30)).toBe('One. A very long sentence');
  expect(cutTo('short', 30)).toBe('short');
});

test('an error field or an HTTP error fails the run', async () => {
  await expect(createFalSuggester({ apiKey: 'k', fetch: () => answer({ output: '{"text": "a"}', error: 'rate limited' }) })(input)).rejects.toThrow('rate limited');
  await expect(createFalSuggester({ apiKey: 'k', fetch: () => answer({ detail: 'no' }, 401) })(input)).rejects.toThrow('HTTP 401');
});

test("a tool's prompt asks for English under its own system prompt, naming the server's task and keeping the member's notes", async () => {
  const bodies: FalBody[] = [];
  const suggest = createFalSuggester({ apiKey: 'k', fetch: (_url, init) => (bodies.push(JSON.parse(String(init!.body))), falText('y'.repeat(400))) });
  expect((await suggest({ field: 'prompt', task: PROMPT_TASKS.try_on, text: 'đứng ở bãi biển', context: '', max: 500 })).options).toHaveLength(3);
  expect(bodies[0]!.system_prompt).toBe(PROMPT_SYSTEM);
  expect(PROMPT_SYSTEM).toMatch(/plain, concrete English/);
  expect(bodies[0]!.prompt).toBe(`Write one prompt for ${PROMPT_TASKS.try_on}.
Direction: ${DIRECTIONS[0]}
The seller's notes: đứng ở bãi biển
About 450 characters long, that is about 4 sentences of about 20 words each: never fewer than 350 characters or more than 500.`);
});

test('a translation is one call under its own system prompt, cool and long enough, and answers one option with no reading', async () => {
  const bodies: FalBody[] = [];
  const suggest = createFalSuggester({ apiKey: 'k', fetch: (_url, init) => (bodies.push(JSON.parse(String(init!.body))), answer({ output: '["Người mẫu xoay chậm dưới ánh sáng cửa sổ"]', usage: { cost: 0.0001 } })) });
  expect(await suggest({ field: 'translate', text: 'The model turns slowly in window light', context: '', max: 10_000 })).toEqual({ options: ['Người mẫu xoay chậm dưới ánh sáng cửa sổ'], costUsd: 0.0001, provider: 'fal', model: ENHANCE_MODEL });
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({ system_prompt: TRANSLATE_SYSTEM, prompt: 'The prompt:\nThe model turns slowly in window light', temperature: 0.2, max_tokens: 6000 });
  expect(TRANSLATE_SYSTEM).toMatch(/natural, plain Vietnamese/);
});

const chat = (content: unknown, usage?: unknown) => answer({ choices: [{ message: { role: 'assistant', content } }], usage });

test('OpenAI: the same system prompt and user turns, a budget for the length, and the options with their summaries and cost', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const suggest = createOpenAiSuggester({
    apiKey: 'sk',
    fetch: (url, init) => {
      calls.push({ url: String(url), init: init! });
      return chat(JSON.stringify({ text: `Câu ${calls.length} đủ dài cho clip`, vi: 'Tóm tắt' }), { prompt_tokens: 500, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 0 } });
    },
  });
  const out = await suggest(input);
  expect(out).toMatchObject({ options: ['Câu 1 đủ dài cho clip', 'Câu 2 đủ dài cho clip', 'Câu 3 đủ dài cho clip'], meanings: ['Tóm tắt', 'Tóm tắt', 'Tóm tắt'], provider: 'openai', model: 'gpt-6-luna' });
  expect(out.costUsd).toBeCloseTo((3 * (500 * 0.1 + 200 * 0.5)) / 1e6);
  expect(calls[0]!.url).toBe(OPENAI_URL);
  expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer sk');
  expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
    model: 'gpt-6-luna',
    messages: [{ role: 'developer', content: SUGGEST_SYSTEM }, { role: 'user', content: suggestPrompt(input, 0) }],
    reasoning_effort: 'none',
    temperature: 0.9,
    max_completion_tokens: Math.ceil(36 / 3) + 600,
  });
});

test('OpenAI: a translation is its one option, at a low temperature and with room for a long prompt', async () => {
  let body: { messages: { content: string }[]; temperature: number; max_completion_tokens: number } | undefined;
  const suggest = createOpenAiSuggester({ apiKey: 'sk', fetch: (_u, init) => ((body = JSON.parse(String(init!.body))), chat('["Người mẫu xoay chậm bên cửa sổ"]')) });
  expect(await suggest({ field: 'translate', text: 'a model turning slowly by the window', context: '', max: 3000 })).toEqual({ options: ['Người mẫu xoay chậm bên cửa sổ'], costUsd: null, provider: 'openai', model: 'gpt-6-luna' });
  expect(body!.messages[0]!.content).toBe(TRANSLATE_SYSTEM);
  expect([body!.temperature, body!.max_completion_tokens]).toEqual([0.2, 6000]);
});

test('OpenAI: a non-JSON or empty answer, or an HTTP error, fails the run', async () => {
  await expect(createOpenAiSuggester({ apiKey: 'k', fetch: () => chat('Here are some ideas') })(input)).rejects.toThrow('not JSON');
  await expect(createOpenAiSuggester({ apiKey: 'k', fetch: () => chat(null) })(input)).rejects.toThrow('not JSON');
  await expect(createOpenAiSuggester({ apiKey: 'k', fetch: () => answer({ error: { message: 'quota' } }, 429) })(input)).rejects.toThrow('openai suggest: HTTP 429');
});
