// Suggestions (a feature Fash lacks): three options for Marketing Studio's brief (UGC) or spoken lines (Advanced), the English
// scene of a member's own hook, location or ending from its Vietnamese name and description, a sectioned prompt's hook or ending written to
// fit its other sections, or the English prompt of any other tool, written by
// the same LLM as Enhance (enhance.ts: OpenAI, else fal), in the worker, which holds the keys. The member picks one; nothing is generated.
// For a template editor it also writes a motion preset's prompt from stills of the preset's clip (`video`, a vision call).
import { ENHANCE_MODEL, ENHANCE_URL, OPENAI_MODEL, openAiChat } from './enhance';
import { ALWAYS_AUDIO, AUDIO_USD_PER_SECOND } from './models';
import { sendJson, timeout, type Fetch } from './providers/http';

export const SUGGESTIONS = 3;

/** Each option aims for 70 to 90 % of its field's limit (owner, 2026-11-04: the options were about a tenth of the room the model takes). */
export const TARGET_SHARE = { low: 0.7, high: 0.9 } as const;
/** Speech at a natural pace, for lines that must fit the clip: about 2.5 words a second, about 6 characters a word with its space. */
const WORDS_PER_SECOND = 2.5;
const CHARS_PER_WORD = 6;
/** A 20-word sentence of description, measured on the answers of 2026-11-04. */
const CHARS_PER_SENTENCE = 125;
/** The Vietnamese summary asks for 300 characters and sometimes runs over; past this it is cut. */
const MAX_SUMMARY = 400;

export interface SuggestInput {
  /** `brief`: what the creator should do and say about the product; `script`: the exact lines the creator speaks; `hook`, `location` and
   * `ending`: the English scene of a new hook, location or ending (the phrase the prompt takes), from the member's Vietnamese name and description
   * in `text`, or a sectioned prompt's hook or ending from the member's own words so far, with the prompt's other sections in `context`;
   * `prompt`: the English prompt of the tool in `task`; `translate`: one Vietnamese reading of the English `text`, for the member only;
   * `video`: one motion preset prompt from stills of the clip in `clip`, for a template editor;
   * `scenes`: which of a reference video's scenes show a product like the member's (Smart Remake's pre-ticked scenes);
   * `check`: a review of the composed English prompt in `text` before the member pays for the clip (the answer's options are its issues, the meanings their fixes). */
  field: 'brief' | 'script' | 'hook' | 'location' | 'ending' | 'prompt' | 'translate' | 'video' | 'scenes' | 'check';
  /** For `video`: the sample clip's name under samples/ (`preset-<id>.mp4`), whose stills the worker sends. */
  clip?: string;
  /** For `scenes`: the bucket keys of the reference video and of the member's product image (both chosen by the server), and the time in seconds of each
   * scene's still. The answer's options are the 1-based numbers of the scenes that show the product. */
  sourceKey?: string;
  productKey?: string;
  times?: number[];
  /** For a prompt: what the tool does and what its prompt should say (PROMPT_TASKS, picked by the server, never the member's words). */
  task?: string;
  /** The member's own text so far (may be empty). */
  text: string;
  /** The chosen hook and location as the English phrases the prompt uses, when chosen; for a sectioned prompt's hook or ending, its other sections. */
  context: string;
  /** The field's character limit. */
  max: number;
  /** The chosen model's name and how to write for it (modelNote, built by the server from an enabled model), when the page has one. */
  model?: string;
  /** The clip's length in seconds, when the page has one: lines must fit it, and a brief or a video prompt paces its beats to it. For `video`, the
   * sample clip's length the worker measured, which times each still. */
  seconds?: number;
  /** The Marketing Studio format whose page asks, when it is not UGC or Advanced: its clip is told to the model (FORMAT_NOTES). */
  format?: keyof typeof FORMAT_NOTES;
}

/** What the clip of an Unboxing or Review page is, so a suggestion fits it. */
export const FORMAT_NOTES = {
  unboxing: 'The clip is an unboxing: the creator, or only their hands when no one is shown, opens a package and reveals the product.',
  review: 'The clip is a product review: the creator talks to the camera about what they like in the product and shows it up close.',
} as const;

