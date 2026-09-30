import pool from '@/lib/db'
import { sha256 } from '@/lib/auth'
import { issueTokens, s256 } from '@/lib/oauth'

export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const fail = (error: string, description: string, status = 400) =>
  Response.json({ error, error_description: description }, { status, headers: { ...CORS, 'Cache-Control': 'no-store' } })

// Token endpoint: authorization_code (with PKCE) and refresh_token grants
export async function POST(req: Request) {
  const type = req.headers.get('content-type') ?? ''
  const form = type.includes('application/json')
    ? new URLSearchParams(Object.entries(await req.json().catch(() => ({}))).map(([k, v]) => [k, String(v)]))
    : new URLSearchParams(await req.text())
  const grant = form.get('grant_type')
  const clientId = form.get('client_id') ?? ''

  if (grant === 'authorization_code') {
    const code = form.get('code') ?? '', verifier = form.get('code_verifier') ?? '', redirect = form.get('redirect_uri') ?? ''
    const r = await pool.query<{ client_id: string; user_id: number; redirect_uri: string; code_challenge: string }>(
      `UPDATE oauth_codes SET used_at = now()
       WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
       RETURNING client_id, user_id, redirect_uri, code_challenge`, [sha256(code)])
    const c = r.rows[0]
    if (!c) return fail('invalid_grant', 'code is invalid, used or expired')
    if (clientId && clientId !== c.client_id) return fail('invalid_grant', 'code was issued to another client')
    if (redirect && redirect !== c.redirect_uri) return fail('invalid_grant', 'redirect_uri does not match')
    if (!verifier || s256(verifier) !== c.code_challenge) return fail('invalid_grant', 'PKCE verification failed')
    return Response.json(await issueTokens(c.client_id, c.user_id), { headers: { ...CORS, 'Cache-Control': 'no-store' } })
  }

  if (grant === 'refresh_token') {
    const r = await pool.query<{ client_id: string; user_id: number }>(
      `UPDATE oauth_tokens SET revoked_at = now()
       WHERE token_hash = $1 AND kind = 'refresh' AND revoked_at IS NULL AND expires_at > now()
       RETURNING client_id, user_id`, [sha256(form.get('refresh_token') ?? '')])
    const t = r.rows[0]
    if (!t || (clientId && clientId !== t.client_id)) return fail('invalid_grant', 'refresh token is invalid or expired')
    return Response.json(await issueTokens(t.client_id, t.user_id), { headers: { ...CORS, 'Cache-Control': 'no-store' } })
  }

  return fail('unsupported_grant_type', 'use authorization_code or refresh_token')
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS })
