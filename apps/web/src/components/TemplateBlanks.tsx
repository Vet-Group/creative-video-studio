'use client';
// The dialog that asks for a saved template's ${blanks} (lib/template-vars.ts) before the page fills its form; promise-based like confirmDialog.
import { useEffect, useRef, useState } from 'react';
import { fillTemplate, type TemplateTexts, templateVars, type TemplateVar } from '@/lib/template-vars';
import { Modal } from './Modal';

type Ask = { vars: TemplateVar[]; answer: (values: Record<string, string> | null) => void };

let show: ((ask: Ask) => void) | null = null;

/** A refill's data with the blanks of a saved template (`from` is `/api/templates/<id>`) filled in by the member; the data as it is when it has none (a job or an example never does). Resolves null on cancel. */
export async function fillBlanks<T extends TemplateTexts>(from: string, data: T): Promise<T | null> {
  const vars = from.startsWith('/api/templates/') ? templateVars(data) : [];
  if (vars.length === 0) return data;
  if (!show) return null;
  const open = show;
  const values = await new Promise<Record<string, string> | null>((resolve) => open({ vars, answer: resolve }));
  return values && fillTemplate(data, values);
}

/** Rendered once, by the Shell, for every fillBlanks of the signed-in pages. */
export function TemplateBlanksHost() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    show = (next) => (setValues(Object.fromEntries(next.vars.map((v) => [v.name, v.default]))), setAsk(next));
    return () => {
      show = null;
    };
  }, []);
  // After the Modal's own effect has opened the dialog, which would otherwise focus its × first.
  useEffect(() => {
    if (ask) form.current?.querySelector('input')?.focus();
  }, [ask]);
  const close = (answer: Record<string, string> | null) => {
    ask?.answer(answer);
    setAsk(null);
  };
  const ready = ask?.vars.every((v) => v.default !== '' || (values[v.name] ?? '').trim() !== '');
  return (
    <Modal open={ask !== null} onClose={() => close(null)} label="Điền chỗ trống" className="confirm choice-dialog">
      {ask && (
        <form
          ref={form}
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) close(values);
          }}
        >
          <h2>Điền chỗ trống</h2>
          {ask.vars.map((v, n) => (
            <div key={v.name}>
              <label className="field-label" htmlFor={`blank-${n}`}>
                {v.name}
              </label>
              <input id={`blank-${n}`} value={values[v.name] ?? ''} onChange={(e) => setValues((cur) => ({ ...cur, [v.name]: e.target.value }))} />
            </div>
          ))}
          <div className="actions">
            <button type="button" onClick={() => close(null)}>
              Huỷ
            </button>
            <button type="submit" className="primary" disabled={!ready}>
              Dùng thiết lập
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
