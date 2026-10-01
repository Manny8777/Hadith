import pool from '@/lib/db'
import { clientIp, deviceOf, isBot, visitorHash } from '@/lib/analytics'

export const dynamic = 'force-dynamic'

// Page-view beacon from app/components/Analytics (navigator.sendBeacon, so it never slows the page)
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { p?: string; r?: string } | null
  const path = String(body?.p ?? '').slice(0, 300)
  if (!path.startsWith('/')) return new Response(null, { status: 204 })
  const ua = req.headers.get('user-agent') ?? ''
  let refHost: string | null = null
  try {
    const r = body?.r ? new URL(body.r) : null
    if (r && !/(^|\.)hadith\.dev$|railway\.app$|localhost/.test(r.hostname)) refHost = r.hostname.replace(/^www\./, '')
  } catch { /* not a URL */ }
  await pool.query(
    `INSERT INTO page_views (path, referrer_host, visitor, is_bot, device) VALUES ($1,$2,$3,$4,$5)`,
    [path, refHost, visitorHash(clientIp(req), ua), isBot(ua), deviceOf(ua)],
  ).catch(err => console.error('[page_views]', err.message))
  return new Response(null, { status: 204 })
}
