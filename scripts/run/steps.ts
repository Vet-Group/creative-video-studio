// Every plan step with its dependencies (plan §4). The conductor only starts a step whose deps are done or skipped.
export interface StepDef {
  id: string;
  title: string;
  deps: string[];
  worktree: 'main' | 'bakeoff' | 'app';
  /** Minutes a step may stay `doing` before it becomes `stuck` (plan A.0, conductor lease). */
  timeoutMin?: number;
  /** Deps whose skip does not skip this step: it then runs in its reduced form (e.g. M.6 ships models disabled). */
  soft?: string[];
}

export const STEPS: StepDef[] = [
  { id: 'A.0', title: 'Launch kit', deps: [], worktree: 'main' },
  { id: 'P.0', title: 'Doc alignment', deps: [], worktree: 'main' },
  { id: 'R.1', title: 'Repository', deps: ['A.0', 'P.0'], worktree: 'main' },
  { id: 'R.2', title: 'CI', deps: ['R.1'], worktree: 'main', timeoutMin: 180 },
  { id: 'R.3', title: 'Password-optional user creation', deps: ['R.1'], worktree: 'main' },
  { id: 'A.0c', title: 'Install the gate key', deps: ['R.2'], worktree: 'main' },
  { id: 'A.0b', title: 'Contracts PR', deps: ['R.2', 'R.3'], worktree: 'main', timeoutMin: 180 },
  { id: 'B.1', title: 'Provider facts', deps: ['A.0b'], worktree: 'bakeoff' },
  { id: 'B.2', title: 'Adapters', deps: ['B.1'], worktree: 'bakeoff' },
  { id: 'B.3', title: 'Sample images', deps: ['A.0c', 'A.0b'], worktree: 'bakeoff' },
  { id: 'B.4', title: 'Run script', deps: ['B.2'], worktree: 'bakeoff' },
  { id: 'B.5a', title: 'Canary', deps: ['B.3', 'B.4'], worktree: 'bakeoff', timeoutMin: 180 },
  { id: 'B.5', title: 'Full bake-off', deps: ['B.5a'], worktree: 'bakeoff', timeoutMin: 180 },
  { id: 'B.6', title: 'Judging and gate', deps: ['B.5'], worktree: 'bakeoff' },
  { id: 'M.1', title: 'Assets', deps: ['A.0b'], worktree: 'app' },
  { id: 'M.2', title: 'Jobs, ledger and presets', deps: ['M.1'], worktree: 'app' },
  { id: 'B.7', title: 'Book bake-off spend in the ledger', deps: ['B.6', 'M.2'], worktree: 'bakeoff' },
  { id: 'M.3', title: 'Limits', deps: ['M.2'], worktree: 'app' },
  { id: 'M.4', title: 'UI', deps: ['M.3'], worktree: 'app' },
  { id: 'M.5', title: 'Admin area', deps: ['M.4'], worktree: 'app' },
  { id: 'M.6', title: 'Real providers', deps: ['M.5', 'B.6'], worktree: 'app', soft: ['B.6'] },
  { id: 'D.1', title: 'Google and Lark login with account linking (mocked OAuth)', deps: ['M.5'], worktree: 'app' },
  // Change request UI-PARITY (2026-10-23): rebuild the Fash look and motion on the existing app (docs/UI-MOTION-PARITY.md).
  { id: 'M.7', title: 'UI and motion parity', deps: ['D.1'], worktree: 'app', timeoutMin: 180 },
  // M.7 ended with C4 not met; M.7b applies the measured fix list (docs/UI-MOTION-PARITY-M7B.md).
  { id: 'M.7b', title: 'UI parity fixes from measurements', deps: ['D.1'], worktree: 'app', timeoutMin: 180 },
  { id: 'D.2', title: 'Backups', deps: ['A.0b'], worktree: 'app' },
  { id: 'D.2-r2', title: 'Weekly R2 copy', deps: ['D.2'], worktree: 'app' },
  { id: 'D.3', title: 'Read-only VET check', deps: ['A.0c'], worktree: 'app' },
  { id: 'D.4', title: 'Deploy kit', deps: ['D.2', 'D.3'], worktree: 'app', soft: ['D.3'] },
  { id: 'D.5', title: 'Deploy', deps: ['D.4', 'D.1', 'M.6', 'B.7', 'M.7', 'M.7b'], worktree: 'app', timeoutMin: 180, soft: ['M.6', 'B.7', 'M.7', 'M.7b'] },
  { id: 'D.5-hostname', title: 'Public hostname', deps: ['D.5'], worktree: 'app' },
  { id: 'D.5-admin', title: 'First Admin', deps: ['D.5'], worktree: 'app' },
  { id: 'D.5-lark', title: 'Lark live check', deps: ['D.5-hostname', 'D.1'], worktree: 'app' },
  { id: 'D.5-google', title: 'Google live check', deps: ['D.5-hostname', 'D.1'], worktree: 'app' },
];

// The results report reports on every other step, so it waits for all of them; a skipped or stuck one is reported, not blocking.
const reported = STEPS.map((s) => s.id);
STEPS.push(
  { id: 'P.1', title: 'Boss results report', deps: reported, worktree: 'main', soft: reported },
  { id: 'A.2', title: 'Done check and clean-up', deps: ['P.1'], worktree: 'main', soft: ['P.1'] },
);
