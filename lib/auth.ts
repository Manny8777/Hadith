// Optional accounts: sign in by a link sent to your email (no passwords). A signed-in reader gets a
// session cookie; MCP clients authenticate with a personal token or an OAuth access token instead
// (see lib/mcp). Tables: db/add_accounts.js. Only SHA-256 hashes of tokens are stored.
import { createHash, randomBytes } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import pool from '@/lib/db'

export const SESSION_COOKIE = 'hd_session'
const SESSION_DAYS = 90
const LINK_MINUTES = 15

export interface User { id: number; email: string }

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const newToken = (prefix = '') => prefix + randomBytes(32).toString('base64url')

export function normalizeEmail(raw: unknown): string | null {
  const e = String(raw ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254 ? e : null
}

// Only same-site paths are followed after sign-in (never an open redirect)
export function safeNext(raw: unknown): string {
  const n = String(raw ?? '')
  return n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : '/account'
}

/** The site's public origin, from the request (Railway sets x-forwarded-*), for links in emails. */
export async function siteOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') || host?.startsWith('127.') ? 'http' : 'https')
  return process.env.SITE_URL || (host ? `${proto}://${host}` : 'https://hadith.dev')
}

// ── Sign-in links ──────────────────────────────────────────────────────────────

/** Creates a one-time link; returns it, or null when this email/IP asked too often (5 per hour). */
export async function createLoginLink(email: string, next: string, ip: string): Promise<string | null> {
  const recent = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM login_links
     WHERE (email = $1 OR ip = $2) AND created_at > now() - interval '1 hour'`, [email, ip])
  if (recent.rows[0].n >= 5) return null
  const token = newToken()
  await pool.query(
    `INSERT INTO login_links (token_hash, email, next_path, ip, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval)`,
    [sha256(token), email, next, ip, String(LINK_MINUTES)])
  return `${await siteOrigin()}/api/auth/verify?token=${token}`
}

/** Spends a sign-in link: returns the user (created on first sign-in) and where to go next. */
export async function redeemLoginLink(token: string): Promise<{ user: User; next: string } | null> {
  const r = await pool.query<{ email: string; next_path: string | null }>(
    `UPDATE login_links SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING email, next_path`, [sha256(token)])
  if (!r.rows.length) return null
  const { email, next_path } = r.rows[0]
  const u = await pool.query<User>(
    `INSERT INTO users (email, last_login_at) VALUES ($1, now())
     ON CONFLICT (email) DO UPDATE SET last_login_at = now()
     RETURNING id, email`, [email])
  return { user: u.rows[0], next: safeNext(next_path) }
}

/** Sends the link with Resend (RESEND_API_KEY, EMAIL_FROM). Without a key: logged in development,
 *  an error in production. */
export async function sendLoginEmail(email: string, link: string): Promise<'sent' | 'logged' | 'unconfigured' | 'failed'> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    if (process.env.NODE_ENV !== 'production') { console.log(`[login link for ${email}] ${link}`); return 'logged' }
    return 'unconfigured'
  }
  const from = process.env.EMAIL_FROM || 'الجامع <login@hadith.dev>'
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:16px;line-height:1.8;color:#14151a">
    <p>السلام عليكم،</p>
    <p>اضغط الزر التالي لتسجيل الدخول إلى «الجامع — موسوعة الحديث النبوي». الرابط صالحٌ ${LINK_MINUTES} دقيقة، ويُستعمل مرةً واحدة.</p>
    <p><a href="${link}" style="display:inline-block;background:#0F3D2E;color:#fff;padding:10px 22px;border-radius:999px;text-decoration:none">تسجيل الدخول</a></p>
    <p style="color:#6b7a70;font-size:13px">إن لم تطلب هذا فتجاهل الرسالة.</p></div>`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject: 'رابط تسجيل الدخول إلى الجامع', html,
      text: `رابط تسجيل الدخول إلى الجامع (صالح ${LINK_MINUTES} دقيقة):\n${link}` }),
  }).catch(() => null)
  if (!res?.ok) console.error('[login email] failed', res?.status, await res?.text().catch(() => ''))
  return res?.ok ? 'sent' : 'failed'
}

// ── Sessions ───────────────────────────────────────────────────────────────────

/** Creates a session and returns its token; set it with sessionCookie() on the response. */
export async function createSession(userId: number): Promise<string> {
  const token = newToken()
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [sha256(token), userId, String(SESSION_DAYS)])
  return token
}

export const sessionCookie = (token: string) => ({
  name: SESSION_COOKIE, value: token, httpOnly: true, sameSite: 'lax' as const, path: '/',
  maxAge: SESSION_DAYS * 86400, secure: process.env.NODE_ENV === 'production',
})

export async function endSession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [sha256(token)]).catch(() => {})
  jar.delete(SESSION_COOKIE)
}

/** The signed-in reader, or null (also when the account tables are not there yet). */
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const r = await pool.query<User>(
    `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`, [sha256(token)]).catch(() => ({ rows: [] as User[] }))
  return r.rows[0] ?? null
}

// ── Bearer tokens (MCP) ────────────────────────────────────────────────────────

/** A personal token (hd_…) or an OAuth access token → its user, or null. */
export async function userForBearer(token: string): Promise<User | null> {
  const h = sha256(token)
  if (token.startsWith('hd_')) {
    const r = await pool.query<User>(
      `UPDATE api_tokens t SET last_used_at = now() FROM users u
       WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND u.id = t.user_id
       RETURNING u.id, u.email`, [h]).catch(() => ({ rows: [] as User[] }))
    return r.rows[0] ?? null
  }
  const r = await pool.query<User>(
    `SELECT u.id, u.email FROM oauth_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.kind = 'access' AND t.revoked_at IS NULL AND t.expires_at > now()`, [h])
    .catch(() => ({ rows: [] as User[] }))
  return r.rows[0] ?? null
}
