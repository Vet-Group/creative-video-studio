// node scripts/check-english.mjs — everything published to GitHub is English (plan R.1).
// Vietnamese is product behaviour only where users read it: string literals and JSX text in the allowed files below,
// the preset seed and test data. Comments are always checked. Exit 1 lists file:line for each hit.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Vietnamese letters, written as escapes so this file passes its own check.
const VI = /[\u00e0\u00e1\u1ea1\u1ea3\u00e3\u00e2\u1ea7\u1ea5\u1ead\u1ea9\u1eab\u0103\u1eb1\u1eaf\u1eb7\u1eb3\u1eb5\u00e8\u00e9\u1eb9\u1ebb\u1ebd\u00ea\u1ec1\u1ebf\u1ec7\u1ec3\u1ec5\u00ec\u00ed\u1ecb\u1ec9\u0129\u00f2\u00f3\u1ecd\u1ecf\u00f5\u00f4\u1ed3\u1ed1\u1ed9\u1ed5\u1ed7\u01a1\u1edd\u1edb\u1ee3\u1edf\u1ee1\u00f9\u00fa\u1ee5\u1ee7\u0169\u01b0\u1eeb\u1ee9\u1ef1\u1eed\u1eef\u1ef3\u00fd\u1ef5\u1ef7\u1ef9\u0111]/i;
const TEXT = /\.(ts|tsx|mts|mjs|js|json|md|yml|yaml|sh|ps1|sql|toml|css|html)$|(^|\/)(cvs-run-gate|pre-push|Dockerfile)$|^\.[a-z]+ignore$|\.env\.example$/;

/** Files where string literals and JSX text may hold Vietnamese UI or owner-facing copy. */
const STRINGS_ALLOWED = [
  /^apps\/web\/src\//,
  /^packages\/db\/seed\/presets\.ts$/,
  /^packages\/core\/src\/presets\.ts$/,
  /\.test\.tsx?$/,
  /^scripts\/preflight\.ts$/,
  /^scripts\/run\/(cli|manifest|preapproval|preflight)\.ts$/,
];
/** PowerShell scripts whose quoted strings are owner-facing messages; their # comments are still checked. */
const PS_STRINGS_ALLOWED = [/^scripts\/run\/watchdog\.ps1$/];

function commentHits(path, text) {
  const hits = [];
  const kind = path.endsWith('x') ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard;
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, kind, text);
  for (let t = scanner.scan(); t !== ts.SyntaxKind.EndOfFileToken; t = scanner.scan()) {
    if ((t === ts.SyntaxKind.SingleLineCommentTrivia || t === ts.SyntaxKind.MultiLineCommentTrivia) && VI.test(scanner.getTokenText())) {
      hits.push(text.slice(0, scanner.getTokenStart()).split('\n').length);
    }
  }
  return hits;
}

function check(path, text) {
  if (STRINGS_ALLOWED.some((r) => r.test(path)) && /\.(m?[jt]sx?)$/.test(path)) return commentHits(path, text);
  const lines = text.split('\n');
  if (PS_STRINGS_ALLOWED.some((r) => r.test(path))) return lines.flatMap((l, i) => (/^\s*#/.test(l) && VI.test(l) ? [i + 1] : []));
  return lines.flatMap((l, i) => (VI.test(l) ? [i + 1] : []));
}

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && TEXT.test(f) && f !== 'pnpm-lock.yaml');
let failed = 0;
for (const f of files) {
  for (const line of check(f, readFileSync(f, 'utf8'))) {
    console.log(`${f}:${line}: Vietnamese text outside the allowed product strings`);
    failed++;
  }
}
console.log(failed ? `${failed} line(s) to translate` : `English check passed (${files.length} files)`);
process.exit(failed ? 1 : 0);
