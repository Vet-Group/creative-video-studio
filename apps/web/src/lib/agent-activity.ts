// Settings > "Connect AI": one connection's audit rows (lib/agent-access.ts, lib/mcp/server.ts, lib/oauth.ts) as short lines an Admin can read. Only the
// method, path and tool name leave the server: never a body, an argument digest, a nonce, an IP or a workspace id.

/** A row of GET /api/agent-access/tokens/[id]/activity. */
export interface ActivityItem {
  id: string;
  at: string;
  action: string;
  label: string;
  method: string | null;
  path: string | null;
  ok: boolean;
}

// What a confirmed agent write did, by method and route (`[^/]+` is one path segment); the first match wins.
const WRITES: readonly (readonly [string, RegExp, string])[] = [
  ['POST', /^\/api\/jobs$/, 'Tạo ảnh hoặc video'],
  ['POST', /^\/api\/jobs\/[^/]+\/cancel$/, 'Huỷ việc'],
  ['POST', /^\/api\/remakes$/, 'Làm lại video'],
  ['POST', /^\/api\/analyses$/, 'Phân tích video'],
  ['POST', /^\/api\/suggestions$/, 'Xin gợi ý'],
  ['POST', /^\/api\/assets(\/|$)/, 'Tải tệp lên'],
  ['POST', /^\/api\/custom-apps\/[^/]+\/run$/, 'Chạy ứng dụng riêng'],
  ['POST', /^\/api\/library\/(zip|lookbook)$/, 'Tải thư viện về'],
];
const BY_METHOD: Record<string, string> = { POST: 'Gửi yêu cầu', PUT: 'Sửa dữ liệu', PATCH: 'Sửa dữ liệu', DELETE: 'Xoá dữ liệu' };
const REFUSED: Record<string, string> = {
  not_allowed_for_agent: 'không được phép',
  bad_path: 'đường dẫn không hợp lệ',
  confirm_required: 'thiếu bước xác nhận',
  confirm_invalid: 'xác nhận không hợp lệ',
  confirm_expired: 'xác nhận đã hết hạn',
  confirm_stale: 'xác nhận đã cũ',
  confirm_used: 'xác nhận đã dùng rồi',
};
// A tool name is one of the MCP server's own (lib/mcp/tools.ts); anything else is not echoed.
const TOOL = /^[a-z][a-z0-9_]{0,40}$/;

function writeLabel(method: string, path: string): string {
  const hit = WRITES.find(([m, re]) => m === method && re.test(path));
  if (hit) return hit[2];
  if (/(^|\/)settings(\/|$)/.test(path) && method !== 'GET') return 'Sửa cài đặt';
  return BY_METHOD[method] ?? 'Gửi yêu cầu';
}

/** One audit row as an activity line. `oauth` labels a revoke as a disconnect for an app that signed in. */
export function activityItem(row: { id: string | number; action: string; new_value: Record<string, unknown> | null; created_at: Date }, oauth: boolean): ActivityItem {
  const v = row.new_value ?? {};
  const method = typeof v.method === 'string' ? v.method : null;
  // An agent chooses the path of a refused request, so cap what an Admin reads.
  const path = typeof v.path === 'string' ? v.path.slice(0, 120) : null;
  const base = { id: String(row.id), at: row.created_at.toISOString(), action: row.action, method, path, ok: true };
  switch (row.action) {
    case 'agent.request':
      return { ...base, label: writeLabel(method ?? '', path ?? '') };
    case 'agent.read':
      return { ...base, label: 'Xem trang quản trị' };
    case 'agent.refused':
      return { ...base, ok: false, label: `Bị chặn: ${REFUSED[String(v.reason)] ?? 'không được phép'}` };
    case 'agent.tool': {
      const tool = typeof v.tool === 'string' && TOOL.test(v.tool) ? v.tool : null;
      const ok = v.outcome === 'ok';
      return { ...base, ok, label: `${tool ? `Gọi công cụ ${tool}` : 'Gọi công cụ'}${ok ? '' : ' (lỗi)'}` };
    }
    case 'agent.token_create':
      return { ...base, label: 'Tạo khoá' };
    case 'agent.oauth_consent':
      return { ...base, label: 'Cho phép ứng dụng đăng nhập' };
    case 'agent.token_update':
      return { ...base, label: 'Đổi tên' };
    case 'agent.token_revoke':
      return { ...base, ok: false, label: oauth ? 'Ngắt kết nối' : 'Thu hồi khoá' };
    case 'agent.oauth_refresh_reuse':
      return { ...base, ok: false, label: 'Bị chặn: mã đăng nhập bị dùng lại' };
    default:
      return { ...base, label: 'Hoạt động khác' };
  }
}