/** `meanings[i]` is option i in Vietnamese (for `check`, the fix of issue i) for the member to read (null when the model gave none); only `options` ever fill a field. */
/** `provider` and `model`: who answered and with what, for the call's ledger row. `frames`: a `video` run's stills, as JPEG data URLs in time order. */
export type Suggester = (input: SuggestInput, frames?: string[]) => Promise<{ options: string[]; meanings?: (string | null)[]; costUsd: number | null; provider: string; model: string }>;

// Each option comes with a short Vietnamese summary (owner, 2026-11-03: the staff read Vietnamese faster, the video models read English best);
// a summary rather than a full reading since the options fill most of the room, and the Translate button gives the full reading.
const REPLY =
  'Reply with a JSON object and nothing else: {"text": the text, "vi": a short summary of it in natural Vietnamese, at most 300 characters, ' +
  'only for the seller to read and choose}.';

/** How every option is written, whatever the field: what makes a video or image model follow a prompt. */
const PRINCIPLES =
  'Write as direct, visual description in the present tense. Be concrete: the action, the setting, the light, the camera and the mood, with ' +
  'sensory detail. Say what to show, never what to avoid. Give one clear main action at a time and, for a clip, the beats in the order they ' +
  'happen. Add no on-screen text, captions, logos or watermarks unless the seller asked for them. Fill the length you are given with useful, ' +
  'specific detail, never with filler, repetition or praise.';

const UNSEEN =
  'You cannot see the photos of the person or the product: never invent their colours, printed text, logos, brand or looks; say "the product", ' +
  '"the outfit" or "the model", or use the seller\'s own words.';

export const SUGGEST_SYSTEM =
  'You help a fashion seller write a short UGC (user-generated content) video. ' + UNSEEN + ' Keep every concrete detail the seller gave. ' + PRINCIPLES +
  " Write the text in the language of the seller's text, or in Vietnamese when it is empty. " + REPLY;

/** For a hook, a location or an ending the answer is always English, whatever the member wrote: the video models read English best. */
export const SCENE_SYSTEM =
  "You write the English scene text an AI video model reads for a fashion UGC clip, from a seller's short notes on it (a Vietnamese name and " +
  'description, or their own words so far, which may be empty) and, when given, the rest of the clip, which the scene must fit. ' + UNSEEN +
  " Keep the notes' meaning and every concrete detail, and write the text in plain English with no Vietnamese. " + PRINCIPLES + ' ' + REPLY;

/** For a prompt, the answer is English too, and it describes only what the tool's prompt controls. */
export const PROMPT_SYSTEM =
  'You write prompts for an AI tool a fashion seller uses on their own photos. ' + UNSEEN + ' Keep every concrete detail the seller gave, translated ' +
  'to English when needed. ' + PRINCIPLES + ' Write the text in plain, concrete English with no Vietnamese. ' + REPLY;

/** The Check button: a review of the prompt a member is about to pay to send, in Vietnamese, as issues with fixes and never a rewrite. */
export const MAX_CHECK_ISSUES = 4;
export const CHECK_SYSTEM =
  'You review the English prompt a fashion seller is about to send to an AI video model, before they pay for the clip. ' + UNSEEN + ' Judge it by these principles: ' + PRINCIPLES +
  ' Look for: a hook that does not grab attention in the first 2 seconds; anything that could change the product (its shape, colours or printed text) or add ' +
  'on-screen text, logos or watermarks; an action too big or too small for the clip length; anything vague or contradictory; anything the chosen model ' +
  `handles badly, using the model note. Report at most ${MAX_CHECK_ISSUES} real problems, the most important first, each as a short issue and a one-line fix, ` +
  'both in plain Vietnamese and never inventing details of the product or person. Do not praise or nitpick; a prompt with no real problem gets an empty list. ' +
  'Reply with a JSON object and nothing else: {"issues": [{"issue": the problem, "fix": the one-line fix}]}.';

/** The Translate button: a Vietnamese reading of an English prompt, shown beside it and never sent to a model. */
export const TRANSLATE_SYSTEM =
  'You translate the English prompt a fashion seller gives an AI video or image model into natural, plain Vietnamese, so the seller can read it ' +
  'quickly. Keep the meaning and every detail, add and drop nothing. Reply with a JSON array of exactly one string, the translation, and nothing else.';

