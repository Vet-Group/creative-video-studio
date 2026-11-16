import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseBreakdown } from './breakdown';
import { ANALYSIS_PROMPTS_SYSTEM, createAnalysisPromptWriter, writeScenePrompts } from './prompts';

// Three cuts: the first two are one beat filmed in two cuts (one scene, as mergeShots shows it), the third its own scene.
const raw = {
  whole_video_vlm: { summary: 'A man unboxes a cream jersey in a living room.', format: '开箱' },
  production_plan: { units: [{ prompt: 'Vertical 9:16; soft frontal light, neutral (about 5000K).\nFollow the action of @视频1.' }] },
  shots: [
    {
      index: 1, start: 0, end: 3,
      narrative: { role: 'hook', point: 'A tattooed man pulls a cream jersey out of a bag.' },
      aspects: { framing: { measured: { shot_size: 'medium shot', position: 'centred' } }, camera: { measured: { support: 'handheld', motion: 'smooth_move' } } },
      vlm: { description: '男子从袋子里拿出球衣', camera_move: '推', aspects: { lighting: { location: '客厅' } }, replication: { video_prompt_en: 'A muscular tattooed man takes a cream jersey out of a bag.' } },
    },
    { index: 2, start: 3, end: 5.5, narrative: { role: 'hook', point: 'A tattooed man pulls a cream jersey out of a bag.' } },
    { index: 3, start: 5.5, end: 9, narrative: { role: 'payoff', point: 'He holds the jersey up to show its print.' } },
  ],
};
const a = parseBreakdown(raw);

const answer = (prompts: unknown) => async () => ({ text: JSON.stringify({ prompts }), costUsd: 0.004 });

test('sends one request for the whole analysis: one entry per scene, with what rea-video saw of each cut', async () => {
  let sent: { system: string; user: string; maxTokens: number } | undefined;
  const chat = async (system: string, user: string, maxTokens: number) => {
    sent = { system, user, maxTokens };
    return { text: '{"prompts":["p1","p2"]}', costUsd: 0.004 };
  };
  await writeScenePrompts(a, raw, chat);
  expect(sent!.system).toBe(ANALYSIS_PROMPTS_SYSTEM);
  expect(sent!.maxTokens).toBe(200 + 400 * 2);
  const body = JSON.parse(sent!.user);
  expect(body.video).toEqual({ summary: 'A man unboxes a cream jersey in a living room.', format: '开箱', look: 'Vertical 9:16; soft frontal light, neutral (about 5000K).' });
  // The model is told the count: on a one-scene clip filmed in three cuts it once answered one prompt per cut.
  expect(body.count).toBe(2);
  expect(body.scenes).toHaveLength(2);
  expect(body.scenes[0]).toMatchObject({ n: 1, seconds: 5.5, role: 'hook', beat: 'A tattooed man pulls a cream jersey out of a bag.' });
  expect(body.scenes[0].cuts).toEqual([
    {
      seconds: 3,
      action: 'A muscular tattooed man takes a cream jersey out of a bag.',
      description: '男子从袋子里拿出球衣',
      shot_size: 'medium shot',
      position: 'centred',
      camera: 'handheld, smooth_move, 推',
      look: { lighting: { location: '客厅' } },
    },
    { seconds: 2.5 }, // a cut rea-video did not describe sends only its length
  ]);
  expect(body.scenes[1]).toEqual({ n: 2, seconds: 3.5, role: 'payoff', beat: 'He holds the jersey up to show its print.', cuts: [{ seconds: 3.5 }] });
});

test('gives each scene prompt, as one paragraph, to every stored shot of the scene, and returns the cost', async () => {
  const chat = async () => ({ text: '```json\n{"prompts":["Medium shot at eye level.\\n\\nA man lifts the shirt out of a bag.", "Close-up; the man holds the shirt up."]}\n```', costUsd: 0.004 });
  const { prompts, costUsd } = await writeScenePrompts(a, raw, chat);
  expect(prompts).toEqual(['Medium shot at eye level. A man lifts the shirt out of a bag.', 'Medium shot at eye level. A man lifts the shirt out of a bag.', 'Close-up; the man holds the shirt up.']);
  expect(costUsd).toBe(0.004);
});

test('throws on an answer the caller must not use, so the scenes keep their points', async () => {
  await expect(writeScenePrompts(a, raw, answer(['only one']))).rejects.toThrow('scene count mismatch');
  await expect(writeScenePrompts(a, raw, answer(['p1', 'p2', 'p3']))).rejects.toThrow('scene count mismatch');
  await expect(writeScenePrompts(a, raw, answer(['p1', '  ']))).rejects.toThrow('empty prompt');
  await expect(writeScenePrompts(a, raw, answer(['p1', 7]))).rejects.toThrow('empty prompt');
  await expect(writeScenePrompts(a, raw, answer(['中景，男子拿起衬衫', 'p2']))).rejects.toThrow('not English');
  await expect(writeScenePrompts(a, raw, async () => ({ text: 'sorry, no', costUsd: null }))).rejects.toThrow('not JSON');
  await expect(writeScenePrompts(a, raw, async () => ({ text: 'null', costUsd: null }))).rejects.toThrow('scene count mismatch');
});

test('makes no call for an analysis without shots', async () => {
  const chat = async () => {
    throw new Error('no call expected');
  };
  expect(await writeScenePrompts(parseBreakdown({}), {}, chat)).toEqual({ prompts: [], costUsd: null });
});

test('reads the real rea-video breakdown.json fixture: the English action, the measured framing and the Chinese look', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./__fixtures__/breakdown.sample.json', import.meta.url), 'utf8'));
  let user = '';
  await writeScenePrompts(parseBreakdown(fixture), fixture, async (_s, u) => ((user = u), { text: '{"prompts":["p"]}', costUsd: null }));
  const cut = JSON.parse(user).scenes[0].cuts[0];
  expect(cut.action).toContain('raises her right hand');
  expect(cut.shot_size).toBe('medium close-up');
  expect(cut.position).toBe('centred');
  expect(Object.keys(cut.look)).toEqual(expect.arrayContaining(['framing', 'camera', 'lighting', 'grade']));
});

test('createAnalysisPromptWriter is undefined without a key, and a function with OpenAI or fal', () => {
  expect(createAnalysisPromptWriter({})).toBeUndefined();
  expect(createAnalysisPromptWriter({ openAiKey: 'k' })).toBeTypeOf('function');
  expect(createAnalysisPromptWriter({ falKey: 'k' })).toBeTypeOf('function');
});
