import { mcpNoStream, mcpOptions, mcpPost } from '@/lib/mcp/server'

export const dynamic = 'force-dynamic'

// hadith.dev/mcp — open MCP endpoint (a Bearer token, if given, lifts the daily limit)
export const POST = (req: Request) => mcpPost(req, { requireAuth: false, path: '/mcp' })
export const GET = mcpNoStream
export const DELETE = mcpNoStream
export const OPTIONS = mcpOptions
