/** A script or style file the browser could not fetch: the page was loaded before a deploy and asks the new server for the old build's files. */
export const isStaleBuild = (e: { name?: string; message?: string }): boolean =>
  e.name === 'ChunkLoadError' || /Loading (CSS )?chunk|Failed to load chunk|dynamically imported module/i.test(e.message ?? '');
