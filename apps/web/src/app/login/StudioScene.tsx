import type { CSSProperties, Ref } from 'react';

// Dust in the two light beams: [x, y, radius, seconds, delay]. Fixed, so the server and the browser draw the same scene.
const DUST = [
  [118, 236, 2.4, 7, 0], [150, 300, 2, 9, 2.1], [176, 352, 2.6, 8, 4.4], [132, 330, 1.9, 10, 1.3], [205, 396, 2.2, 7.5, 3.2], [160, 262, 1.8, 11, 5.6],
  [362, 236, 2.4, 8, 1.1], [330, 300, 2, 9.5, 3.7], [304, 352, 2.6, 7, 0.6], [348, 330, 1.9, 10.5, 2.8], [276, 396, 2.2, 8.5, 4.9], [320, 262, 1.8, 11, 6.2],
] as const;

/**
 * The product-video studio drawn for the login page: paper sweep, two lights that switch on, dust in their beams, a turntable with a product
 * box, a camera mascot that shows REC while the form is being filled in, and a flash and clapperboard for a successful sign-in.
 */
export function StudioScene({ mascot }: { mascot: Ref<SVGGElement> }) {
  return (
    <svg className="studio" viewBox="0 0 480 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect className="scene-wall" width="480" height="560" />
      <rect className="scene-floor" y="410" width="480" height="150" />
      <path className="scene-sweep" d="M100 40h280v290q0 80 80 80v60H20v-60q80 0 80-80z" />
      <path className="scene-glow" d="M58 150l30 22 202 258H150z M422 150l-30 22-202 258h140z" />
      <g className="scene-dust">
        {DUST.map(([cx, cy, r, s, d]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} style={{ '--s': `${s}s`, '--d': `${d}s` } as CSSProperties} />
        ))}
      </g>
      {[
        { x: 46, turn: 28 },
        { x: 434, turn: -28 },
      ].map(({ x, turn }) => (
        <g key={x} className="scene-light">
          <path className="scene-stand" d={`M${x} 175v315 m0 0l-26 24 m26-24l26 24 m-26-24v28`} />
          <g transform={`rotate(${turn} ${x} 145)`}>
            <rect className="scene-lamp" x={x - 34} y="118" width="68" height="54" rx="8" />
            <rect className="scene-lamp-face" x={x - 27} y="126" width="54" height="38" rx="4" />
          </g>
        </g>
      ))}
      <g className="scene-turntable">
        <path className="scene-table" d="M130 420v16a110 22 0 0 0 220 0v-16z" />
        <ellipse className="scene-table-top" cx="240" cy="420" rx="110" ry="22" />
        <ellipse className="scene-table-ring" cx="240" cy="420" rx="92" ry="16" />
      </g>
      <g className="scene-box">
        <path className="scene-box-top" d="M190 330l30-16h80l-30 16z" />
        <path className="scene-box-side" d="M270 330l30-16v90l-30 16z" />
        <rect className="scene-box-front" x="190" y="330" width="80" height="90" />
        <rect className="scene-box-mark" x="190" y="352" width="80" height="12" />
        <path className="scene-box-mark" d="M221 380h6l3 9 3-9h6l-6 16h-6z" />
      </g>
      <g className="mascot" ref={mascot}>
        <path className="scene-stand" d="M100 386l-30 118 M100 386l30 118 M100 386v122" />
        <rect className="mascot-body" x="62" y="334" width="76" height="54" rx="12" />
        <rect className="mascot-body" x="76" y="320" width="32" height="18" rx="5" />
        {/* Left of the lens pivot and above the handle: the lens, turned up to its 40° limit, never covers them. */}
        <circle className="mascot-tally" cx="72" cy="346" r="4" />
        <text className="mascot-rec" x="80" y="315">
          REC
        </text>
        <g transform="translate(100 361)">
          <g className="mascot-lens">
            <rect className="mascot-dark" x="22" y="-14" width="30" height="28" rx="5" />
            <circle className="mascot-dark" cx="54" r="16" />
            <circle className="mascot-glass" cx="54" r="10" />
            <circle className="mascot-glint" cx="50" cy="-4" r="3" />
          </g>
        </g>
      </g>
      <g className="scene-clapper">
        <g className="scene-clapper-arm">
          <rect x="300" y="196" width="112" height="18" rx="3" />
          <path className="scene-clapper-stripes" d="M312 196l-10 18h16l10-18z M344 196l-10 18h16l10-18z M376 196l-10 18h16l10-18z" />
        </g>
        <rect x="300" y="216" width="112" height="70" rx="5" />
        <path className="scene-clapper-stripes" d="M312 216l-10 14h16l10-14z M344 216l-10 14h16l10-14z M376 216l-10 14h16l10-14z" />
        <text x="356" y="268" textAnchor="middle">
          Bấm máy!
        </text>
      </g>
      <rect className="scene-flash" width="480" height="560" />
    </svg>
  );
}