/** How many stills of a preset's clip the vision call gets, evenly spread over it. */
export const VIDEO_FRAMES = 8;

/** `n` times spread evenly over a clip of `seconds`, each in the middle of its slice, so no still is the very first or last frame. */
export const frameTimes = (seconds: number, n: number): number[] => Array.from({ length: n }, (_, i) => ((i + 0.5) * seconds) / n);

/**
 * The prompt-from-video button: the motion of a preset's clip as a prompt that works for any seller's photo; the keep clauses are added by videoPrompt.
 * The grounding rules keep the model to what the stills clearly show, so it does not fill the gaps between them with events of its own.
 */
export const VIDEO_SYSTEM =
  "You write the English motion prompt of a template for an image-to-video model that animates a fashion seller's product or model photo. " +
  'You get evenly spaced stills of the template\'s sample clip, numbered in time order. Describe the camera move, how the subject moves, the ' +
  'pacing, the framing and the light, and only the subjects, objects, motion and camera moves that are clearly visible in the stills. Never infer ' +
  'events between stills. If something appears in only one still or is unclear, leave it out. Prefer fewer, certain details over more, uncertain ' +
  'ones. Never invent props, particles, pieces, people or text the stills do not show. The template is used with any product or person, so say ' +
  '"the product", "the model" or "the outfit" and never name or describe the specific object, garment, brand, colours, printed text or the ' +
  "person's looks. Write 40 to 90 words (near 40 when the stills show little) of direct, visual description in the present tense, the beats " +
  'in the order they happen, as one plain paragraph, in the voice of: "The camera arcs smoothly ' +
  'to the right around the standing model, moving from a front view towards a side and back view of the outfit." Do not say what must stay ' +
  'unchanged; that is added after. Reply with a JSON object and nothing else: {"motion": the paragraph, "person": true when a model or another ' +
  'person is shown (a hand alone is not), else false, "stable": true when the camera moves smoothly or stays still, false when it shakes or cuts}.';

/** What the house prompts (migration 0020, presets.ts) say must stay as it is, for a product shot and for a person. */
export const PRODUCT_KEEP = 'Keep the product, its shape, colours and any printed text exactly unchanged. Do not add any text, logos or watermarks. No faces.';
export const PERSON_KEEP = 'Keep the person, their face, the outfit, its colours and any printed text exactly as in the image. Do not add any text, logos or watermarks.';
const STABLE = 'Smooth, stable camera.';

/** A preset prompt in the house shape: the motion, then the keep clauses for a person or a product, then the stable-camera line when it is; at most `max` characters. */
export function videoPrompt(a: { motion: string; person: boolean; stable: boolean }, max: number): string {
  const tail = [a.person ? PERSON_KEEP : PRODUCT_KEEP, a.stable && STABLE].filter(Boolean).join(' ');
  return `${cutTo(a.motion.trim(), max - tail.length - 1)} ${tail}`;
}

/** The vision answer, `{ motion, person, stable }` (possibly in a code fence), as the preset prompt; a camera not said to shake counts as stable. */
export function parseVideoAnswer(answer: string, max: number): string {
  let v: { motion?: unknown; person?: unknown; stable?: unknown } | null;
  try {
    v = JSON.parse(unfence(answer));
  } catch {
    throw new Error('suggest: the answer is not JSON');
  }
  const motion = typeof v?.motion === 'string' ? v.motion.trim() : '';
  if (!motion) throw new Error('suggest: no motion in the answer');
  return videoPrompt({ motion, person: v!.person === true, stable: v!.stable !== false }, max);
}

/** Smart Remake's scene pick: the first image is the member's product, the others are one still per scene of a reference video, numbered from 1. */
export const SCENES_SYSTEM =
  'You pick the scenes of a reference video whose product will be replaced by a seller\'s product. The first image is the seller\'s product. The other images are one ' +
  'still per scene of the video, numbered from 1 in the order you get them. List every scene that shows a product of the same general type as the first image, ' +
  'worn, held or displayed: any top (T-shirt, shirt, blouse, sweater) for a top, any dress for a dress, any bag for a bag, and so on. Colour, pattern, sleeve ' +
  'length, fit, brand and style do not matter, because that product is about to be replaced. Leave out scenes with no such product, and scenes that show only ' +
  'a product of another type, such as shoes when the product is a top. ' +
  'Reply with a JSON object and nothing else: {"scenes": [the scene numbers, ascending]}. Use an empty list when no scene matches.';

