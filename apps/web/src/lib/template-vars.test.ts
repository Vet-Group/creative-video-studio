import { expect, test } from 'vitest';
import { fillTemplate, templateVars } from './template-vars';

test('the blanks are listed once each, in order of first appearance across the fields, with the first default it was given', () => {
  const t = { prompt: 'A ${product:shoe} on ${place}', brief: '${place:beach} and ${product}', script: 'Hi ${ name }!', highlights: ['${last:x} one'] };
  expect(templateVars(t)).toEqual([{ name: 'product', default: 'shoe' }, { name: 'place', default: 'beach' }, { name: ' name ', default: '' }, { name: 'last', default: 'x' }]);
  expect(templateVars({ prompt: 'plain', brief: null })).toEqual([]);
});

test('the name takes 1 to 30 characters and the default up to 100, both without a closing brace; a default may hold a colon', () => {
  expect(templateVars({ prompt: `\${${'n'.repeat(30)}} \${${'n'.repeat(31)}}` }).map((v) => v.name.length)).toEqual([30]);
  expect(templateVars({ prompt: `\${a:${'d'.repeat(100)}}` })[0]!.default).toHaveLength(100);
  expect(templateVars({ prompt: `\${a:${'d'.repeat(101)}}` })).toEqual([]);
  expect(templateVars({ prompt: '${a:b:c}' })).toEqual([{ name: 'a', default: 'b:c' }]);
});

test('malformed text stays literal', () => {
  const prompt = 'open ${} and $ {a} and {a} and ${a and ${ unclosed';
  expect(templateVars({ prompt })).toEqual([]);
  expect(fillTemplate({ prompt }, { a: 'x' })).toEqual({ prompt });
});

test('fill replaces every occurrence with the value, or the default when the value is empty, in every text field', () => {
  const t = { prompt: '${a:one} ${a:two} ${b}', brief: '${a}', script: null, hookText: '${b:z}', ending: 'end ${c:e}', endText: '${a}', highlights: ['${a:h}', 'plain'], hook: 'keep ${a}' };
  expect(fillTemplate(t, { a: 'X', b: '', c: '' })).toEqual({ ...t, prompt: 'X X z', brief: 'X', hookText: 'z', ending: 'end e', endText: 'X', highlights: ['X', 'plain'] });
  expect(fillTemplate({ prompt: '${a:one} ${a:two} ${a}' }, {})).toEqual({ prompt: 'one one one' }); // the first default belongs to the name
  expect(fillTemplate({ prompt: '${a}' }, { a: '$& $1' })).toEqual({ prompt: '$& $1' }); // the value is text, not a replacement pattern
  expect(fillTemplate({ prompt: 'on ${place:a beach}' }, { place: '  ' })).toEqual({ prompt: 'on a beach' }); // spaces alone count as empty
});
