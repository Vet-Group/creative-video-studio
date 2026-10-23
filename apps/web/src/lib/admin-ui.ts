// Browser-side helpers shared by the Admin pages.
import { useEffect, useState } from 'react';
import { api, ApiError } from './api';

/** Loads a GET route, again whenever `path` changes or `reload` is called. `data` stays undefined until the first answer, so forms render after hydration. */
export function useFetch<T>(path: string) {
  const [data, setData] = useState<T>();
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let stale = false;
    api<T>(path).then(
      (r) => {
        if (stale) return;
        setData(r);
        setFailed(false);
      },
      () => !stale && setFailed(true),
    );
    return () => {
      stale = true;
    };
  }, [path, tick]);
  return { data, failed, reload: () => setTick((n) => n + 1) };
}

/** The Vietnamese text for a failed Admin call, followed by the server's reason, which Admins may read. */
export const failText = (e: unknown, fallback: string): string => (e instanceof ApiError ? `${fallback} (${e.message})` : fallback);

/** Runs a change, reloads the page data after it and keeps the reason when it fails; `run` says whether it worked. */
export function useAction(reload: () => void) {
  const [problem, setProblem] = useState('');
  async function run(change: () => Promise<unknown>, fallback: string): Promise<boolean> {
    setProblem('');
    try {
      await change();
      reload();
      return true;
    } catch (e) {
      setProblem(failText(e, fallback));
      return false;
    }
  }
  return { problem, run };
}
