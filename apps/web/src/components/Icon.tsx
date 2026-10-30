// A small inline icon set, drawn for this app: 16 px grid, 1.5 px strokes, colour from the text.
const PATHS = {
  create: 'M2 4.5h7.5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z M10.5 7l4-2v6l-4-2',
  tryon: 'M5.5 2L1.5 4.5l1.8 3 1.7-.9V14h6V6.6l1.7.9 1.8-3L10.5 2C10.2 3.2 9.2 3.8 8 3.8S5.8 3.2 5.5 2z',
  image: 'M2 3h12v10H2z M2 11.5l3.5-3.5 3 3 2-2 3.5 3 M10.5 5.6h.01',
  megaphone: 'M2 6.5v3h2.5l5 3v-9l-5 3z M12 6a2.5 2.5 0 0 1 0 4 M4.5 9.5l1 4h1.5l-.7-3.5',
  apps: 'M2.5 2.5h3v3h-3z M6.5 2.5h3v3h-3z M10.5 2.5h3v3h-3z M2.5 6.5h3v3h-3z M6.5 6.5h3v3h-3z M10.5 6.5h3v3h-3z M2.5 10.5h3v3h-3z M6.5 10.5h3v3h-3z M10.5 10.5h3v3h-3z',
  library: 'M2 2h5v5H2z M9 2h5v5H9z M2 9h5v5H2z M9 9h5v5H9z',
  admin: 'M8 1.5l5.5 2v4c0 3.2-2.3 5.6-5.5 7-3.2-1.4-5.5-3.8-5.5-7v-4z',
  gear: 'M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M8 1v2 M8 13v2 M1 8h2 M13 8h2 M3.05 3.05l1.4 1.4 M11.55 11.55l1.4 1.4 M3.05 12.95l1.4-1.4 M11.55 4.45l1.4-1.4',
  menu: 'M2 4h12 M2 8h9.3 M2 12h6.7',
  down: 'M3.5 6l4.5 4.5L12.5 6',
  up: 'M3.5 10l4.5-4.5L12.5 10',
  left: 'M10 3.5L5.5 8l4.5 4.5',
  right: 'M6 3.5l4.5 4.5L6 12.5',
  plus: 'M8 3v10 M3 8h10',
  check: 'M3 8.5l3.2 3.2L13 4.5',
  x: 'M3.5 3.5l9 9 M12.5 3.5l-9 9',
  preset: 'M8 1.5l1.4 3.6 3.6 1.4-3.6 1.4L8 11.5 6.6 7.9 3 6.5l3.6-1.4z',
  ratio: 'M2.5 4h11v8h-11z',
  'ratio-tall': 'M4.5 2h7v12h-7z',
  'ratio-square': 'M3 3h10v10H3z',
  film: 'M2.5 3h11v10h-11z M5 3v10 M11 3v10 M2.5 6h2.5 M2.5 10h2.5 M11 6h2.5 M11 10h2.5',
  sliders: 'M2 4.5h12 M2 8h12 M2 11.5h12 M5 3v3 M10.5 6.5v3 M7 10v3',
  wand: 'M2.5 13.5l7.5-7.5 M8.5 4.5l3 3 M12 1.5v2 M11 2.5h2 M13.5 5v2 M12.5 6h2 M5 2.5v2 M4 3.5h2',
  clock: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z M8 4.8V8l2.2 1.4',
  store: 'M2 6l1-3.5h10L14 6 M2 6v7.5h12V6 M2 6c0 1.1.9 1.8 2 1.8S6 7.1 6 6c0 1.1.9 1.8 2 1.8s2-.7 2-1.8c0 1.1.9 1.8 2 1.8s2-.7 2-1.8',
  model: 'M8 1.5l6 3.2v6.6l-6 3.2-6-3.2V4.7z M2 4.7l6 3.2 6-3.2 M8 7.9v6.6',
  search: 'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z M10.5 10.5L14 14',
  download: 'M8 2v8 M4.5 6.5L8 10l3.5-3.5 M2.5 13.5h11',
  external: 'M9.5 2.5h4v4 M13.5 2.5L7.5 8.5 M11.5 9.5v4h-9v-9h4',
  arrow: 'M4.5 11.5l7-7 M5.5 4.5h6v6',
  edit: 'M10.5 2.5l3 3L6 13H3v-3z M9 4l3 3',
  copy: 'M5.5 5.5h8v8h-8z M10.5 5.5v-3h-8v8h3',
  home: 'M2 7.5L8 2.5l6 5 M3.5 6.5v7h3.5v-4h2v4h3.5v-7',
  panel: 'M2 3h12v10H2z M6 3v10',
  star: 'M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z',
  eye: 'M1.5 8S3.9 3.5 8 3.5 14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z M8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  sun: 'M8 5.3a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4z M8 1.3v1.4 M8 13.3v1.4 M1.3 8h1.4 M13.3 8h1.4 M3.3 3.3l1 1 M11.7 11.7l1 1 M3.3 12.7l1-1 M11.7 4.3l1-1',
  moon: 'M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z',
  speaker: 'M2 6v4h2.5L8 13V3L4.5 6z M10.5 5.8a3 3 0 0 1 0 4.4 M12.3 4a5.5 5.5 0 0 1 0 8',
} as const;

/** Solid shapes for the sidebar, as the live one draws its menu; an icon without one fills its outline path. */
const FILLED: Partial<Record<keyof typeof PATHS, string>> = {
  home: 'M8 1.5L1.2 7.3V14.5h4.8v-4.5h4v4.5h4.8V7.3z',
  image: 'M1.5 2.5h13v11h-13z M3 11.8h10L10 8.2l-2 2.3-1.6-1.6z M10.6 4.3a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z',
  create: 'M2 3.5h8a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z M12 6.5l3.5-2.2v7.4L12 9.5z',
  megaphone: 'M1 5.8v4.4h2.8L10 14V2L3.8 5.8z M11.5 5a3.2 3.2 0 0 1 0 6z M3.5 11l1.3 3.8h2.4L6.1 11z',
  apps: 'M1.5 3.5h3.5v3.5H1.5z M6.25 3.5h3.5v3.5h-3.5z M11 3.5h3.5v3.5H11z M1.5 9h3.5v3.5H1.5z M6.25 9h3.5v3.5h-3.5z M11 9h3.5v3.5H11z',
  library: 'M3.5 1.5h11v9h-11z M5 9h8L10.6 6l-1.8 2-1.3-1.2z M1.5 4v10.5H12V13H3V4z',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 14, filled = false }: { name: IconName; size?: number; filled?: boolean }) {
  if (filled)
    return (
      <svg className="icon" aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" fillRule="evenodd">
        <path d={FILLED[name] ?? PATHS[name]} />
      </svg>
    );
  return (
    <svg className="icon" aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
