import { mcpNoStream, mcpOptions, mcpPost } from '@/lib/mcp/server'

export const dynamic = 'force-dynamic'

// hadith.dev/mcp/account — the same server behind sign-in: MCP clients run the OAuth flow themselves
export const POST = (req: Request) => mcpPost(req, { requireAuth: true, path: '/mcp/account' })
export const GET = mcpNoStream
export const DELETE = mcpNoStream
export const OPTIONS = mcpOptions
