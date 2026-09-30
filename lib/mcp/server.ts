// A Model Context Protocol server over Streamable HTTP, stateless: every POST carries JSON-RPC and
// is answered with JSON (no server-sent events, so GET is 405, as the spec allows).
//
//   /mcp          open to everyone — 50 tool calls a day per IP; a valid Bearer token (a personal
//                 hd_… token or an OAuth access token) lifts it to the signed-in limit
//   /mcp/account  the same, but asks for sign-in: without a token it answers 401 pointing at the
//                 OAuth metadata, so Claude / ChatGPT run the sign-in themselves
//
// Anonymous answers carry a note inviting the reader to create an account for the higher limit.
import { createHash } from 'node:crypto'
import pool from '@/lib/db'
import { userForBearer, type User } from '@/lib/auth'
import { MCP_LIMITS } from './limits'
import { TOOLS } from './tools'

const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05']
const SERVER_INFO = { name: 'hadith-dev', title: 'الجامع — موسوعة الحديث النبوي', version: '1.0.0', websiteUrl: 'https://hadith.dev' }
const INSTRUCTIONS =
  'Al-Jami\' hadith encyclopedia (hadith.dev): 339,607 hadiths in 245 books, 30,087 narrators. ' +
  'Search texts with search_hadith, read one with get_hadith, its other narrations with get_parallels, ' +
  'narrators with search_narrators / get_narrator. Quote texts exactly as returned and cite the hadith.dev link; ' +
  'rulings are those of the named muhaddith as summarised by al-Durar al-Saniyya — do not grade hadiths yourself.'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Accept',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
}

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

function origin(req: Request): string {
  const h = req.headers
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'hadith.dev'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return process.env.SITE_URL || `${proto}://${host}`
}

function unauthorized(req: Request, path: string, error?: string): Response {
  const meta = `${origin(req)}/.well-known/oauth-protected-resource${path}`
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: error ? 'Invalid or expired token' : 'Sign in to use this endpoint' }, id: null }), {
    status: 401,
    headers: { ...CORS, 'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer resource_metadata="${meta}"${error ? `, error="${error}"` : ''}` },
  })
}

/** Counts one tool call; returns the calls made today (including this one). */
async function countCall(subject: string): Promise<number> {
  const r = await pool.query<{ calls: number }>(
    `INSERT INTO mcp_usage (subject, day, calls) VALUES ($1, current_date, 1)
     ON CONFLICT (subject, day) DO UPDATE SET calls = mcp_usage.calls + 1 RETURNING calls`, [subject])
  return r.rows[0].calls
}

const ACCOUNT_NOTE = (left: number) =>
  `ملاحظة: تستعمل خادم «الجامع» دون حساب — بقي لك اليوم ${left} من ${MCP_LIMITS.anon} طلبًا. ` +
  `لرفع الحد إلى ${MCP_LIMITS.user.toLocaleString('en')} طلب يوميًا: أنشئ حسابًا مجانيًا على https://hadith.dev/login ` +
  `ثم استعمل الموصِّل https://hadith.dev/mcp/account (أو رمزًا شخصيًا من https://hadith.dev/account).\n` +
  `Note: you are using the Al-Jami' MCP server without an account (${left} of ${MCP_LIMITS.anon} calls left today). ` +
  `Create a free account at https://hadith.dev/login and connect https://hadith.dev/mcp/account for ${MCP_LIMITS.user.toLocaleString('en')} calls a day.`

async function callTool(params: Record<string, unknown>, user: User | null, ip: string) {
  const tool = TOOLS.find(t => t.name === params.name)
  if (!tool) return { error: { code: -32602, message: `Unknown tool: ${String(params.name)}` } }

  const limit = user ? MCP_LIMITS.user : MCP_LIMITS.anon
  const subject = user ? `u:${user.id}` : `ip:${createHash('sha256').update(ip).digest('hex').slice(0, 20)}`
  const calls = await countCall(subject)
  if (calls > limit) {
    const text = user
      ? `بلغتَ الحد اليومي (${limit} طلب) لحسابك؛ يتجدّد غدًا. / Daily limit of ${limit} calls reached; it resets tomorrow.`
      : ACCOUNT_NOTE(0).replace(/^ملاحظة: /, 'بلغتَ الحد اليومي دون حساب. ')
    return { result: { content: [{ type: 'text', text }], isError: true } }
  }

  try {
    const data = await tool.run((params.arguments as Record<string, unknown>) ?? {})
    const content: { type: 'text'; text: string }[] = [{ type: 'text', text: JSON.stringify(data, null, 1) }]
    if (!user) content.push({ type: 'text', text: ACCOUNT_NOTE(limit - calls) })
    return { result: { content, structuredContent: Array.isArray(data) ? { items: data } : data, isError: false } }
  } catch (e) {
    return { result: { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true } }
  }
}

async function handle(msg: Rpc, user: User | null, ip: string): Promise<object | null> {
  const reply = (body: object) => ({ jsonrpc: '2.0', id: msg.id ?? null, ...body })
  if (msg.id === undefined || msg.id === null) return null // a notification: no answer
  switch (msg.method) {
    case 'initialize': {
      const asked = String(msg.params?.protocolVersion ?? '')
      return reply({ result: {
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      } })
    }
    case 'ping': return reply({ result: {} })
    case 'tools/list': return reply({ result: { tools: TOOLS.map(({ run: _run, ...t }) => ({ ...t, annotations: { readOnlyHint: true, openWorldHint: false } })) } })
    case 'tools/call': return reply(await callTool(msg.params ?? {}, user, ip))
    case 'resources/list': return reply({ result: { resources: [] } })
    case 'prompts/list': return reply({ result: { prompts: [] } })
    default: return reply({ error: { code: -32601, message: `Method not found: ${msg.method}` } })
  }
}

export async function mcpPost(req: Request, { requireAuth, path }: { requireAuth: boolean; path: string }): Promise<Response> {
  const auth = req.headers.get('authorization') ?? ''
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  const user = bearer ? await userForBearer(bearer) : null
  if (bearer && !user) return unauthorized(req, path, 'invalid_token')
  if (requireAuth && !user) return unauthorized(req, path)

  let body: Rpc | Rpc[]
  try { body = await req.json() } catch {
    return Response.json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }, { status: 400, headers: CORS })
  }
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local'
  const msgs = Array.isArray(body) ? body : [body]
  const out = (await Promise.all(msgs.map(m => handle(m, user, ip)))).filter(Boolean)
  if (!out.length) return new Response(null, { status: 202, headers: CORS })
  return Response.json(Array.isArray(body) ? out : out[0], { headers: CORS })
}

export const mcpOptions = () => new Response(null, { status: 204, headers: CORS })
export const mcpNoStream = () => new Response('This MCP server answers POST requests with JSON; it has no event stream.', { status: 405, headers: { ...CORS, Allow: 'POST, OPTIONS' } })