/** The scene numbers of a `{ scenes: [...] }` answer (possibly in a code fence), ascending and without repeats; numbers outside 1 to `count` are dropped. */
export function parseScenes(answer: string, count: number): number[] {
  let v: unknown;
  try {
    v = JSON.parse(unfence(answer));
  } catch {
    throw new Error('suggest: the answer is not JSON');
  }
  const list = Array.isArray(v) ? v : (v as { scenes?: unknown } | null)?.scenes;
  if (!Array.isArray(list)) throw new Error('suggest: no scenes in the answer');
  return [...new Set(list.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= count))].sort((a, b) => a - b);
}

/** What each tool's prompt should say, by feature (the Create, Image Generation, Try On and app pages that take a prompt). */
export const PROMPT_TASKS = {
  video: "an image-to-video model that animates the seller's product photos into a short clip. Describe the motion, the camera move and the light",
  image: "an image model that creates a fashion photo, optionally from reference photos. Describe the subject, the setting, the light and the framing",
  try_on: "a virtual try-on that dresses a model in the seller's garments. Describe the pose, the setting and the light, not the garments",
  character_swap: "a tool that replaces the person in a video with the seller's model photo. Describe how the new person should look and move",
  model_swap: "a tool that replaces the model in a fashion photo while keeping the outfit. Describe the new model's look and pose",
  background_changer: "a tool that puts the product photo on a new background. Describe only the new background as a short scene",
  motion_control: "a tool that makes the person in the seller's photo copy the motion of a reference video. Describe the setting, the light and the mood, not the motion",
  lingerie_try_on: "a lingerie try-on on a model photo for a fashion shop. Describe a tasteful pose, the setting and the light, not the garment",
} as const;

/** How to write for each model family, by the start of its id: what each provider's own prompt guide stresses. */
const FAMILY_TIPS: [RegExp, string][] = [
  [/^veo/, 'Veo follows cinematic direction: name the shot size, the camera move and the lens look, and describe the sound in its own sentence.'],
  [/^kling/, 'Kling follows a clear order: the subject, its action, the setting, then the camera move and the light, in plain camera terms (slow push-in, orbit, tracking shot, handheld).'],
  [/^seedance/, 'Seedance can play several shots in one clip: give them in order as short beats, each with its framing and camera move, keeping the same person and product.'],
  [/^gemini-omni/, 'Gemini Omni reads a natural paragraph well: describe the action as it unfolds, the camera, the light and the sound.'],
  [/^grok-imagine/, 'Grok Imagine follows short, vivid sentences: one action per sentence, the camera, the light and the sound.'],
  [/^wan/, 'WAN rewards detail: how fast things move and which parts of the body move, the camera, the light and the textures.'],
  [/^(minimax|hailuo)/, 'MiniMax follows clear camera direction and natural, physical motion: say how each movement starts and ends.'],
  [/^flux/, 'FLUX follows a precise description of the motion, the camera and the light, most important first.'],
  [/^nano-banana/, 'Nano Banana reads a natural descriptive paragraph better than a list of keywords; with reference photos, say what stays as it is and what changes.'],
  [/^gpt-image/, 'GPT Image follows long, precise instructions: state each requirement plainly (composition, light, background, what stays as in the photo).'],
  [/^seedream/, 'Seedream: lead with the subject and the action, then the setting, the style and the light, in short concrete sentences.'],
];

/**
 * The model line of the user turn: the model's name, its family's tip and, for a clip with sound (an endpoint that always makes it, or one that
 * can with the page's audio switch on), a sentence on the sound.
 */
