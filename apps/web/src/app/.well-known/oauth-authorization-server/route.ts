import { authorizationServerMetadata } from '@/lib/oauth';

// RFC 8414 metadata of the OAuth server behind /api/mcp (lib/oauth.ts); the issuer is APP_URL, never the Host header.
export const GET = () => Response.json(authorizationServerMetadata(), { headers: { 'cache-control': 'public, max-age=300' } });
