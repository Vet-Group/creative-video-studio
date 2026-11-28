import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ipKey, TOKEN_CREATE_FRESH_MS } from '@/lib/agent-access';
import { pool } from '@/lib/auth';
import { backTo, checkAuthorize } from '@/lib/oauth';
import { isImpersonated, readSession } from '@/lib/session';
import { ReauthButton } from './ReauthButton';

export const dynamic = 'force-dynamic';

const PARAMS = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'response_type', 'resource'] as const;

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="oauth-consent">
      <section className="forced-pw-card" aria-labelledby="oauth-title">
        <h1 id="oauth-title">{title}</h1>
        {children}
      </section>
    </div>
  );
}

/**
 * The OAuth consent page of an MCP client (lib/oauth.ts, docs/AGENT-ACCESS.md "OAuth"). A signed-out visitor comes here through /login with the full
 * query (the app layout). An unknown client or a redirect it did not register gets an error page, never a redirect; a bad request from a known client and
 * a non-Admin go back to the client with the error. The Admin sees the client's self-declared name and the host it returns to on their own lines, the
 * workspace and the monthly cap, then Allow or Deny (POST /api/oauth/authorize).
 */
export default async function OAuthAuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const params = Object.fromEntries(PARAMS.flatMap((k) => (typeof query[k] === 'string' ? [[k, query[k]]] : []))) as Record<string, string>;
  const requestHeaders = await headers();
  const session = await readSession(requestHeaders);
  if (!session?.workspace) return null; // the app layout has already sent this visitor to /login or explained the missing workspace
  if (process.env.CVS_AGENT_API === '0')
    return (
      <Card title="Kết nối AI đang tạm tắt">
        <p className="muted">Hiện chưa kết nối được ứng dụng nào với CVS. Hãy thử lại sau.</p>
      </Card>
    );
  const check = await checkAuthorize(params);
  if (check.kind === 'fatal')
    return (
      <Card title="Không mở được yêu cầu kết nối">
        <p className="muted" role="alert">
          {check.reason === 'client'
            ? 'Ứng dụng này chưa đăng ký với CVS hoặc đăng ký đã hết hạn. Hãy bắt đầu kết nối lại từ ứng dụng.'
            : 'Địa chỉ quay về không khớp với địa chỉ ứng dụng đã đăng ký, nên CVS không gửi gì về đó. Hãy bắt đầu kết nối lại từ ứng dụng.'}
        </p>
      </Card>
    );
  if (check.kind === 'error') redirect(backTo(check.redirectUri, { error: check.error, error_description: check.description, state: check.state }));
  const { client, request } = check;
  if (session.user.role !== 'admin') redirect(backTo(request.redirectUri, { error: 'access_denied', state: request.state }));
  if (isImpersonated(session))
    return (
      <Card title="Không thể cho phép lúc này">
        <p className="muted">Bạn đang đăng nhập thay người khác. Hãy thoát chế độ đó rồi kết nối lại từ ứng dụng.</p>
      </Card>
    );
  const fresh = Date.now() - new Date(session.session.createdAt).getTime() <= TOKEN_CREATE_FRESH_MS;
  const workspace = (await pool.query('select name from workspaces where id = $1', [session.workspace.workspaceId])).rows[0]?.name as string;
  const returnTo = new URL(request.redirectUri);
  // A client registered from another address may be someone else's, sent here to borrow this Admin's consent.
  const elsewhere = ipKey(client.registeredIp ?? '') !== ipKey(requestHeaders.get('cf-connecting-ip') ?? 'unknown');
  return (
    <Card title="Cho phép ứng dụng dùng CVS thay bạn?">
      <dl className="oauth-facts">
        <dt>Ứng dụng tự khai tên</dt>
        <dd>{client.name}</dd>
        <dt>Sẽ quay về</dt>
        <dd>
          {returnTo.host} <span className="oauth-where">trên máy này</span>
        </dd>
      </dl>
      <p className="muted">
        Ứng dụng sẽ hành động như bạn, kể cả quyền Admin, trong không gian {workspace}. Chỉ cho phép nếu chính bạn vừa bắt đầu kết nối này. Ngắt kết nối bất cứ lúc
        nào trong Cài đặt, mục Kết nối AI.
      </p>
      {elsewhere && (
        <p className="error" role="alert">
          App này được đăng ký từ một máy khác. Chỉ bấm Cho phép nếu chính bạn vừa kết nối.
        </p>
      )}
      {query.too_many === '1' && (
        <p className="error" role="alert">
          Bạn đã có 10 kết nối. Ngắt bớt trong Cài đặt, mục Kết nối AI, rồi thử lại.
        </p>
      )}
      <form className="pw-form" method="post" action="/api/oauth/authorize">
        {Object.entries(params).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {fresh && (
          <>
            <label htmlFor="oauth-cap">Hạn mức mỗi tháng (USD)</label>
            <input id="oauth-cap" name="cap_usd" type="number" inputMode="decimal" min={0} max={1000} step="0.01" defaultValue="20" required aria-describedby="oauth-cap-hint" />
            <p className="pw-hint" id="oauth-cap-hint">
              Chi qua kết nối này chạm hạn mức thì ứng dụng không chạy thêm việc tốn tiền. Đặt lại vào ngày 1 hằng tháng.
            </p>
          </>
        )}
        {!fresh && (
          <p className="error" role="alert">
            Vì an toàn, hãy đăng nhập lại rồi cho phép.
          </p>
        )}
        <div className="tf-buttons oauth-buttons">
          {fresh ? (
            <button type="submit" className="pw-submit" name="decision" value="allow">
              Cho phép
            </button>
          ) : (
            <ReauthButton />
          )}
          <button type="submit" name="decision" value="deny" formNoValidate>
            Từ chối
          </button>
        </div>
      </form>
    </Card>
  );
}
