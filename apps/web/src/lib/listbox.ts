// The keyboard model of the custom selects and the model picker, kept free of React so it can be tested alone.

/** The index an arrow key, Home or End moves to, skipping disabled options; the same index when nothing can move. */
export function moveActive(key: string, active: number, disabled: readonly boolean[]): number {
  const enabled = (i: number) => i >= 0 && i < disabled.length && !disabled[i];
  const scan = (from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < disabled.length; i += step) if (enabled(i)) return i;
    return active;
  };
  if (key === 'Home') return scan(0, 1);
  if (key === 'End') return scan(disabled.length - 1, -1);
  if (key === 'ArrowDown') return scan(active + 1, 1);
  if (key === 'ArrowUp') return scan(active - 1, -1);
  return active;
}

/** The first enabled option at or after `from`, else -1. */
export function firstEnabled(disabled: readonly boolean[], from = 0): number {
  return disabled.findIndex((d, n) => n >= from && !d);
}
