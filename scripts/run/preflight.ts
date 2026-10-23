// Zero-cost credential checks behind `pnpm preflight` (plan §3, A.0). Prints ready / missing / wrong (in Vietnamese)
// per item and never a value.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Status = 'ĐỦ' | 'THIẾU' | 'SAI';
export interface ItemResult {
  id: string;
  status: Status;
  note: string;
}
export type Env = Record<string, string | undefined>;
export interface Deps {
  env: Env;
  fetch: typeof fetch;
  run: (cmd: string, args: string[], stdin?: string) => Promise<{ code: number }>;
  listBucket: (repo: { endpoint: string; bucket: string; key: string; secret: string }) => Promise<void>;
}

/** Plan steps that start `skipped` when an item is not ready. `required` items block the whole run instead. */
export const ITEMS: { id: string; label: string; required?: boolean; skips: string[] }[] = [
  { id: 'github', label: 'GitHub CLI đã đăng nhập', required: true, skips: [] },
  { id: 'docker', label: 'Docker trên máy này', required: true, skips: [] },
  { id: 'ssh', label: 'ssh vet-linux', skips: ['A.0c', 'B.3', 'B.5a', 'B.5', 'B.6', 'B.7', 'D.3', 'D.5'] },
  { id: 'fal', label: 'fal (FAL_KEY)', skips: ['B.5a', 'B.5', 'B.6', 'B.7', 'M.6'] },
  { id: 'replicate', label: 'Replicate (REPLICATE_API_TOKEN)', skips: ['B.5a', 'B.5', 'B.6', 'B.7', 'M.6'] },
  { id: 'lark-app', label: 'App Lark OAuth', skips: ['D.5-lark'] },
  { id: 'r2', label: 'Cloudflare R2 cho sao lưu', skips: ['D.2-r2'] },
  { id: 'restic', label: 'Mật khẩu mã hoá sao lưu (restic)', skips: ['D.2-r2'] },
  { id: 'cloudflare', label: 'Khoá Cloudflare (tunnel + DNS vetgroup.net)', skips: ['D.5-hostname'] },
  { id: 'admin', label: 'Email và mật khẩu Admin đầu tiên', skips: ['D.5-admin'] },
  { id: 'lark-dm', label: 'Nhắn Lark cho người phụ trách', skips: [] },
];

export const FAL_PROBE_ENDPOINT = 'fal-ai/kling-video/o3/pro/reference-to-video';
export const CLOUDFLARE_ZONE = 'vetgroup.net';

const ok = (id: string, note = ''): ItemResult => ({ id, status: 'ĐỦ', note });
const missing = (id: string, note: string): ItemResult => ({ id, status: 'THIẾU', note });
const wrong = (id: string, note: string): ItemResult => ({ id, status: 'SAI', note });

async function http(deps: Deps, url: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await deps.fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch {
    return null;
  }
}

/** Owner's Lark open_id: CVS_OWNER_LARK_OPEN_ID, else the ops notifier config this machine already uses. */
export function ownerOpenId(env: Env): string | undefined {
  if (env.CVS_OWNER_LARK_OPEN_ID) return env.CVS_OWNER_LARK_OPEN_ID;
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), '.omniroute', 'quota-notify.json'), 'utf8')) as { lark_open_id?: string };
    return cfg.lark_open_id;
  } catch {
    return undefined;
  }
}

async function bearer(deps: Deps, id: string, url: string, auth: string): Promise<ItemResult> {
  const res = await http(deps, url, { headers: { Authorization: auth } });
  if (!res) return wrong(id, 'không kết nối được');
  if (res.status === 401 || res.status === 403) return wrong(id, `khoá bị từ chối (HTTP ${res.status})`);
  return res.ok ? ok(id) : wrong(id, `HTTP ${res.status}`);
}

