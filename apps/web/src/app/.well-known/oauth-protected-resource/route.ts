import { protectedResourceMetadata } from '@/lib/oauth';

// RFC 9728 metadata of /api/mcp at the root well-known URL, for clients that do not try the path-suffixed one first.
export const GET = () => Response.json(protectedResourceMetadata(), { headers: { 'cache-control': 'public, max-age=300' } });
