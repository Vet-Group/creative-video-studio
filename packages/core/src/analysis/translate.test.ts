import { expect, test } from 'vitest';
import type { Analysis } from './breakdown';
import { createAnalysisTranslator, translateAnalysisVi } from './translate';

const a: Analysis = {
  durationS: 5,
  shotCount: 2,
  format: 'tutorial',
  hook: 'hook',
  summary: 'sum',
  shots: [
    { index: 1, start: 0, end: 2, role: 'hook', prompt: 'p1' },
    { index: 2, start: 2, end: 5, role: 'info', prompt: 'p2' },
  ],
};

test('sends the English fields and parses a JSON answer, even fenced, keeping the shot order and length', async () => {
  const chat = async (_system: string, user: string) => {
    expect(JSON.parse(user).shots).toEqual(['p1', 'p2']);
    return { text: '```json\n{"format":"hướng dẫn","hook":"mở","summary":"tóm","shots":["c1","c2"]}\n```', costUsd: 0.001 };
  };
  const { vi, costUsd } = await translateAnalysisVi(a, chat);
  expect(vi).toEqual({ format: 'hướng dẫn', hook: 'mở', summary: 'tóm', shots: ['c1', 'c2'] });
  expect(costUsd).toBe(0.001);
});

test('throws on a shot-count mismatch so the caller keeps the analysis English-only', async () => {
  const chat = async () => ({ text: '{"format":"f","hook":"h","summary":"s","shots":["only-one"]}', costUsd: null });
  await expect(translateAnalysisVi(a, chat)).rejects.toThrow('shot count');
});

test('throws when any value of the answer is in Chinese, so a wrong-language reading is never shown', async () => {
  const allChinese = async () => ({ text: '{"format":"商品展示","hook":"视频从动作中途开始","summary":"s","shots":["c1","c2"]}', costUsd: null });
  await expect(translateAnalysisVi(a, allChinese)).rejects.toThrow('not Vietnamese');
  const formatKept = async () => ({ text: '{"format":"剧情","hook":"Mở đầu","summary":"Tóm tắt","shots":["Cảnh 1","Cảnh 2"]}', costUsd: null });
  await expect(translateAnalysisVi(a, formatKept)).rejects.toThrow('not Vietnamese');
});

test('throws when the answer is not JSON', async () => {
  const chat = async () => ({ text: 'sorry, not json', costUsd: null });
  await expect(translateAnalysisVi(a, chat)).rejects.toThrow('not JSON');
});

test('createAnalysisTranslator is undefined without a key, and a function with OpenAI or fal', () => {
  expect(createAnalysisTranslator({})).toBeUndefined();
  expect(createAnalysisTranslator({ openAiKey: 'k' })).toBeTypeOf('function');
  expect(createAnalysisTranslator({ falKey: 'k' })).toBeTypeOf('function');
});
