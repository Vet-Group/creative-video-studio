import { expect, test } from 'vitest';
import { larkPromptDue, needsLarkPrompt, vnDay } from './lark-prompt';

test('vnDay is the Vietnam calendar day, which starts at 17:00 UTC', () => {
  expect(vnDay(new Date('2026-11-11T16:59:59Z'))).toBe('2026-11-11');
  expect(vnDay(new Date('2026-11-11T17:00:00Z'))).toBe('2026-11-12');
});

test('the reminder is due once a Vietnam day: never shown, or last shown on another day', () => {
  expect(larkPromptDue(null, '2026-11-11')).toBe(true);
  expect(larkPromptDue('2026-11-10', '2026-11-11')).toBe(true);
  expect(larkPromptDue('2026-11-11', '2026-11-11')).toBe(false);
});

test('only a person inside the Lark organisation without a linked Lark account gets the reminder, and only while Lark sign-in is on', () => {
  expect(needsLarkPrompt({ larkEnabled: true, system: false, outsideLark: false, providers: ['credential'] })).toBe(true);
  expect(needsLarkPrompt({ larkEnabled: true, system: false, outsideLark: false, providers: ['credential', 'lark'] })).toBe(false);
  expect(needsLarkPrompt({ larkEnabled: true, system: true, outsideLark: false, providers: ['credential'] })).toBe(false);
  expect(needsLarkPrompt({ larkEnabled: false, system: false, outsideLark: false, providers: ['credential'] })).toBe(false);
  expect(needsLarkPrompt({ larkEnabled: true, system: false, outsideLark: true, providers: ['credential'] })).toBe(false);
});
