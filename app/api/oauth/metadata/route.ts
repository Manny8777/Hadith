import { authServerMetadata, originOf } from '@/lib/oauth'

export const dynamic = 'force-dynamic'

// Served at /.well-known/oauth-authorization-server (rewrite in next.config.ts)
export function GET(req: Request) {
  return Response.json(authServerMetadata(originOf(req)), { headers: { 'Access-Control-Allow-Origin': '*' } })
}
