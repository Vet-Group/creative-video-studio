import { protectedResourceMetadata } from '@/lib/oauth';

// RFC 9728 metadata of /api/mcp, the URL its 401 names in WWW-Authenticate resource_metadata.
export const GET = () => Response.json(protectedResourceMetadata(), { headers: { 'cache-control': 'public, max-age=300' } });
