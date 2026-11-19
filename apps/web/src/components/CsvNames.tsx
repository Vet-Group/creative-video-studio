'use client';
// The name swap app's names from a CSV file (a Shopify order export, a personalization app's export), read in the browser only. The member picks the column
// (one that looks like a pet's name first), and its names fill the box through the box's own rules (csvNames).
import { useRef, useState } from 'react';
import { csvNames, MAX_BATCH, nameColumn } from '@/lib/apps';
import { parseCsv } from '@/lib/csv';
import { Select } from './Select';

/** A CSV of orders runs to a few MB at most; a bigger file is not one. */
const MAX_CSV_BYTES = 5 * 1024 * 1024;
const short = (v: string) => `"${v.length > 30 ? `${v.slice(0, 29)}…` : v}"`;

export function CsvNames({ disabled, onNames }: { disabled: boolean; onNames: (text: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<{ file: string; rows: string[][]; column: number } | null>(null);
  const [error, setError] = useState('');

  function fill(file: string, rows: string[][], column: number) {
    setCsv({ file, rows, column });
    onNames(csvNames(rows, column).names.join('\n'));
  }

  async function open(file: File | undefined) {
    setError('');
    if (!file) return;
    if (file.size > MAX_CSV_BYTES) return setError('Tệp CSV tối đa 5 MB.');
    const rows = parseCsv(await file.text());
    if (rows.length < 2) return setError('Tệp CSV cần dòng tiêu đề và ít nhất một dòng tên bên dưới.');
    fill(file.name, rows, nameColumn(rows[0]!));
  }

  const got = csv && csvNames(csv.rows, csv.column);
  const header = csv?.rows[0] ?? [];
  return (
    <>
      <div>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          hidden
          aria-label="Tệp CSV chứa tên"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            void open(file);
          }}
        />
        <button type="button" className="link-button uploads-link" disabled={disabled} onClick={() => input.current?.click()}>
          Lấy tên từ tệp CSV
        </button>
      </div>
      {csv && (
        <Select
          label="Cột chứa tên"
          icon="list"
          heading="Chọn cột chứa tên"
          value={String(csv.column)}
          options={header.map((h, i) => ({ value: String(i), label: h.trim() || `Cột ${i + 1}` }))}
          onChange={(v) => fill(csv.file, csv.rows, Number(v))}
        />
      )}
      {got && (
        <p className="help" role="status">
          Đã lấy {got.names.length} tên từ cột “{header[csv.column]?.trim() || `Cột ${csv.column + 1}`}” của {csv.file}.
          {got.invalid.length > 0 && ` Bỏ qua ${got.invalid.length} giá trị không hợp lệ: ${got.invalid.slice(0, 3).map(short).join(', ')}${got.invalid.length > 3 ? '…' : ''}.`}
          {got.over > 0 && ` Chỉ giữ ${MAX_BATCH} tên đầu, bỏ ${got.over} tên còn lại.`}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
