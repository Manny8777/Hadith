import pool from '@/lib/db'
import { newToken } from '@/lib/auth'
import { validRedirect } from '@/lib/oauth'

export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }

// Dynamic client registration (RFC 7591), public clients only
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const uris: string[] = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : []
  if (!uris.length || uris.length > 10 || !uris.every(validRedirect)) {
    return Response.json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris must be https (or http on localhost)' }, { status: 400, headers: CORS })
  }
  const clientId = newToken('mcp_')
  const name = String(body.client_name ?? '').slice(0, 100) || null
  await pool.query(`INSERT INTO oauth_clients (client_id, client_name, redirect_uris) VALUES ($1, $2, $3)`, [clientId, name, uris])
  return Response.json({
    client_id: clientId, client_name: name, redirect_uris: uris,
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
    token_endpoint_auth_method: 'none', client_id_issued_at: Math.floor(Date.now() / 1000),
  }, { status: 201, headers: CORS })
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS })
