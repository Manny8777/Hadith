// OAuth 2.1 for the MCP server (hadith.dev/mcp/account), the minimum the MCP authorization spec asks
// for: protected-resource and authorization-server metadata, dynamic client registration, the
// authorization-code grant with PKCE (S256), and refresh tokens. Public clients only (no secrets).
// The sign-in itself is the site's email link; the consent page is app/oauth/authorize.
import { createHash } from 'node:crypto'
import pool from '@/lib/db'
import { newToken, sha256 } from '@/lib/auth'

export const ACCESS_DAYS = 30
export const REFRESH_DAYS = 180

export function originOf(req: Request): string {
  const h = req.headers
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'hadith.dev'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return process.env.SITE_URL || `${proto}://${host}`
}

export const authServerMetadata = (origin: string) => ({
  issuer: origin,
  authorization_endpoint: `${origin}/oauth/authorize`,
  token_endpoint: `${origin}/api/oauth/token`,
  registration_endpoint: `${origin}/api/oauth/register`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  scopes_supported: ['mcp'],
  service_documentation: `${origin}/developers#mcp`,
})

// A redirect URI must be https, or http on loopback (native and CLI clients)
export function validRedirect(u: string): boolean {
  try {
    const x = new URL(u)
    if (x.protocol === 'https:') return true
    return x.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname)
  } catch { return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) && !u.startsWith('javascript:') } // custom app schemes
}

export async function getClient(clientId: string) {
  const r = await pool.query<{ client_id: string; client_name: string | null; redirect_uris: string[] }>(
    `SELECT client_id, client_name, redirect_uris FROM oauth_clients WHERE client_id = $1`, [clientId])
  return r.rows[0] ?? null
}

export async function issueCode(clientId: string, userId: number, redirectUri: string, challenge: string): Promise<string> {
  const code = newToken()
  await pool.query(
    `INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + interval '10 minutes')`,
    [sha256(code), clientId, userId, redirectUri, challenge])
  return code
}

export const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

export async function issueTokens(clientId: string, userId: number) {
  const access = newToken('at_'), refresh = newToken('rt_')
  await pool.query(
    `INSERT INTO oauth_tokens (token_hash, kind, client_id, user_id, expires_at) VALUES
       ($1, 'access', $3, $4, now() + ($5 || ' days')::interval),
       ($2, 'refresh', $3, $4, now() + ($6 || ' days')::interval)`,
    [sha256(access), sha256(refresh), clientId, userId, String(ACCESS_DAYS), String(REFRESH_DAYS)])
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_DAYS * 86400, refresh_token: refresh, scope: 'mcp' }
}
