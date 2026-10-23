// The CSV downloads of the Admin area: UTF-8 with a byte order mark so Excel reads the Vietnamese.

/** A text cell that Excel would read as a formula is prefixed with a quote. */
export const text = (v: string | null) => (v && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const quote = (v: string | null) => ((v ?? '').match(/[",\r\n]/) ? `"${(v ?? '').replaceAll('"', '""')}"` : (v ?? ''));

/** A CSV download named `fileName`: a label line, then the header, then the rows. */
export function csvResponse(label: string, fileName: string, header: string[], rows: (string | null)[][]) {
  const lines = [[label], header, ...rows].map((r) => r.map(quote).join(','));
  return new Response(`﻿${lines.join('\r\n')}\r\n`, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${fileName}"` },
  });
}
