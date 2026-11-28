// OAuth building blocks (lib/oauth.ts): the loopback redirect rule (RFC 8252, port aside), the metadata naming APP_URL, the redirect back with `iss`,
// and the pending-client eviction, against a disposable database on the compose Postgres.
import { randomBytes } from 'node:crypto';
import { createTestDatabase } from '@cvs/db/testing';
import { afterAll, describe, expect, test } from 'vitest';

const testDb = await createTestDatabase();
process.env.DATABASE_URL = testDb.url;
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
process.env.APP_URL = 'https://cvs.example.test/';

const { pool } = await import('@/lib/auth');
const { authorizationServerMetadata, backTo, loopbackRedirect, MAX_PENDING_CLIENTS, protectedResourceMetadata, redirectMatches, registerClient, registrations, resourceMetadataUrl } =
  await import('@/lib/oauth');

afterAll(async () => {
  try {
    await pool.end();
  } finally {
    await testDb.drop();
  }
});

describe('loopback redirects', () => {
  test.each([
    ['http://127.0.0.1:53682/callback', true],
    ['http://localhost:33418/callback', true],
    ['http://[::1]:8080/mcp-oauth/callback', true],
    ['http://127.0.0.1/mcp-oauth/callback', true],
    ['https://127.0.0.1:53682/callback', false],
    ['https://claude.ai/api/mcp/auth_callback', false],
    ['http://example.com/callback', false],
    ['http://127.0.0.1.example.com/callback', false],
    ['http://user:pw@127.0.0.1/callback', false],
    ['http://127.0.0.1/callback#frag', false],
    ['http://127.0.0.1/callback#', false],
    ['http://127.0.0.1/callback?next=https://evil.example', false],
    ['http://localhost:4000/callback?', false],
    ['javascript:alert(1)', false],
    [42, false],
  ])('%s -> %s', (uri, ok) => {
    expect(loopbackRedirect(uri) !== null).toBe(ok);
  });

  test('a registered loopback redirect matches whatever the port, but never another host, path or query', () => {
    const registered = ['http://127.0.0.1:1111/mcp-oauth/callback', 'http://localhost/callback'];
    expect(redirectMatches(registered, 'http://127.0.0.1:52000/mcp-oauth/callback')).toBe(true);
    expect(redirectMatches(registered, 'http://localhost:40123/callback')).toBe(true);
    expect(redirectMatches(registered, 'http://localhost:40123/mcp-oauth/callback')).toBe(false);
    expect(redirectMatches(registered, 'http://[::1]:40123/callback')).toBe(false);
    expect(redirectMatches(registered, 'http://127.0.0.1:52000/mcp-oauth/callback?x=1')).toBe(false);
    expect(redirectMatches(registered, 'https://127.0.0.1:52000/mcp-oauth/callback')).toBe(false);
  });
});

test('the metadata names APP_URL as issuer and resource, never a request host', () => {
  expect(authorizationServerMetadata()).toMatchObject({
    issuer: 'https://cvs.example.test',
    authorization_endpoint: 'https://cvs.example.test/oauth/authorize',
    token_endpoint: 'https://cvs.example.test/api/oauth/token',
    registration_endpoint: 'https://cvs.example.test/api/oauth/register',
    revocation_endpoint: 'https://cvs.example.test/api/oauth/revoke',
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    authorization_response_iss_parameter_supported: true,
  });
  expect(protectedResourceMetadata()).toMatchObject({ resource: 'https://cvs.example.test/api/mcp', authorization_servers: ['https://cvs.example.test'] });
  expect(resourceMetadataUrl()).toBe('https://cvs.example.test/.well-known/oauth-protected-resource/api/mcp');
});

test('the redirect back carries the parameters and the issuer, and leaves out a missing state', () => {
  const url = new URL(backTo('http://127.0.0.1:5000/callback', { code: 'c', state: null }));
  expect(Object.fromEntries(url.searchParams)).toEqual({ code: 'c', iss: 'https://cvs.example.test' });
});

test(`at ${MAX_PENDING_CLIENTS} clients waiting for an approval the oldest is evicted, so registration never locks out`, async () => {
  const values = Array.from({ length: MAX_PENDING_CLIENTS }, (_, i) => `('cvsc_${String(i).padStart(24, '0')}', 'Old ${i}', '{http://127.0.0.1/cb}', now() - interval '1 hour' + ${i} * interval '1 second')`);
  await pool.query(`insert into oauth_clients (id, name, redirect_uris, created_at) values ${values.join(',')}`);
  await pool.query(`insert into oauth_clients (id, name, redirect_uris, first_consent_at, created_at) values ('cvsc_${'a'.repeat(24)}', 'Approved', '{http://127.0.0.1/cb}', now(), now() - interval '2 hours')`);
  registrations.clear();
  const made = await registerClient({ client_name: 'Newest', redirect_uris: ['http://127.0.0.1/cb'] }, '198.51.100.20');
  expect('client' in made).toBe(true);
  const pending = (await pool.query(`select id from oauth_clients where first_consent_at is null order by created_at, id`)).rows.map((r) => r.id as string);
  expect(pending).toHaveLength(MAX_PENDING_CLIENTS);
  expect(pending).not.toContain(`cvsc_${'0'.repeat(24)}`);
  expect(pending[0]).toBe(`cvsc_${'0'.repeat(23)}1`);
  expect(pending).toContain(made.client?.client_id);
  // An approved client is never evicted, however old.
  expect((await pool.query(`select 1 from oauth_clients where id = $1`, [`cvsc_${'a'.repeat(24)}`])).rowCount).toBe(1);
});