export function modelNote(model: { id: string; label: string; endpoint: string }, audio: boolean): string {
  const tip = FAMILY_TIPS.find(([re]) => re.test(model.id))?.[1];
  const sound = ALWAYS_AUDIO.has(model.endpoint) || (audio && Object.hasOwn(AUDIO_USD_PER_SECOND, model.endpoint));
  return [`The model: ${model.label}.`, tip, sound && 'The clip has sound: add one sentence on the ambient sound, with any spoken line in double quotes.'].filter(Boolean).join(' ');
}

const ASK = {
  brief: 'Write one creator brief: what the creator does on camera, beat by beat, and what they say about the product, as flowing prose.',
  script: 'Write one script: only the exact words the creator speaks to camera, natural and casual, with no stage directions.',
  hook: 'Write one hook: what happens in the first one or two seconds of the clip, in English, starting "The clip opens".',
  ending: 'Write one ending: the last shot of the clip, one clear final action or pose that comes to rest, in English, starting "The clip ends".',
  location: 'Write one place the clip is set in: an English noun phrase, not a sentence, rich in concrete detail (the space, the light, the props and the mood), such as "a cozy corner cafe with warm light".',
  prompt: 'Write one prompt for',
};

/** The three directions, one call each, in the order the page names them (Suggestions: DIRECTION_LABELS). */
export const DIRECTIONS = [
  "Faithful: build directly on the seller's notes (or the most natural take on the task when there are none), polished and completed.",
  'Creative: a fresh angle on the same goal, different from the obvious take.',
  'Bold: the most eye-catching, scroll-stopping version.',
] as const;

/** The length each option aims for: 70 to 90 % of the limit, or of the lines that fit the clip for a script. */
export function targetRange(i: Pick<SuggestInput, 'field' | 'max' | 'seconds'>): { low: number; high: number; max: number } {
  const max = i.field === 'script' && i.seconds ? Math.min(i.max, Math.round(i.seconds * WORDS_PER_SECOND) * CHARS_PER_WORD) : i.max;
  return { low: Math.floor(max * TARGET_SHARE.low), high: Math.floor(max * TARGET_SHARE.high), max };
}

/** The length line: models count sentences far better than characters, so a long text is also asked as a number of sentences. */
function lengthLine(i: SuggestInput): string {
  const { low, high, max } = targetRange(i);
  const sentences = high >= 2 * CHARS_PER_SENTENCE ? `, that is about ${Math.round(high / CHARS_PER_SENTENCE)} sentences of about 20 words each` : '';
  return `About ${high} characters long${sentences}: never fewer than ${low} characters or more than ${max}.`;
}

/** The user turn of the call for direction `d` (0 to 2): the task, the direction, the model, the pace, the hook and location, the notes and the length. */
export function suggestPrompt(i: SuggestInput, d = 0): string {
  if (i.field === 'translate') return `The prompt:\n${i.text}`;
  if (i.field === 'scenes') return `The first image is the product; the other ${i.times?.length ?? 0} images are scenes 1 to ${i.times?.length ?? 0}.`;
  if (i.field === 'check') return [i.model, i.format && FORMAT_NOTES[i.format], i.seconds && `The clip lasts ${i.seconds} seconds.`, `The prompt to review:\n${i.text}`].filter(Boolean).join('\n');
  if (i.field === 'video') {
    // Each still's number and time, so the model can read their order.
    const at = i.seconds ? frameTimes(i.seconds, VIDEO_FRAMES).map((t, k) => `still ${k + 1} of ${VIDEO_FRAMES} at ${t.toFixed(1)} s`) : [];
    return `The ${VIDEO_FRAMES} stills of the template's sample clip follow in time order, evenly spaced over it${at.length ? ` (${i.seconds!.toFixed(1)} seconds long): ${at.join(', ')}` : ''}.`;
  }
  const pace =
    i.seconds &&
    (i.field === 'script' ? `The lines are spoken in a ${i.seconds}-second clip.` : i.field === 'brief' || i.task === PROMPT_TASKS.video ? `The clip lasts ${i.seconds} seconds: pace the beats to it.` : '');
  return [
    i.field === 'prompt' ? `${ASK.prompt} ${i.task}.` : ASK[i.field],
    `Direction: ${DIRECTIONS[d]}`,
    i.model,
    i.format && FORMAT_NOTES[i.format],
    pace,
    i.context && (i.field === 'hook' || i.field === 'ending' ? `The rest of the clip: ${i.context}` : `The video: ${i.context}`),
    i.text && `The seller's notes: ${i.text}`,
    lengthLine(i),
  ]
    .filter(Boolean)
    .join('\n');
}

