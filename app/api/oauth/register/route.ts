import pool from '@/lib/db'
import { newToken, sha256 } from '@/lib/auth'
import { validRedirect } from '@/lib/oauth'

export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const METHODS = ['none', 'client_secret_post', 'client_secret_basic']

// Dynamic client registration (RFC 7591): public clients, or confidential ones that ask for a
// secret (client_secret_post / client_secret_basic — claude.ai does). The secret is returned once.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const uris: string[] = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : []
  if (!uris.length || uris.length > 10 || !uris.every(validRedirect)) {
    return Response.json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris must be https (or http on localhost)' }, { status: 400, headers: CORS })
  }
  const method = String(body.token_endpoint_auth_method ?? 'none')
  if (!METHODS.includes(method)) {
    return Response.json({ error: 'invalid_client_metadata', error_description: `token_endpoint_auth_method must be one of ${METHODS.join(', ')}` }, { status: 400, headers: CORS })
  }
  const clientId = newToken('mcp_')
  const secret = method === 'none' ? null : newToken('mcs_')
  const name = String(body.client_name ?? '').slice(0, 100) || null
  await pool.query(
    `INSERT INTO oauth_clients (client_id, client_name, redirect_uris, client_secret_hash, token_auth_method) VALUES ($1, $2, $3, $4, $5)`,
    [clientId, name, uris, secret && sha256(secret), method])
  return Response.json({
    client_id: clientId, client_name: name, redirect_uris: uris,
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
    token_endpoint_auth_method: method, client_id_issued_at: Math.floor(Date.now() / 1000),
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
  }, { status: 201, headers: { ...CORS, 'Cache-Control': 'no-store' } })
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS })
