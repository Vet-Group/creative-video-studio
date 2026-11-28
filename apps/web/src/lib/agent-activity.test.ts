import { expect, test } from 'vitest';
import { activityItem } from './agent-activity';

test('an activity line caps the path an agent chose for a refused request', () => {
  const path = `/api/${'x'.repeat(500)}`;
  const item = activityItem({ id: 1, action: 'agent.refused', new_value: { method: 'GET', path, reason: 'not_allowed_for_agent' }, created_at: new Date('2026-11-28T12:00:00Z') }, false);
  expect(item.path).toHaveLength(120);
  expect(item.path).toBe(path.slice(0, 120));
});
