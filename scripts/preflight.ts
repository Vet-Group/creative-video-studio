// pnpm preflight — checks every owner-provided credential with zero-cost calls (plan §3). Values are never printed.
// Writes .omc/run/preflight.json (statuses only) for the run manifest, then prints the pre-approval sentence.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { PREAPPROVAL_SENTENCE } from './run/preapproval.ts';
import { runPreflight, skippedSteps, type Deps } from './run/preflight.ts';

const deps: Deps = {
  env: process.env,
  fetch,
  run: (cmd, args, stdin) =>
    new Promise((resolve) => {
      // lark-cli is an npm .cmd shim on Windows, which only resolves through a shell; no argument here contains spaces.
      const p = spawn(cmd, args, { stdio: [stdin ? 'pipe' : 'ignore', 'ignore', 'ignore'], shell: process.platform === 'win32' });
      p.on('error', () => resolve({ code: 127 }));
      p.on('close', (code) => resolve({ code: code ?? 1 }));
      if (stdin) p.stdin?.end(stdin);
    }),
  listBucket: async ({ endpoint, bucket, key, secret }) => {
    const s3 = new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId: key, secretAccessKey: secret } });
    await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
  },
};

const { results, text, blocked } = await runPreflight(deps);
console.log(text);
mkdirSync('.omc/run', { recursive: true });
const skipped = Object.fromEntries(skippedSteps(results));
writeFileSync('.omc/run/preflight.json', `${JSON.stringify({ checkedAt: new Date().toISOString(), results, skipped }, null, 2)}\n`);

if (blocked) {
  console.log('\nChưa chạy được: sửa các mục bắt buộc ở trên rồi chạy lại `pnpm preflight`.');
  process.exit(1);
}
const n = Object.keys(skipped).length;
console.log(`\n${n ? `${n} bước sẽ được bỏ qua vì mục chưa ĐỦ (chạy lại preflight sau khi bổ sung để mở lại).` : 'Mọi mục đã ĐỦ.'}`);
console.log('\nĐể bắt đầu lượt chạy, gõ đúng câu sau vào lệnh `pnpm run:approve "<câu duyệt>"`:\n');
console.log(PREAPPROVAL_SENTENCE);
