// The CSV downloads of the Admin area (UTF-8 with a byte order mark so Excel reads the Vietnamese), and the reader of a member's own CSV file (the name swap app's names).

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

/**
 * The rows of a CSV file as RFC 4180 reads it: commas split the fields, a field in double quotes may hold commas, line breaks and "" for one quote, CRLF or LF
 * ends a row, and a byte order mark or a last line break adds nothing. A quote inside an unquoted field is kept as it is, as spreadsheet apps write it.
 */
export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let open = false; // the row has begun
  const s = csv.startsWith('\uFEFF') ? csv.slice(1) : csv;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c !== '"') field += c;
      else if (s[i + 1] === '"') (field += '"'), i++;
      else quoted = false;
      continue;
    }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      open = false;
      continue;
    }
    open = true;
    if (c === '"' && field === '') quoted = true;
    else if (c === ',') row.push(field), (field = '');
    else field += c;
  }
  if (open) rows.push([...row, field]);
  return rows;
}
