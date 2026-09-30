import { originOf } from '@/lib/oauth'

export const dynamic = 'force-dynamic'

// Served at /.well-known/oauth-protected-resource[/mcp[/account]] (rewrites in next.config.ts):
// tells MCP clients which authorization server signs them in for the MCP endpoint
export function GET(req: Request) {
  const origin = originOf(req)
  const path = new URL(req.url).searchParams.get('path') || '/mcp/account'
  return Response.json({
    resource: `${origin}${path}`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp'],
    resource_name: 'الجامع — موسوعة الحديث النبوي',
    resource_documentation: `${origin}/developers#mcp`,
  }, { headers: { 'Access-Control-Allow-Origin': '*' } })
}
