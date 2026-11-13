// Blanks in a saved template's text (prompts.chat style): `${name}` or `${name:default}`. Text that does not close, or has no name, stays literal.

/** The template text a blank may sit in: the free-text fields of TemplateData as a page reads them (null when a field is unset). */
export type TemplateTexts = { prompt?: string | null; brief?: string | null; script?: string | null; hookText?: string | null; ending?: string | null; endText?: string | null; highlights?: string[] | null };

export interface TemplateVar {
  name: string;
  default: string;
}

const KEYS = ['prompt', 'brief', 'script', 'hookText', 'ending', 'endText'] as const;
const BLANK = /\$\{([^}:]{1,30})(?::([^}]{0,100}))?\}/g;

const texts = (t: TemplateTexts): string[] => [...KEYS.map((k) => t[k] ?? ''), ...(t.highlights ?? [])];

/** The distinct blanks across all the text, in order of first appearance, each with the first default it was given (a bare `${name}` before one that has a default does not hide it). */
export function templateVars(t: TemplateTexts): TemplateVar[] {
  const seen = new Map<string, TemplateVar>();
  for (const text of texts(t)) {
    for (const m of text.matchAll(BLANK)) {
      const v = seen.get(m[1]!) ?? { name: m[1]!, default: '' };
      seen.set(v.name, { ...v, default: v.default || m[2] || '' });
    }
  }
  return [...seen.values()];
}

/** The template with every blank replaced by its value, or when the value is empty by the first default its name was given (so a bare `${name}` takes it too). */
export function fillTemplate<T extends TemplateTexts>(t: T, values: Record<string, string>): T {
  const defaults = new Map(templateVars(t).map((v) => [v.name, v.default]));
  const fill = (s: string) => s.replace(BLANK, (_, name: string) => values[name]?.trim() || defaults.get(name) || '');
  const out: TemplateTexts = { ...t };
  for (const k of KEYS) if (typeof t[k] === 'string') out[k] = fill(t[k]);
  if (t.highlights) out.highlights = t.highlights.map(fill);
  return out as T;
}