export async function checkItem(id: string, deps: Deps): Promise<ItemResult> {
  const e = deps.env;
  switch (id) {
    case 'github':
      return (await deps.run('gh', ['auth', 'status'])).code === 0 ? ok(id) : missing(id, 'chạy `gh auth login`');
    case 'docker':
      return (await deps.run('docker', ['info'])).code === 0 ? ok(id) : missing(id, 'mở Docker Desktop');
    case 'ssh':
      return (await deps.run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', 'vet-linux', 'true'])).code === 0
        ? ok(id)
        : wrong(id, 'không vào được vet-linux');
    case 'fal':
      if (!e.FAL_KEY) return missing(id, 'điền FAL_KEY');
      return bearer(deps, id, `https://api.fal.ai/v1/models/pricing?endpoint_id=${FAL_PROBE_ENDPOINT}`, `Key ${e.FAL_KEY}`);
    case 'replicate':
      if (!e.REPLICATE_API_TOKEN) return missing(id, 'điền REPLICATE_API_TOKEN');
      return bearer(deps, id, 'https://api.replicate.com/v1/account', `Bearer ${e.REPLICATE_API_TOKEN}`);
    case 'lark-app': {
      if (!e.LARK_APP_ID || !e.LARK_APP_SECRET || !e.LARK_TENANT_KEY) return missing(id, 'điền LARK_APP_ID, LARK_APP_SECRET, LARK_TENANT_KEY');
      const res = await http(deps, 'https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ app_id: e.LARK_APP_ID, app_secret: e.LARK_APP_SECRET }),
      });
      if (!res) return wrong(id, 'không kết nối được');
      const body = (await res.json().catch(() => ({}))) as { code?: number };
      return res.ok && body.code === 0 ? ok(id) : wrong(id, `Lark trả mã ${body.code ?? res.status}`);
    }
    case 'r2': {
      const repo = e.CVS_R2_REPOSITORY;
      if (!repo || !e.CVS_R2_ACCESS_KEY_ID || !e.CVS_R2_SECRET_ACCESS_KEY) return missing(id, 'điền CVS_R2_REPOSITORY và khoá R2');
      const m = /^s3:(https:\/\/[^/]+)\/([^/]+)\/?$/.exec(repo);
      if (!m) return wrong(id, 'CVS_R2_REPOSITORY phải có dạng s3:https://<account>.r2.cloudflarestorage.com/<bucket>');
      try {
        await deps.listBucket({ endpoint: m[1]!, bucket: m[2]!, key: e.CVS_R2_ACCESS_KEY_ID, secret: e.CVS_R2_SECRET_ACCESS_KEY });
        return ok(id);
      } catch {
        return wrong(id, 'không liệt kê được bucket bằng khoá này');
      }
    }
    case 'restic':
      if (!e.CVS_RESTIC_PASSWORD) return missing(id, 'điền CVS_RESTIC_PASSWORD');
      return e.CVS_RESTIC_PASSWORD.length >= 16 ? ok(id, 'nhớ lưu vào trình quản lý mật khẩu') : wrong(id, 'cần ít nhất 16 ký tự');
    case 'cloudflare': {
      const t = e.CLOUDFLARE_API_TOKEN;
      if (!t) return missing(id, 'điền CLOUDFLARE_API_TOKEN');
      const auth = { headers: { Authorization: `Bearer ${t}` } };
      const zones = await http(deps, `https://api.cloudflare.com/client/v4/zones?name=${CLOUDFLARE_ZONE}`, auth);
      const zone = ((await zones?.json().catch(() => null)) as { result?: { id: string; account: { id: string } }[] } | null)?.result?.[0];
      // User tokens verify on /user; account-owned tokens only on their account's path.
      const verify = await http(deps, 'https://api.cloudflare.com/client/v4/user/tokens/verify', auth);
      const accountVerify = !verify?.ok && zone ? await http(deps, `https://api.cloudflare.com/client/v4/accounts/${zone.account.id}/tokens/verify`, auth) : null;
      if (!verify?.ok && !accountVerify?.ok) return wrong(id, 'khoá không hợp lệ');
      if (!zone) return wrong(id, `khoá không thấy zone ${CLOUDFLARE_ZONE}`);
      const dns = await http(deps, `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records?per_page=1`, auth);
      const tunnels = await http(deps, `https://api.cloudflare.com/client/v4/accounts/${zone.account.id}/cfd_tunnel?per_page=1`, auth);
      if (!dns?.ok) return wrong(id, 'thiếu quyền DNS');
      if (!tunnels?.ok) return wrong(id, 'thiếu quyền Cloudflare Tunnel');
      return ok(id, 'đã kiểm quyền đọc; quyền sửa được xác nhận lúc tạo tunnel');
    }
    case 'admin':
      if (!e.CVS_ADMIN_EMAIL || !e.CVS_ADMIN_PASSWORD) return missing(id, 'điền CVS_ADMIN_EMAIL và CVS_ADMIN_PASSWORD');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.CVS_ADMIN_EMAIL)) return wrong(id, 'email không hợp lệ');
      return e.CVS_ADMIN_PASSWORD.length >= 12 ? ok(id) : wrong(id, 'mật khẩu cần ít nhất 12 ký tự');
    case 'lark-dm': {
      const to = ownerOpenId(e);
      if (!to) return missing(id, 'điền CVS_OWNER_LARK_OPEN_ID');
      const sent = await deps.run('lark-cli', ['im', '+messages-send', '--user-id', to, '--as', 'bot', '--markdown', '-'], 'Creative Video Studio: tin thử của preflight.');
      return sent.code === 0 ? ok(id, 'đã gửi 1 tin thử') : wrong(id, 'lark-cli không gửi được');
    }
    default:
      throw new Error(`unknown preflight item ${id}`);
  }
}

/** Every value that must never appear in output. */
export function secretValues(env: Env): string[] {
  const keys = ['FAL_KEY', 'REPLICATE_API_TOKEN', 'LARK_APP_SECRET', 'CVS_R2_ACCESS_KEY_ID', 'CVS_R2_SECRET_ACCESS_KEY', 'CVS_RESTIC_PASSWORD', 'CLOUDFLARE_API_TOKEN', 'CVS_ADMIN_PASSWORD', 'BETTER_AUTH_SECRET'];
  return keys.map((k) => env[k]).filter((v): v is string => !!v && v.length >= 4);
}

export function redact(text: string, secrets: string[]): string {
  return secrets.reduce((t, s) => t.split(s).join('***'), text);
}

export function format(results: ItemResult[]): string {
  return results
    .map((r) => {
      const label = ITEMS.find((i) => i.id === r.id)?.label ?? r.id;
      return `${r.status.padEnd(5)} ${label}${r.note ? ` — ${r.note}` : ''}`;
    })
    .join('\n');
}

export async function runPreflight(deps: Deps): Promise<{ results: ItemResult[]; text: string; blocked: boolean }> {
  const results = await Promise.all(ITEMS.map((i) => checkItem(i.id, deps)));
  const blocked = results.some((r) => r.status !== 'ĐỦ' && ITEMS.find((i) => i.id === r.id)?.required);
  return { results, text: redact(format(results), secretValues(deps.env)), blocked };
}

/** Steps to start as `skipped`, with the item that caused each. */
export function skippedSteps(results: ItemResult[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of results) {
    if (r.status === 'ĐỦ') continue;
    for (const step of ITEMS.find((i) => i.id === r.id)?.skips ?? []) if (!out.has(step)) out.set(step, `preflight ${r.id}: ${r.status}`);
  }
  return out;
}
