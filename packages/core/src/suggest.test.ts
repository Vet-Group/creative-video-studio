import { expect, test } from 'vitest';
import { ENHANCE_MODEL, ENHANCE_URL, OPENAI_URL } from './enhance';
import {
  CHECK_SYSTEM, createFalSuggester, FORMAT_NOTES, createOpenAiSuggester, cutTo, DIRECTIONS, lengthenPrompt, modelNote, parseOption, PROMPT_SYSTEM, PROMPT_TASKS, SCENE_SYSTEM, SUGGEST_SYSTEM,
  frameTimes, parseCheck, parseScenes, parseVideoAnswer, PERSON_KEEP, SCENES_SYSTEM, PRODUCT_KEEP, suggestPrompt, targetRange, TRANSLATE_SYSTEM, VIDEO_FRAMES, VIDEO_SYSTEM, videoPrompt,
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

test("a sectioned prompt's ending is English scene text that starts \"The clip ends\" and fits the rest of the clip, under the scene system prompt", async () => {
  const bodies: FalBody[] = [];
  const suggest = createFalSuggester({ apiKey: 'k', fetch: (_url, init) => (bodies.push(JSON.parse(String(init!.body))), falText('The clip ends with the model smiling at the camera.'.padEnd(150, '.'))) });
  const out = await suggest({ field: 'ending', text: 'mỉm cười', context: 'The clip opens with a spin. The model walks to the window.', max: 200, model: 'The model: Kling.' });
  expect(out.options).toHaveLength(3);
  expect(bodies.map((b) => b.system_prompt)).toEqual(Array(3).fill(SCENE_SYSTEM));
  // The same rules as every option: unseen photos and the writing principles.
  expect(SCENE_SYSTEM).toMatch(/You cannot see the photos .* present tense/);
  const user = bodies[0]!.prompt.split('\n');
  expect(user[0]).toMatch(/^Write one ending: the last shot .*starting "The clip ends"\.$/);
  expect(user).toContain('The model: Kling.');
  expect(user).toContain('The rest of the clip: The clip opens with a spin. The model walks to the window.');
  expect(user).toContain("The seller's notes: mỉm cười");
  expect(user.at(-1)).toBe('About 180 characters long: never fewer than 140 characters or more than 200.');
  // A section's hook reads the rest of the clip the same way; a brief keeps "The video" for its hook and location.
  expect(suggestPrompt({ field: 'hook', text: '', context: 'The model walks.', max: 200 })).toContain('\nThe rest of the clip: The model walks.\n');
  expect(suggestPrompt({ field: 'brief', text: '', context: '', max: 500, format: 'unboxing' })).toContain('\nThe clip is an unboxing: the creator, or only their hands when no one is shown, opens a package and reveals the product.\n');
  expect(suggestPrompt({ field: 'ending', text: '', context: '', max: 200, format: 'review' })).toContain('\nThe clip is a product review: the creator talks to the camera about what they like in the product and shows it up close.\n');
  expect(suggestPrompt({ field: 'brief', text: '', context: '', max: 500 })).not.toContain('The clip is a');
  expect(suggestPrompt({ field: 'brief', text: '', context: 'The model walks.', max: 200 })).toContain('\nThe video: The model walks.\n');
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

test('a check is one cool call under its own system prompt with the model, format, pace and prompt, and answers each issue with its fix', async () => {
  const bodies: FalBody[] = [];
  const reply = JSON.stringify({ issues: [{ issue: 'Mở đầu chưa gây chú ý', fix: 'Bắt đầu bằng một chuyển động rõ.' }, { issue: 'Có thể thêm chữ lên video', fix: 'Bỏ cụm "caption".' }] });
  const suggest = createFalSuggester({ apiKey: 'k', fetch: (_url, init) => (bodies.push(JSON.parse(String(init!.body))), answer({ output: reply, usage: { cost: 0.0002 } })) });
  const ask = { field: 'check' as const, text: 'The model turns, a caption appears.', context: '', max: 5000, model: 'The model: Kling T.', seconds: 5, format: 'unboxing' as const };
  expect(await suggest(ask)).toEqual({ options: ['Mở đầu chưa gây chú ý', 'Có thể thêm chữ lên video'], meanings: ['Bắt đầu bằng một chuyển động rõ.', 'Bỏ cụm "caption".'], costUsd: 0.0002, provider: 'fal', model: ENHANCE_MODEL });
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({ system_prompt: CHECK_SYSTEM, temperature: 0.2 });
  expect(bodies[0]!.prompt).toBe(['The model: Kling T.', FORMAT_NOTES.unboxing, 'The clip lasts 5 seconds.', 'The prompt to review:', 'The model turns, a caption appears.'].join('\n'));
  expect(CHECK_SYSTEM).toMatch(/first 2 seconds/);
  expect(CHECK_SYSTEM).toMatch(/never inventing details/);
});

test('a check answer is read strictly: no issues is fine, more than four are cut, and anything malformed is an error and never an OK', () => {
  expect(parseCheck('```json\n{"issues": []}\n```')).toEqual([]);
  expect(parseCheck(JSON.stringify({ issues: Array.from({ length: 6 }, (_, i) => ({ issue: `i${i}`, fix: `f${i}` })) }))).toHaveLength(4);
  for (const bad of ['', 'ổn', '[]', '{}', '{"issues": "none"}', '{"issues": [null]}', '{"issues": [{"issue": "x"}]}', '{"issues": [{"issue": " ", "fix": "y"}]}']) expect(() => parseCheck(bad), bad).toThrow(/suggest:/);
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

const video = { field: 'video' as const, text: '', context: '', max: 5000, clip: 'preset-walk-left.mp4' };
const stills = Array.from({ length: VIDEO_FRAMES }, (_, k) => `data:image/jpeg;base64,${'ABCDEFGH'[k]}AAA`);
const motion = 'The model walks to the left while the camera tracks alongside.';

test('the video system prompt keeps the model to what the stills clearly show', () => {
  for (const rule of [
    'only the subjects, objects, motion and camera moves that are clearly visible in the stills',
    'Never infer events between stills.',
    'If something appears in only one still or is unclear, leave it out.',
    'Prefer fewer, certain details over more, uncertain ones.',
    'Never invent props, particles, pieces, people or text',
    'Write 40 to 90 words',
    'Do not say what must stay unchanged; that is added after.',
  ]) expect(VIDEO_SYSTEM).toContain(rule);
});

test('eight stills, evenly spaced, each numbered with its time when the clip length is known', () => {
  expect(VIDEO_FRAMES).toBe(8);
  expect(frameTimes(8, VIDEO_FRAMES)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]);
  expect(suggestPrompt({ ...video, seconds: 5 })).toBe(
    "The 8 stills of the template's sample clip follow in time order, evenly spaced over it (5.0 seconds long): still 1 of 8 at 0.3 s, still 2 of 8 at 0.9 s, " +
      'still 3 of 8 at 1.6 s, still 4 of 8 at 2.2 s, still 5 of 8 at 2.8 s, still 6 of 8 at 3.4 s, still 7 of 8 at 4.1 s, still 8 of 8 at 4.7 s.',
  );
  expect(suggestPrompt(video)).toBe("The 8 stills of the template's sample clip follow in time order, evenly spaced over it.");
});

test('a preset prompt is the motion, then the keep clauses of a person or of a product (no faces), then the stable line when the camera is', () => {
  expect(videoPrompt({ motion, person: true, stable: true }, 5000)).toBe(`${motion} ${PERSON_KEEP} Smooth, stable camera.`);
  expect(videoPrompt({ motion: ` ${motion} `, person: false, stable: false }, 5000)).toBe(`${motion} ${PRODUCT_KEEP}`);
  expect(PRODUCT_KEEP).toContain('No faces.');
  // The motion is cut so the clauses always fit the limit.
  const out = videoPrompt({ motion: 'A slow drift. '.repeat(40), person: false, stable: true }, 200);
  expect(out.length).toBeLessThanOrEqual(200);
  expect(out.endsWith(`${PRODUCT_KEEP} Smooth, stable camera.`)).toBe(true);
});

test('the vision answer is a JSON object in a fence or not; a camera not said to shake is stable; no motion or no JSON throws', () => {
  expect(parseVideoAnswer('```json\n' + JSON.stringify({ motion, person: true, stable: true }) + '\n```', 5000)).toBe(videoPrompt({ motion, person: true, stable: true }, 5000));
  expect(parseVideoAnswer(JSON.stringify({ motion }), 5000)).toBe(videoPrompt({ motion, person: false, stable: true }, 5000));
  expect(() => parseVideoAnswer(JSON.stringify({ motion: ' ' }), 5000)).toThrow('no motion');
  expect(() => parseVideoAnswer('The camera pushes in.', 5000)).toThrow('not JSON');
});

test("fal: a preset prompt is one call to the router's vision endpoint with the stills and the video system prompt", async () => {
  const calls: { url: string; body: FalBody & { image_urls?: string[] } }[] = [];
  const suggest = createFalSuggester({
    apiKey: 'k',
    fetch: (url, init) => (calls.push({ url: String(url), body: JSON.parse(String(init!.body)) }), answer({ output: JSON.stringify({ motion, person: true, stable: true }), usage: { cost: 0.0012 } })),
  });
  const out = await suggest(video, stills);
  expect(out).toEqual({ options: [videoPrompt({ motion, person: true, stable: true }, 5000)], costUsd: 0.0012, provider: 'fal', model: ENHANCE_MODEL });
  expect(out.options[0]).toBe(`${motion} ${PERSON_KEEP} Smooth, stable camera.`); // the keep clauses come from code, after the model's motion
  expect(calls).toHaveLength(1);
  expect(calls[0]!.url).toBe(`${ENHANCE_URL}/vision`);
  expect(calls[0]!.body).toMatchObject({ model: ENHANCE_MODEL, system_prompt: VIDEO_SYSTEM, prompt: suggestPrompt(video), image_urls: stills });
  expect(calls[0]!.body.image_urls).toHaveLength(8);
  await expect(suggest(video)).rejects.toThrow('no stills'); // never a vision call without the clip
});

test('OpenAI: a preset prompt sends the stills as image parts after the text', async () => {
  let body: { messages: { role: string; content: unknown }[] } | undefined;
  const suggest = createOpenAiSuggester({ apiKey: 'sk', fetch: (_u, init) => ((body = JSON.parse(String(init!.body))), chat(JSON.stringify({ motion, person: false, stable: true }))) });
  expect((await suggest(video, stills)).options).toEqual([videoPrompt({ motion, person: false, stable: true }, 5000)]);
  expect(body!.messages).toEqual([
    { role: 'developer', content: VIDEO_SYSTEM },
    { role: 'user', content: [{ type: 'text', text: suggestPrompt(video) }, ...stills.map((url) => ({ type: 'image_url', image_url: { url } }))] },
  ]);
});

const scenes = { field: 'scenes' as const, text: '', context: '', max: 0, sourceKey: 'v.mp4', productKey: 'p.png', times: [0.3, 4.3, 9] };

test('the scene answer keeps whole scene numbers inside the video, ascending and once each; no JSON or no list throws', () => {
  expect(parseScenes('{"scenes": [3, 1, 1, 2.5, 0, 4, "2"]}', 3)).toEqual([1, 3]);
  expect(parseScenes('```json\n{"scenes": []}\n```', 3)).toEqual([]);
  expect(parseScenes('[2]', 3)).toEqual([2]);
  expect(() => parseScenes('Scenes 1 and 2.', 3)).toThrow('not JSON');
  expect(() => parseScenes('{"scene": [1]}', 3)).toThrow('no scenes');
});

test('fal: a scene pick is one vision call with the product, then a still per scene, and answers the scene numbers as options', async () => {
  const calls: { url: string; body: FalBody & { image_urls?: string[] } }[] = [];
  const suggest = createFalSuggester({
    apiKey: 'k',
    fetch: (url, init) => (calls.push({ url: String(url), body: JSON.parse(String(init!.body)) }), answer({ output: '{"scenes": [2, 3]}', usage: { cost: 0.0009 } })),
  });
  const frames = ['data:image/jpeg;base64,P', 'data:image/jpeg;base64,A', 'data:image/jpeg;base64,B', 'data:image/jpeg;base64,C'];
  expect(await suggest(scenes, frames)).toEqual({ options: ['2', '3'], costUsd: 0.0009, provider: 'fal', model: ENHANCE_MODEL });
  expect(calls).toHaveLength(1);
  expect(calls[0]!.url).toBe(`${ENHANCE_URL}/vision`);
  expect(calls[0]!.body).toMatchObject({ system_prompt: SCENES_SYSTEM, prompt: 'The first image is the product; the other 3 images are scenes 1 to 3.', image_urls: frames });
  await expect(suggest(scenes, frames.slice(0, 3))).rejects.toThrow('one still per scene'); // a still is missing: no call is made
  expect(calls).toHaveLength(1);
});

test('the scene pick matches by product type, not look: a black long-sleeve top in the video still counts for a white T-shirt', () => {
  // gpt-6-luna on prod (2026-11-13) left out all three scenes of a black long-sleeve top for a white T-shirt under "the same kind".
  expect(SCENES_SYSTEM).toMatch(/same general type/);
  expect(SCENES_SYSTEM).toMatch(/Colour, pattern, sleeve length, fit, brand and style do not matter/);
});
