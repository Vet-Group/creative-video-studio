/** The picture of an empty Library or History: a small stack of frames in the app's tokens, with a play mark, or a lens when filters hide everything. */
export function EmptyArt({ search }: { search?: boolean }) {
  return (
    <svg className="library-art" viewBox="0 0 120 96" width="120" height="96" aria-hidden="true" focusable="false">
      <rect className="art-back" x="22" y="16" width="44" height="60" rx="8" transform="rotate(-12 44 46)" />
      <rect className="art-mid" x="54" y="16" width="44" height="60" rx="8" transform="rotate(12 76 46)" />
      <rect className="art-front" x="34" y="12" width="52" height="70" rx="8" />
      {search ? (
        <>
          <path className="art-line" d="M44 30h32 M44 40h24 M44 50h28" />
          <circle className="art-lens" cx="80" cy="64" r="11" />
          <path className="art-handle" d="M88 72l9 9" />
        </>
      ) : (
        <>
          <circle className="art-play" cx="60" cy="44" r="12" />
          <path className="art-play-mark" d="M56.5 38.5v11l9-5.5z" />
          <path className="art-spark" d="M96 14l1.8 4.2L102 20l-4.2 1.8L96 26l-1.8-4.2L90 20l4.2-1.8z" />
        </>
      )}
    </svg>
  );
}