/** The second turn for an option that came back short of the range: the same text, longer, with more of the same kind of detail. */
export function lengthenPrompt(i: SuggestInput, text: string): string {
  return [
    'Rewrite the text below longer. Keep its direction, its order, its language and every detail, and add concrete detail of the same kind.',
    i.model,
    lengthLine(i),
    `The text:\n${text}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** An answer's token budget: one text at the top of the range and its summary (about 3 characters a token, Vietnamese included). */
function maxTokens(i: SuggestInput): number {
  return i.field === 'translate' ? 6000 : Math.ceil(targetRange(i).high / 3) + 600;
}

/** Cuts `text` to `max` at the last sentence end, else the last word, so an over-long option never stops mid-word. */
export function cutTo(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const end = Math.max(...['. ', '! ', '? ', '." ', '!" ', '?" '].map((m) => (head.lastIndexOf(m) < 0 ? -1 : head.lastIndexOf(m) + m.length - 1)));
  if (end >= max * 0.5) return head.slice(0, end).trim(); // a whole sentence beats a fuller cut one
  const space = head.lastIndexOf(' ');
  return (space > 0 ? head.slice(0, space) : head).trim();
}

const unfence = (answer: string): string => answer.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1');

/** One option from an answer: a JSON object `{ text, vi }` (or a one-item array of it, or a bare string), possibly in a code fence; text cut to `max`. */
export function parseOption(answer: string, max: number): { text: string; vi: string | null } {
  let v: unknown;
  try {
    v = JSON.parse(unfence(answer));
  } catch {
    throw new Error('suggest: the answer is not JSON');
  }
  if (Array.isArray(v)) v = v[0];
  const o = typeof v === 'string' ? { text: v } : (v as { text?: unknown; vi?: unknown } | null);
  const text = typeof o?.text === 'string' ? cutTo(o.text.trim(), max) : '';
  if (!text) throw new Error('suggest: no text in the answer');
  return { text, vi: typeof o?.vi === 'string' && o.vi.trim() ? cutTo(o.vi.trim(), MAX_SUMMARY) : null };
}

/** The issues of a `{ issues: [{ issue, fix }] }` answer (possibly in a code fence), at most MAX_CHECK_ISSUES; an empty list means the prompt is fine, any other shape is an error. */
export function parseCheck(answer: string): { issue: string; fix: string }[] {
  let v: unknown;
  try {
    v = JSON.parse(unfence(answer));
  } catch {
    throw new Error('suggest: the answer is not JSON');
  }
  const list = (v as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(list)) throw new Error('suggest: no issues list in the answer');
  return list.slice(0, MAX_CHECK_ISSUES).map((o: { issue?: unknown; fix?: unknown } | null) => {
    const issue = typeof o?.issue === 'string' ? o.issue.trim() : '';
    const fix = typeof o?.fix === 'string' ? o.fix.trim() : '';
    if (!issue || !fix) throw new Error('suggest: an issue needs its text and its fix');
    return { issue: cutTo(issue, MAX_SUMMARY), fix: cutTo(fix, MAX_SUMMARY) };
  });
}

/** One LLM call: a system prompt, a user turn, a temperature, a token budget and any images (data URLs) in; the answer's text and its cost out. */
type Chat = (system: string, user: string, temperature: number, maxTokens: number, images?: string[]) => Promise<{ text: string; costUsd: number | null }>;

const SYSTEMS: Record<SuggestInput['field'], string> = {
  brief: SUGGEST_SYSTEM, script: SUGGEST_SYSTEM, hook: SCENE_SYSTEM, location: SCENE_SYSTEM, ending: SCENE_SYSTEM, prompt: PROMPT_SYSTEM, translate: TRANSLATE_SYSTEM, video: VIDEO_SYSTEM, scenes: SCENES_SYSTEM, check: CHECK_SYSTEM,
};

const sum = (costs: (number | null)[]): number | null => (costs.every((c) => c === null) ? null : costs.reduce<number>((a, c) => a + (c ?? 0), 0));

/**
 * The run: a translation is one call, and so is a preset prompt from its clip's stills; otherwise one call per direction, all at once (one answer each reaches the length far more often than three
 * in one answer), and a second call for an option still short of the range. Any failed call fails the run, so option i is always direction i.
 */
async function suggestWith(chat: Chat, input: SuggestInput, frames: string[] = []): Promise<{ options: string[]; meanings?: (string | null)[]; costUsd: number | null }> {
  const system = SYSTEMS[input.field];
  if (input.field === 'video') {
    if (!frames.length) throw new Error('suggest: no stills of the clip');
    const { text, costUsd } = await chat(system, suggestPrompt(input), 0.4, 800, frames);
    return { options: [parseVideoAnswer(text, input.max)], costUsd };
  }
  if (input.field === 'scenes') {
    const count = input.times?.length ?? 0;
    if (!count || frames.length !== count + 1) throw new Error('suggest: the product and one still per scene are needed');
    const { text, costUsd } = await chat(system, suggestPrompt(input), 0, 800, frames);
    return { options: parseScenes(text, count).map(String), costUsd };
  }
  if (input.field === 'check') {
    const { text, costUsd } = await chat(system, suggestPrompt(input), 0.2, 1200);
    const issues = parseCheck(text);
    return { options: issues.map((x) => x.issue), meanings: issues.map((x) => x.fix), costUsd };
  }
  if (input.field === 'translate') {
    const { text, costUsd } = await chat(system, suggestPrompt(input), 0.2, maxTokens(input));
    return { options: [parseOption(text, input.max).text], costUsd };
  }
  const { low, max } = targetRange(input);
  const answers = await Promise.all(
    DIRECTIONS.map(async (_, d) => {
      const first = await chat(system, suggestPrompt(input, d), 0.9, maxTokens(input));
      const option = parseOption(first.text, max);
      if (option.text.length >= low) return { ...option, costs: [first.costUsd] };
      const second = await chat(system, lengthenPrompt(input, option.text), 0.7, maxTokens(input));
      const longer = parseOption(second.text, max);
      // A rewrite that came back shorter still is no better: keep the first.
      return { ...(longer.text.length > option.text.length ? longer : option), costs: [first.costUsd, second.costUsd] };
    }),
  );
  return { options: answers.map((a) => a.text), meanings: answers.map((a) => a.vi), costUsd: sum(answers.flatMap((a) => a.costs)) };
}

export function createFalSuggester({ apiKey, fetch: f = fetch, model = ENHANCE_MODEL }: { apiKey: string; fetch?: Fetch; model?: string }): Suggester {
  // With images the call goes to the router's vision endpoint, which takes the same fields plus `image_urls` (data URLs accepted; docs read 2026-11-04:
  // https://fal.ai/models/openrouter/router/vision/api).
  const chat: Chat = async (system, user, temperature, maxTokens, images = []) => {
    const out = (await sendJson(f, 'fal suggest', images.length ? `${ENHANCE_URL}/vision` : ENHANCE_URL, {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, system_prompt: system, prompt: user, temperature, max_tokens: maxTokens, ...(images.length > 0 && { image_urls: images }) }),
      signal: timeout(),
    })) as { output?: unknown; error?: unknown; usage?: { cost?: unknown } };
    if (out.error) throw new Error(`fal suggest: ${String(out.error)}`);
    const cost = Number(out.usage?.cost);
    return { text: typeof out.output === 'string' ? out.output : '', costUsd: Number.isFinite(cost) ? cost : null };
  };
  return async (input, frames) => ({ ...(await suggestWith(chat, input, frames)), provider: 'fal', model });
}

/** The OpenAI twin of createFalSuggester, with the same prompts, limits and parsing. */
export function createOpenAiSuggester({ apiKey, fetch: f = fetch, model = OPENAI_MODEL }: { apiKey: string; fetch?: Fetch; model?: string }): Suggester {
  const chat: Chat = (system, user, temperature, maxTokens, images) => openAiChat(f, 'openai suggest', apiKey, model, system, user, temperature, maxTokens, images);
  return async (input, frames) => ({ ...(await suggestWith(chat, input, frames)), provider: 'openai', model });
}
